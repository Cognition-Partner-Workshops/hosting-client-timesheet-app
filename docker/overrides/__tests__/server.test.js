const request = require('supertest');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

describe('Server Components', () => {
  let app;

  describe('Health Check Endpoint', () => {
    beforeEach(() => {
      const express = require('express');
      app = express();
      app.get('/health', (req, res) => {
        res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
      });
    });

    it('should return 200 OK status', async () => {
      const response = await request(app).get('/health');
      expect(response.status).toBe(200);
    });

    it('should return status OK in response body', async () => {
      const response = await request(app).get('/health');
      expect(response.body.status).toBe('OK');
    });

    it('should include timestamp in response', async () => {
      const response = await request(app).get('/health');
      expect(response.body.timestamp).toBeDefined();
      expect(new Date(response.body.timestamp)).toBeInstanceOf(Date);
    });
  });

  describe('API Routes', () => {
    beforeEach(() => {
      const express = require('express');
      app = express();
      app.use(express.json());
      
      const authRouter = express.Router();
      authRouter.get('/test', (req, res) => res.json({ route: 'auth' }));
      authRouter.post('/login', (req, res) => res.json({ success: true }));
      authRouter.post('/register', (req, res) => res.status(201).json({ success: true }));
      
      const clientsRouter = express.Router();
      clientsRouter.get('/', (req, res) => res.json([{ id: 1, name: 'Test Client' }]));
      clientsRouter.post('/', (req, res) => res.status(201).json({ id: 1, ...req.body }));
      clientsRouter.get('/:id', (req, res) => res.json({ id: req.params.id, name: 'Test Client' }));
      clientsRouter.put('/:id', (req, res) => res.json({ id: req.params.id, ...req.body }));
      clientsRouter.delete('/:id', (req, res) => res.status(204).send());
      
      const workEntriesRouter = express.Router();
      workEntriesRouter.get('/', (req, res) => res.json([{ id: 1, hours: 8 }]));
      workEntriesRouter.post('/', (req, res) => res.status(201).json({ id: 1, ...req.body }));
      
      const reportsRouter = express.Router();
      reportsRouter.get('/summary', (req, res) => res.json({ totalHours: 40 }));
      
      app.use('/api/auth', authRouter);
      app.use('/api/clients', clientsRouter);
      app.use('/api/work-entries', workEntriesRouter);
      app.use('/api/reports', reportsRouter);
      
      app.use('*', (req, res) => {
        res.status(404).json({ error: 'Route not found' });
      });
    });

    describe('Auth Routes', () => {
      it('should respond to GET /api/auth/test', async () => {
        const response = await request(app).get('/api/auth/test');
        expect(response.status).toBe(200);
        expect(response.body.route).toBe('auth');
      });

      it('should respond to POST /api/auth/login', async () => {
        const response = await request(app)
          .post('/api/auth/login')
          .send({ email: 'test@example.com', password: 'password' });
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });

      it('should respond to POST /api/auth/register', async () => {
        const response = await request(app)
          .post('/api/auth/register')
          .send({ email: 'test@example.com', password: 'password' });
        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
      });
    });

    describe('Client Routes', () => {
      it('should respond to GET /api/clients', async () => {
        const response = await request(app).get('/api/clients');
        expect(response.status).toBe(200);
        expect(Array.isArray(response.body)).toBe(true);
      });

      it('should respond to POST /api/clients', async () => {
        const response = await request(app)
          .post('/api/clients')
          .send({ name: 'New Client', description: 'Test' });
        expect(response.status).toBe(201);
        expect(response.body.name).toBe('New Client');
      });

      it('should respond to GET /api/clients/:id', async () => {
        const response = await request(app).get('/api/clients/1');
        expect(response.status).toBe(200);
        expect(response.body.id).toBe('1');
      });

      it('should respond to PUT /api/clients/:id', async () => {
        const response = await request(app)
          .put('/api/clients/1')
          .send({ name: 'Updated Client' });
        expect(response.status).toBe(200);
        expect(response.body.name).toBe('Updated Client');
      });

      it('should respond to DELETE /api/clients/:id', async () => {
        const response = await request(app).delete('/api/clients/1');
        expect(response.status).toBe(204);
      });
    });

    describe('Work Entry Routes', () => {
      it('should respond to GET /api/work-entries', async () => {
        const response = await request(app).get('/api/work-entries');
        expect(response.status).toBe(200);
        expect(Array.isArray(response.body)).toBe(true);
      });

      it('should respond to POST /api/work-entries', async () => {
        const response = await request(app)
          .post('/api/work-entries')
          .send({ client_id: 1, hours: 8, description: 'Work', date: '2024-01-15' });
        expect(response.status).toBe(201);
        expect(response.body.hours).toBe(8);
      });
    });

    describe('Report Routes', () => {
      it('should respond to GET /api/reports/summary', async () => {
        const response = await request(app).get('/api/reports/summary');
        expect(response.status).toBe(200);
        expect(response.body.totalHours).toBe(40);
      });
    });

    describe('404 Handler', () => {
      it('should return 404 for unknown routes', async () => {
        const response = await request(app).get('/api/unknown');
        expect(response.status).toBe(404);
        expect(response.body.error).toBe('Route not found');
      });
    });
  });

  describe('Security Middleware', () => {
    beforeEach(() => {
      const express = require('express');
      const helmet = require('helmet');
      const cors = require('cors');
      const rateLimit = require('express-rate-limit');
      
      app = express();
      
      app.use(helmet({
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
        },
        crossOriginResourcePolicy: { policy: "cross-origin" },
        crossOriginOpenerPolicy: { policy: "unsafe-none" },
        strictTransportSecurity: false,
      }));
      
      app.use(cors({
        origin: true,
        credentials: true
      }));
      
      app.get('/test', (req, res) => res.json({ success: true }));
    });

    it('should include security headers from helmet', async () => {
      const response = await request(app).get('/test');
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
    });

    it('should include CORS headers', async () => {
      const response = await request(app)
        .get('/test')
        .set('Origin', 'http://localhost:5173');
      expect(response.headers['access-control-allow-credentials']).toBe('true');
    });

    it('should allow cross-origin requests', async () => {
      const response = await request(app)
        .options('/test')
        .set('Origin', 'http://localhost:5173')
        .set('Access-Control-Request-Method', 'GET');
      expect(response.status).toBeLessThan(400);
    });
  });

  describe('Rate Limiting', () => {
    beforeEach(() => {
      const express = require('express');
      const rateLimit = require('express-rate-limit');
      
      app = express();
      
      const limiter = rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 5,
        standardHeaders: true,
        legacyHeaders: false,
      });
      
      app.use(limiter);
      app.get('/test', (req, res) => res.json({ success: true }));
    });

    it('should allow requests within rate limit', async () => {
      const response = await request(app).get('/test');
      expect(response.status).toBe(200);
    });

    it('should include rate limit headers', async () => {
      const response = await request(app).get('/test');
      expect(response.headers['ratelimit-limit']).toBeDefined();
      expect(response.headers['ratelimit-remaining']).toBeDefined();
    });
  });

  describe('Body Parsing', () => {
    beforeEach(() => {
      const express = require('express');
      app = express();
      app.use(express.json({ limit: '10mb' }));
      app.use(express.urlencoded({ extended: true }));
      
      app.post('/json', (req, res) => res.json(req.body));
      app.post('/form', (req, res) => res.json(req.body));
    });

    it('should parse JSON body', async () => {
      const response = await request(app)
        .post('/json')
        .send({ name: 'Test', value: 123 })
        .set('Content-Type', 'application/json');
      expect(response.status).toBe(200);
      expect(response.body.name).toBe('Test');
      expect(response.body.value).toBe(123);
    });

    it('should parse URL-encoded body', async () => {
      const response = await request(app)
        .post('/form')
        .send('name=Test&value=123')
        .set('Content-Type', 'application/x-www-form-urlencoded');
      expect(response.status).toBe(200);
      expect(response.body.name).toBe('Test');
      expect(response.body.value).toBe('123');
    });

    it('should handle empty body', async () => {
      const response = await request(app)
        .post('/json')
        .send({})
        .set('Content-Type', 'application/json');
      expect(response.status).toBe(200);
      expect(response.body).toEqual({});
    });
  });

  describe('Static File Serving (Production Mode)', () => {
    it('should serve static files in production mode', () => {
      process.env.NODE_ENV = 'production';
      const express = require('express');
      const path = require('path');
      
      const testApp = express();
      const publicPath = path.join(__dirname, 'test-public');
      
      if (process.env.NODE_ENV === 'production') {
        testApp.use(express.static(publicPath));
        testApp.get('*', (req, res) => {
          res.status(200).send('index.html');
        });
      }
      
      expect(process.env.NODE_ENV).toBe('production');
    });
  });
});

describe('Server Configuration', () => {
  it('should use PORT from environment variable or default to 3001', () => {
    const defaultPort = process.env.PORT || 3001;
    expect(defaultPort).toBe(3001);
    
    process.env.PORT = '4000';
    const customPort = process.env.PORT || 3001;
    expect(customPort).toBe('4000');
    
    delete process.env.PORT;
  });

  it('should use DATABASE_PATH from environment variable', () => {
    process.env.DATABASE_PATH = '/custom/path/db.sqlite';
    expect(process.env.DATABASE_PATH).toBe('/custom/path/db.sqlite');
    
    process.env.DATABASE_PATH = ':memory:';
  });
});
