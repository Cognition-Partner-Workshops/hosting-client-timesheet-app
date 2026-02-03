/**
 * @fileoverview Production Express Server for Client Timesheet Application
 * 
 * This server serves as the main entry point for the production deployment,
 * handling both API requests and serving the React frontend as static files.
 * It includes comprehensive security middleware, rate limiting, and health
 * check endpoints for container orchestration.
 * 
 * @module server
 * @requires express
 * @requires cors
 * @requires path
 * @requires helmet
 * @requires morgan
 * @requires express-rate-limit
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/auth');
const clientRoutes = require('./routes/clients');
const workEntryRoutes = require('./routes/workEntries');
const reportRoutes = require('./routes/reports');

const { initializeDatabase } = require('./database/init');
const { errorHandler } = require('./middleware/errorHandler');

/**
 * Express application instance
 * @type {express.Application}
 */
const app = express();

/**
 * Server port configuration
 * Defaults to 3001 if PORT environment variable is not set
 * @type {number}
 */
const PORT = process.env.PORT || 3001;

/**
 * Security Middleware Configuration
 * 
 * Configures Helmet.js with Content Security Policy (CSP) settings
 * optimized for a React Single Page Application (SPA).
 * 
 * Security considerations:
 * - HSTS is disabled because the application serves HTTP without SSL termination
 * - 'unsafe-inline' is required for React's runtime script injection
 * - Google Fonts are explicitly allowed for typography
 * - Cross-origin policies are relaxed to support static asset loading
 */
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'"],
    },
    useDefaults: false,
  },
  crossOriginResourcePolicy: { policy: "cross-origin" },
  crossOriginOpenerPolicy: { policy: "unsafe-none" },
  strictTransportSecurity: false,
}));

/**
 * CORS Configuration
 * 
 * In production mode, allows same-origin requests since the frontend
 * is served from the same server. In development, allows requests from
 * the Vite dev server (default: localhost:5173).
 */
app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? true : (process.env.FRONTEND_URL || 'http://localhost:5173'),
  credentials: true
}));

/**
 * Rate Limiter Configuration
 * 
 * Implements basic DDoS protection by limiting each IP address to
 * 100 requests per 15-minute window. This helps prevent abuse while
 * allowing normal usage patterns.
 * 
 * @type {express.RequestHandler}
 */
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});
app.use(limiter);

/**
 * HTTP Request Logging
 * 
 * Uses Morgan with 'combined' format for comprehensive request logging,
 * including remote address, user agent, and response time. Useful for
 * debugging and monitoring application traffic.
 */
app.use(morgan('combined'));

/**
 * Body Parsing Middleware
 * 
 * Configures Express to parse JSON request bodies with a 10MB limit
 * and URL-encoded form data with extended syntax support.
 */
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

/**
 * Health Check Endpoint
 * 
 * Provides a lightweight endpoint for container health monitoring.
 * Used by Docker HEALTHCHECK and deployment verification scripts
 * to confirm the server is operational.
 * 
 * @route GET /health
 * @returns {Object} JSON object with status and timestamp
 */
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

/**
 * API Routes Registration
 * 
 * All API endpoints are prefixed with /api to separate them from
 * static file serving. Each route module handles a specific domain:
 * - /api/auth: User authentication (login, registration)
 * - /api/clients: Client CRUD operations
 * - /api/work-entries: Time entry management
 * - /api/reports: Report generation and analytics
 */
app.use('/api/auth', authRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/work-entries', workEntryRoutes);
app.use('/api/reports', reportRoutes);

/**
 * API Error Handler
 * 
 * Centralized error handling middleware for all API routes.
 * Catches errors thrown by route handlers and returns consistent
 * error responses to clients.
 */
app.use('/api', errorHandler);

/**
 * Static File Serving and SPA Routing
 * 
 * In production mode, serves the built React frontend from the /app/public
 * directory. The catch-all route ensures that client-side routing works
 * correctly by serving index.html for all non-API routes.
 * 
 * In development mode, returns a 404 for unknown routes since the
 * frontend is served by Vite's dev server on a separate port.
 */
if (process.env.NODE_ENV === 'production') {
  const publicPath = path.join(__dirname, '..', 'public');
  app.use(express.static(publicPath));
  
  app.get('*', (req, res) => {
    res.sendFile(path.join(publicPath, 'index.html'));
  });
} else {
  app.use('*', (req, res) => {
    res.status(404).json({ error: 'Route not found' });
  });
}

/**
 * Initializes the database and starts the Express server.
 * 
 * This function performs the following steps:
 * 1. Initializes the SQLite database (creates tables if they don't exist)
 * 2. Starts the HTTP server on the configured port
 * 3. Logs server status and configuration information
 * 
 * If database initialization fails, the process exits with code 1
 * to signal container orchestration systems of the failure.
 * 
 * @async
 * @function startServer
 * @returns {Promise<void>}
 */
async function startServer() {
  try {
    await initializeDatabase();
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Health check: http://localhost:${PORT}/health`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

module.exports = app;
