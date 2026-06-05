require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const crypto = require("crypto");
const mysql = require("mysql2/promise");

async function main() {
  const usuario = process.argv[2] || "admin";
  const password = process.argv[3] || "";

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306,
  });

  const [rows] = await conn.query(
    "SELECT id, usuario, nombre, perfil, password FROM crm WHERE usuario = ? LIMIT 1",
    [usuario],
  );
  const row = rows[0];
  if (!row) {
    console.log("Usuario no encontrado:", usuario);
    await conn.end();
    return;
  }

  console.log({
    id: row.id,
    usuario: row.usuario,
    nombre: row.nombre,
    perfil: row.perfil,
    passwordHash: row.password,
    passwordLen: String(row.password || "").length,
  });

  if (password) {
    const inputHash = crypto.createHash("md5").update(password).digest("hex");
    const stored = String(row.password || "").trim().toLowerCase();
    console.log({
      inputHash,
      match: stored === inputHash,
    });
  }

  await conn.end();
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
