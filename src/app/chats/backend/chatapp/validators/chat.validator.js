function validateSendMessage(req, _res, next) {
  const { text } = req.body || {};

  if (typeof text !== 'string' || !text.trim()) {
    const error = new Error('text is required');
    error.status = 400;
    return next(error);
  }

  if (text.length > 2000) {
    const error = new Error('text exceeds max length (2000)');
    error.status = 400;
    return next(error);
  }

  return next();
}

module.exports = {
  validateSendMessage,
};
