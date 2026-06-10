require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const mongoose = require("mongoose");
const mysql = require("mysql2/promise");

function normalizeKey(value) {
  const raw = String(value ?? "").trim();
  if (!raw || raw === "undefined" || raw === "null") return "";
  return raw;
}

async function loadCrmUsers() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306,
  });

  const [rows] = await conn.query(
    "SELECT id, usuario, nombre, exten FROM crm ORDER BY id",
  );
  await conn.end();
  return rows;
}

function buildLookup(users) {
  const byKey = new Map();

  for (const user of users) {
    const crmId = String(user.id).trim();
    const record = {
      crmId,
      usuario: normalizeKey(user.usuario),
      nombre: normalizeKey(user.nombre),
      exten: normalizeKey(user.exten),
    };

    const keys = [crmId, record.usuario, record.exten, String(Number(crmId))];
    for (const key of keys) {
      if (!key) continue;
      byKey.set(key, record);
    }
  }

  return byKey;
}

function resolveAgent(byKey, rawValue) {
  const key = normalizeKey(rawValue);
  if (!key) return null;
  return byKey.get(key) || byKey.get(String(Number(key))) || null;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const users = await loadCrmUsers();
  const byKey = buildLookup(users);

  await mongoose.connect(
    process.env.MONGO_URI || "mongodb://localhost:27017/omnicanalidad",
  );
  const db = mongoose.connection.db;
  const col = db.collection("conversaciones");

  const conversations = await col.find({}).toArray();
  let updated = 0;
  let alreadyOk = 0;
  let unresolved = 0;
  const changes = [];

  for (const conv of conversations) {
    const current = normalizeKey(conv.agenteId ?? conv.agente_id);
    if (!current) {
      alreadyOk += 1;
      continue;
    }

    const agent = resolveAgent(byKey, current);
    if (!agent) {
      unresolved += 1;
      changes.push({
        convId: String(conv._id),
        telefono: conv.telefono || "",
        estado: conv.estado || "",
        from: current,
        to: null,
        reason: "agente no encontrado en CRM",
      });
      continue;
    }

    const nextId = agent.crmId;
    const nextExten = agent.exten || null;
    const currentId = String(conv.agenteId ?? conv.agente_id ?? "");
    const sameId = currentId === nextId;

    if (sameId && String(conv.agente_id ?? currentId) === nextId) {
      alreadyOk += 1;
      continue;
    }

    const update = {
      agenteId: nextId,
      agente_id: nextId,
      ultima_actividad: new Date(),
    };
    if (nextExten) {
      update.agente_destino_exten = nextExten;
    }

    changes.push({
      convId: String(conv._id),
      telefono: conv.telefono || "",
      estado: conv.estado || "",
      from: current,
      to: nextId,
      exten: nextExten,
      usuario: agent.usuario,
    });

    if (!dryRun) {
      await col.updateOne({ _id: conv._id }, { $set: update });
    }
    updated += 1;
  }

  const summary = {
    total: conversations.length,
    updated,
    alreadyOk,
    unresolved,
    dryRun,
  };

  console.log("Resumen:", JSON.stringify(summary, null, 2));
  if (changes.length) {
    console.log("Cambios:", JSON.stringify(changes, null, 2));
  }

  const activas = await col
    .find({ estado: { $in: ["abierta", "nuevo", "pendiente", "activa"] } })
    .project({ agenteId: 1, agente_id: 1, estado: 1, telefono: 1 })
    .toArray();

  const porAgente = {};
  for (const item of activas) {
    const agent = normalizeKey(item.agenteId ?? item.agente_id) || "SIN_AGENTE";
    porAgente[agent] = (porAgente[agent] || 0) + 1;
  }

  console.log("Activas por agente:", JSON.stringify(porAgente, null, 2));
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
