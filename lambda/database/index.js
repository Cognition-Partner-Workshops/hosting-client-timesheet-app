/**
 * Database abstraction layer.
 *
 * This module re-exports the correct database adapter based on the DB_MODE
 * environment variable, giving the rest of the application a single import
 * point that works identically in both local and cloud environments.
 *
 * Supported modes:
 *   - 'sqlite'   (default) — In-memory SQLite via sqlite3; no cloud deps needed.
 *   - 'dynamodb'           — AWS DynamoDB via @aws-sdk; requires valid AWS creds.
 *
 * Usage:
 *   const db = require('./database');
 *   const user = await db.getUser('alice@example.com');
 *
 * @module database
 * @see {@link ./sqlite.js}   for the SQLite adapter
 * @see {@link ./dynamodb.js} for the DynamoDB adapter
 */

/** Active database mode — defaults to 'sqlite' when unset. */
const DB_MODE = process.env.DB_MODE || 'sqlite';

/** @type {import('./sqlite')|import('./dynamodb')} */
let db;

if (DB_MODE === 'dynamodb') {
  db = require('./dynamodb');
} else {
  db = require('./sqlite');
}

module.exports = db;
