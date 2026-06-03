import { computed, ref } from "vue";
import { defineStore } from "pinia";
import {
  enrichConversationWithContact,
  findContactFromLookup,
  resolveConversationDisplayName,
} from "@/utils/contactDisplay";
import { dedupeConversationsByPhone } from "@/utils/conversationDedup";
import { extractMessageMediaUrl } from "@/utils/messageMedia";

const normalizeConvId = (value) => {
  if (value === null || value === undefined) return null;
  const id = String(value).trim();
  if (!id || id === "NaN") return null;
  return id;
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
  const tipificaciones = ref([]);

  const activos = computed(() => {
    return dedupeConversationsByPhone(
      Object.values(conversaciones.value).filter((c) => c.estado === "abierta"),
    );
  });

  const nuevos = computed(() => {
    return dedupeConversationsByPhone(
      Object.values(conversaciones.value).filter((c) => c.estado === "nuevo"),
    );
  });

  const cerrados = computed(() => {
    return dedupeConversationsByPhone(
      Object.values(conversaciones.value).filter((c) => c.estado === "cerrada"),
    );
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

  const setQueueState = ({
    activos: stateActivos = [],
    nuevos: stateNuevos = [],
    cerrados: stateCerrados = [],
  } = {}) => {
    const nextMap = { ...conversaciones.value };

    const applyQueue = (items, estado) => {
      for (const c of dedupeConversationsByPhone(items)) {
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

    conversaciones.value = nextMap;

    if (
      conversacionActivaId.value &&
      !conversaciones.value[conversacionActivaId.value]
    ) {
      conversacionActivaId.value = null;
    }

    initialized.value = true;
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

  const selectConversation = (convId) => {
    const id = normalizeConvId(convId);
    if (!id || !conversaciones.value[id]) return;

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

  const markConversationClosed = (convId) => {
    const id = normalizeConvId(convId);
    if (!id || !conversaciones.value[id]) return;

    conversaciones.value[id].estado = "cerrada";
    conversaciones.value[id].metadata = {
      ...(conversaciones.value[id].metadata || {}),
      estado: "cerrada",
    };
  };

  const resetStore = () => {
    conversaciones.value = {};
    mensajesPorConv.value = {};
    conversacionActivaId.value = null;
    initialized.value = false;
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
    tipificaciones,
    etiquetas,
    etiquetasPorConv,
    etiquetasDeConvActiva,
    etiquetasDeConv,
    enrichConversationsWithContactLookup,
    upsertConversation,
    setQueueState,
    selectConversation,
    addMessage,
    confirmMessage,
    patchMessage,
    setConversationMessages,
    markConversationClosed,
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
    resetStore,
  };
});
