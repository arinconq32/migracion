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

export { enrichConversationsWithContacts };

/**
 * Inicializa socket y sincroniza colas con el backend (HTTP + tiempo real).
 */
export function useChatSocket(userId = resolveAgentIdFromSources()) {
  const store = useChatStore();

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

  iniciarSocket(userId, {
    onConnect: () => {
      console.log("[useChatSocket] Conectado al servidor");
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
    onUpdateQueues: async (data) => {
      const total =
        (data?.activos?.length || 0) +
        (data?.nuevos?.length || 0) +
        (data?.cerrados?.length || 0);
      if (total > 0 || countQueuesLocal(store) === 0) {
        store.setQueueState(data);
        await enrichConversationsWithContacts(store);
      }
    },
    onChatMessage: ({ convId, msg }) => {
      store.addMessage(convId, msg);
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

  return { sendMessage, syncConversations };
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
