/**
 * Production Express server for the Client Timesheet App.
 *
 * This file replaces the original development server when the application is
 * packaged inside a Docker container. Key differences from the development
 * server:
 *
 *   - Serves the React SPA as static files (in production mode)
 *   - Uses file-based SQLite (via DATABASE_PATH env var) for data persistence
 *   - Adds rate limiting, HTTP logging (morgan), and stricter CSP headers
 *
 * The server auto-initialises the SQLite database on startup and listens on
 * the port specified by the PORT environment variable (default 3001).
 *
 * @module server
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

const app = express();
const PORT = process.env.PORT || 3001;

// Security middleware with Content-Security-Policy tuned for the React SPA.
// HSTS and upgrade-insecure-requests are disabled because the container serves
// plain HTTP behind the host’s reverse proxy / load balancer.
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

// CORS — In production the API and SPA share the same origin, so `true`
// reflects the request origin. In development we allow the Vite dev server.
app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? true : (process.env.FRONTEND_URL || 'http://localhost:5173'),
  credentials: true
}));

// Rate limiting — prevents abuse by capping each IP to 100 requests per
// 15-minute window. Returns HTTP 429 when exceeded.
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});
app.use(limiter);

// HTTP request logging in Apache "combined" format for production visibility.
app.use(morgan('combined'));

// Body parsing — JSON payloads up to 10 MB, plus URL-encoded form data.
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

/**
 * GET /health
 * Lightweight health-check endpoint used by the Docker HEALTHCHECK directive
 * and external monitors.
 */
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// --- API route mounting ---
app.use('/api/auth', authRoutes);          // Authentication (login, profile)
app.use('/api/clients', clientRoutes);      // Client CRUD
app.use('/api/work-entries', workEntryRoutes); // Work-entry CRUD
app.use('/api/reports', reportRoutes);      // Reporting / analytics

// Centralised error handler for all /api/* routes.
app.use('/api', errorHandler);

// In production the server doubles as a static file host for the React SPA
// build output. The catch-all GET * ensures client-side routing works by
// always returning index.html for non-API paths.
if (process.env.NODE_ENV === 'production') {
  const publicPath = path.join(__dirname, '..', 'public');
  app.use(express.static(publicPath));
  
  app.get('*', (req, res) => {
    res.sendFile(path.join(publicPath, 'index.html'));
  });
} else {
  // Development-only 404 handler (the SPA is served by Vite in dev).
  app.use('*', (req, res) => {
    res.status(404).json({ error: 'Route not found' });
  });
}

/**
 * Initialises the SQLite database and starts the HTTP server.
 * Exits with code 1 if database initialisation fails.
 *
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
