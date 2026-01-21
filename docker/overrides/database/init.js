const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

let db = null;

// Session timeout configuration (in milliseconds)
const SESSION_TIMEOUT_MS = parseInt(process.env.SESSION_TIMEOUT_MS) || 24 * 60 * 60 * 1000; // Default: 24 hours
const SESSION_INACTIVITY_TIMEOUT_MS = parseInt(process.env.SESSION_INACTIVITY_TIMEOUT_MS) || 30 * 60 * 1000; // Default: 30 minutes

function getDatabase() {
  if (!db) {
    // Use file-based database in production, in-memory for development/testing
    const dbPath = process.env.DATABASE_PATH || ':memory:';
    
    // Ensure the directory exists for file-based database
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

function getSessionTimeoutMs() {
  return SESSION_TIMEOUT_MS;
}

function getSessionInactivityTimeoutMs() {
  return SESSION_INACTIVITY_TIMEOUT_MS;
}

async function initializeDatabase() {
  const database = getDatabase();
  
  return new Promise((resolve, reject) => {
    database.serialize(() => {
      // Enable foreign keys
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

      // Create sessions table for session management
      database.run(`
        CREATE TABLE IF NOT EXISTS sessions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          session_token TEXT UNIQUE NOT NULL,
          user_email TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          last_activity DATETIME DEFAULT CURRENT_TIMESTAMP,
          expires_at DATETIME NOT NULL,
          is_active INTEGER DEFAULT 1,
          FOREIGN KEY (user_email) REFERENCES users (email) ON DELETE CASCADE
        )
      `);

      // Create indexes for better performance
      database.run(`CREATE INDEX IF NOT EXISTS idx_clients_user_email ON clients (user_email)`);
      database.run(`CREATE INDEX IF NOT EXISTS idx_work_entries_client_id ON work_entries (client_id)`);
      database.run(`CREATE INDEX IF NOT EXISTS idx_work_entries_user_email ON work_entries (user_email)`);
      database.run(`CREATE INDEX IF NOT EXISTS idx_work_entries_date ON work_entries (date)`);
      database.run(`CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions (session_token)`);
      database.run(`CREATE INDEX IF NOT EXISTS idx_sessions_user_email ON sessions (user_email)`);
      database.run(`CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions (expires_at)`);

      console.log('Database tables created successfully');
      console.log(`Session timeout configured: ${SESSION_TIMEOUT_MS}ms absolute, ${SESSION_INACTIVITY_TIMEOUT_MS}ms inactivity`);
      resolve();
    });
  });
}

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

function generateSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

function createSession(userEmail, callback) {
  const database = getDatabase();
  const sessionToken = generateSessionToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TIMEOUT_MS);
  
  database.run(
    `INSERT INTO sessions (session_token, user_email, created_at, last_activity, expires_at, is_active) 
     VALUES (?, ?, ?, ?, ?, 1)`,
    [sessionToken, userEmail, now.toISOString(), now.toISOString(), expiresAt.toISOString()],
    function(err) {
      if (err) {
        console.error('SESSION_CREATE_ERROR:', { userEmail, error: err.message });
        return callback(err, null);
      }
      console.log('SESSION_CREATED:', { userEmail, sessionToken: sessionToken.substring(0, 8) + '...', expiresAt: expiresAt.toISOString() });
      callback(null, { sessionToken, expiresAt: expiresAt.toISOString() });
    }
  );
}

function validateSession(sessionToken, callback) {
  const database = getDatabase();
  const now = new Date();
  
  database.get(
    `SELECT * FROM sessions WHERE session_token = ? AND is_active = 1`,
    [sessionToken],
    (err, session) => {
      if (err) {
        console.error('SESSION_VALIDATION_ERROR:', { error: err.message });
        return callback(err, null);
      }
      
      if (!session) {
        console.log('SESSION_NOT_FOUND:', { sessionToken: sessionToken.substring(0, 8) + '...' });
        return callback(null, { valid: false, reason: 'Session not found or inactive' });
      }
      
      const expiresAt = new Date(session.expires_at);
      const lastActivity = new Date(session.last_activity);
      const inactivityDuration = now.getTime() - lastActivity.getTime();
      
      // Check absolute expiration
      if (now > expiresAt) {
        console.log('SESSION_EXPIRED_ABSOLUTE:', { 
          userEmail: session.user_email, 
          sessionToken: sessionToken.substring(0, 8) + '...', 
          expiresAt: session.expires_at,
          currentTime: now.toISOString()
        });
        invalidateSession(sessionToken, () => {});
        return callback(null, { valid: false, reason: 'Session expired', code: 'SESSION_TIMEOUT' });
      }
      
      // Check inactivity timeout
      if (inactivityDuration > SESSION_INACTIVITY_TIMEOUT_MS) {
        console.log('SESSION_EXPIRED_INACTIVITY:', { 
          userEmail: session.user_email, 
          sessionToken: sessionToken.substring(0, 8) + '...', 
          lastActivity: session.last_activity,
          inactivityMs: inactivityDuration,
          inactivityTimeoutMs: SESSION_INACTIVITY_TIMEOUT_MS
        });
        invalidateSession(sessionToken, () => {});
        return callback(null, { valid: false, reason: 'Session expired due to inactivity', code: 'SESSION_INACTIVITY_TIMEOUT' });
      }
      
      // Update last activity
      database.run(
        `UPDATE sessions SET last_activity = ? WHERE session_token = ?`,
        [now.toISOString(), sessionToken],
        (updateErr) => {
          if (updateErr) {
            console.error('SESSION_UPDATE_ERROR:', { error: updateErr.message });
          }
        }
      );
      
      callback(null, { valid: true, userEmail: session.user_email, session });
    }
  );
}

function invalidateSession(sessionToken, callback) {
  const database = getDatabase();
  
  database.run(
    `UPDATE sessions SET is_active = 0 WHERE session_token = ?`,
    [sessionToken],
    function(err) {
      if (err) {
        console.error('SESSION_INVALIDATE_ERROR:', { error: err.message });
        return callback(err);
      }
      console.log('SESSION_INVALIDATED:', { sessionToken: sessionToken.substring(0, 8) + '...' });
      callback(null);
    }
  );
}

function invalidateUserSessions(userEmail, callback) {
  const database = getDatabase();
  
  database.run(
    `UPDATE sessions SET is_active = 0 WHERE user_email = ?`,
    [userEmail],
    function(err) {
      if (err) {
        console.error('SESSION_INVALIDATE_ALL_ERROR:', { userEmail, error: err.message });
        return callback(err);
      }
      console.log('SESSION_INVALIDATED_ALL:', { userEmail, count: this.changes });
      callback(null, this.changes);
    }
  );
}

function cleanupExpiredSessions(callback) {
  const database = getDatabase();
  const now = new Date().toISOString();
  
  database.run(
    `DELETE FROM sessions WHERE expires_at < ? OR is_active = 0`,
    [now],
    function(err) {
      if (err) {
        console.error('SESSION_CLEANUP_ERROR:', { error: err.message });
        return callback ? callback(err) : null;
      }
      if (this.changes > 0) {
        console.log('SESSION_CLEANUP:', { deletedCount: this.changes });
      }
      if (callback) callback(null, this.changes);
    }
  );
}

module.exports = {
  getDatabase,
  initializeDatabase,
  closeDatabase,
  getSessionTimeoutMs,
  getSessionInactivityTimeoutMs,
  generateSessionToken,
  createSession,
  validateSession,
  invalidateSession,
  invalidateUserSessions,
  cleanupExpiredSessions
};
