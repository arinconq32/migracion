const mysql = require("mysql2/promise");

function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function buildPoolConfig(prefix = "DB") {
  const host = process.env[`${prefix}_HOST`] || process.env.DB_HOST;
  const user = process.env[`${prefix}_USER`] || process.env.DB_USER;
  const password = process.env[`${prefix}_PASSWORD`] || process.env.DB_PASSWORD;
  const database = process.env[`${prefix}_NAME`] || process.env.DB_NAME;

  if (!host || !user || !database) {
    return null;
  }

  return {
    host,
    user,
    password,
    database,
    port: toNumber(process.env[`${prefix}_PORT`] || process.env.DB_PORT, 3306),
    waitForConnections: true,
    connectionLimit: toNumber(
      process.env[`${prefix}_CONNECTION_LIMIT`] ||
        process.env.DB_CONNECTION_LIMIT,
      10,
    ),
    queueLimit: 0,
    namedPlaceholders: false,
    charset:
      process.env[`${prefix}_CHARSET`] || process.env.DB_CHARSET || "utf8mb4",
  };
}

function createPoolFromPrefix(prefix = "DB") {
  const config = buildPoolConfig(prefix);
  return config ? mysql.createPool(config) : null;
}

function createDbPoolBundle() {
  const pool = createPoolFromPrefix("DB");
  if (!pool) {
    throw new Error(
      "DB_HOST, DB_USER y DB_NAME son requeridos para USE_SQL_MODEL=true",
    );
  }

  return {
    pool,
    poolTipificaciones: createPoolFromPrefix("TIPIFICACIONES_DB") || pool,
    poolUsuariosB: createPoolFromPrefix("USUARIOSB_DB") || pool,
    poolColas: createPoolFromPrefix("COLAS_DB") || pool,
  };
}

module.exports = {
  createDbPoolBundle,
};
