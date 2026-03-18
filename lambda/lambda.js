/**
 * AWS Lambda handler for the Client Timesheet App API.
 *
 * This module defines the Express application that powers the timesheet REST API.
 * It is wrapped with serverless-http for deployment as an AWS Lambda function,
 * and also exports the raw Express app for local development via local-server.js.
 *
 * Database backend is selected at runtime via the DB_MODE environment variable:
 *   - 'sqlite'   (default) — in-memory SQLite for local development
 *   - 'dynamodb'           — AWS DynamoDB for cloud deployments
 *
 * Authentication is handled with JSON Web Tokens (JWT). Every protected route
 * requires a valid Bearer token obtained from POST /api/auth/login.
 *
 * @module lambda
 * @see {@link ./database/index.js} for the database abstraction layer
 * @see {@link ./local-server.js}   for the local development entry point
 */

const serverless = require('serverless-http');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const jwt = require('jsonwebtoken');
const Joi = require('joi');

const db = require('./database');

const app = express();

// Security middleware — Content-Security-Policy is disabled because the Lambda
// function serves a pure JSON API; CSP headers are only meaningful for HTML responses.
app.use(helmet({
  contentSecurityPolicy: false
}));

// Allow requests from any origin so the front-end (hosted separately) can
// reach the API. Credentials are forwarded to support cookie-based flows
// if they are ever added.
app.use(cors({
  origin: '*',
  credentials: true
}));

// Parse incoming JSON request bodies up to 10 MB.
app.use(express.json({ limit: '10mb' }));

/**
 * Shared secret used to sign and verify JWT tokens.
 * Falls back to a hard-coded demo value when JWT_SECRET is not set.
 * WARNING: The default value is NOT secure — always set JWT_SECRET in production.
 */
const JWT_SECRET = process.env.JWT_SECRET || 'demo-secret-change-in-production';

/**
 * Express middleware that validates the JWT Bearer token from the Authorization
 * header. On success it attaches the decoded payload (containing `email`) to
 * `req.user` so downstream handlers can identify the caller.
 *
 * @param {import('express').Request}  req  - Express request object
 * @param {import('express').Response} res  - Express response object
 * @param {import('express').NextFunction} next - Express next middleware
 * @returns {void}
 */
