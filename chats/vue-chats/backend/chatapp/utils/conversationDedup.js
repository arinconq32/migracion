function normalizePhoneDigits(value) {
  return String(value || "")
    .replace(/\|+$/, "")
    .replace(/\D/g, "");
}

function conversationPhoneKey(conv = {}) {
  const raw =
    conv.telefono ||
    conv.contactoId ||
    conv.contacto_id ||
    conv.tels ||
    conv.data ||
    "";
  const digits = normalizePhoneDigits(raw);
  if (!digits) return "";
  if (digits.length === 10) return `57${digits}`;
  return digits;
}

function conversationNumericId(conv = {}) {
  const id = conv.id ?? conv.legacyId ?? conv._id;
  const numeric = Number(id);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  return String(id || "").trim();
}

function dedupeConversationsByPhone(conversations = []) {
  const map = new Map();

  for (const conv of conversations) {
    const phoneKey = conversationPhoneKey(conv);
    const key = phoneKey ? `phone:${phoneKey}` : `id:${conv.id ?? conv._id}`;
    const existing = map.get(key);

    if (!existing) {
      map.set(key, conv);
      continue;
    }

    const nextId = conversationNumericId(conv);
    const prevId = conversationNumericId(existing);
    const nextIsHigher =
      typeof nextId === "number" && typeof prevId === "number"
        ? nextId > prevId
        : String(nextId) > String(prevId);

    if (nextIsHigher) {
      map.set(key, conv);
    }
  }

  return [...map.values()];
}

function dedupeConversationsByPhonePerEstado(conversations = []) {
  const byEstado = new Map();

  for (const conv of conversations) {
    const estado = String(conv.estado || "nuevo").toLowerCase().trim();
    if (!byEstado.has(estado)) byEstado.set(estado, []);
    byEstado.get(estado).push(conv);
  }

  const result = [];
  for (const group of byEstado.values()) {
    result.push(...dedupeConversationsByPhone(group));
  }
  return result;
}

module.exports = {
  conversationPhoneKey,
  dedupeConversationsByPhone,
  dedupeConversationsByPhonePerEstado,
};
