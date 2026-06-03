const pool = require("../config/db");

async function getAllUsuarios() {
  const [rows] = await pool
    .createDbPoolBundle()
    .pool.query("SELECT * FROM crm");
  return rows;
}

module.exports = { getAllUsuarios };
