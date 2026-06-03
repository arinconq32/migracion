function errorMiddleware(err, _req, res, _next) {
  const status = err.status || 500;
  const message = err.message || 'Internal server error';

  if (status >= 500) {
    console.error('[chatapp:error]', err);
  }

  res.status(status).json({
    ok: false,
    error: {
      message,
      status,
    },
  });
}

module.exports = errorMiddleware;
