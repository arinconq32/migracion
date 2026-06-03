const mongoose = require("mongoose");

async function connectMongo() {
  const uri = process.env.MONGO_URI || "mongodb://localhost:27017/omnicanalidad";
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  const dbName = db ? db.databaseName : mongoose.connection.name;
  console.log("✅ Conectado a URI:", uri);
  console.log("✅ Base de datos activa:", dbName);

  if (process.env.DEBUG_MONGO === "1" && db) {
    const collections = await db.listCollections().toArray();
    console.log(
      "Colecciones:",
      collections.map((col) => col.name).join(", "),
    );
  }
}

module.exports = { connectMongo, mongoose };
