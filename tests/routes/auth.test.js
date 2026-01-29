const request = require('supertest');
const express = require('express');
const authRoutes = require('../../docker/overrides/routes/auth');

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);

describe('Auth Routes', () => {
  describe('POST /api/auth/login', () => {
    test('should login with valid email', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@example.com' });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Login successful');
      expect(response.body.user.email).toBe('test@example.com');
    });

    test('should return 400 when email is missing', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Email is required');
    });

    test('should return 400 when email is empty', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: '' });

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/auth/me', () => {
    test('should return user info when x-user-email header is provided', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('x-user-email', 'test@example.com');

      expect(response.status).toBe(200);
      expect(response.body.user.email).toBe('test@example.com');
    });

    test('should return 401 when x-user-email header is missing', async () => {
      const response = await request(app).get('/api/auth/me');

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('User email required');
    });
  });
});
