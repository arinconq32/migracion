const mongoose = require("mongoose");

function toObjectId(value) {
  if (value == null || value === "") return null;
  if (value instanceof mongoose.Types.ObjectId) return value;
  const raw = String(value).trim();
  if (!mongoose.Types.ObjectId.isValid(raw)) return null;
  return new mongoose.Types.ObjectId(raw);
}

function buildMessageFilters(convIdStr, conv = null) {
  const objectIds = new Set();
  const legacyNumeric = new Set();

  for (const candidate of [convIdStr, conv?._id, conv?.legacyId]) {
    if (candidate == null || candidate === "") continue;
    const oid = toObjectId(candidate);
    if (oid) {
      objectIds.add(oid.toString());
      continue;
    }
    const asNum = Number(candidate);
    if (Number.isFinite(asNum) && asNum > 0) {
      legacyNumeric.add(asNum);
    }
  }

  const filters = [];
  if (objectIds.size) {
    const oidList = [...objectIds].map((id) => new mongoose.Types.ObjectId(id));
    filters.push({ conversacionId: { $in: oidList } });
    filters.push({ conversacion_id: { $in: oidList } });
  }

  for (const legacyId of legacyNumeric) {
    filters.push({ conversacionId: legacyId }, { conversacion_id: legacyId });
    filters.push(
      { conversacionId: String(legacyId) },
      { conversacion_id: String(legacyId) },
    );
  }

  return filters;
}

async function fetchMessagesForConversation(db, convIdStr, conv = null, options = {}) {
  const filters = buildMessageFilters(convIdStr, conv);
  if (!filters.length) return [];

  const query = options.mediaOnly
    ? {
        $and: [
          { $or: filters },
          {
            $or: [
              { archivoUrl: { $exists: true, $nin: [null, ""] } },
              { archivo_url: { $exists: true, $nin: [null, ""] } },
            ],
          },
        ],
      }
    : { $or: filters };

  const sort = options.mediaOnly
    ? { ts: -1, fecha: -1, timestamp: -1, _id: -1 }
    : { ts: 1, fecha: 1, timestamp: 1, _id: 1 };

  return db.collection("mensajes").find(query).sort(sort).toArray();
}

module.exports = {
  buildMessageFilters,
  fetchMessagesForConversation,
};
