require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const mongoose = require("mongoose");
const mysql = require("mysql2/promise");

const TARGET_USERS = [
  { usuario: "arinconq32", crmId: "413", exten: "3025" },
  { usuario: "asesor_prueba", crmId: "427", exten: "3037" },
];

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  await mongoose.connect(
    process.env.MONGO_URI || "mongodb://localhost:27017/omnicanalidad",
  );
  const db = mongoose.connection.db;
  const col = db.collection("conversaciones");

  const openStates = ["abierta", "nuevo", "pendiente", "activa"];
  const changes = [];

  for (const target of TARGET_USERS) {
    const refs = [target.exten, target.usuario, `Agent/${target.exten}`];
    const rows = await col
      .find({
        estado: { $in: openStates },
        $or: [
          { salaId: { $regex: target.exten, $options: "i" } },
          { sala_id: { $regex: target.exten, $options: "i" } },
          { agente_origen_exten: target.exten },
          { agente_destino_exten: target.exten },
        ],
        agenteId: { $nin: [target.crmId, Number(target.crmId)] },
        agente_id: { $nin: [target.crmId, Number(target.crmId)] },
      })
      .toArray();

    for (const conv of rows) {
      changes.push({
        convId: String(conv._id),
        telefono: conv.telefono || "",
        estado: conv.estado,
        from: String(conv.agenteId ?? conv.agente_id ?? ""),
        to: target.crmId,
        usuario: target.usuario,
        reason: `sala/exten apunta a ${target.usuario}`,
      });

      if (!dryRun) {
        await col.updateOne(
          { _id: conv._id },
          {
            $set: {
              agenteId: target.crmId,
              agente_id: target.crmId,
              agente_destino_exten: target.exten,
              ultima_actividad: new Date(),
            },
          },
        );
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        dryRun,
        updated: changes.length,
        changes,
      },
      null,
      2,
    ),
  );

  for (const target of TARGET_USERS) {
    const count = await col.countDocuments({
      estado: { $in: openStates },
      $or: [
        { agenteId: { $in: [target.crmId, Number(target.crmId)] } },
        { agente_id: { $in: [target.crmId, Number(target.crmId)] } },
      ],
    });
    console.log(`Activas ${target.usuario} (${target.crmId}): ${count}`);
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
