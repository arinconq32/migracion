import { useChatStore } from "@/stores/chatStore";
import {
  iniciarSocket,
  registrarListenersSocket,
  emitSocket,
} from "./useSocket";
import { resolveAgentIdFromSources } from "@/utils/agentId";
import {
  loadConversationsForStore,
  scheduleConversationReload,
} from "./loadConversations";
import { enrichConversationsWithContacts } from "./enrichContacts";
import { fetchCatalogosDesdeDb } from "./useCatalog";
import {
  registerInternalIdentity,
  registerInternalChatListeners,
  fetchInternalAgents,
  sendInternalChatMessage,
  parseInternalPeerId,
  openInternalChat,
  mapInternalMessagesForUi,
  buildInternalConvId,
  resolveInternalPeerFromPayload,
} from "./useInternalChatSocket";
import {
  setupNotificacionesConPermiso,
  alertarMensajeEntrante,
  esMensajeEntrante,
  textoVistaPreviaMensaje,
} from "./useNotificaciones";

export { enrichConversationsWithContacts };

let notificacionesConfiguradas = false;

function ensureNotificacionesActivas() {
  if (notificacionesConfiguradas) return;
  notificacionesConfiguradas = true;
  setupNotificacionesConPermiso();
}

function isViewingClientConversation(store, convId) {
  return (
    String(store.conversacionActivaId || "").trim() === String(convId || "").trim()
  );
}

function isViewingInternalConversation(store, peerId) {
  const activePeer = parseInternalPeerId(store.conversacionActivaId);
  return (
    store.internoListaVisible &&
    activePeer &&
    String(activePeer) === String(peerId || "").trim()
  );
}

function notifyIncomingClientMessage(store, convId, msg) {
  if (!esMensajeEntrante(msg)) return;
  if (isViewingClientConversation(store, convId)) return;

  const conv = store.conversaciones?.[convId];
  const titulo =
    conv?.nombre || conv?.name || conv?.telefono || "Nuevo mensaje de cliente";

  alertarMensajeEntrante({
    titulo,
    cuerpo: textoVistaPreviaMensaje(msg),
    tag: `chat-cliente-${convId}`,
    onClick: () => store.selectConversation(convId),
  });
}

function notifyIncomingInternalMessage(store, userId, payload) {
  const peer = resolveInternalPeerFromPayload(payload, userId);
  if (!peer) return;
  if (String(payload?.direction || "").trim() === "out") return;
  if (isViewingInternalConversation(store, peer)) return;

  const agente = (store.agentesInternos || []).find(
    (a) => String(a.id) === String(peer),
  );
  const titulo = agente?.nombre
    ? `Chat interno · ${agente.nombre}`
    : `Chat interno · Agente ${peer}`;

  alertarMensajeEntrante({
    titulo,
    cuerpo: textoVistaPreviaMensaje(payload),
    tag: `chat-interno-${peer}`,
    onClick: () => {
      store.setInternoListaVisible(true);
      store.selectConversation(buildInternalConvId(peer));
    },
  });
}

/**
 * Inicializa socket y sincroniza colas con el backend (HTTP + tiempo real).
 */
