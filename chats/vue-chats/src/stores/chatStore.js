import { computed, ref } from "vue";
import { defineStore } from "pinia";
import {
  enrichConversationWithContact,
  findContactFromLookup,
  resolveConversationDisplayName,
} from "@/utils/contactDisplay";
import {
  dedupeConversationsByPhone,
  dedupeConversationsByPhonePerEstado,
  conversationPhoneKey,
} from "@/utils/conversationDedup";
import { extractMessageMediaUrl } from "@/utils/messageMedia";

const INTERNAL_CONV_PREFIX = "internal:";

const normalizeConvId = (value) => {
  if (value === null || value === undefined) return null;
  const id = String(value).trim();
  if (!id || id === "NaN") return null;
  return id;
};

const isInternoConversation = (conv = {}) =>
  String(conv?.origen || conv?.metadata?.origen || "")
    .trim()
    .toLowerCase() === "interno";

const isInternalConversationId = (convId) =>
  String(convId || "")
    .trim()
    .startsWith(INTERNAL_CONV_PREFIX);

const parseInternalPeerFromConvId = (convId) => {
  const raw = String(convId || "").trim();
  if (!raw.startsWith(INTERNAL_CONV_PREFIX)) return null;
  const peer = raw.slice(INTERNAL_CONV_PREFIX.length).trim();
  return peer || null;
};

const normalizeConversation = (conversation = {}) => {
  const id = normalizeConvId(
    conversation.id ?? conversation._id ?? conversation.legacyId,
  );
  const estadoRaw = String(conversation.estado || conversation.status || "")
    .toLowerCase()
    .trim();
  const estado =
    estadoRaw === "abierta" || estadoRaw === "active" || estadoRaw === "activo"
      ? "abierta"
      : estadoRaw === "cerrada" || estadoRaw === "closed"
        ? "cerrada"
        : estadoRaw === "nuevo" || estadoRaw === "new"
          ? "nuevo"
          : estadoRaw || "nuevo";

  const telefonoRaw =
    conversation.telefono ||
    conversation.tels ||
    conversation.contacto_id ||
    "";
  const metadata = {
    ...(conversation.metadata || {}),
    estado,
    nombreWhatsApp:
      conversation.metadata?.nombreWhatsApp ||
      conversation.metadata?.pushName ||
      conversation.nombreWhatsApp ||
      "",
    pushName:
      conversation.metadata?.pushName ||
      conversation.pushName ||
      "",
  };

  // Preserve etiquetas if they arrive with the conversation
  let etiquetasConv = [];
  if (
    Array.isArray(conversation.etiquetas) &&
    conversation.etiquetas.length > 0
  ) {
    etiquetasConv = conversation.etiquetas.filter((e) => e && e.nombre);
  }

  const telefono = String(telefonoRaw).replace(/\|+$/, "").trim();

  const base = {
    id,
    telefono,
    estado,
    unread: Number(conversation.unread || 0),
    online: Boolean(conversation.online),
    lastMessage: conversation.lastMessage || conversation.ultimoMensaje || "",
    fotoPerfil:
      conversation.fotoPerfil ||
      conversation.avatarUrl ||
      conversation.avatar ||
      conversation.foto ||
      metadata.fotoPerfil ||
      metadata.avatarUrl ||
      metadata.avatar ||
      metadata.foto ||
      "",
    email: conversation.email || metadata.email || "",
    ciudad: conversation.ciudad || metadata.ciudad || "",
    direccion: conversation.direccion || metadata.direccion || "",
    entidad: conversation.entidad || metadata.entidad || "",
    data:
      conversation.data ||
      conversation.dni ||
      metadata.data ||
      metadata.dni ||
      conversation.contactoId ||
      conversation.contacto_id ||
      "",
    contactoId:
      conversation.contactoId ||
      conversation.contacto_id ||
      metadata.contactoId ||
      "",
    origen: conversation.origen || metadata.origen || "",
    agenteId: conversation.agenteId || conversation.agente_id || null,
    agente_id: conversation.agente_id || conversation.agenteId || null,
    agente_origen_exten:
      conversation.agente_origen_exten || metadata.agente_origen_exten || null,
    transferida: Boolean(conversation.transferida),
    transferOrigenId: conversation.transferOrigenId || null,
    destacado: Boolean(conversation.destacado || metadata.destacado),
    bloqueado: Boolean(conversation.bloqueado || metadata.bloqueado),
    etiquetas: etiquetasConv,
    metadata,
    messages: Array.isArray(conversation.messages) ? conversation.messages : [],
    nombre: conversation.nombre || conversation.name || "",
    name: conversation.name || conversation.nombre || "",
  };

  const nombre = resolveConversationDisplayName(base, null);

  return {
    ...base,
    nombre,
    name: nombre,
  };
};

