const sqlite3 = require('sqlite3').verbose();

let db = null;

function getDatabase() {
  if (!db) {
    const dbPath = ':memory:';
    db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('Error opening database:', err);
        throw err;
      }
    });
  }
  return db;
}

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
      database.run(`CREATE INDEX IF NOT EXISTS idx_work_entries_date ON work_entries (date)`, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });
}

function closeDatabase() {
  return new Promise((resolve, reject) => {
    if (db) {
      db.close((err) => {
        if (err) {
          reject(err);
        } else {
          db = null;
          resolve();
        }
      });
    } else {
      resolve();
    }
  });
}

function runQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDatabase().run(sql, params, function(err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function getAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDatabase().all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function getOne(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDatabase().get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

describe('Database Initialization', () => {
  beforeAll(async () => {
    await initializeDatabase();
  });

  afterAll(async () => {
    await closeDatabase();
  });

  test('should create users table', async () => {
    const tables = await getAll(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='users'"
    );
    expect(tables.length).toBe(1);
    expect(tables[0].name).toBe('users');
  });

  test('should create clients table', async () => {
    const tables = await getAll(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='clients'"
    );
    expect(tables.length).toBe(1);
    expect(tables[0].name).toBe('clients');
  });

  test('should create work_entries table', async () => {
    const tables = await getAll(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='work_entries'"
    );
    expect(tables.length).toBe(1);
    expect(tables[0].name).toBe('work_entries');
  });

  test('should create indexes', async () => {
    const indexes = await getAll(
      "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'"
    );
    const indexNames = indexes.map(i => i.name);
    expect(indexNames).toContain('idx_clients_user_email');
    expect(indexNames).toContain('idx_work_entries_client_id');
    expect(indexNames).toContain('idx_work_entries_user_email');
    expect(indexNames).toContain('idx_work_entries_date');
  });
});

describe('User Operations', () => {
  beforeAll(async () => {
    db = null;
    await initializeDatabase();
  });

  afterAll(async () => {
    await closeDatabase();
  });

  test('should insert a user', async () => {
    const result = await runQuery(
      'INSERT INTO users (email) VALUES (?)',
      ['test@example.com']
    );
    expect(result.changes).toBe(1);
  });

  test('should retrieve a user', async () => {
    const user = await getOne('SELECT * FROM users WHERE email = ?', ['test@example.com']);
    expect(user).toBeDefined();
    expect(user.email).toBe('test@example.com');
  });

  test('should not allow duplicate emails', async () => {
    await expect(
      runQuery('INSERT INTO users (email) VALUES (?)', ['test@example.com'])
    ).rejects.toThrow();
  });
});

describe('Client Operations', () => {
  beforeAll(async () => {
    db = null;
    await initializeDatabase();
    await runQuery('INSERT INTO users (email) VALUES (?)', ['client-test@example.com']);
  });

  afterAll(async () => {
    await closeDatabase();
  });

  test('should insert a client', async () => {
    const result = await runQuery(
      'INSERT INTO clients (name, description, user_email) VALUES (?, ?, ?)',
      ['Test Client', 'A test client', 'client-test@example.com']
    );
    expect(result.lastID).toBeGreaterThan(0);
  });

  test('should retrieve clients by user email', async () => {
    const clients = await getAll(
      'SELECT * FROM clients WHERE user_email = ?',
      ['client-test@example.com']
    );
    expect(clients.length).toBe(1);
    expect(clients[0].name).toBe('Test Client');
  });

  test('should update a client', async () => {
    await runQuery(
      'UPDATE clients SET name = ? WHERE user_email = ?',
      ['Updated Client', 'client-test@example.com']
    );
    const client = await getOne(
      'SELECT * FROM clients WHERE user_email = ?',
      ['client-test@example.com']
    );
    expect(client.name).toBe('Updated Client');
  });
});

describe('Work Entry Operations', () => {
  let clientId;

  beforeAll(async () => {
    db = null;
    await initializeDatabase();
    await runQuery('INSERT INTO users (email) VALUES (?)', ['work-test@example.com']);
    const result = await runQuery(
      'INSERT INTO clients (name, description, user_email) VALUES (?, ?, ?)',
      ['Work Test Client', 'For work entry tests', 'work-test@example.com']
    );
    clientId = result.lastID;
  });

  afterAll(async () => {
    await closeDatabase();
  });

  test('should insert a work entry', async () => {
    const result = await runQuery(
      'INSERT INTO work_entries (client_id, user_email, hours, description, date) VALUES (?, ?, ?, ?, ?)',
      [clientId, 'work-test@example.com', 8.5, 'Development work', '2024-01-15']
    );
    expect(result.lastID).toBeGreaterThan(0);
  });

  test('should retrieve work entries by client', async () => {
    const entries = await getAll(
      'SELECT * FROM work_entries WHERE client_id = ?',
      [clientId]
    );
    expect(entries.length).toBe(1);
    expect(entries[0].hours).toBe(8.5);
  });

  test('should retrieve work entries by date range', async () => {
    await runQuery(
      'INSERT INTO work_entries (client_id, user_email, hours, description, date) VALUES (?, ?, ?, ?, ?)',
      [clientId, 'work-test@example.com', 4.0, 'Meeting', '2024-01-16']
    );
    
    const entries = await getAll(
      'SELECT * FROM work_entries WHERE date BETWEEN ? AND ? ORDER BY date',
      ['2024-01-15', '2024-01-16']
    );
    expect(entries.length).toBe(2);
  });

  test('should calculate total hours for a client', async () => {
    const result = await getOne(
      'SELECT SUM(hours) as total_hours FROM work_entries WHERE client_id = ?',
      [clientId]
    );
    expect(result.total_hours).toBe(12.5);
  });
});

describe('Foreign Key Constraints', () => {
  beforeAll(async () => {
    db = null;
    await initializeDatabase();
  });

  afterAll(async () => {
    await closeDatabase();
  });

  test('should not allow client without valid user', async () => {
    await expect(
      runQuery(
        'INSERT INTO clients (name, description, user_email) VALUES (?, ?, ?)',
        ['Invalid Client', 'No user', 'nonexistent@example.com']
      )
    ).rejects.toThrow();
  });

  test('should not allow work entry without valid client', async () => {
    await runQuery('INSERT INTO users (email) VALUES (?)', ['fk-test@example.com']);
    await expect(
      runQuery(
        'INSERT INTO work_entries (client_id, user_email, hours, description, date) VALUES (?, ?, ?, ?, ?)',
        [99999, 'fk-test@example.com', 1.0, 'Invalid', '2024-01-01']
      )
    ).rejects.toThrow();
  });
});
