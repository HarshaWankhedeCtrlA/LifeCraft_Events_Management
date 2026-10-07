// Catches all errors passed via next(err) and returns JSON instead of HTML.

const { sendError } = require('../utils/response');

// eslint-disable-next-line no-unused-vars
module.exports = (err, req, res, next) => {
  console.error('[events] Unhandled error:', err);

  const status = err.status || err.statusCode || 500;
  const code = err.code || 'INTERNAL_ERROR';
  const message =
    process.env.NODE_ENV === 'production'
      ? 'Something went wrong'
      : err.message || 'Internal server error';

  return sendError(res, code, message, status);
};