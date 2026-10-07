const cors = require('cors');
const express = require('express');
const helmet = require('helmet');
const mongoose = require('mongoose');

const routes = require('./routes');
const errorHandler = require('./middleware/errorHandler');

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.get('/api/health/ready', (_req, res) => {
  const isDatabaseConnected = mongoose.connection.readyState === 1;

  res.status(isDatabaseConnected ? 200 : 503).json({
    status: isDatabaseConnected ? 'ready' : 'not ready',
    database: isDatabaseConnected ? 'connected' : 'disconnected'
  });
});

// Module L routes
app.use(process.env.API_PREFIX || '/api/v1', routes);

// 404 for unknown routes
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: { code: 'ROUTE_NOT_FOUND', message: 'Route not found' }
  });
});

// Central error handler (must be last)
app.use(errorHandler);

module.exports = app;