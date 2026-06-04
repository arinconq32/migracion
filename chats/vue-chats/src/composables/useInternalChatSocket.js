import { emitSocket, enviarMensajeInterno } from "./useSocket";

export const INTERNAL_CONV_PREFIX = "internal:";

export function buildInternalConvId(peerAgentId) {
  return `${INTERNAL_CONV_PREFIX}${String(peerAgentId || "").trim()}`;
}

export function parseInternalPeerId(convId) {
  const raw = String(convId || "").trim();
  if (!raw.startsWith(INTERNAL_CONV_PREFIX)) return null;
  const peer = raw.slice(INTERNAL_CONV_PREFIX.length).trim();
  return peer || null;
}

export function isInternalConvId(convId) {
  return parseInternalPeerId(convId) !== null;
}

function normalizeInternalMessage(msg = {}, viewerAgentId = "") {
  const text = String(msg.text || msg.mensaje || "").trim();
  const archivoUrl = String(
    msg.archivo_url || msg.archivoUrl || msg.url || "",
  ).trim();
  let tipo = String(msg.tipo || "texto").trim().toLowerCase() || "texto";
  if (tipo === "image") tipo = "imagen";
  if (tipo === "document") tipo = "documento";
  return {
    id: String(msg.id || msg._id || `im_${Date.now()}`),
    emisor: msg.direction === "out" ? "agente" : "contact",
    text,
    mensaje: text,
    timestamp: Number(msg.timestamp) || Date.now(),
    tipo,
    archivo_url: archivoUrl || null,
    archivoUrl: archivoUrl || null,
    fromAgentId: msg.fromAgentId,
    toAgentId: msg.toAgentId,
    direction: msg.direction,
  };
}

export function registerInternalIdentity(agentId) {
  const id = String(agentId || "").trim();
  if (!id) return;
  emitSocket("internal_chat_set_identity", { agentId: id });
}

export function refreshInternalAgents() {
  emitSocket("obtener_agentes_internos", (res) => {
    if (Array.isArray(res?.agentes)) {
      return res.agentes;
    }
    return [];
  });
}

export function fetchInternalAgents(callback) {
  emitSocket("obtener_agentes_internos", (res) => {
    callback?.(Array.isArray(res?.agentes) ? res.agentes : []);
  });
}

export function openInternalChat(peerAgentId, myAgentId, callback) {
  const target = String(peerAgentId || "").trim();
  if (!target) {
    callback?.({ ok: false, error: "Agente destino requerido" });
    return;
  }

  registerInternalIdentity(myAgentId);
  emitSocket("internal_chat_join", { targetAgentId: target }, (res) => {
    callback?.(res);
  });
}

export function sendInternalChatMessage(peerAgentId, payload, callback) {
  if (typeof payload === "function") {
    callback = payload;
    payload = {};
  }
  const data =
    typeof payload === "string"
      ? { text: payload }
      : { ...(payload || {}) };
  enviarMensajeInterno({ toAgentId: peerAgentId, ...data }, callback);
}

export function mapInternalMessagesForUi(messages = [], viewerAgentId = "") {
  return (Array.isArray(messages) ? messages : []).map((msg) =>
    normalizeInternalMessage(msg, viewerAgentId),
  );
}

export function resolveInternalPeerFromPayload(payload = {}, viewerAgentId = "") {
  const viewer = String(viewerAgentId || "").trim();
  const from = String(payload?.fromAgentId || "").trim();
  const to = String(payload?.toAgentId || "").trim();
  if (!from && !to) return null;
  if (!viewer) return from || to || null;
  if (from === viewer && to) return to;
  if (to === viewer && from) return from;
  if (from && from !== viewer) return from;
  if (to && to !== viewer) return to;
  return null;
}

export function registerInternalChatListeners(store, myAgentId) {
  const viewerId = String(myAgentId || "").trim();

  const onAgents = (payload) => {
    const list = Array.isArray(payload?.agentes) ? payload.agentes : [];
    store.setAgentesInternos(list);
  };

  const onMessage = (payload) => {
    const peer = resolveInternalPeerFromPayload(payload, viewerId);
    if (!peer) return;
    store.addInternalMessage(String(peer), payload, viewerId);
  };

  const onError = (payload) => {
    console.warn("[chat interno]", payload?.error || payload);
  };

  return { onAgents, onMessage, onError };
}
