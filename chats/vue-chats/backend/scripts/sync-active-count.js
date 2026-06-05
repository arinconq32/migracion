require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const mongoose = require("mongoose");
const ChatModelMongo = require("../chatapp/models/ChatModel.mongo");

async function inspectAgent(model, col, agentId) {
  const filter = {
    estado: "abierta",
    $or: [
      { agenteId: agentId },
      { agente_id: agentId },
      { agenteId: Number(agentId) },
      { agente_id: Number(agentId) },
    ],
  };
  const raw = await col
    .find(filter)
    .project({
      _id: 1,
      id: 1,
      telefono: 1,
      inicio: 1,
      ultima_actividad: 1,
      fin: 1,
    })
    .toArray();
  const visible = await model.getVisibleQueueState(agentId);
  const count = await model.countActiveConversations(agentId);
  return {
    agent: agentId,
    rawAbierta: raw.length,
    raw,
    visibleActivos: visible.activos.length,
    visibleIds: visible.activos.map((c) => c.id),
    count,
  };
}

async function main() {
  const agentId = process.argv[2];
  await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/omnicanalidad");
  const model = new ChatModelMongo();
  const col = mongoose.connection.db.collection("conversaciones");

  if (agentId) {
    const synced = await model.syncActiveConversations(agentId);
    const after = await inspectAgent(model, col, agentId);
    console.log(JSON.stringify({ ...after, reconciled: synced.reconciled }, null, 2));
    await mongoose.disconnect();
    return;
  }

  const agents = await col.distinct("agenteId", { estado: "abierta" });
  const agents2 = await col.distinct("agente_id", { estado: "abierta" });
  const unique = [...new Set([...agents, ...agents2].map(String))];

  for (const agent of unique) {
    const info = await inspectAgent(model, col, agent);
    if (info.rawAbierta > 0) console.log(JSON.stringify(info, null, 2));
  }

  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
