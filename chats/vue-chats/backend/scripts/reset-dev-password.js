require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const crypto = require("crypto");
const mysql = require("mysql2/promise");

const DEV_PASSWORD = process.argv[2] || "Best2024";
const USERS = (process.argv[3] || "admin,arinconq32").split(",").map((u) => u.trim());

async function main() {
  const hash = crypto.createHash("md5").update(DEV_PASSWORD).digest("hex");
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306,
  });

  for (const usuario of USERS) {
    const [result] = await conn.query(
      "UPDATE crm SET password = ? WHERE usuario = ?",
      [hash, usuario],
    );
    console.log(`Usuario ${usuario}: ${result.affectedRows ? "actualizado" : "no encontrado"}`);
  }

  console.log(`Contraseña de desarrollo: ${DEV_PASSWORD}`);
  await conn.end();
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
