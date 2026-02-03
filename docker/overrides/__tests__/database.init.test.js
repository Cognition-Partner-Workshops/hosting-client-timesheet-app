const path = require('path');
const fs = require('fs');

describe('Database Init Module', () => {
  let dbModule;
  const testDbPath = path.join(__dirname, 'test-db.sqlite');

  beforeEach(() => {
    jest.resetModules();
    process.env.DATABASE_PATH = ':memory:';
    dbModule = require('../database/init');
  });

  afterEach(async () => {
    if (dbModule && dbModule.closeDatabase) {
      dbModule.closeDatabase();
    }
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('getDatabase', () => {
    it('should return a database connection', () => {
      const db = dbModule.getDatabase();
      expect(db).toBeDefined();
      expect(db).not.toBeNull();
    });

    it('should return the same database instance on multiple calls', () => {
      const db1 = dbModule.getDatabase();
      const db2 = dbModule.getDatabase();
      expect(db1).toBe(db2);
    });

    it('should create in-memory database when DATABASE_PATH is :memory:', () => {
      process.env.DATABASE_PATH = ':memory:';
      jest.resetModules();
      const freshModule = require('../database/init');
      const db = freshModule.getDatabase();
      expect(db).toBeDefined();
      freshModule.closeDatabase();
    });

    it('should create file-based database when DATABASE_PATH is a file path', () => {
      process.env.DATABASE_PATH = testDbPath;
      jest.resetModules();
      const freshModule = require('../database/init');
      const db = freshModule.getDatabase();
      expect(db).toBeDefined();
      freshModule.closeDatabase();
    });

    it('should create directory if it does not exist for file-based database', () => {
      const nestedPath = path.join(__dirname, 'nested', 'dir', 'test.db');
      process.env.DATABASE_PATH = nestedPath;
      jest.resetModules();
      const freshModule = require('../database/init');
      const db = freshModule.getDatabase();
      expect(db).toBeDefined();
      expect(fs.existsSync(path.dirname(nestedPath))).toBe(true);
      freshModule.closeDatabase();
      if (fs.existsSync(nestedPath)) {
        fs.unlinkSync(nestedPath);
      }
      fs.rmdirSync(path.join(__dirname, 'nested', 'dir'));
      fs.rmdirSync(path.join(__dirname, 'nested'));
    });
  });

  describe('initializeDatabase', () => {
    it('should initialize database successfully', async () => {
      await expect(dbModule.initializeDatabase()).resolves.not.toThrow();
    });

    it('should create users table', async () => {
      await dbModule.initializeDatabase();
      const db = dbModule.getDatabase();
      
      return new Promise((resolve, reject) => {
        db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='users'", (err, row) => {
          if (err) reject(err);
          expect(row).toBeDefined();
          expect(row.name).toBe('users');
          resolve();
        });
      });
    });

    it('should create clients table', async () => {
      await dbModule.initializeDatabase();
      const db = dbModule.getDatabase();
      
      return new Promise((resolve, reject) => {
        db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='clients'", (err, row) => {
          if (err) reject(err);
          expect(row).toBeDefined();
          expect(row.name).toBe('clients');
          resolve();
        });
      });
    });

    it('should create work_entries table', async () => {
      await dbModule.initializeDatabase();
      const db = dbModule.getDatabase();
      
      return new Promise((resolve, reject) => {
        db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='work_entries'", (err, row) => {
          if (err) reject(err);
          expect(row).toBeDefined();
          expect(row.name).toBe('work_entries');
          resolve();
        });
      });
    });

    it('should create indexes for performance', async () => {
      await dbModule.initializeDatabase();
      const db = dbModule.getDatabase();
      
      return new Promise((resolve, reject) => {
        db.all("SELECT name FROM sqlite_master WHERE type='index'", (err, rows) => {
          if (err) reject(err);
          const indexNames = rows.map(r => r.name);
          expect(indexNames).toContain('idx_clients_user_email');
          expect(indexNames).toContain('idx_work_entries_client_id');
          expect(indexNames).toContain('idx_work_entries_user_email');
          expect(indexNames).toContain('idx_work_entries_date');
          resolve();
        });
      });
    });

    it('should be idempotent - can be called multiple times', async () => {
      await dbModule.initializeDatabase();
      await expect(dbModule.initializeDatabase()).resolves.not.toThrow();
    });
  });

  describe('closeDatabase', () => {
    it('should close database connection without error', () => {
      dbModule.getDatabase();
      expect(() => dbModule.closeDatabase()).not.toThrow();
    });

    it('should handle closing when no database is open', () => {
      expect(() => dbModule.closeDatabase()).not.toThrow();
    });

    it('should allow reopening database after close', () => {
      const db1 = dbModule.getDatabase();
      dbModule.closeDatabase();
      jest.resetModules();
      process.env.DATABASE_PATH = ':memory:';
      const freshModule = require('../database/init');
      const db2 = freshModule.getDatabase();
      expect(db2).toBeDefined();
      freshModule.closeDatabase();
    });
  });

  describe('Database Schema', () => {
    beforeEach(async () => {
      await dbModule.initializeDatabase();
    });

    it('should allow inserting a user', (done) => {
      const db = dbModule.getDatabase();
      db.run("INSERT INTO users (email) VALUES (?)", ['test@example.com'], function(err) {
        expect(err).toBeNull();
        expect(this.changes).toBe(1);
        done();
      });
    });

    it('should allow inserting a client for a user', (done) => {
      const db = dbModule.getDatabase();
      db.run("INSERT INTO users (email) VALUES (?)", ['test@example.com'], function(err) {
        expect(err).toBeNull();
        db.run(
          "INSERT INTO clients (name, description, user_email) VALUES (?, ?, ?)",
          ['Test Client', 'A test client', 'test@example.com'],
          function(err) {
            expect(err).toBeNull();
            expect(this.changes).toBe(1);
            done();
          }
        );
      });
    });

    it('should allow inserting a work entry', (done) => {
      const db = dbModule.getDatabase();
      db.serialize(() => {
        db.run("INSERT INTO users (email) VALUES (?)", ['test@example.com']);
        db.run(
          "INSERT INTO clients (name, description, user_email) VALUES (?, ?, ?)",
          ['Test Client', 'A test client', 'test@example.com']
        );
        db.run(
          "INSERT INTO work_entries (client_id, user_email, hours, description, date) VALUES (?, ?, ?, ?, ?)",
          [1, 'test@example.com', 8.5, 'Test work entry', '2024-01-15'],
          function(err) {
            expect(err).toBeNull();
            expect(this.changes).toBe(1);
            done();
          }
        );
      });
    });

    it('should enforce foreign key constraint on clients', (done) => {
      const db = dbModule.getDatabase();
      db.run(
        "INSERT INTO clients (name, description, user_email) VALUES (?, ?, ?)",
        ['Test Client', 'A test client', 'nonexistent@example.com'],
        function(err) {
          expect(err).not.toBeNull();
          done();
        }
      );
    });

    it('should cascade delete clients when user is deleted', (done) => {
      const db = dbModule.getDatabase();
      db.serialize(() => {
        db.run("INSERT INTO users (email) VALUES (?)", ['test@example.com']);
        db.run(
          "INSERT INTO clients (name, description, user_email) VALUES (?, ?, ?)",
          ['Test Client', 'A test client', 'test@example.com']
        );
        db.run("DELETE FROM users WHERE email = ?", ['test@example.com']);
        db.get("SELECT COUNT(*) as count FROM clients WHERE user_email = ?", ['test@example.com'], (err, row) => {
          expect(err).toBeNull();
          expect(row.count).toBe(0);
          done();
        });
      });
    });
  });
});