const toTimestamp = (value) => {
  if (value === null || value === undefined || value === "") return Date.now();
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Date.parse(value);
  if (!Number.isNaN(parsed)) return parsed;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : Date.now();
};

const normalizeMessage = (message = {}, convId = null) => {
  const mediaUrl =
    extractMessageMediaUrl(message) ||
    message.archivo_url ||
    message.archivoUrl ||
    null;
  return {
    id:
      message.id ||
      `temp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    conversacion_id: normalizeConvId(message.conversacion_id || convId) || "0",
    emisor: message.emisor || message.autor || message.from || "agente",
    mensaje: message.mensaje || message.text || message.texto || "",
    text: message.text || message.mensaje || message.texto || "",
    tipo: message.tipo || "texto",
    timestamp: toTimestamp(message.timestamp || message.ts || message.fecha),
    ts: message.ts || null,
    fecha: message.fecha || null,
    origen: message.origen || "web",
    tempId: message.tempId || null,
    filename: message.filename || null,
    archivoUrl: mediaUrl || null,
    archivo_url: mediaUrl || null,
  };
};

export const useChatStore = defineStore("chat", () => {
  const conversaciones = ref({});
  const mensajesPorConv = ref({});
  const conversacionActivaId = ref(null);
  const initialized = ref(false);
  // etiquetas: catálogo del servidor [{id, nombre, color}]
  const etiquetas = ref([]);
  // etiquetasPorConv: etiquetas asignadas por convId [{id, nombre, color}]
  const etiquetasPorConv = ref({});
  // Modal de etiquetas
  const labelModalOpen = ref(false);
  const labelModalConvId = ref(null);
  const labelModalTelefono = ref(null);
  // Menu de etiquetas (antes del modal)
  const labelMenuOpen = ref(false);
  const labelMenuConvId = ref(null);
  const labelMenuTelefono = ref(null);
  const labelMenuX = ref(0);
  const labelMenuY = ref(0);
  // Filtro de conversaciones por etiquetas (IDs)
  const filtrosEtiquetasSeleccionadas = ref([]);
  const motivosCierre = ref([]);
  const transferNotifications = ref([]);
  const tipificaciones = ref([]);
  const agentesInternos = ref([]);
  const mensajesInternosPorPeer = ref({});
  /** Incrementa en cada cambio de mensajes internos para forzar reactividad en la UI. */
  const internalMessagesRevision = ref(0);
  const noLeidosInternosPorPeer = ref({});
  const ultimoInternoPorPeer = ref({});
  const internoListaVisible = ref(false);
  const activeCountDb = ref(0);
  const maxActiveConversations = ref(3);
  const activeConversationIdsDb = ref([]);
  const AGENT_STATUS_STORAGE_KEY = "agentEstadoConexion";

  const readStoredAgentEstado = () => {
    try {
      const stored = String(
        sessionStorage.getItem(AGENT_STATUS_STORAGE_KEY) || "",
      ).trim();
      return stored || "Activo";
    } catch {
      return "Activo";
    }
  };

  const agentEstadoConexion = ref(readStoredAgentEstado());

  const agentPuedeEnviarMensajes = computed(
    () =>
      String(agentEstadoConexion.value || "Activo").trim().toLowerCase() ===
      "activo",
  );

  const mensajeBloqueoPorEstadoAgente = () => {
    const estado = String(agentEstadoConexion.value || "").trim();
    if (estado === "Ocupado") {
      return "Tu estado es Ocupado. Cambia a Activo para escribir o enviar multimedia.";
    }
    if (estado === "Ausente") {
      return "Tu estado es Ausente. Cambia a Activo para escribir o enviar multimedia.";
    }
    if (/sin conexion/i.test(estado)) {
      return "Tu estado es Sin conexión. Cambia a Activo para escribir o enviar multimedia.";
    }
    return "Cambia tu estado a Activo para escribir o enviar multimedia.";
  };

  const setAgentEstadoConexion = (estado) => {
    const next = String(estado || "Activo").trim() || "Activo";
    agentEstadoConexion.value = next;
    try {
      sessionStorage.setItem(AGENT_STATUS_STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  };

  const totalNoLeidosInternos = computed(() =>
    Object.values(noLeidosInternosPorPeer.value).reduce(
      (acc, count) => acc + Number(count || 0),
      0,
    ),
  );

  const tieneNoLeidosInternos = computed(
    () => totalNoLeidosInternos.value > 0,
  );

  const activos = computed(() => {
    return dedupeConversationsByPhonePerEstado(
      Object.values(conversaciones.value),
    ).filter((c) => c.estado === "abierta");
  });

  const activosCliente = computed(() =>
    activos.value.filter((conv) => !isInternoConversation(conv)),
  );

  const activeCountSynced = computed(() => {
    const uiCount = activosCliente.value.length;
    const dbCount = Number(activeCountDb.value || 0);
    return Math.max(uiCount, dbCount);
  });

  const nuevos = computed(() => {
    return dedupeConversationsByPhonePerEstado(
      Object.values(conversaciones.value),
    ).filter((c) => c.estado === "nuevo");
  });

  const cerrados = computed(() => {
    return dedupeConversationsByPhonePerEstado(
      Object.values(conversaciones.value),
    ).filter((c) => c.estado === "cerrada");
  });

  const conversacionActiva = computed(() => {
    if (!conversacionActivaId.value) return null;
    return conversaciones.value[conversacionActivaId.value] || null;
  });

  const mensajesActivos = computed(() => {
    if (!conversacionActivaId.value) return [];
    return mensajesPorConv.value[conversacionActivaId.value] || [];
  });

  const totalNoLeidos = computed(() => {
    return Object.values(conversaciones.value).reduce(
      (acc, c) => acc + Number(c.unread || 0),
      0,
    );
  });

  const syncEtiquetasPorConv = (conv) => {
    const id = normalizeConvId(conv?.id);
    if (!id || !Array.isArray(conv?.etiquetas) || conv.etiquetas.length === 0) {
      return;
    }

    const tags = conv.etiquetas.filter((e) => e && e.nombre);
    if (tags.length > 0) {
      etiquetasPorConv.value[id] = tags;
    }
  };

  const removeConversation = (convId) => {
    const id = normalizeConvId(convId);
    if (!id) return;

    const next = { ...conversaciones.value };
    delete next[id];
    conversaciones.value = next;

    const nextMsgs = { ...mensajesPorConv.value };
    delete nextMsgs[id];
    mensajesPorConv.value = nextMsgs;

    const nextTags = { ...etiquetasPorConv.value };
    delete nextTags[id];
    etiquetasPorConv.value = nextTags;

    if (conversacionActivaId.value === id) {
      conversacionActivaId.value = null;
    }
  };

  const upsertConversation = (rawConversation) => {
    const conversation = normalizeConversation(rawConversation);
    if (!conversation.id) return;

    const existing = conversaciones.value[conversation.id] || null;

    conversaciones.value[conversation.id] = {
      ...(existing || {}),
      ...conversation,
      metadata: {
        ...((existing && existing.metadata) || {}),
        ...(conversation.metadata || {}),
      },
    };

    syncEtiquetasPorConv(conversaciones.value[conversation.id]);

    if (
      Array.isArray(conversation.messages) &&
      conversation.messages.length > 0
    ) {
      mensajesPorConv.value[conversation.id] = conversation.messages.map((m) =>
        normalizeMessage(m, conversation.id),
      );
    }
  };

  const setQueueState = (
    {
      activos: stateActivos = [],
      nuevos: stateNuevos = [],
      cerrados: stateCerrados = [],
    } = {},
    options = {},
  ) => {
    const nextMap = options.replace ? {} : { ...conversaciones.value };

    const applyQueue = (items, estado) => {
      for (const c of dedupeConversationsByPhonePerEstado(items)) {
        const normalized = normalizeConversation({ ...c, estado });
        if (!normalized.id) continue;

        const existing = nextMap[normalized.id] || null;
        nextMap[normalized.id] = {
          ...(existing || {}),
          ...normalized,
          metadata: {
            ...((existing && existing.metadata) || {}),
            ...(normalized.metadata || {}),
          },
        };

        syncEtiquetasPorConv(nextMap[normalized.id]);

        // Preserve cached messages unless backend actually sends messages.
        if (Array.isArray(c.messages) && c.messages.length > 0) {
          mensajesPorConv.value[normalized.id] = c.messages.map((m) =>
            normalizeMessage(m, normalized.id),
          );
        }
      }
    };

    applyQueue(stateActivos, "abierta");
    applyQueue(stateNuevos, "nuevo");
    applyQueue(stateCerrados, "cerrada");

    const winners = dedupeConversationsByPhonePerEstado(Object.values(nextMap));
    const prunedMap = {};
    for (const conv of winners) {
      if (conv?.id) prunedMap[conv.id] = nextMap[conv.id];
    }

    const preserveIds = new Set();
    for (const list of [stateActivos, stateNuevos, stateCerrados]) {
      for (const item of dedupeConversationsByPhonePerEstado(list)) {
        const id = normalizeConvId(item?.id);
        if (id) preserveIds.add(id);
      }
    }
    const activeIdToPreserve = normalizeConvId(conversacionActivaId.value);
    if (activeIdToPreserve) preserveIds.add(activeIdToPreserve);

    for (const id of preserveIds) {
      if (nextMap[id]) prunedMap[id] = nextMap[id];
    }

    conversaciones.value = prunedMap;

    const activeId = normalizeConvId(conversacionActivaId.value);
    if (activeId && !prunedMap[activeId]) {
      const previous = nextMap[activeId];
      const phoneKey = previous ? conversationPhoneKey(previous) : "";
      if (phoneKey) {
        const winner = winners.find(
          (conv) => conversationPhoneKey(conv) === phoneKey,
        );
        if (winner?.id) {
          conversacionActivaId.value = winner.id;
        }
      }
    }

    if (
      conversacionActivaId.value &&
      !isInternalConversationId(conversacionActivaId.value) &&
      !conversaciones.value[conversacionActivaId.value]
    ) {
      conversacionActivaId.value = null;
    }

    activeCountDb.value = winners.filter(
      (conv) => conv.estado === "abierta" && !isInternoConversation(conv),
    ).length;
    initialized.value = true;
  };

  const setActiveConversationCount = ({
    count = 0,
    max = 3,
    activeIds = [],
  } = {}) => {
    activeCountDb.value = Math.max(0, Number(count) || 0);
    maxActiveConversations.value = Math.max(1, Number(max) || 3);
    activeConversationIdsDb.value = Array.isArray(activeIds)
      ? activeIds.map((id) => String(id))
      : [];
  };

  const enrichConversationsWithContactLookup = (lookup = {}) => {
    const nextMap = { ...conversaciones.value };

    for (const convId of Object.keys(nextMap)) {
      const conv = nextMap[convId];
      const contact = findContactFromLookup(conv, lookup);
      nextMap[convId] = enrichConversationWithContact(conv, contact);
    }

    conversaciones.value = nextMap;
  };

  const isInternalPeerActivoYVisible = (peerId) => {
    const key = String(peerId || "").trim();
    if (!key) return false;
    const active = parseInternalPeerFromConvId(conversacionActivaId.value);
    return (
      internoListaVisible.value &&
      active &&
      String(active) === key
    );
  };

  const setInternoListaVisible = (visible) => {
    internoListaVisible.value = Boolean(visible);
  };

  const markInternalPeerAsRead = (peerId) => {
    const key = String(peerId || "").trim();
    if (!key || !noLeidosInternosPorPeer.value[key]) return;
    const next = { ...noLeidosInternosPorPeer.value };
    delete next[key];
    noLeidosInternosPorPeer.value = next;
  };

  const incrementInternalUnread = (peerId, preview = {}) => {
    const key = String(peerId || "").trim();
    if (!key) return;
    noLeidosInternosPorPeer.value = {
      ...noLeidosInternosPorPeer.value,
      [key]: Number(noLeidosInternosPorPeer.value[key] || 0) + 1,
    };
    const text = String(preview.text || preview.mensaje || "").trim();
    if (text) {
      ultimoInternoPorPeer.value = {
        ...ultimoInternoPorPeer.value,
        [key]: {
          lastMessage: text,
          lastMessageTime: Number(preview.timestamp) || Date.now(),
        },
      };
    }
  };

  const selectConversation = (convId) => {
    const id = normalizeConvId(convId);
    if (!id) return;

    if (isInternalConversationId(id)) {
      conversacionActivaId.value = id;
      const peer = parseInternalPeerFromConvId(id);
      if (peer) markInternalPeerAsRead(peer);
      return;
    }

    if (!conversaciones.value[id]) {
      upsertConversation({ id, estado: "nuevo", nombre: "Conversacion" });
    }

    conversacionActivaId.value = id;
    conversaciones.value[id].unread = 0;

    if (conversaciones.value[id].estado === "nuevo") {
      conversaciones.value[id].estado = "abierta";
      conversaciones.value[id].metadata = {
        ...(conversaciones.value[id].metadata || {}),
        estado: "abierta",
      };
    }
  };

  const addMessage = (convId, rawMessage) => {
    const id = normalizeConvId(convId);
    if (!id) return;

    if (!conversaciones.value[id]) {
      upsertConversation({ id, estado: "nuevo", nombre: `Conversacion ${id}` });
    }

    const normalized = normalizeMessage(rawMessage, id);
    const current = mensajesPorConv.value[id] || [];
    const exists = current.some((m) => m.id === normalized.id);
    if (!exists) {
      mensajesPorConv.value[id] = [...current, normalized];
    }

    conversaciones.value[id].lastMessage = normalized.text;

    if (conversacionActivaId.value !== id) {
      conversaciones.value[id].unread =
        Number(conversaciones.value[id].unread || 0) + 1;
    }
  };

  const confirmMessage = (convId, realMessage, tempId = null) => {
    const id = normalizeConvId(convId);
    if (!id) return;
    const list = mensajesPorConv.value[id] || [];
    const normalized = normalizeMessage(realMessage, id);

    if (tempId) {
      const idx = list.findIndex((m) => m.id === tempId || m.tempId === tempId);
      if (idx >= 0) {
        const next = [...list];
        next[idx] = normalized;
        mensajesPorConv.value[id] = next;
        return;
      }
    }

    const exists = list.some((m) => m.id === normalized.id);
    if (!exists) {
      mensajesPorConv.value[id] = [...list, normalized];
    }
  };

  const patchMessage = (convId, messageId, patch = {}) => {
    const id = normalizeConvId(convId);
    const targetId = String(messageId || "").trim();
    if (!id || !targetId) return;

    const list = mensajesPorConv.value[id] || [];
    const idx = list.findIndex(
      (m) => m.id === targetId || m.tempId === targetId,
    );
    if (idx < 0) return;

    const merged = normalizeMessage({ ...list[idx], ...patch }, id);
    const next = [...list];
    next[idx] = merged;
    mensajesPorConv.value[id] = next;
  };

  const setConversationMessages = (convId, rawMessages = []) => {
    const id = normalizeConvId(convId);
    if (!id) return;

    const normalized = (Array.isArray(rawMessages) ? rawMessages : [])
      .map((msg) => normalizeMessage(msg, id))
      .sort((a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0));

    mensajesPorConv.value[id] = normalized;

    if (conversaciones.value[id] && normalized.length > 0) {
      const last = normalized[normalized.length - 1];
      conversaciones.value[id].lastMessage = last.text || last.mensaje || "";
    }
  };

  const patchConversationState = (convId, estado) => {
    const id = normalizeConvId(convId);
    if (!id || !conversaciones.value[id]) return false;

    const current = conversaciones.value[id];
    conversaciones.value = {
      ...conversaciones.value,
      [id]: {
        ...current,
        estado,
        metadata: {
          ...(current.metadata || {}),
          estado,
        },
      },
    };
    return true;
  };

  const markConversationClosed = (convId, extra = {}) => {
    const id = normalizeConvId(convId);
    if (!id) return;

    const existing = conversaciones.value[id] || null;
    upsertConversation({
      ...(existing || {}),
      ...extra,
      id,
      estado: "cerrada",
    });

    if (conversacionActivaId.value === id) {
      conversacionActivaId.value = null;
    }
  };

  const markConversationOpened = (convId) => {
    patchConversationState(convId, "abierta");
  };

  const setAgentesInternos = (list = []) => {
    agentesInternos.value = Array.isArray(list) ? list : [];
  };

  const setInternalMessages = (peerId, messages = []) => {
    const key = String(peerId || "").trim();
    if (!key) return;
    mensajesInternosPorPeer.value = {
      ...mensajesInternosPorPeer.value,
      [key]: Array.isArray(messages) ? [...messages] : [],
    };
    internalMessagesRevision.value += 1;
  };

  const mergeInternalMessages = (peerId, messages = []) => {
    const key = String(peerId || "").trim();
    if (!key) return;

    const incoming = Array.isArray(messages) ? messages : [];
    const current = Array.isArray(mensajesInternosPorPeer.value[key])
      ? mensajesInternosPorPeer.value[key]
      : [];
    const byId = new Map();

    for (const raw of [...incoming, ...current]) {
      if (!raw) continue;
      const id = String(raw.id || "").trim();
      if (!id) continue;
      const prev = byId.get(id);
      const ts = Number(raw.timestamp) || 0;
      if (!prev || ts >= (Number(prev.timestamp) || 0)) {
        byId.set(id, { ...raw });
      }
    }

    const merged = Array.from(byId.values()).sort(
      (a, b) => (Number(a.timestamp) || 0) - (Number(b.timestamp) || 0),
    );
    mensajesInternosPorPeer.value = {
      ...mensajesInternosPorPeer.value,
      [key]: merged,
    };
    internalMessagesRevision.value += 1;
  };

  const addInternalMessage = (peerId, rawMsg = {}, viewerAgentId = "") => {
    const key = String(peerId || "").trim();
    if (!key || !rawMsg) return;

    const text = String(rawMsg.text || rawMsg.mensaje || "").trim();
    const archivoUrl = String(
      rawMsg.archivo_url || rawMsg.archivoUrl || rawMsg.url || "",
    ).trim();
    let tipo = String(rawMsg.tipo || "texto").trim().toLowerCase() || "texto";
    if (tipo === "image") tipo = "imagen";
    if (tipo === "document") tipo = "documento";
    const normalized = {
      id: String(rawMsg.id || `im_${Date.now()}`),
      emisor: rawMsg.direction === "out" ? "agente" : "contact",
      text,
      mensaje: text,
      timestamp: Number(rawMsg.timestamp) || Date.now(),
      tipo,
      archivo_url: archivoUrl || null,
      archivoUrl: archivoUrl || null,
      direction: rawMsg.direction,
      fromAgentId: rawMsg.fromAgentId,
      toAgentId: rawMsg.toAgentId,
    };

    const current = Array.isArray(mensajesInternosPorPeer.value[key])
      ? mensajesInternosPorPeer.value[key]
      : [];
    const exists = current.some(
      (m) =>
        String(m.id) === normalized.id ||
        (String(m.id).startsWith("temp_") &&
          normalized.direction === "out" &&
          m.direction === "out" &&
          (m.text === normalized.text ||
            (normalized.archivo_url &&
              m.archivo_url === normalized.archivo_url))),
    );
    if (exists) {
      mensajesInternosPorPeer.value = {
        ...mensajesInternosPorPeer.value,
        [key]: current.map((m) =>
          String(m.id).startsWith("temp_") &&
          normalized.direction === "out" &&
          m.direction === "out" &&
          (m.text === normalized.text ||
            (normalized.archivo_url &&
              m.archivo_url === normalized.archivo_url))
            ? normalized
            : m,
        ),
      };
      internalMessagesRevision.value += 1;
      return;
    }

    mensajesInternosPorPeer.value = {
      ...mensajesInternosPorPeer.value,
      [key]: [...current, normalized],
    };
    internalMessagesRevision.value += 1;

    if (
      normalized.emisor === "contact" &&
      !isInternalPeerActivoYVisible(key)
    ) {
      incrementInternalUnread(key, normalized);
    }
  };

  const addTransferNotification = (notification = {}) => {
    const id = String(notification.id || "").trim();
    const text = String(notification.text || "").trim();
    if (!id || !text) return;

    transferNotifications.value = [
      {
        id,
        type: notification.type || "info",
        title: String(notification.title || "").trim(),
        text,
        persistent: notification.persistent !== false,
      },
      ...transferNotifications.value.filter((item) => item.id !== id),
    ].slice(0, 8);
  };

  const dismissTransferNotification = (id) => {
    const normalized = String(id || "").trim();
    if (!normalized) return;
    transferNotifications.value = transferNotifications.value.filter(
      (item) => item.id !== normalized,
    );
  };

  const resetStore = () => {
    conversaciones.value = {};
    mensajesPorConv.value = {};
    conversacionActivaId.value = null;
    initialized.value = false;
    transferNotifications.value = [];
    etiquetasPorConv.value = {};
    labelModalOpen.value = false;
    labelModalConvId.value = null;
    labelModalTelefono.value = null;
    labelMenuOpen.value = false;
    labelMenuConvId.value = null;
    labelMenuTelefono.value = null;
    labelMenuX.value = 0;
    labelMenuY.value = 0;
    filtrosEtiquetasSeleccionadas.value = [];
    motivosCierre.value = [];
    tipificaciones.value = [];
    agentesInternos.value = [];
    mensajesInternosPorPeer.value = {};
    noLeidosInternosPorPeer.value = {};
    ultimoInternoPorPeer.value = {};
    internoListaVisible.value = false;
  };

  // ——— Etiquetas ———

  const etiquetasDeConvActiva = computed(() => {
    if (!conversacionActivaId.value) return [];
    return etiquetasPorConv.value[conversacionActivaId.value] || [];
  });

  const etiquetasDeConv = (convId) => {
    const id = normalizeConvId(convId);
    return (id && etiquetasPorConv.value[id]) || [];
  };

  const setEtiquetas = (lista = []) => {
    if (Array.isArray(lista)) {
      etiquetas.value = lista.map((t) => ({
        id: t.id ?? t.legacyId ?? t._id ?? `${t.nombre || "etq"}_${Math.random().toString(36).slice(2, 7)}`,
        nombre: t.nombre || t.desc || "",
        color: t.color || "#888",
      }));
    }
  };

  /**
   * Agrega una etiqueta al catálogo local (tras crear_etiqueta)
   */
  const addEtiquetaCatalogo = (etiqueta) => {
    if (!etiqueta?.id) return;
    const existe = etiquetas.value.some((e) => e.id === etiqueta.id);
    if (!existe) {
      etiquetas.value = [
        ...etiquetas.value,
        { id: etiqueta.id, nombre: etiqueta.nombre, color: etiqueta.color },
      ];
    }
  };

  const removeEtiquetaCatalogo = (etiquetaId) => {
    const idToRemove = String(etiquetaId ?? "").trim();
    if (!idToRemove) return;

    etiquetas.value = etiquetas.value.filter(
      (e) => String(e.id ?? "") !== idToRemove,
    );

    Object.keys(etiquetasPorConv.value).forEach((convId) => {
      const tags = etiquetasPorConv.value[convId] || [];
      etiquetasPorConv.value[convId] = tags.filter(
        (tag) => String(tag.id ?? "") !== idToRemove,
      );
    });

    Object.values(conversaciones.value).forEach((conv) => {
      if (!Array.isArray(conv.etiquetas)) return;
      conv.etiquetas = conv.etiquetas.filter(
        (tag) => String(tag.id ?? "") !== idToRemove,
      );
    });
  };

  /**
   * Abre el menú de etiquetas para una conversación específica
   */
  const abrirMenuEtiquetas = (convId, telefono, x = 0, y = 0) => {
    labelMenuConvId.value = normalizeConvId(convId);
    labelMenuTelefono.value = String(telefono || "");
    labelMenuX.value = x;
    labelMenuY.value = y;
    labelMenuOpen.value = true;
  };

  /**
   * Cierra el menú de etiquetas y abre el modal
   */
  const cerrarMenuYAbrirModalEtiquetas = (convId, telefono) => {
    labelMenuOpen.value = false;
    abrirModalEtiquetas(convId, telefono);
  };

  /**
   * Cierra el menú de etiquetas
   */
  const cerrarMenuEtiquetas = () => {
    labelMenuOpen.value = false;
    labelMenuConvId.value = null;
    labelMenuTelefono.value = null;
  };

  /**
   * Abre el modal de etiquetas para una conversación específica
   */
  const abrirModalEtiquetas = (convId, telefono) => {
    labelModalConvId.value = normalizeConvId(convId);
    labelModalTelefono.value = String(telefono || "");
    labelModalOpen.value = true;
  };

  /**
   * Cierra el modal de etiquetas
   */
  const cerrarModalEtiquetas = () => {
    labelModalOpen.value = false;
    labelModalConvId.value = null;
    labelModalTelefono.value = null;
  };

  /**
   * Asigna etiquetas a todas las conversaciones con el mismo teléfono
   * y actualiza etiquetasPorConv para la convId actual
   */
  const asignarEtiquetasAConv = (convId, telefono, etiquetasList) => {
    const id = normalizeConvId(convId);
    if (!id) return;
    // Actualizar en etiquetasPorConv por convId
    etiquetasPorConv.value[id] = [...etiquetasList];
    // Actualizar el campo etiquetas en todas las convs con el mismo telefono
    const telStr = String(telefono || "");
    Object.values(conversaciones.value).forEach((conv) => {
      const telConv = String(conv.telefono || "");
      if (telConv && telConv === telStr) {
        conv.etiquetas = [...etiquetasList];
        etiquetasPorConv.value[conv.id] = [...etiquetasList];
      }
    });
  };

  /**
   * Actualiza filtros seleccionados del select de etiquetas
   */
  const setFiltrosEtiquetas = (ids = []) => {
    if (!Array.isArray(ids)) {
      filtrosEtiquetasSeleccionadas.value = [];
      return;
    }
    filtrosEtiquetasSeleccionadas.value = ids
      .map((id) => String(id ?? "").trim())
      .filter(Boolean);
  };

  const limpiarFiltrosEtiquetas = () => {
    filtrosEtiquetasSeleccionadas.value = [];
  };

  const setMotivosCierre = (lista = []) => {
    if (!Array.isArray(lista)) {
      motivosCierre.value = [];
      return;
    }

    motivosCierre.value = lista
      .map((item, index) => {
        const rawId = item.id ?? item._id ?? item.legacyId ?? index + 1;
        const id = Number(rawId);
        const desc = String(
          item.desc || item.descripcion || item.nombre || "",
        ).trim();
        return {
          id: Number.isFinite(id) ? id : index + 1,
          desc,
        };
      })
      .filter((item) => item.desc);
  };

  const setTipificaciones = (lista = []) => {
    if (!Array.isArray(lista)) {
      tipificaciones.value = [];
      return;
    }

    tipificaciones.value = lista
      .map((item) => ({
        id: Number(item.id ?? item._id ?? item.id_tipificacion),
        desc: String(
          item.desc ||
            item.tipificacion ||
            item.observacion ||
            item.descripcion ||
            item.nombre ||
            "",
        ).trim(),
      }))
      .filter((item) => Number.isFinite(item.id) && item.desc);
  };

  return {
    conversaciones,
    mensajesPorConv,
    conversacionActivaId,
    conversacionActiva,
    mensajesActivos,
    activos,
    activeCountDb,
    maxActiveConversations,
    activeConversationIdsDb,
    activeCountSynced,
    agentEstadoConexion,
    agentPuedeEnviarMensajes,
    mensajeBloqueoPorEstadoAgente,
    setAgentEstadoConexion,
    setActiveConversationCount,
    nuevos,
    cerrados,
    totalNoLeidos,
    initialized,
    labelModalOpen,
    labelModalConvId,
    labelModalTelefono,
    labelMenuOpen,
    labelMenuConvId,
    labelMenuTelefono,
    labelMenuX,
    labelMenuY,
    filtrosEtiquetasSeleccionadas,
    motivosCierre,
    transferNotifications,
    addTransferNotification,
    dismissTransferNotification,
    tipificaciones,
    agentesInternos,
    mensajesInternosPorPeer,
    internalMessagesRevision,
    noLeidosInternosPorPeer,
    ultimoInternoPorPeer,
    internoListaVisible,
    totalNoLeidosInternos,
    tieneNoLeidosInternos,
    etiquetas,
    etiquetasPorConv,
    etiquetasDeConvActiva,
    etiquetasDeConv,
    enrichConversationsWithContactLookup,
    upsertConversation,
    removeConversation,
    setQueueState,
    selectConversation,
    addMessage,
    confirmMessage,
    patchMessage,
    setConversationMessages,
    markConversationClosed,
    markConversationOpened,
    setEtiquetas,
    addEtiquetaCatalogo,
    removeEtiquetaCatalogo,
    abrirMenuEtiquetas,
    cerrarMenuEtiquetas,
    cerrarMenuYAbrirModalEtiquetas,
    abrirModalEtiquetas,
    cerrarModalEtiquetas,
    asignarEtiquetasAConv,
    setFiltrosEtiquetas,
    limpiarFiltrosEtiquetas,
    setMotivosCierre,
    setTipificaciones,
    setAgentesInternos,
    setInternalMessages,
    mergeInternalMessages,
    addInternalMessage,
    setInternoListaVisible,
    markInternalPeerAsRead,
    incrementInternalUnread,
    resetStore,
  };
});
