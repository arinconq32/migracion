const mongoose = require("mongoose");

async function connectMongo() {
  // Forzar conexión a la base de datos omnicanalidad
  const uri = "mongodb://localhost:27017/omnicanalidad";
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  const dbName = db ? db.databaseName : mongoose.connection.name;
  console.log("✅ Conectado a URI:", uri);
  console.log("✅ Base de datos activa:", dbName);
  if (db) {
    const collections = await db.listCollections().toArray();
    const nombresColecciones = collections.map((col) => col.name);
    console.log("Colecciones reales en la base de datos:", nombresColecciones);
    // Mostrar los primeros 5 documentos de cada colección
    for (const nombre of nombresColecciones) {
      const docs = await db.collection(nombre).find().limit(5).toArray();
      console.log(`\nColección '${nombre}':`);
      if (docs.length > 0) {
        console.log(docs);
      } else {
        console.log("(Sin documentos)");
      }
    }
  } else {
    console.log(
      "No se pudo obtener la conexión a la base de datos para listar colecciones.",
    );
  }
}

module.exports = { connectMongo, mongoose };