const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.substring(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

/**
 * Joi validation schemas used to validate incoming request bodies.
 *
 * - `email`     — validates the login payload (email address)
 * - `client`    — validates create/update client payloads
 * - `workEntry` — validates create/update work-entry payloads
 */
const schemas = {
  email: Joi.object({ email: Joi.string().email().required() }),
  client: Joi.object({
    name: Joi.string().min(1).max(100).required(),
    description: Joi.string().max(500).allow('', null),
    department: Joi.string().max(100).allow('', null),
    email: Joi.string().email().allow('', null)
  }),
  workEntry: Joi.object({
    client_id: Joi.string().required(),
    hours: Joi.number().positive().max(24).required(),
    description: Joi.string().max(500).allow('', null),
    date: Joi.string().isoDate().required()
  })
};

/**
 * GET /health
 * Lightweight health-check endpoint used by load balancers and monitoring.
 * Returns the current database mode and server timestamp.
 */
app.get('/health', (req, res) => {
  res.json({ status: 'OK', mode: process.env.DB_MODE || 'sqlite', timestamp: new Date().toISOString() });
});

// =============================================================================
// Auth Routes
// =============================================================================

/**
 * POST /api/auth/login
 * Authenticates (or auto-registers) a user by email address.
 * Returns a signed JWT valid for 24 hours together with the user record.
 *
 * @body {string} email — the user's email address
 * @returns {{ token: string, user: object }}
 */
app.post('/api/auth/login', async (req, res) => {
  try {
    const { error, value } = schemas.email.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });

    const { email } = value;
    
    // Upsert: fetch existing user or create a new one on first login
    let user = await db.getUser(email);
    if (!user) {
      user = await db.createUser(email);
    }

    const token = jwt.sign({ email }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ token, user });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/auth/me
 * Returns the profile of the currently authenticated user.
 * Requires a valid Bearer token.
 */
app.get('/api/auth/me', authenticate, async (req, res) => {
  try {
    const user = await db.getUser(req.user.email);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// =============================================================================
// Client Routes
// =============================================================================

/**
 * GET /api/clients
 * Lists all clients belonging to the authenticated user.
 */
app.get('/api/clients', authenticate, async (req, res) => {
  try {
    const clients = await db.getClientsByUser(req.user.email);
    res.json(clients);
  } catch (error) {
    console.error('Get clients error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/clients/:id
 * Returns a single client by ID. Returns 404 if the client does not exist
 * or does not belong to the authenticated user.
 */
app.get('/api/clients/:id', authenticate, async (req, res) => {
  try {
    const client = await db.getClientById(req.params.id);
    if (!client || client.user_email !== req.user.email) {
      return res.status(404).json({ error: 'Client not found' });
    }
    res.json(client);
  } catch (error) {
    console.error('Get client error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/clients
 * Creates a new client for the authenticated user.
 *
 * @body {string} name        — client name (required, 1-100 chars)
 * @body {string} description — optional description (max 500 chars)
 * @body {string} department  — optional department (max 100 chars)
 * @body {string} email       — optional contact email
 * @returns {object} 201 — the newly created client record
 */
app.post('/api/clients', authenticate, async (req, res) => {
  try {
    const { error, value } = schemas.client.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });

    const client = await db.createClient({ ...value, user_email: req.user.email });
    res.status(201).json(client);
  } catch (error) {
    console.error('Create client error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /api/clients/:id
 * Replaces the mutable fields of an existing client. The client must belong
 * to the authenticated user. Accepts the same body fields as POST.
 */
app.put('/api/clients/:id', authenticate, async (req, res) => {
  try {
    const existing = await db.getClientById(req.params.id);
    if (!existing || existing.user_email !== req.user.email) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const { error, value } = schemas.client.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });

    const client = await db.updateClient(req.params.id, value);
    res.json(client);
  } catch (error) {
    console.error('Update client error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/clients/:id
 * Deletes a client and its associated work entries.
 * Returns 204 No Content on success.
 */
app.delete('/api/clients/:id', authenticate, async (req, res) => {
  try {
    const existing = await db.getClientById(req.params.id);
    if (!existing || existing.user_email !== req.user.email) {
      return res.status(404).json({ error: 'Client not found' });
    }

    await db.deleteClient(req.params.id);
    res.status(204).send();
  } catch (error) {
    console.error('Delete client error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// =============================================================================
// Work Entry Routes
// =============================================================================

/**
 * GET /api/work-entries
 * Lists all work entries belonging to the authenticated user.
 */
app.get('/api/work-entries', authenticate, async (req, res) => {
  try {
    const entries = await db.getWorkEntriesByUser(req.user.email);
    res.json(entries);
  } catch (error) {
    console.error('Get work entries error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/work-entries/:id
 * Returns a single work entry by ID. Returns 404 if the entry does not
 * exist or does not belong to the authenticated user.
 */
app.get('/api/work-entries/:id', authenticate, async (req, res) => {
  try {
    const entry = await db.getWorkEntryById(req.params.id);
    if (!entry || entry.user_email !== req.user.email) {
      return res.status(404).json({ error: 'Work entry not found' });
    }
    res.json(entry);
  } catch (error) {
    console.error('Get work entry error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/work-entries
 * Creates a new work entry for the authenticated user.
 * The referenced client_id must belong to the same user.
 *
 * @body {string} client_id   — ID of the associated client (required)
 * @body {number} hours       — hours worked, 0 < hours <= 24 (required)
 * @body {string} description — optional description (max 500 chars)
 * @body {string} date        — ISO-8601 date string (required)
 * @returns {object} 201 — the newly created work entry record
 */
app.post('/api/work-entries', authenticate, async (req, res) => {
  try {
    const { error, value } = schemas.workEntry.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });

    // Verify the referenced client belongs to the authenticated user
    const client = await db.getClientById(value.client_id);
    if (!client || client.user_email !== req.user.email) {
      return res.status(400).json({ error: 'Invalid client' });
    }

    const entry = await db.createWorkEntry({ ...value, user_email: req.user.email });
    res.status(201).json(entry);
  } catch (error) {
    console.error('Create work entry error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /api/work-entries/:id
 * Updates an existing work entry. The entry and the referenced client must
 * both belong to the authenticated user. Accepts the same body fields as POST.
 */
app.put('/api/work-entries/:id', authenticate, async (req, res) => {
  try {
    const existing = await db.getWorkEntryById(req.params.id);
    if (!existing || existing.user_email !== req.user.email) {
      return res.status(404).json({ error: 'Work entry not found' });
    }

    const { error, value } = schemas.workEntry.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });

    // Verify the referenced client belongs to the authenticated user
    const client = await db.getClientById(value.client_id);
    if (!client || client.user_email !== req.user.email) {
      return res.status(400).json({ error: 'Invalid client' });
    }

    const entry = await db.updateWorkEntry(req.params.id, value);
    res.json(entry);
  } catch (error) {
    console.error('Update work entry error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/work-entries/:id
 * Deletes a single work entry. Returns 204 No Content on success.
 */
app.delete('/api/work-entries/:id', authenticate, async (req, res) => {
  try {
    const existing = await db.getWorkEntryById(req.params.id);
    if (!existing || existing.user_email !== req.user.email) {
      return res.status(404).json({ error: 'Work entry not found' });
    }

    await db.deleteWorkEntry(req.params.id);
    res.status(204).send();
  } catch (error) {
    console.error('Delete work entry error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** Catch-all 404 handler for unmatched routes. */
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

/** Global error handler — logs the error and returns a generic 500 response. */
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

/** Serverless-http wrapper — this is the entry point invoked by AWS Lambda. */
module.exports.handler = serverless(app);

/** Raw Express app exported for local-server.js and testing. */
module.exports.app = app;
