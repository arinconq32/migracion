function authMiddleware(req, _res, next) {
  const authHeader = req.headers.authorization || '';

  if (!authHeader.startsWith('Bearer ')) {
    req.user = { id: 'anonymous' };
    return next();
  }

  const token = authHeader.slice('Bearer '.length).trim();
  req.user = { id: token || 'anonymous' };
  return next();
}

module.exports = authMiddleware;
