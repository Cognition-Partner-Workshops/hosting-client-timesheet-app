/**
 * @fileoverview SQLite Database Initialization Module
 * 
 * This module provides database connection management and schema initialization
 * for the Client Timesheet Application. It supports both file-based persistence
 * (for production) and in-memory databases (for development/testing).
 * 
 * The database schema consists of three main tables:
 * - users: Stores user account information
 * - clients: Stores client profiles linked to users
 * - work_entries: Stores time tracking records linked to clients and users
 * 
 * @module database/init
 * @requires sqlite3
 * @requires path
 * @requires fs
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

/**
 * Singleton database connection instance
 * @type {sqlite3.Database|null}
 * @private
 */
let db = null;

/**
 * Gets or creates the SQLite database connection.
 * 
 * This function implements the singleton pattern to ensure only one
 * database connection exists throughout the application lifecycle.
 * It automatically creates the data directory if it doesn't exist
 * when using file-based storage.
 * 
 * @function getDatabase
 * @returns {sqlite3.Database} The SQLite database connection instance
 * @throws {Error} If the database connection cannot be established
 * 
 * @example
 * const db = getDatabase();
 * db.run('SELECT * FROM users', (err, rows) => { ... });
 */
function getDatabase() {
  if (!db) {
    const dbPath = process.env.DATABASE_PATH || ':memory:';
    
    if (dbPath !== ':memory:') {
      const dbDir = path.dirname(dbPath);
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
      }
    }
    
    db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('Error opening database:', err);
        throw err;
      }
      const dbType = dbPath === ':memory:' ? 'in-memory' : `file: ${dbPath}`;
      console.log(`Connected to SQLite database (${dbType})`);
    });
  }
  return db;
}

/**
 * Initializes the database schema by creating all required tables and indexes.
 * 
 * This function is idempotent - it can be called multiple times safely as it
 * uses CREATE TABLE IF NOT EXISTS statements. It creates the following schema:
 * 
 * Tables:
 * - users: Primary key is email, stores user creation timestamp
 * - clients: Stores client information with foreign key to users
 * - work_entries: Stores time entries with foreign keys to both clients and users
 * 
 * Indexes (for query optimization):
 * - idx_clients_user_email: Speeds up client lookups by user
 * - idx_work_entries_client_id: Speeds up entry lookups by client
 * - idx_work_entries_user_email: Speeds up entry lookups by user
 * - idx_work_entries_date: Speeds up date-based queries for reports
 * 
 * @async
 * @function initializeDatabase
 * @returns {Promise<void>} Resolves when all tables and indexes are created
 * @throws {Error} If database operations fail
 */
async function initializeDatabase() {
  const database = getDatabase();
  
  return new Promise((resolve, reject) => {
    database.serialize(() => {
      database.run('PRAGMA foreign_keys = ON');
      
      database.run(`
        CREATE TABLE IF NOT EXISTS users (
          email TEXT PRIMARY KEY,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      database.run(`
        CREATE TABLE IF NOT EXISTS clients (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          description TEXT,
          user_email TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_email) REFERENCES users (email) ON DELETE CASCADE
        )
      `);

      database.run(`
        CREATE TABLE IF NOT EXISTS work_entries (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          client_id INTEGER NOT NULL,
          user_email TEXT NOT NULL,
          hours DECIMAL(5,2) NOT NULL,
          description TEXT,
          date DATE NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (client_id) REFERENCES clients (id) ON DELETE CASCADE,
          FOREIGN KEY (user_email) REFERENCES users (email) ON DELETE CASCADE
        )
      `);

      database.run(`CREATE INDEX IF NOT EXISTS idx_clients_user_email ON clients (user_email)`);
      database.run(`CREATE INDEX IF NOT EXISTS idx_work_entries_client_id ON work_entries (client_id)`);
      database.run(`CREATE INDEX IF NOT EXISTS idx_work_entries_user_email ON work_entries (user_email)`);
      database.run(`CREATE INDEX IF NOT EXISTS idx_work_entries_date ON work_entries (date)`);

      console.log('Database tables created successfully');
      resolve();
    });
  });
}

/**
 * Closes the database connection gracefully.
 * 
 * This function should be called during application shutdown to ensure
 * all pending database operations are completed and resources are released.
 * It resets the singleton instance to allow reconnection if needed.
 * 
 * @function closeDatabase
 * @returns {void}
 */
function closeDatabase() {
  if (db) {
    db.close((err) => {
      if (err) {
        console.error('Error closing database:', err);
      } else {
        console.log('Database connection closed');
      }
    });
    db = null;
  }
}

module.exports = {
  getDatabase,
  initializeDatabase,
  closeDatabase
};
