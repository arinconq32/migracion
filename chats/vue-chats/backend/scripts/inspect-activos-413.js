require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const mongoose = require("mongoose");

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const col = mongoose.connection.db.collection("conversaciones");
  const rows = await col
    .find({
      estado: "abierta",
      $or: [{ agenteId: "413" }, { agente_id: "413" }],
    })
    .project({
      _id: 1,
      telefono: 1,
      nombre: 1,
      origen: 1,
      inicio: 1,
      ultima_actividad: 1,
    })
    .toArray();
  console.log(JSON.stringify(rows, null, 2));
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
