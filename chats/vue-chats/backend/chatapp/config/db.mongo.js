const mongoose = require("mongoose");

async function ensureConversationIndexes(db) {
  const col = db.collection("conversaciones");

  const broken = await col
    .find({
      $or: [{ legacyId: null }, { legacyId: { $exists: false } }],
    })
    .project({ _id: 1 })
    .toArray();

  for (const doc of broken) {
    const legacyId = String(doc._id);
    await col.updateOne(
      { _id: doc._id },
      { $set: { legacyId, id: legacyId } },
    );
  }

  if (broken.length > 0) {
    console.log(
      `🔧 conversaciones: asignado legacyId a ${broken.length} documento(s) sin id legado`,
    );
  }

  const indexes = await col.indexes();
  const legacyIndex = indexes.find((idx) => idx.name === "legacyId_1");
  const needsRecreate =
    legacyIndex && legacyIndex.unique && legacyIndex.sparse !== true;

  if (needsRecreate) {
    await col.dropIndex("legacyId_1");
    console.log("🔧 conversaciones: índice legacyId_1 recreado como sparse+unique");
  }

  if (!legacyIndex || needsRecreate) {
    await col.createIndex({ legacyId: 1 }, { unique: true, sparse: true });
  }
}

async function connectMongo() {
  const uri = process.env.MONGO_URI || "mongodb://localhost:27017/omnicanalidad";
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  const dbName = db ? db.databaseName : mongoose.connection.name;
  console.log("✅ Conectado a URI:", uri);
  console.log("✅ Base de datos activa:", dbName);

  if (db) {
    try {
      await ensureConversationIndexes(db);
    } catch (error) {
      console.warn(
        "⚠️ No se pudo ajustar índices de conversaciones:",
        error.message,
      );
    }
  }

  if (process.env.DEBUG_MONGO === "1" && db) {
    const collections = await db.listCollections().toArray();
    console.log(
      "Colecciones:",
      collections.map((col) => col.name).join(", "),
    );
  }
}

module.exports = { connectMongo, mongoose };
