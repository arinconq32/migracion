require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const mongoose = require("mongoose");

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;
  const col = db.collection("mensajes");

  console.log("\n=== ¿Existen tus mensajes recientes? ===\n");
  for (const texto of ["0000000", "GAMAN.png", "65464", "test-save-fix"]) {
    const docs = await col
      .find({ $or: [{ mensaje: texto }, { texto: texto }, { text: texto }] })
      .toArray();
    console.log(`"${texto}": ${docs.length} encontrado(s)`);
    for (const d of docs) {
      console.log(
        `   _id=${d._id}  ts=${d.ts}  timestamp=${d.timestamp}  conv=${d.conversacionId}`,
      );
    }
  }

  console.log("\n=== Primeros 5 si ordenas por ts DESC (lo que deberías ver arriba) ===\n");
  const topTs = await col.find().sort({ ts: -1 }).limit(5).toArray();
  for (const d of topTs) {
    console.log(
      `  ${String(d.mensaje || d.texto || "").slice(0, 30)} | ts=${d.ts} | _id=${d._id}`,
    );
  }

  console.log("\n=== Primeros 5 si Compass ordena por _id ASC (por defecto, mensajes VIEJOS arriba) ===\n");
  const topIdAsc = await col.find().sort({ _id: 1 }).limit(5).toArray();
  for (const d of topIdAsc) {
    console.log(
      `  ${String(d.mensaje || d.texto || "").slice(0, 30)} | ts=${d.ts} | _id=${d._id}`,
    );
  }

  console.log("\n=== Últimos 5 por _id DESC (tus mensajes nuevos deberían estar aquí) ===\n");
  const topIdDesc = await col.find().sort({ _id: -1 }).limit(5).toArray();
  for (const d of topIdDesc) {
    console.log(
      `  ${String(d.mensaje || d.texto || "").slice(0, 30)} | ts=${d.ts} | _id=${d._id}`,
    );
  }

  // Timestamps raros que desordenan la vista
  const future = await col.countDocuments({
    ts: { $gt: new Date("2027-01-01") },
  });
  const oldNum = await col.countDocuments({
    timestamp: { $gt: 9999999999999 },
  });
  console.log("\n=== Posibles fechas que confunden el orden en Compass ===");
  console.log("  ts después de 2027:", future);
  console.log("  timestamp numérico absurdo:", oldNum);

  const internos = await db.collection("mensajes_internos").countDocuments();
  console.log("\n=== ¿Estás en mensajes_internos por error? ===");
  console.log("  mensajes_internos tiene", internos, "documentos");
  console.log("  mensajes tiene", await col.countDocuments(), "documentos");

  console.log("\n=== FILTRO para pegar en Compass (barra Filter) ===\n");
  console.log('{ "mensaje": "0000000" }');
  console.log('o');
  console.log('{ "conversacionId": "6a1df57781b73f27a0cec617" }');

  await mongoose.disconnect();
}

main().catch(console.error);