export function useChatSocket(userId = resolveAgentIdFromSources()) {
  const store = useChatStore();
  ensureNotificacionesActivas();

  fetchCatalogosDesdeDb(store);

  async function syncConversations(force = false) {
    try {
      await loadConversationsForStore(store, { force, agentId: userId });
    } catch (err) {
      console.error("[useChatSocket] Error cargando conversaciones:", err);
      scheduleConversationReload(store);
    }
  }

  syncConversations();

  const internalListeners = registerInternalChatListeners(store, userId);

  iniciarSocket(userId, {
    onConnect: () => {
      console.log("[useChatSocket] Conectado al servidor");
      registerInternalIdentity(userId);
      fetchInternalAgents((agentes) => store.setAgentesInternos(agentes));
      const activePeer = parseInternalPeerId(store.conversacionActivaId);
      if (activePeer) {
        openInternalChat(activePeer, userId, (res) => {
          if (res?.ok && Array.isArray(res.mensajes)) {
            store.mergeInternalMessages(
              activePeer,
              mapInternalMessagesForUi(res.mensajes, userId),
            );
          }
        });
      }
      syncConversations();
      fetchCatalogosDesdeDb(store);
    },
    onDisconnect: (reason) => {
      console.warn("[useChatSocket] Desconectado:", reason);
      scheduleConversationReload(store);
    },
    onConnectError: (err) => {
      console.error("[useChatSocket] Error de conexión:", err.message);
      scheduleConversationReload(store, 1500);
    },
  });

  registrarListenersSocket({
    onInternalAgentsList: internalListeners.onAgents,
    onInternalChatMessage: (payload) => {
      internalListeners.onMessage(payload);
      notifyIncomingInternalMessage(store, userId, payload);
    },
    onInternalChatError: internalListeners.onError,
    onInternalAgentStatus: () => {
      fetchInternalAgents((agentes) => store.setAgentesInternos(agentes));
    },
    onUpdateQueues: async (data) => {
      store.setQueueState(data);
      await enrichConversationsWithContacts(store);
    },
    onInitState: async (data) => {
      store.setQueueState(data);
      await enrichConversationsWithContacts(store);
    },
    onChatMessage: ({ convId, msg }) => {
      const id = String(convId || "").trim();
      if (!id) return;
      store.addMessage(id, msg);
      notifyIncomingClientMessage(store, id, msg);
    },
    onClientMessage: (data) => {
      const convId = String(
        data?.convId ||
          data?.conversacion_id ||
          data?.conversacionId ||
          "",
      ).trim();
      if (!convId) return;
      store.addMessage(convId, {
        id: data?.id || data?.idMensaje || `client_${Date.now()}`,
        emisor: "cliente",
        mensaje: data?.mensaje || data?.text || "",
        text: data?.mensaje || data?.text || "",
        tipo: data?.tipo || "texto",
        archivo_url: data?.archivo_url || data?.mediaUrl || null,
        timestamp: data?.timestamp
          ? new Date(data.timestamp).getTime()
          : Date.now(),
      });
      notifyIncomingClientMessage(store, convId, data);
    },
    onMessageConfirmed: ({ convId, msg, tempId }) => {
      store.confirmMessage(convId, msg, tempId);
    },
    onChatAssigned: async (conv) => {
      store.upsertConversation(conv);
      await enrichConversationsWithContacts(store);
    },
    onChatTaken: ({ convId }) => {
      store.markConversationClosed(convId);
    },
    onConversationEnded: (data) => {
      if (data?.convId) store.markConversationClosed(data.convId);
    },
    onEtiquetas: (data) => {
      if (Array.isArray(data) && data.length > 0) store.setEtiquetas(data);
    },
    onMotivosCierre: (data) => {
      if (Array.isArray(data)) store.setMotivosCierre(data);
    },
    onTipificaciones: (data) => {
      if (Array.isArray(data) && data.length > 0) store.setTipificaciones(data);
    },
  });

  function sendMessage(convId, text) {
    if (!text || !convId) return;

    const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const optimisticMsg = {
      id: tempId,
      tempId,
      emisor: "agente",
      text,
      mensaje: text,
      timestamp: Date.now(),
      tipo: "texto",
    };

    store.addMessage(convId, optimisticMsg);
    emitSocket("chat_message", { convId, text, tempId });
  }

  function sendInternalMessage(peerAgentId, payload) {
    const target = String(peerAgentId || "").trim();
    const data =
      typeof payload === "string"
        ? { text: payload }
        : { ...(payload || {}) };
    const body = String(data.text || data.mensaje || "").trim();
    const archivoUrl = String(data.archivo_url || data.archivoUrl || "").trim();
    const tipo = String(data.tipo || "texto").trim().toLowerCase() || "texto";
    if (!target || (!body && !archivoUrl)) return;

    registerInternalIdentity(userId);
    const tempId = `temp_${Date.now()}`;
    store.addInternalMessage(target, {
      id: tempId,
      direction: "out",
      fromAgentId: userId,
      toAgentId: target,
      text: body || data.label || "",
      mensaje: body || data.label || "",
      timestamp: Date.now(),
      tipo,
      archivo_url: archivoUrl || null,
      archivoUrl: archivoUrl || null,
    });

    sendInternalChatMessage(
      target,
      {
        text: body,
        tipo,
        archivo_url: archivoUrl || null,
      },
      (res) => {
        if (!res?.ok) {
          console.warn("[chat interno] Error al enviar:", res?.error);
          return;
        }
        if (res?.mensaje) {
          store.addInternalMessage(target, res.mensaje, userId);
        }
      },
    );
  }

  return { sendMessage, sendInternalMessage, syncConversations, userId };
}

function countQueuesLocal(store) {
  if (!store) return 0;
  return (
    (store.activos?.length || 0) +
    (store.nuevos?.length || 0) +
    (store.cerrados?.length || 0) ||
    Object.keys(store.conversaciones || {}).length
  );
}

export function emitEtiquetasPorConv(telefono, callback) {
  emitSocket("etiquetasPorConv", { convId: null, telefono }, callback);
}

export function emitEtiquetaSeleccionada(etiquetas, telefono) {
  emitSocket("etiquetaSeleccionada", { etiquetas, convId: null, telefono });
}

export function emitCrearEtiqueta(nombre, color, callback) {
  emitSocket("crear_etiqueta", { nombre, color }, callback);
}
