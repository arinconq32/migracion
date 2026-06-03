// verificar_conversaciones.js
// Script para verificar si existen conversaciones con agente_id 392 en MongoDB

const mongoose = require("mongoose");

const MONGO_URI = "mongodb://localhost:27017/omnicanalidad";

async function main() {
  await mongoose.connect(MONGO_URI);
  const Conversation = mongoose.model(
    "Conversation",
    new mongoose.Schema({}, { strict: false }),
    "conversations",
  );

  const count = await Conversation.countDocuments({ agente_id: 392 });
  console.log(`Conversaciones con agente_id 392: ${count}`);

  if (count > 0) {
    const ejemplos = await Conversation.find({ agente_id: 392 }).limit(3);
    console.log("Ejemplos:", ejemplos);
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
