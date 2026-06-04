/**
 * Diagnóstico: dónde están los mensajes que guarda el chat.
 * Ejecutar: node scripts/ver-mensajes-compass.js
 */
require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");

async function main() {
  const uri = process.env.MONGO_URI || "mongodb://localhost:27017/omnicanalidad";
  console.log("\n=== CONEXIÓN (la misma que usa server.js) ===");
  console.log(uri);

  await mongoose.connect(uri);
  const db = mongoose.connection.db;

  const { databases } = await db.admin().listDatabases();
  console.log("\n=== BASES DE DATOS en localhost:27017 ===");
  for (const d of databases) {
    const dbi = mongoose.connection.client.db(d.name);
    const cols = await dbi.listCollections().toArray();
    const hasMensajes = cols.some((c) => c.name === "mensajes");
    let n = 0;
    if (hasMensajes) n = await dbi.collection("mensajes").countDocuments();
    const mark = d.name === "omnicanalidad" ? "  <-- ABRIR ESTA" : "";
    console.log(`  - ${d.name}: colección mensajes = ${hasMensajes ? n + " docs" : "(no existe)"}${mark}`);
  }

  const total = await db.collection("mensajes").countDocuments();
  const ultimo = await db.collection("mensajes").findOne({}, { sort: { ts: -1 } });

  console.log("\n=== COLECCIÓN omnicanalidad.mensajes ===");
  console.log("Total documentos:", total);
  if (ultimo) {
    console.log("Último mensaje guardado:");
    console.log("  _id:", ultimo._id);
    console.log("  conversacionId:", ultimo.conversacionId || ultimo.conversacion_id);
    console.log("  texto:", ultimo.mensaje || ultimo.texto || ultimo.text);
    console.log("  ts:", ultimo.ts);
  }

  const convIds = [
    "6a1df57781b73f27a0cec617",
    "6a1df57781b73f27a0cec618",
  ];
  console.log("\n=== Mensajes por conversación (IDs del log del servidor) ===");
  for (const convId of convIds) {
    const n = await db.collection("mensajes").countDocuments({
      $or: [{ conversacionId: convId }, { conversacion_id: convId }],
    });
    console.log(`  conv ${convId}: ${n} mensajes`);
  }

  const out = path.join(__dirname, "ultimos-mensajes-export.json");
  const sample = await db
    .collection("mensajes")
    .find({})
    .sort({ ts: -1 })
    .limit(10)
    .toArray();
  fs.writeFileSync(out, JSON.stringify(sample, null, 2), "utf8");
  console.log("\n=== Archivo para abrir en el bloc de notas ===");
  console.log(out);

  console.log("\n=== EN MONGODB COMPASS ===");
  console.log("1. URI: mongodb://127.0.0.1:27017");
  console.log("2. Base: omnicanalidad");
  console.log("3. Colección: mensajes  (NO mensajes_internos, NO conversaciones)");
  console.log("4. Quita cualquier filtro en la barra de búsqueda");
  console.log("5. Ordena por campo: ts  descendente\n");

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
