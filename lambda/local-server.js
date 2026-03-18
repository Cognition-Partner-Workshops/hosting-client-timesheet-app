/**
 * Local development entry point for the Client Timesheet App API.
 *
 * Starts a plain HTTP server that hosts the same Express application used by
 * the Lambda handler, but without the serverless-http wrapper. The database is
 * forced to SQLite in-memory mode so no AWS credentials or cloud services are
 * needed.
 *
 * Usage:
 *   npm start          # starts on the default port (3001)
 *   PORT=4000 npm start # starts on a custom port
 *
 * @module local-server
 * @see {@link ./lambda.js} for the Express app definition
 */

// Force SQLite mode so the database module loads the in-memory adapter
// instead of attempting to connect to DynamoDB.
process.env.DB_MODE = 'sqlite';

const { app } = require('./lambda');

/** Port the local server listens on (configurable via PORT env var). */
const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`🚀 Local server running on http://localhost:${PORT}`);
  console.log(`📊 Database mode: SQLite (in-memory)`);
  console.log(`❤️  Health check: http://localhost:${PORT}/health`);
  console.log('');
  console.log('No cloud dependencies required for local testing!');
});
