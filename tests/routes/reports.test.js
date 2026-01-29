const request = require('supertest');
const express = require('express');
const reportRoutes = require('../../docker/overrides/routes/reports');

describe('Report Routes', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/reports', reportRoutes);
  });

  describe('GET /api/reports/client/:clientId', () => {
    test('should return client report', async () => {
      const response = await request(app).get('/api/reports/client/1');

      expect(response.status).toBe(200);
      expect(response.body.client).toBeDefined();
      expect(response.body.client.id).toBe(1);
      expect(response.body.workEntries).toBeDefined();
      expect(response.body.totalHours).toBeDefined();
      expect(response.body.entryCount).toBeDefined();
    });

    test('should return 400 for invalid client ID', async () => {
      const response = await request(app).get('/api/reports/client/invalid');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid client ID');
    });
  });

  describe('GET /api/reports/export/csv/:clientId', () => {
    test('should return CSV file', async () => {
      const response = await request(app).get('/api/reports/export/csv/1');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/csv');
      expect(response.headers['content-disposition']).toContain('attachment');
    });

    test('should return 400 for invalid client ID', async () => {
      const response = await request(app).get('/api/reports/export/csv/invalid');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid client ID');
    });
  });

  describe('GET /api/reports/export/pdf/:clientId', () => {
    test('should return PDF file', async () => {
      const response = await request(app).get('/api/reports/export/pdf/1');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('application/pdf');
      expect(response.headers['content-disposition']).toContain('attachment');
    });

    test('should return 400 for invalid client ID', async () => {
      const response = await request(app).get('/api/reports/export/pdf/invalid');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid client ID');
    });
  });
});
