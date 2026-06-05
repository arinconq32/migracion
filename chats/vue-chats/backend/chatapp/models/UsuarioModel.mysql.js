const pool = require("../config/db");

let dbBundle;

function getDbPool() {
  if (!dbBundle) {
    dbBundle = pool.createDbPoolBundle();
  }
  return dbBundle.pool;
}

async function getAllUsuarios() {
  const [rows] = await getDbPool().query("SELECT * FROM crm");
  return rows;
}

async function findByUsuario(usuario) {
  const login = String(usuario || "").trim();
  if (!login) return null;

  const [rows] = await getDbPool().query(
    "SELECT * FROM crm WHERE usuario = ? LIMIT 1",
    [login],
  );
  return rows[0] || null;
}

async function touchUltimoLogin(userId, tokenSesion) {
  const id = String(userId || "").trim();
  if (!id) return;

  await getDbPool().query(
    `UPDATE crm
     SET ultimo_login = NOW(), ultima_conexion = NOW(), token_sesion = ?
     WHERE id = ?`,
    [tokenSesion, id],
  );
}

module.exports = { getAllUsuarios, findByUsuario, touchUltimoLogin };
