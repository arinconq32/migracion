require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const mongoose = require("mongoose");
const { fetchMessagesForConversation } = require("../chatapp/utils/messageQuery");
const { enrichConversationsWithContacts } = require("../chatapp/utils/contactResolver");

async function main() {
  await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/omnicanalidad");
  const db = mongoose.connection.db;

  const top = await db
    .collection("mensajes")
    .aggregate([
      { $group: { _id: "$conversacionId", n: { $sum: 1 } } },
      { $sort: { n: -1 } },
      { $limit: 5 },
    ])
    .toArray();

  for (const row of top) {
    const conv = await db.collection("conversaciones").findOne({ _id: row._id });
    const id = String(row._id);
    const fetched = await fetchMessagesForConversation(db, id, conv);
    console.log("conv", id.slice(-6), "mongo", row.n, "fetch", fetched.length);
  }

  const convs = await db
    .collection("conversaciones")
    .find({ agenteId: "413" })
    .limit(2)
    .toArray();
  const enriched = await enrichConversationsWithContacts(
    db,
    convs.map((c) => ({ ...c, id: String(c._id) })),
  );
  console.log("enriched names:", enriched.map((c) => c.nombre));

  const tpfs = await db.collection("tpfslvl1").find({}).toArray();
  console.log("tpfslvl1 count", tpfs.length, tpfs[0]?.nombre);

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
