describe('Database Initialization', () => {
  let originalEnv;

  beforeEach(() => {
    jest.resetModules();
    originalEnv = process.env.DATABASE_PATH;
  });

  afterEach(() => {
    process.env.DATABASE_PATH = originalEnv;
    jest.resetModules();
  });

  describe('getDatabase', () => {
    test('should return a database instance', () => {
      delete process.env.DATABASE_PATH;
      const { getDatabase } = require('../../docker/overrides/database/init');
      
      const db = getDatabase();
      
      expect(db).toBeDefined();
      expect(typeof db.serialize).toBe('function');
      expect(typeof db.run).toBe('function');
      expect(typeof db.get).toBe('function');
      expect(typeof db.all).toBe('function');
    });

    test('should return same database instance on subsequent calls', () => {
      const { getDatabase } = require('../../docker/overrides/database/init');
      
      const db1 = getDatabase();
      const db2 = getDatabase();
      
      expect(db1).toBe(db2);
    });
  });

  describe('initializeDatabase', () => {
    test('should initialize database without errors', async () => {
      const { initializeDatabase } = require('../../docker/overrides/database/init');
      
      await expect(initializeDatabase()).resolves.not.toThrow();
    });

    test('should be callable multiple times', async () => {
      const { initializeDatabase } = require('../../docker/overrides/database/init');
      
      await initializeDatabase();
      await expect(initializeDatabase()).resolves.not.toThrow();
    });
  });

  describe('closeDatabase', () => {
    test('should close database without errors', () => {
      const { getDatabase, closeDatabase } = require('../../docker/overrides/database/init');
      
      getDatabase();
      
      expect(() => closeDatabase()).not.toThrow();
    });

    test('should handle closing when database not initialized', () => {
      jest.resetModules();
      const { closeDatabase } = require('../../docker/overrides/database/init');
      
      expect(() => closeDatabase()).not.toThrow();
    });
  });

  describe('Module exports', () => {
    test('should export getDatabase function', () => {
      const dbModule = require('../../docker/overrides/database/init');
      expect(typeof dbModule.getDatabase).toBe('function');
    });

    test('should export initializeDatabase function', () => {
      const dbModule = require('../../docker/overrides/database/init');
      expect(typeof dbModule.initializeDatabase).toBe('function');
    });

    test('should export closeDatabase function', () => {
      const dbModule = require('../../docker/overrides/database/init');
      expect(typeof dbModule.closeDatabase).toBe('function');
    });
  });
});
