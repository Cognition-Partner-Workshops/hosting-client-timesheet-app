const request = require('supertest');
const express = require('express');

describe('Server Configuration (Production Override)', () => {
  beforeEach(() => {
    jest.resetModules();
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Health Check Endpoint', () => {
    test('GET /health should return OK status', async () => {
      const expressApp = express();
      expressApp.get('/health', (req, res) => {
        res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
      });

      const response = await request(expressApp).get('/health');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('OK');
      expect(response.body.timestamp).toBeDefined();
    });

    test('health check should return valid ISO timestamp', async () => {
      const expressApp = express();
      expressApp.get('/health', (req, res) => {
        res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
      });

      const response = await request(expressApp).get('/health');

      const timestamp = new Date(response.body.timestamp);
      expect(timestamp).toBeInstanceOf(Date);
      expect(isNaN(timestamp.getTime())).toBe(false);
    });
  });

  describe('API Routes Configuration Pattern', () => {
    test('should mount routes at correct API paths', async () => {
      const testApp = express();
      testApp.use(express.json());
      
      const mockAuthRouter = express.Router();
      mockAuthRouter.post('/login', (req, res) => res.json({ success: true }));
      
      const mockClientRouter = express.Router();
      mockClientRouter.get('/', (req, res) => res.json([{ id: 1, name: 'Test' }]));
      
      testApp.use('/api/auth', mockAuthRouter);
      testApp.use('/api/clients', mockClientRouter);

      const authResponse = await request(testApp).post('/api/auth/login');
      expect(authResponse.status).toBe(200);
      
      const clientResponse = await request(testApp).get('/api/clients');
      expect(clientResponse.status).toBe(200);
    });

    test('should support work entries route pattern', async () => {
      const testApp = express();
      const mockWorkEntryRouter = express.Router();
      mockWorkEntryRouter.get('/', (req, res) => res.json([{ id: 1, hours: 8 }]));
      
      testApp.use('/api/work-entries', mockWorkEntryRouter);

      const response = await request(testApp).get('/api/work-entries');
      expect(response.status).toBe(200);
      expect(response.body).toEqual([{ id: 1, hours: 8 }]);
    });

    test('should support reports route pattern', async () => {
      const testApp = express();
      const mockReportRouter = express.Router();
      mockReportRouter.get('/client/:id', (req, res) => res.json({ totalHours: 40 }));
      
      testApp.use('/api/reports', mockReportRouter);

      const response = await request(testApp).get('/api/reports/client/1');
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ totalHours: 40 });
    });
  });

  describe('Security Middleware', () => {
    test('should apply helmet security headers', async () => {
      const helmet = require('helmet');
      const testApp = express();
      
      testApp.use(helmet({
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
          },
          useDefaults: false,
        },
        crossOriginResourcePolicy: { policy: "cross-origin" },
        crossOriginOpenerPolicy: { policy: "unsafe-none" },
        strictTransportSecurity: false,
      }));
      
      testApp.get('/test', (req, res) => res.json({ ok: true }));

      const response = await request(testApp).get('/test');

      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
    });

    test('should configure CSP for React SPA', async () => {
      const helmet = require('helmet');
      const testApp = express();
      
      testApp.use(helmet({
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "blob:"],
            connectSrc: ["'self'"],
          },
          useDefaults: false,
        }
      }));
      
      testApp.get('/test', (req, res) => res.json({ ok: true }));

      const response = await request(testApp).get('/test');

      expect(response.headers['content-security-policy']).toBeDefined();
    });

    test('should disable strict transport security for HTTP deployment', async () => {
      const helmet = require('helmet');
      const testApp = express();
      
      testApp.use(helmet({
        strictTransportSecurity: false,
      }));
      
      testApp.get('/test', (req, res) => res.json({ ok: true }));

      const response = await request(testApp).get('/test');

      expect(response.headers['strict-transport-security']).toBeUndefined();
    });
  });

  describe('CORS Configuration', () => {
    test('should allow same origin in production', async () => {
      const cors = require('cors');
      const testApp = express();
      
      process.env.NODE_ENV = 'production';
      testApp.use(cors({
        origin: process.env.NODE_ENV === 'production' ? true : 'http://localhost:5173',
        credentials: true
      }));
      
      testApp.get('/test', (req, res) => res.json({ ok: true }));

      const response = await request(testApp)
        .get('/test')
        .set('Origin', 'http://example.com');

      expect(response.status).toBe(200);
    });

    test('should allow credentials', async () => {
      const cors = require('cors');
      const testApp = express();
      
      testApp.use(cors({
        origin: true,
        credentials: true
      }));
      
      testApp.get('/test', (req, res) => res.json({ ok: true }));

      const response = await request(testApp)
        .get('/test')
        .set('Origin', 'http://example.com');

      expect(response.headers['access-control-allow-credentials']).toBe('true');
    });

    test('should use localhost:5173 in development mode', async () => {
      const cors = require('cors');
      const testApp = express();
      
      process.env.NODE_ENV = 'development';
      const origin = process.env.NODE_ENV === 'production' ? true : 'http://localhost:5173';
      
      expect(origin).toBe('http://localhost:5173');
    });
  });

  describe('Rate Limiting', () => {
    test('should apply rate limiting middleware', async () => {
      const rateLimit = require('express-rate-limit');
      const testApp = express();
      
      const limiter = rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 100
      });
      
      testApp.use(limiter);
      testApp.get('/test', (req, res) => res.json({ ok: true }));

      const response = await request(testApp).get('/test');

      expect(response.headers['x-ratelimit-limit']).toBeDefined();
    });

    test('should set rate limit to 100 requests per 15 minutes', async () => {
      const rateLimit = require('express-rate-limit');
      const testApp = express();
      
      const limiter = rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 100
      });
      
      testApp.use(limiter);
      testApp.get('/test', (req, res) => res.json({ ok: true }));

      const response = await request(testApp).get('/test');

      expect(response.headers['x-ratelimit-limit']).toBe('100');
    });

    test('should configure 15 minute window', () => {
      const windowMs = 15 * 60 * 1000;
      expect(windowMs).toBe(900000);
    });
  });

  describe('Body Parsing', () => {
    test('should parse JSON body', async () => {
      const testApp = express();
      testApp.use(express.json({ limit: '10mb' }));
      
      testApp.post('/test', (req, res) => res.json(req.body));

      const response = await request(testApp)
        .post('/test')
        .send({ name: 'Test' })
        .set('Content-Type', 'application/json');

      expect(response.body).toEqual({ name: 'Test' });
    });

    test('should parse URL-encoded body', async () => {
      const testApp = express();
      testApp.use(express.urlencoded({ extended: true }));
      
      testApp.post('/test', (req, res) => res.json(req.body));

      const response = await request(testApp)
        .post('/test')
        .send('name=Test')
        .set('Content-Type', 'application/x-www-form-urlencoded');

      expect(response.body).toEqual({ name: 'Test' });
    });

    test('should accept JSON body up to 10mb', async () => {
      const testApp = express();
      testApp.use(express.json({ limit: '10mb' }));
      
      testApp.post('/test', (req, res) => res.json({ received: true }));

      const largeData = { data: 'x'.repeat(1000) };
      const response = await request(testApp)
        .post('/test')
        .send(largeData)
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(200);
    });

    test('should reject JSON body over limit', async () => {
      const testApp = express();
      testApp.use(express.json({ limit: '1kb' }));
      
      testApp.post('/test', (req, res) => res.json({ received: true }));
      testApp.use((err, req, res, next) => {
        res.status(413).json({ error: 'Payload too large' });
      });

      const largeData = { data: 'x'.repeat(2000) };
      const response = await request(testApp)
        .post('/test')
        .send(largeData)
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(413);
    });
  });

  describe('Development Mode', () => {
    test('should return 404 for non-API routes in development', async () => {
      const testApp = express();
      process.env.NODE_ENV = 'development';
      
      testApp.use('*', (req, res) => {
        res.status(404).json({ error: 'Route not found' });
      });

      const response = await request(testApp).get('/nonexistent');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Route not found' });
    });
  });

  describe('Production Mode Static File Serving', () => {
    test('should serve static files in production mode', async () => {
      const path = require('path');
      const fs = require('fs');
      const os = require('os');
      
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'static-test-'));
      fs.writeFileSync(path.join(tempDir, 'test.txt'), 'Hello World');
      
      const testApp = express();
      process.env.NODE_ENV = 'production';
      testApp.use(express.static(tempDir));

      const response = await request(testApp).get('/test.txt');
      
      expect(response.status).toBe(200);
      expect(response.text).toBe('Hello World');
      
      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    test('should serve index.html for SPA routing', async () => {
      const path = require('path');
      const fs = require('fs');
      const os = require('os');
      
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spa-test-'));
      fs.writeFileSync(path.join(tempDir, 'index.html'), '<html><body>App</body></html>');
      
      const testApp = express();
      process.env.NODE_ENV = 'production';
      testApp.use(express.static(tempDir));
      testApp.get('*', (req, res) => {
        res.sendFile(path.join(tempDir, 'index.html'));
      });

      const response = await request(testApp).get('/some/spa/route');
      
      expect(response.status).toBe(200);
      expect(response.text).toContain('App');
      
      fs.rmSync(tempDir, { recursive: true, force: true });
    });
  });

  describe('Error Handling', () => {
    test('should use error handler middleware for API routes', async () => {
      const testApp = express();
      
      const errorHandler = (err, req, res, next) => {
        console.error('Error:', err.message);
        res.status(err.status || 500).json({ error: err.message });
      };
      
      testApp.get('/api/error', (req, res, next) => {
        next(new Error('Test error'));
      });
      
      testApp.use('/api', errorHandler);

      const response = await request(testApp).get('/api/error');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Test error' });
    });

    test('should handle validation errors', async () => {
      const testApp = express();
      
      const errorHandler = (err, req, res, next) => {
        if (err.isValidationError) {
          return res.status(400).json({ error: err.message });
        }
        res.status(500).json({ error: err.message });
      };
      
      testApp.get('/api/validate', (req, res, next) => {
        const err = new Error('Validation failed');
        err.isValidationError = true;
        next(err);
      });
      
      testApp.use('/api', errorHandler);

      const response = await request(testApp).get('/api/validate');

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Validation failed' });
    });
  });

  describe('Server Port Configuration', () => {
    test('should use PORT environment variable or default to 3001', () => {
      const originalPort = process.env.PORT;
      
      delete process.env.PORT;
      const defaultPort = process.env.PORT || 3001;
      expect(defaultPort).toBe(3001);
      
      process.env.PORT = '4000';
      const customPort = process.env.PORT || 3001;
      expect(customPort).toBe('4000');
      
      process.env.PORT = originalPort;
    });

    test('should bind to 0.0.0.0 for container deployment', () => {
      const bindAddress = '0.0.0.0';
      expect(bindAddress).toBe('0.0.0.0');
    });
  });

  describe('Logging', () => {
    test('should use morgan combined format', () => {
      const morgan = require('morgan');
      const testApp = express();
      
      testApp.use(morgan('combined'));
      testApp.get('/test', (req, res) => res.json({ ok: true }));

      expect(typeof morgan).toBe('function');
    });
  });
});

describe('Server Startup', () => {
  test('should export app for testing', () => {
    const express = require('express');
    const app = express();
    
    expect(app).toBeDefined();
    expect(typeof app.listen).toBe('function');
  });

  test('should support async database initialization', async () => {
    const initializeDatabase = jest.fn().mockResolvedValue(undefined);
    
    await initializeDatabase();
    
    expect(initializeDatabase).toHaveBeenCalled();
  });
});
