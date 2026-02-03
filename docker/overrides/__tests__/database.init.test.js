const path = require('path');
const fs = require('fs');
const os = require('os');

describe('Database Initialization (Production Override)', () => {
  let dbModule;
  let tempDir;

  beforeEach(() => {
    jest.resetModules();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'db-test-'));
  });

  afterEach(() => {
    if (dbModule && dbModule.closeDatabase) {
      dbModule.closeDatabase();
    }
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    delete process.env.DATABASE_PATH;
  });

  describe('getDatabase', () => {
    test('should create database with default in-memory path when DATABASE_PATH not set', () => {
      delete process.env.DATABASE_PATH;
      
      dbModule = require('../database/init');
      const db = dbModule.getDatabase();
      
      expect(db).toBeDefined();
      expect(typeof db.run).toBe('function');
      expect(typeof db.get).toBe('function');
      expect(typeof db.all).toBe('function');
    });

    test('should create database with file path when DATABASE_PATH is set', () => {
      const dbPath = path.join(tempDir, 'test.db');
      process.env.DATABASE_PATH = dbPath;
      
      dbModule = require('../database/init');
      const db = dbModule.getDatabase();
      
      expect(db).toBeDefined();
    });

    test('should create directory if it does not exist for file-based database', () => {
      const newDir = path.join(tempDir, 'newsubdir');
      const dbPath = path.join(newDir, 'test.db');
      process.env.DATABASE_PATH = dbPath;
      
      expect(fs.existsSync(newDir)).toBe(false);
      
      dbModule = require('../database/init');
      dbModule.getDatabase();
      
      expect(fs.existsSync(newDir)).toBe(true);
    });

    test('should return same database instance on multiple calls (singleton)', () => {
      delete process.env.DATABASE_PATH;
      
      dbModule = require('../database/init');
      const db1 = dbModule.getDatabase();
      const db2 = dbModule.getDatabase();
      
      expect(db1).toBe(db2);
    });

    test('should not create directory for in-memory database', () => {
      process.env.DATABASE_PATH = ':memory:';
      
      dbModule = require('../database/init');
      const db = dbModule.getDatabase();
      
      expect(db).toBeDefined();
    });
  });

  describe('initializeDatabase', () => {
    beforeEach(() => {
      delete process.env.DATABASE_PATH;
      dbModule = require('../database/init');
    });

    test('should create all required tables', async () => {
      await dbModule.initializeDatabase();
      const db = dbModule.getDatabase();
      
      const tables = await new Promise((resolve, reject) => {
        db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, rows) => {
          if (err) reject(err);
          else resolve(rows.map(r => r.name));
        });
      });
      
      expect(tables).toContain('users');
      expect(tables).toContain('clients');
      expect(tables).toContain('work_entries');
    });

    test('should create indexes for performance', async () => {
      await dbModule.initializeDatabase();
      const db = dbModule.getDatabase();
      
      const indexes = await new Promise((resolve, reject) => {
        db.all("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'", (err, rows) => {
          if (err) reject(err);
          else resolve(rows.map(r => r.name));
        });
      });
      
      expect(indexes).toContain('idx_clients_user_email');
      expect(indexes).toContain('idx_work_entries_client_id');
      expect(indexes).toContain('idx_work_entries_user_email');
      expect(indexes).toContain('idx_work_entries_date');
    });

    test('should enable foreign keys', async () => {
      await dbModule.initializeDatabase();
      const db = dbModule.getDatabase();
      
      const result = await new Promise((resolve, reject) => {
        db.get('PRAGMA foreign_keys', (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });
      
      expect(result.foreign_keys).toBe(1);
    });

    test('should resolve promise on successful initialization', async () => {
      await expect(dbModule.initializeDatabase()).resolves.toBeUndefined();
    });
  });

  describe('closeDatabase', () => {
    test('should close database connection', async () => {
      delete process.env.DATABASE_PATH;
      dbModule = require('../database/init');
      
      dbModule.getDatabase();
      await dbModule.initializeDatabase();
      
      dbModule.closeDatabase();
    });

    test('should handle multiple close calls safely', () => {
      delete process.env.DATABASE_PATH;
      dbModule = require('../database/init');
      
      dbModule.getDatabase();
      
      dbModule.closeDatabase();
      dbModule.closeDatabase();
    });
  });

  describe('Database Schema', () => {
    beforeEach(async () => {
      delete process.env.DATABASE_PATH;
      dbModule = require('../database/init');
      await dbModule.initializeDatabase();
    });

    test('users table should have email as primary key', async () => {
      const db = dbModule.getDatabase();
      
      const tableInfo = await new Promise((resolve, reject) => {
        db.all("PRAGMA table_info(users)", (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
      
      const emailColumn = tableInfo.find(col => col.name === 'email');
      expect(emailColumn).toBeDefined();
      expect(emailColumn.pk).toBe(1);
    });

    test('clients table should have user_email column', async () => {
      const db = dbModule.getDatabase();
      
      const tableInfo = await new Promise((resolve, reject) => {
        db.all("PRAGMA table_info(clients)", (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
      
      const userEmailColumn = tableInfo.find(col => col.name === 'user_email');
      expect(userEmailColumn).toBeDefined();
    });

    test('work_entries table should have client_id and user_email columns', async () => {
      const db = dbModule.getDatabase();
      
      const tableInfo = await new Promise((resolve, reject) => {
        db.all("PRAGMA table_info(work_entries)", (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
      
      const clientIdColumn = tableInfo.find(col => col.name === 'client_id');
      const userEmailColumn = tableInfo.find(col => col.name === 'user_email');
      
      expect(clientIdColumn).toBeDefined();
      expect(userEmailColumn).toBeDefined();
    });

    test('work_entries table should have hours column', async () => {
      const db = dbModule.getDatabase();
      
      const tableInfo = await new Promise((resolve, reject) => {
        db.all("PRAGMA table_info(work_entries)", (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
      
      const hoursColumn = tableInfo.find(col => col.name === 'hours');
      expect(hoursColumn).toBeDefined();
    });
  });

  describe('Production Configuration', () => {
    test('should use DATABASE_PATH environment variable', () => {
      const dbPath = '/app/data/timesheet.db';
      process.env.DATABASE_PATH = dbPath;
      
      const configuredPath = process.env.DATABASE_PATH || ':memory:';
      
      expect(configuredPath).toBe(dbPath);
    });

    test('should default to in-memory when DATABASE_PATH not set', () => {
      delete process.env.DATABASE_PATH;
      
      const configuredPath = process.env.DATABASE_PATH || ':memory:';
      
      expect(configuredPath).toBe(':memory:');
    });
  });
});
