const assert = require('node:assert/strict');
const test = require('node:test');
const mongoose = require('mongoose');
const request = require('supertest');

const app = require('../src/app');

test('GET /api/health reports that the API is running', async () => {
  const response = await request(app).get('/api/health');

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { status: 'ok' });
});

test('GET /api/health/ready reports an unavailable database connection', async () => {
  const response = await request(app).get('/api/health/ready');

  assert.equal(response.status, 503);
  assert.deepEqual(response.body, {
    status: 'not ready',
    database: 'disconnected'
  });

  await mongoose.disconnect();
});

test('unknown routes return a JSON 404 response', async () => {
  const response = await request(app).get('/api/missing');

  assert.equal(response.status, 404);
  assert.deepEqual(response.body, { error: 'Route not found' });
});
