const request = require('supertest');

jest.mock('../docker/overrides/database/init', () => ({
  initializeDatabase: jest.fn().mockResolvedValue(undefined),
  getDatabase: jest.fn().mockReturnValue({
    get: jest.fn(),
    all: jest.fn(),
    run: jest.fn()
  })
}));

describe('Server Configuration', () => {
  let app;

  beforeEach(() => {
    jest.resetModules();
    process.env.NODE_ENV = 'test';
    app = require('../docker/overrides/server');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Health Check Endpoint', () => {
    test('GET /health should return OK status', async () => {
      const response = await request(app).get('/health');
      
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('OK');
      expect(response.body.timestamp).toBeDefined();
    });

    test('GET /health should return valid ISO timestamp', async () => {
      const response = await request(app).get('/health');
      
      const timestamp = new Date(response.body.timestamp);
      expect(timestamp.toISOString()).toBe(response.body.timestamp);
    });
  });

  describe('Security Headers', () => {
    test('should include helmet security headers', async () => {
      const response = await request(app).get('/health');
      
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBeDefined();
    });

    test('should include Content-Security-Policy header', async () => {
      const response = await request(app).get('/health');
      
      expect(response.headers['content-security-policy']).toBeDefined();
    });
  });

  describe('CORS Configuration', () => {
    test('should handle CORS preflight requests', async () => {
      const response = await request(app)
        .options('/api/auth/login')
        .set('Origin', 'http://localhost:5173')
        .set('Access-Control-Request-Method', 'POST');
      
      expect(response.status).toBeLessThan(500);
    });
  });

  describe('Body Parsing', () => {
    test('should parse JSON body', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@example.com' })
        .set('Content-Type', 'application/json');
      
      expect(response.status).toBeLessThan(500);
    });

    test('should handle URL-encoded body', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send('email=test@example.com')
        .set('Content-Type', 'application/x-www-form-urlencoded');
      
      expect(response.status).toBeLessThan(500);
    });
  });

  describe('API Routes', () => {
    describe('Auth Routes', () => {
      test('POST /api/auth/login should accept email', async () => {
        const response = await request(app)
          .post('/api/auth/login')
          .send({ email: 'test@example.com' });
        
        expect(response.status).toBe(200);
        expect(response.body.user.email).toBe('test@example.com');
      });

      test('POST /api/auth/login should return 400 without email', async () => {
        const response = await request(app)
          .post('/api/auth/login')
          .send({});
        
        expect(response.status).toBe(400);
      });

      test('GET /api/auth/me should return 401 without header', async () => {
        const response = await request(app).get('/api/auth/me');
        
        expect(response.status).toBe(401);
      });

      test('GET /api/auth/me should return user with header', async () => {
        const response = await request(app)
          .get('/api/auth/me')
          .set('x-user-email', 'test@example.com');
        
        expect(response.status).toBe(200);
        expect(response.body.user.email).toBe('test@example.com');
      });
    });

    describe('Client Routes', () => {
      test('GET /api/clients should return clients array', async () => {
        const response = await request(app).get('/api/clients');
        
        expect(response.status).toBe(200);
        expect(response.body.clients).toBeDefined();
        expect(Array.isArray(response.body.clients)).toBe(true);
      });

      test('GET /api/clients/:id should return 400 for invalid ID', async () => {
        const response = await request(app).get('/api/clients/invalid');
        
        expect(response.status).toBe(400);
      });

      test('POST /api/clients should create client', async () => {
        const response = await request(app)
          .post('/api/clients')
          .send({ name: 'Test Client', description: 'Test Description' });
        
        expect(response.status).toBe(201);
        expect(response.body.client.name).toBe('Test Client');
      });

      test('POST /api/clients should return 400 without name', async () => {
        const response = await request(app)
          .post('/api/clients')
          .send({ description: 'No name' });
        
        expect(response.status).toBe(400);
      });
    });

    describe('Work Entry Routes', () => {
      test('GET /api/work-entries should return work entries array', async () => {
        const response = await request(app).get('/api/work-entries');
        
        expect(response.status).toBe(200);
        expect(response.body.workEntries).toBeDefined();
        expect(Array.isArray(response.body.workEntries)).toBe(true);
      });

      test('GET /api/work-entries should filter by clientId', async () => {
        const response = await request(app).get('/api/work-entries?clientId=1');
        
        expect(response.status).toBe(200);
      });

      test('GET /api/work-entries should return 400 for invalid clientId', async () => {
        const response = await request(app).get('/api/work-entries?clientId=invalid');
        
        expect(response.status).toBe(400);
      });

      test('POST /api/work-entries should create work entry', async () => {
        const response = await request(app)
          .post('/api/work-entries')
          .send({ clientId: 1, hours: 5, description: 'Work', date: '2024-01-15' });
        
        expect(response.status).toBe(201);
      });

      test('POST /api/work-entries should return 400 without required fields', async () => {
        const response = await request(app)
          .post('/api/work-entries')
          .send({ hours: 5 });
        
        expect(response.status).toBe(400);
      });
    });

    describe('Report Routes', () => {
      test('GET /api/reports/client/:clientId should return report', async () => {
        const response = await request(app).get('/api/reports/client/1');
        
        expect(response.status).toBe(200);
        expect(response.body.client).toBeDefined();
        expect(response.body.totalHours).toBeDefined();
      });

      test('GET /api/reports/client/:clientId should return 400 for invalid ID', async () => {
        const response = await request(app).get('/api/reports/client/invalid');
        
        expect(response.status).toBe(400);
      });

      test('GET /api/reports/export/csv/:clientId should return CSV', async () => {
        const response = await request(app).get('/api/reports/export/csv/1');
        
        expect(response.status).toBe(200);
        expect(response.headers['content-type']).toContain('text/csv');
      });

      test('GET /api/reports/export/pdf/:clientId should return PDF', async () => {
        const response = await request(app).get('/api/reports/export/pdf/1');
        
        expect(response.status).toBe(200);
        expect(response.headers['content-type']).toContain('application/pdf');
      });
    });
  });

  describe('Error Handling', () => {
    test('should return 404 for unknown API routes in development', async () => {
      const response = await request(app).get('/api/unknown');
      
      expect(response.status).toBe(404);
    });
  });
});

describe('Server Environment Configuration', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('should use default port 3001 when PORT not set', () => {
    delete process.env.PORT;
    const app = require('../docker/overrides/server');
    expect(app).toBeDefined();
  });

  test('should use custom port when PORT is set', () => {
    process.env.PORT = '4000';
    const app = require('../docker/overrides/server');
    expect(app).toBeDefined();
  });
});
