const request = require('supertest');
const express = require('express');
const clientRoutes = require('../../docker/overrides/routes/clients');

describe('Client Routes', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/clients', clientRoutes);
  });

  describe('GET /api/clients', () => {
    test('should return clients array', async () => {
      const response = await request(app).get('/api/clients');

      expect(response.status).toBe(200);
      expect(response.body.clients).toBeDefined();
      expect(Array.isArray(response.body.clients)).toBe(true);
    });
  });

  describe('GET /api/clients/:id', () => {
    test('should return 400 for invalid client ID', async () => {
      const response = await request(app).get('/api/clients/invalid');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid client ID');
    });

    test('should return 404 for non-existent client', async () => {
      const response = await request(app).get('/api/clients/999');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Client not found');
    });
  });

  describe('POST /api/clients', () => {
    test('should create client with valid data', async () => {
      const response = await request(app)
        .post('/api/clients')
        .send({ name: 'Test Client', description: 'Test Description' });

      expect(response.status).toBe(201);
      expect(response.body.message).toBe('Client created');
      expect(response.body.client.name).toBe('Test Client');
    });

    test('should return 400 when name is missing', async () => {
      const response = await request(app)
        .post('/api/clients')
        .send({ description: 'No name provided' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Name is required');
    });
  });

  describe('PUT /api/clients/:id', () => {
    test('should return 400 for invalid client ID', async () => {
      const response = await request(app)
        .put('/api/clients/invalid')
        .send({ name: 'Updated' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid client ID');
    });

    test('should return 404 for non-existent client', async () => {
      const response = await request(app)
        .put('/api/clients/999')
        .send({ name: 'Updated' });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Client not found');
    });
  });

  describe('DELETE /api/clients/:id', () => {
    test('should return 400 for invalid client ID', async () => {
      const response = await request(app).delete('/api/clients/invalid');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid client ID');
    });

    test('should return 404 for non-existent client', async () => {
      const response = await request(app).delete('/api/clients/999');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Client not found');
    });
  });
});
