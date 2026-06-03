const mongoose = require("mongoose");

async function main() {
  await mongoose.connect("mongodb://localhost:27017/omnicanalidad");
  const col = mongoose.connection.db.collection("mensajes");

  const broken = await col
    .find({ $or: [{ id: null }, { id: { $exists: false } }] })
    .toArray();

  let fixed = 0;
  for (const doc of broken) {
    const nextId = String(doc._id);
    await col.updateOne({ _id: doc._id }, { $set: { id: nextId, legacyId: nextId } });
    fixed += 1;
  }

  console.log(`Mensajes reparados (id null): ${fixed}`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
