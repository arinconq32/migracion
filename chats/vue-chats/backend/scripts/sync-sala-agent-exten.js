require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const mongoose = require("mongoose");
const mysql = require("mysql2/promise");

async function loadUsers() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306,
  });
  const [rows] = await conn.query("SELECT id, usuario, exten FROM crm");
  await conn.end();

  const byId = new Map();
  for (const row of rows) {
    byId.set(String(row.id), {
      crmId: String(row.id),
      exten: String(row.exten || "").trim(),
      usuario: String(row.usuario || "").trim(),
    });
  }
  return byId;
}

function rebuildSalaId(salaId, telefono, exten, legacyId) {
  const phone = String(telefono || "").trim();
  const ext = String(exten || "").trim();
  if (!phone || !ext) return null;

  const current = String(salaId || "").trim();
  const parts = current.split("-");
  const suffix = parts.length >= 3 ? parts.slice(2).join("-") : String(legacyId || Date.now());

  return `${phone}-${ext}-${suffix}`;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const users = await loadUsers();

  await mongoose.connect(
    process.env.MONGO_URI || "mongodb://localhost:27017/omnicanalidad",
  );
  const col = mongoose.connection.db.collection("conversaciones");
  const openStates = ["abierta", "nuevo", "pendiente", "activa"];
  const rows = await col.find({ estado: { $in: openStates } }).toArray();
  const changes = [];

  for (const conv of rows) {
    const agentId = String(conv.agenteId ?? conv.agente_id ?? "").trim();
    const user = users.get(agentId);
    if (!user?.exten || user.exten === "undefined") continue;

    const nextSala = rebuildSalaId(
      conv.salaId || conv.sala_id,
      conv.telefono,
      user.exten,
      conv.legacyId || conv.id,
    );
    if (!nextSala || nextSala === String(conv.salaId || conv.sala_id || "")) {
      continue;
    }

    changes.push({
      convId: String(conv._id),
      telefono: conv.telefono,
      agenteId: agentId,
      usuario: user.usuario,
      fromSala: conv.salaId || conv.sala_id,
      toSala: nextSala,
    });

    if (!dryRun) {
      await col.updateOne(
        { _id: conv._id },
        {
          $set: {
            salaId: nextSala,
            sala_id: nextSala,
            agente_destino_exten: user.exten,
            ultima_actividad: new Date(),
          },
        },
      );
    }
  }

  console.log(JSON.stringify({ dryRun, updated: changes.length, changes }, null, 2));
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
