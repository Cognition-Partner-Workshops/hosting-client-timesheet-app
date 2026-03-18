/**
 * Production SQLite database initialisation module.
 *
 * Unlike the Lambda SQLite adapter (which always uses an in-memory database),
 * this module supports file-based persistence via the DATABASE_PATH environment
 * variable. When DATABASE_PATH is set to an absolute path, data survives
 * container restarts (the path is typically mounted to a Docker volume).
 *
 * Exports:
 *   - getDatabase()        — Returns the singleton sqlite3.Database connection.
 *   - initializeDatabase() — Creates the schema (tables, indexes, pragmas).
 *   - closeDatabase()      — Gracefully shuts down the connection.
 *
 * @module database/init
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

/** @type {import('sqlite3').Database|null} Singleton database connection. */
let db = null;

/**
 * Returns (and lazily creates) the singleton SQLite database connection.
 *
 * The storage location is controlled by the DATABASE_PATH env var:
 *   - Set to an absolute file path for persistent, file-based storage.
 *   - Defaults to ':memory:' for ephemeral in-memory storage.
 *
 * If the target directory does not exist it is created recursively.
 *
 * @returns {import('sqlite3').Database}
 */
function getDatabase() {
  if (!db) {
    const dbPath = process.env.DATABASE_PATH || ':memory:';
    
    // Ensure the parent directory exists when using file-based storage.
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
 * Creates the database schema (tables, indexes) and enables foreign-key
 * constraints. Safe to call multiple times — every statement uses
 * CREATE TABLE/INDEX IF NOT EXISTS.
 *
 * @returns {Promise<void>}
 */
async function initializeDatabase() {
  const database = getDatabase();
  
  return new Promise((resolve, reject) => {
    database.serialize(() => {
      // Enable foreign-key constraint enforcement (off by default in SQLite).
      database.run('PRAGMA foreign_keys = ON');
      
      // Create users table
      database.run(`
        CREATE TABLE IF NOT EXISTS users (
          email TEXT PRIMARY KEY,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create clients table
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

      // Create work_entries table
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

      // Indexes to accelerate the most common query patterns.
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
 * Gracefully closes the database connection and resets the singleton.
 * Logs an error to stderr if the close operation fails.
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
