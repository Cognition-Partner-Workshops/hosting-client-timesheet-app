const request = require('supertest');
const express = require('express');
const workEntryRoutes = require('../../docker/overrides/routes/workEntries');

describe('Work Entry Routes', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/work-entries', workEntryRoutes);
  });

  describe('GET /api/work-entries', () => {
    test('should return work entries array', async () => {
      const response = await request(app).get('/api/work-entries');

      expect(response.status).toBe(200);
      expect(response.body.workEntries).toBeDefined();
      expect(Array.isArray(response.body.workEntries)).toBe(true);
    });

    test('should filter by clientId when provided', async () => {
      const response = await request(app).get('/api/work-entries?clientId=1');

      expect(response.status).toBe(200);
      expect(response.body.workEntries).toBeDefined();
    });

    test('should return 400 for invalid clientId filter', async () => {
      const response = await request(app).get('/api/work-entries?clientId=invalid');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid client ID');
    });
  });

  describe('GET /api/work-entries/:id', () => {
    test('should return 400 for invalid work entry ID', async () => {
      const response = await request(app).get('/api/work-entries/invalid');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid work entry ID');
    });

    test('should return 404 for non-existent work entry', async () => {
      const response = await request(app).get('/api/work-entries/999');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Work entry not found');
    });
  });

  describe('POST /api/work-entries', () => {
    test('should create work entry with valid data', async () => {
      const response = await request(app)
        .post('/api/work-entries')
        .send({
          clientId: 1,
          hours: 5.5,
          description: 'Development work',
          date: '2024-01-15'
        });

      expect(response.status).toBe(201);
      expect(response.body.message).toBe('Work entry created');
      expect(response.body.workEntry.hours).toBe(5.5);
    });

    test('should return 400 when required fields are missing', async () => {
      const response = await request(app)
        .post('/api/work-entries')
        .send({ hours: 5 });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('clientId, hours, and date are required');
    });

    test('should return 400 when clientId is missing', async () => {
      const response = await request(app)
        .post('/api/work-entries')
        .send({ hours: 5, date: '2024-01-15' });

      expect(response.status).toBe(400);
    });

    test('should return 400 when date is missing', async () => {
      const response = await request(app)
        .post('/api/work-entries')
        .send({ clientId: 1, hours: 5 });

      expect(response.status).toBe(400);
    });
  });

  describe('PUT /api/work-entries/:id', () => {
    test('should return 400 for invalid work entry ID', async () => {
      const response = await request(app)
        .put('/api/work-entries/invalid')
        .send({ hours: 8 });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid work entry ID');
    });

    test('should return 404 for non-existent work entry', async () => {
      const response = await request(app)
        .put('/api/work-entries/999')
        .send({ hours: 8 });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Work entry not found');
    });
  });

  describe('DELETE /api/work-entries/:id', () => {
    test('should return 400 for invalid work entry ID', async () => {
      const response = await request(app).delete('/api/work-entries/invalid');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid work entry ID');
    });

    test('should return 404 for non-existent work entry', async () => {
      const response = await request(app).delete('/api/work-entries/999');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Work entry not found');
    });
  });
});
