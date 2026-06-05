require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const mongoose = require("mongoose");
const ChatModel = require("../chatapp/models/ChatModel.mongo");

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const m = new ChatModel();
  const col = mongoose.connection.db.collection("conversaciones");

  const cerrada = await col.findOne({
    estado: "cerrada",
    $or: [{ agenteId: "413" }, { agente_id: "413" }],
  });

  if (!cerrada) {
    console.log("No hay conversación cerrada para probar");
    await mongoose.disconnect();
    return;
  }

  const id = String(cerrada._id);
  console.log("before", cerrada.estado, cerrada.fin);

  await m.updateConversationState(id, "abierta", "413", true);

  const after = await col.findOne({ _id: cerrada._id });
  console.log("after", after.estado, after.fin);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
