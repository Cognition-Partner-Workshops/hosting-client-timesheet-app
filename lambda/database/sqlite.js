/**
 * SQLite database adapter for local development.
 *
 * Provides the same CRUD interface as the DynamoDB adapter (dynamodb.js) so the
 * two backends can be swapped transparently via the abstraction layer (index.js).
 *
 * The database is created in-memory by default, meaning all data is lost when
 * the process exits. This keeps local development simple and dependency-free.
 *
 * Tables and indexes are lazily initialised on first access (see
 * {@link initializeDatabase}).
 *
 * @module database/sqlite
 */

const sqlite3 = require('sqlite3').verbose();

/** @type {import('sqlite3').Database|null} Singleton database connection. */
let db = null;

/** Whether the schema (tables + indexes) has already been created. */
let initialized = false;

/**
 * Returns (and lazily creates) the singleton SQLite database connection.
 * The database lives entirely in memory (:memory:).
 *
 * @returns {import('sqlite3').Database}
 */
function getDatabase() {
  if (!db) {
    db = new sqlite3.Database(':memory:', (err) => {
      if (err) {
        console.error('Error opening database:', err);
        throw err;
      }
      console.log('Connected to SQLite in-memory database');
    });
  }
  return db;
}

/**
 * Creates the database schema (tables and indexes) if it hasn't been created
 * yet. Safe to call multiple times — subsequent calls are no-ops.
 *
 * @returns {Promise<void>}
 */
