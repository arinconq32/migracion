const redisClient = require("../config/redis");
const { safeGet, safeSet, safeDel, isRedisReady, ensureRedisConnected } = redisClient;

const BUFFER_PREFIX = "mensajes:buffer:";
const ACTIVE_PREFIX = "mensajes:activa:";
const BUFFER_TTL_SECONDS = 60 * 60 * 24;

function bufferKey(convId) {
  return `${BUFFER_PREFIX}${String(convId || "").trim()}`;
}

function activeKey(userId) {
  return `${ACTIVE_PREFIX}${String(userId || "").trim()}`;
}

async function getBufferedMessages(convId) {
  const key = bufferKey(convId);
  if (!key || key === BUFFER_PREFIX) return [];
  try {
    const raw = await safeGet(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function appendBufferedMessage(convId, message = {}) {
  const convIdStr = String(convId || "").trim();
  if (!convIdStr) return null;

  const normalized = {
    ...message,
    id:
      message.id ||
      message.tempId ||
      `temp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    conversacion_id: convIdStr,
    conversacionId: convIdStr,
    timestamp: message.timestamp || message.ts || Date.now(),
    ts: message.ts || message.timestamp || Date.now(),
  };

  const current = await getBufferedMessages(convIdStr);
  const exists = current.some(
    (item) =>
      item.id === normalized.id ||
      (normalized.tempId && item.tempId === normalized.tempId),
  );
  if (!exists) {
    current.push(normalized);
    await safeSet(bufferKey(convIdStr), JSON.stringify(current), {
      EX: BUFFER_TTL_SECONDS,
    });
  }

  return normalized;
}

async function clearBufferedMessages(convId) {
  const convIdStr = String(convId || "").trim();
  if (!convIdStr) return;
  await safeDel(bufferKey(convIdStr));
}

async function setActiveConversation(userId, convId) {
  const uid = String(userId || "").trim();
  const convIdStr = String(convId || "").trim();
  if (!uid || !convIdStr) return;
  await safeSet(activeKey(uid), convIdStr, { EX: BUFFER_TTL_SECONDS });
}

async function getActiveConversation(userId) {
  const uid = String(userId || "").trim();
  if (!uid) return null;
  return safeGet(activeKey(uid));
}

async function isRedisAvailable() {
  return ensureRedisConnected();
}

function mergeMessages(persistedMessages = [], bufferedMessages = []) {
  const merged = [];
  const seen = new Set();

  for (const msg of [...persistedMessages, ...bufferedMessages]) {
    if (!msg) continue;
    const key = String(
      msg.id || msg._id || msg.tempId || `${msg.timestamp}-${msg.mensaje}`,
    );
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(msg);
  }

  return merged.sort(
    (a, b) =>
      Number(a.timestamp || a.ts || 0) - Number(b.timestamp || b.ts || 0),
  );
}

async function persistToMongo(convId, chatModel) {
  const convIdStr = String(convId || "").trim();
  if (!convIdStr || !chatModel?.insertMessage) {
    return { persisted: 0, ids: [], convId: convIdStr };
  }

  const buffered = await getBufferedMessages(convIdStr);
  if (!buffered.length) {
    return { persisted: 0, ids: [], convId: convIdStr };
  }

  const ids = [];
  for (const msg of buffered) {
    const messageId = await chatModel.insertMessage(
      convIdStr,
      msg.emisor || msg.autor || "agente",
      msg.mensaje || msg.text || msg.texto || "",
      msg.tipo || "texto",
      {
        archivo_url: msg.archivo_url || msg.archivoUrl || null,
        origen: msg.origen || "web",
        timestamp: msg.timestamp || msg.ts || Date.now(),
      },
    );
    ids.push(messageId);
  }

  await clearBufferedMessages(convIdStr);
  try {
    await safeDel(`mensajes:${convIdStr}`);
  } catch {
    /* ignore cache invalidation errors */
  }

  return { persisted: ids.length, ids, convId: convIdStr };
}

module.exports = {
  appendBufferedMessage,
  getBufferedMessages,
  clearBufferedMessages,
  setActiveConversation,
  getActiveConversation,
  mergeMessages,
  persistToMongo,
  bufferKey,
  isRedisAvailable,
};
