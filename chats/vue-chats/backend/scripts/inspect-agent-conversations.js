require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const mongoose = require("mongoose");
const mysql = require("mysql2/promise");

async function main() {
  const agentIds = (process.argv[2] || "413,427,392").split(",").map((v) => v.trim());

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306,
  });
  const [users] = await conn.query(
    "SELECT id, usuario, nombre, exten FROM crm WHERE id IN (?)",
    [agentIds.map(Number).filter((n) => Number.isFinite(n))],
  );
  await conn.end();

  await mongoose.connect(
    process.env.MONGO_URI || "mongodb://localhost:27017/omnicanalidad",
  );
  const db = mongoose.connection.db;

  for (const user of users) {
    const id = String(user.id);
    const refs = [id, String(Number(id)), user.exten, user.usuario].filter(Boolean);
    const rows = await db
      .collection("conversaciones")
      .find({
        $or: [{ agenteId: { $in: refs } }, { agente_id: { $in: refs } }],
        estado: { $in: ["abierta", "nuevo", "pendiente", "activa"] },
      })
      .project({ telefono: 1, estado: 1, agenteId: 1, agente_id: 1 })
      .toArray();

    console.log(`\n${user.usuario} (id=${id}, exten=${user.exten}) -> ${rows.length} activas`);
    rows.forEach((row) => {
      console.log(
        `  - ${row.telefono || "(sin tel)"} | ${row.estado} | agenteId=${row.agenteId} agente_id=${row.agente_id}`,
      );
    });
  }

  const dupOpen = await db
    .collection("conversaciones")
    .aggregate([
      {
        $match: {
          telefono: { $nin: ["", null] },
          estado: { $in: ["abierta", "nuevo", "pendiente", "activa"] },
        },
      },
      {
        $group: {
          _id: "$telefono",
          count: { $sum: 1 },
          agentes: { $addToSet: "$agenteId" },
        },
      },
      { $match: { count: { $gt: 1 } } },
    ])
    .toArray();

  console.log("\nTelefonos abiertos duplicados:", JSON.stringify(dupOpen, null, 2));
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