async function initializeDatabase() {
  if (initialized) return;
  
  const database = getDatabase();
  
  return new Promise((resolve, reject) => {
    database.serialize(() => {
      // ---- users table ----
      database.run(`
        CREATE TABLE IF NOT EXISTS users (
          email TEXT PRIMARY KEY,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // ---- clients table ----
      database.run(`
        CREATE TABLE IF NOT EXISTS clients (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          department TEXT,
          email TEXT,
          user_email TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // ---- work_entries table ----
      database.run(`
        CREATE TABLE IF NOT EXISTS work_entries (
          id TEXT PRIMARY KEY,
          client_id TEXT NOT NULL,
          user_email TEXT NOT NULL,
          hours DECIMAL(5,2) NOT NULL,
          description TEXT,
          date DATE NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // ---- indexes for query performance ----
      database.run(`CREATE INDEX IF NOT EXISTS idx_clients_user_email ON clients (user_email)`);
      database.run(`CREATE INDEX IF NOT EXISTS idx_work_entries_client_id ON work_entries (client_id)`);
      database.run(`CREATE INDEX IF NOT EXISTS idx_work_entries_user_email ON work_entries (user_email)`, () => {
        initialized = true;
        resolve();
      });
    });
  });
}

/**
 * Generates a RFC 4122–style v4 UUID using Math.random().
 * Suitable for local development; in production the DynamoDB adapter uses
 * the `uuid` package instead.
 *
 * @returns {string} A lowercase UUID string (e.g. '550e8400-e29b-41d4-a716-446655440000').
 */
function generateId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// ---------------------------------------------------------------------------
// User operations
// ---------------------------------------------------------------------------

/**
 * Fetches a user by email.
 *
 * @param {string} email - The user's email address (primary key).
 * @returns {Promise<object|undefined>} The user row, or undefined if not found.
 */
async function getUser(email) {
  await initializeDatabase();
  return new Promise((resolve, reject) => {
    getDatabase().get('SELECT * FROM users WHERE email = ?', [email], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

/**
 * Inserts a new user. Uses INSERT OR IGNORE so duplicate emails are silently
 * skipped rather than throwing a constraint error.
 *
 * @param {string} email - The user's email address.
 * @returns {Promise<object>} The created user object ({ email, created_at }).
 */
async function createUser(email) {
  await initializeDatabase();
  const created_at = new Date().toISOString();
  return new Promise((resolve, reject) => {
    getDatabase().run('INSERT OR IGNORE INTO users (email, created_at) VALUES (?, ?)', [email, created_at], function(err) {
      if (err) reject(err);
      else resolve({ email, created_at });
    });
  });
}

// ---------------------------------------------------------------------------
// Client operations
// ---------------------------------------------------------------------------

/**
 * Returns all clients owned by the given user.
 *
 * @param {string} userEmail - Owner's email address.
 * @returns {Promise<object[]>} Array of client rows (may be empty).
 */
async function getClientsByUser(userEmail) {
  await initializeDatabase();
  return new Promise((resolve, reject) => {
    getDatabase().all('SELECT * FROM clients WHERE user_email = ?', [userEmail], (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

/**
 * Fetches a single client by its unique ID.
 *
 * @param {string} id - Client UUID.
 * @returns {Promise<object|undefined>} The client row, or undefined if not found.
 */
async function getClientById(id) {
  await initializeDatabase();
  return new Promise((resolve, reject) => {
    getDatabase().get('SELECT * FROM clients WHERE id = ?', [id], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

/**
 * Inserts a new client record.
 *
 * @param {object} data - Client fields (name, description, department, email, user_email).
 * @returns {Promise<object>} The created client object including generated id and timestamps.
 */
async function createClient(data) {
  await initializeDatabase();
  const id = generateId();
  const now = new Date().toISOString();
  const client = {
    id,
    name: data.name,
    description: data.description || null,
    department: data.department || null,
    email: data.email || null,
    user_email: data.user_email,
    created_at: now,
    updated_at: now
  };
  
  return new Promise((resolve, reject) => {
    getDatabase().run(
      'INSERT INTO clients (id, name, description, department, email, user_email, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [client.id, client.name, client.description, client.department, client.email, client.user_email, client.created_at, client.updated_at],
      function(err) {
        if (err) reject(err);
        else resolve(client);
      }
    );
  });
}

/**
 * Partially updates a client record. Only the fields present in `data` are
 * modified; `updated_at` is always refreshed. Returns the full updated row.
 *
 * @param {string} id   - Client UUID.
 * @param {object} data - Fields to update (name, description, department, email).
 * @returns {Promise<object>} The updated client row.
 */
async function updateClient(id, data) {
  await initializeDatabase();
  const updates = [];
  const values = [];
  
  if (data.name !== undefined) { updates.push('name = ?'); values.push(data.name); }
  if (data.description !== undefined) { updates.push('description = ?'); values.push(data.description); }
  if (data.department !== undefined) { updates.push('department = ?'); values.push(data.department); }
  if (data.email !== undefined) { updates.push('email = ?'); values.push(data.email); }
  
  updates.push('updated_at = ?');
  values.push(new Date().toISOString());
  values.push(id);
  
  return new Promise((resolve, reject) => {
    getDatabase().run(`UPDATE clients SET ${updates.join(', ')} WHERE id = ?`, values, function(err) {
      if (err) reject(err);
      else getClientById(id).then(resolve).catch(reject);
    });
  });
}

/**
 * Deletes a client and cascade-deletes all of its work entries.
 * Operations are serialised so work entries are removed before the client.
 *
 * @param {string} id - Client UUID.
 * @returns {Promise<void>}
 */
async function deleteClient(id) {
  await initializeDatabase();
  return new Promise((resolve, reject) => {
    getDatabase().serialize(() => {
      getDatabase().run('DELETE FROM work_entries WHERE client_id = ?', [id]);
      getDatabase().run('DELETE FROM clients WHERE id = ?', [id], function(err) {
        if (err) reject(err);
        else resolve();
      });
    });
  });
}

// ---------------------------------------------------------------------------
// Work-entry operations
// ---------------------------------------------------------------------------

/**
 * Returns all work entries belonging to the given user.
 *
 * @param {string} userEmail - Owner's email address.
 * @returns {Promise<object[]>} Array of work-entry rows (may be empty).
 */
async function getWorkEntriesByUser(userEmail) {
  await initializeDatabase();
  return new Promise((resolve, reject) => {
    getDatabase().all('SELECT * FROM work_entries WHERE user_email = ?', [userEmail], (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

/**
 * Returns all work entries for a specific client.
 *
 * @param {string} clientId - Client UUID.
 * @returns {Promise<object[]>} Array of work-entry rows (may be empty).
 */
async function getWorkEntriesByClient(clientId) {
  await initializeDatabase();
  return new Promise((resolve, reject) => {
    getDatabase().all('SELECT * FROM work_entries WHERE client_id = ?', [clientId], (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

/**
 * Fetches a single work entry by its unique ID.
 *
 * @param {string} id - Work-entry UUID.
 * @returns {Promise<object|undefined>} The work-entry row, or undefined if not found.
 */
async function getWorkEntryById(id) {
  await initializeDatabase();
  return new Promise((resolve, reject) => {
    getDatabase().get('SELECT * FROM work_entries WHERE id = ?', [id], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

/**
 * Inserts a new work entry.
 *
 * @param {object} data - Entry fields (client_id, user_email, hours, description, date).
 * @returns {Promise<object>} The created work-entry object including generated id and timestamps.
 */
async function createWorkEntry(data) {
  await initializeDatabase();
  const id = generateId();
  const now = new Date().toISOString();
  const entry = {
    id,
    client_id: data.client_id,
    user_email: data.user_email,
    hours: data.hours,
    description: data.description || null,
    date: data.date,
    created_at: now,
    updated_at: now
  };
  
  return new Promise((resolve, reject) => {
    getDatabase().run(
      'INSERT INTO work_entries (id, client_id, user_email, hours, description, date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [entry.id, entry.client_id, entry.user_email, entry.hours, entry.description, entry.date, entry.created_at, entry.updated_at],
      function(err) {
        if (err) reject(err);
        else resolve(entry);
      }
    );
  });
}

/**
 * Partially updates a work entry. Only the fields present in `data` are
 * modified; `updated_at` is always refreshed. Returns the full updated row.
 *
 * @param {string} id   - Work-entry UUID.
 * @param {object} data - Fields to update (hours, description, date, client_id).
 * @returns {Promise<object>} The updated work-entry row.
 */
async function updateWorkEntry(id, data) {
  await initializeDatabase();
  const updates = [];
  const values = [];
  
  if (data.hours !== undefined) { updates.push('hours = ?'); values.push(data.hours); }
  if (data.description !== undefined) { updates.push('description = ?'); values.push(data.description); }
  if (data.date !== undefined) { updates.push('date = ?'); values.push(data.date); }
  if (data.client_id !== undefined) { updates.push('client_id = ?'); values.push(data.client_id); }
  
  updates.push('updated_at = ?');
  values.push(new Date().toISOString());
  values.push(id);
  
  return new Promise((resolve, reject) => {
    getDatabase().run(`UPDATE work_entries SET ${updates.join(', ')} WHERE id = ?`, values, function(err) {
      if (err) reject(err);
      else getWorkEntryById(id).then(resolve).catch(reject);
    });
  });
}

/**
 * Deletes a single work entry.
 *
 * @param {string} id - Work-entry UUID.
 * @returns {Promise<void>}
 */
async function deleteWorkEntry(id) {
  await initializeDatabase();
  return new Promise((resolve, reject) => {
    getDatabase().run('DELETE FROM work_entries WHERE id = ?', [id], function(err) {
      if (err) reject(err);
      else resolve();
    });
  });
}

module.exports = {
  getUser,
  createUser,
  getClientsByUser,
  getClientById,
  createClient,
  updateClient,
  deleteClient,
  getWorkEntriesByUser,
  getWorkEntriesByClient,
  getWorkEntryById,
  createWorkEntry,
  updateWorkEntry,
  deleteWorkEntry,
  initializeDatabase
};
