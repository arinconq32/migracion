function createCorsConfig() {
  const origin = process.env.FRONT_ORIGIN || 'http://localhost:5173';

  return {
    origin,
    credentials: true,
  };
}

module.exports = {
  createCorsConfig,
};
