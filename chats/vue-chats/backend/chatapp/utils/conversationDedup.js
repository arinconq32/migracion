function normalizePhoneDigits(value) {
  return String(value || "")
    .replace(/\|+$/, "")
    .replace(/\D/g, "");
}

function conversationPhoneKey(conv = {}) {
  const raw =
    conv.telefono ||
    conv.tels ||
    conv.contactoId ||
    conv.contacto_id ||
    conv.data ||
    "";
  const digits = normalizePhoneDigits(raw);
  if (!digits) return "";
  if (digits.length === 10) return `57${digits}`;
  return digits;
}

function conversationRecencyScore(conv = {}) {
  const legacy = conv.legacyId ?? conv.id ?? conv._id;
  const numeric = Number(legacy);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;

  const idStr = String(conv._id || conv.id || "").trim();
  if (/^[a-f0-9]{24}$/i.test(idStr)) {
    return parseInt(idStr.substring(0, 8), 16);
  }

  const ts = new Date(
    conv.ultima_actividad || conv.ultimaActividad || conv.inicio || 0,
  ).getTime();
  if (Number.isFinite(ts) && ts > 0) return ts;

  return 0;
}

function isConversationNewer(next, prev) {
  const nextScore = conversationRecencyScore(next);
  const prevScore = conversationRecencyScore(prev);
  if (nextScore !== prevScore) return nextScore > prevScore;

  const nextId = String(next.id ?? next._id ?? "");
  const prevId = String(prev.id ?? prev._id ?? "");
  return nextId > prevId;
}

function dedupeConversationsByPhone(conversations = []) {
  const map = new Map();

  for (const conv of conversations) {
    const phoneKey = conversationPhoneKey(conv);
    const key = phoneKey ? `phone:${phoneKey}` : `id:${conv.id ?? conv._id}`;
    const existing = map.get(key);

    if (!existing || isConversationNewer(conv, existing)) {
      map.set(key, conv);
    }
  }

  return [...map.values()];
}

function dedupeConversationsByPhonePerEstado(conversations = []) {
  return dedupeConversationsByPhone(conversations);
}

module.exports = {
  conversationPhoneKey,
  conversationRecencyScore,
  isConversationNewer,
  dedupeConversationsByPhone,
  dedupeConversationsByPhonePerEstado,
};
