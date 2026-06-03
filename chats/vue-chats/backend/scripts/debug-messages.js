require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const mongoose = require("mongoose");
const { buildMessageFilters } = require("../chatapp/utils/messageQuery");

async function main() {
  await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/omnicanalidad");
  const db = mongoose.connection.db;

  const top = await db
    .collection("mensajes")
    .aggregate([
      { $group: { _id: "$conversacionId", n: { $sum: 1 } } },
      { $sort: { n: -1 } },
      { $limit: 1 },
    ])
    .toArray();

  const convOid = top[0]._id;
  const id = String(convOid);
  const conv = await db.collection("conversaciones").findOne({ _id: convOid });

  console.log("convOid", convOid, "conv found", !!conv);
  const filters = buildMessageFilters(id, conv);
  console.log("filters count", filters.length);
  console.log(JSON.stringify(filters.slice(0, 6), null, 2));

  const direct = await db.collection("mensajes").countDocuments({ conversacionId: convOid });
  const viaOr = await db.collection("mensajes").countDocuments({ $or: filters });
  console.log("direct count", direct, "viaOr count", viaOr);

  await mongoose.disconnect();
}

main().catch(console.error);
