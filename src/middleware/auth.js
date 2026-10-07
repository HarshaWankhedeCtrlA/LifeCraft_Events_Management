const jwt = require('jsonwebtoken');
const { sendError } = require('../utils/response');

const JWT_SECRET = process.env.JWT_ACCESS_SECRET;
const JWT_ISSUER = process.env.JWT_ISSUER;
const JWT_AUDIENCE = process.env.JWT_AUDIENCE;

const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return sendError(res, 'UNAUTHORIZED', 'Missing or malformed Authorization header', 401);
  }

  const token = authHeader.slice(7).trim();

  try {
    const payload = jwt.verify(token, JWT_SECRET, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE
    });

    const roles = Array.isArray(payload.roles)
      ? payload.roles
      : (payload.role ? [payload.role] : []);

    req.user = {
      id: payload.sub || payload.userId || payload.id,
      email: payload.email || null,
      roles,
      role: roles[0] || 'user',
      sessionId: payload.sid || null,
      raw: payload
    };

    if (!req.user.id) {
      return sendError(res, 'INVALID_TOKEN', 'Token is missing a user identifier', 401);
    }

    return next();
  } catch (err) {
    return sendError(res, 'INVALID_TOKEN', 'Invalid or expired token', 401);
  }
};

const requireAdmin = (req, res, next) => {
  const roles = req.user?.roles || [];
  const devAdmins = (process.env.DEV_ADMINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const isAdmin =
    roles.includes('admin') ||
    req.user?.role === 'admin' ||
    devAdmins.includes(req.user?.id);

  if (!isAdmin) {
    return sendError(res, 'FORBIDDEN', 'Admin privileges required', 403);
  }
  return next();
};

module.exports = { authenticate, requireAdmin };