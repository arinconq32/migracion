require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const mongoose = require("mongoose");
const ChatModel = require("../chatapp/models/ChatModel.mongo");
const { conversationPhoneKey } = require("../chatapp/utils/conversationDedup");

async function main() {
  const agentId = process.argv[2] || "413";
  await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/omnicanalidad");
  const model = new ChatModel();
  const col = mongoose.connection.db.collection("conversaciones");

  const filter = {
    $or: [
      { agenteId: agentId },
      { agente_id: agentId },
      { agenteId: Number(agentId) },
      { agente_id: Number(agentId) },
    ],
  };

  const all = await col.find(filter).toArray();
  const byPhone = new Map();
  for (const c of all) {
    const key = conversationPhoneKey(c) || `id:${c._id}`;
    if (!byPhone.has(key)) byPhone.set(key, []);
    byPhone.get(key).push(c);
  }

  console.log(`\nAgente ${agentId}: ${all.length} conversaciones, ${byPhone.size} teléfonos únicos\n`);

  for (const [phone, rows] of byPhone) {
    if (rows.length < 2) continue;
    console.log(`--- ${phone} (${rows.length} registros) ---`);
    for (const r of rows) {
      console.log(
        `  ${r._id} estado=${r.estado} inicio=${r.inicio} fin=${r.fin || "-"} ultima=${r.ultima_actividad}`,
      );
    }
  }

  const activosRaw = await model.getConversaciones(agentId, "abierta");
  const cerradosRaw = await model.getConversaciones(agentId, "cerrada");

  console.log(`\nabierta en BD (deduped): ${activosRaw.length}`);
  for (const a of activosRaw) {
    const superseded = model.isSupersededActiveConversation(a, cerradosRaw);
    const inconsistent = model.isInconsistentAbierta(a);
    console.log(
      `  ${a.id} phone=${conversationPhoneKey(a)} superseded=${superseded} inconsistent=${inconsistent} fin=${a.fin || "-"}`,
    );
  }

  const visible = await model.getVisibleQueueState(agentId);
  console.log(`\nvisible activos: ${visible.activos.length}`);
  console.log(`visible ids: ${visible.activos.map((c) => c.id).join(", ")}`);

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
