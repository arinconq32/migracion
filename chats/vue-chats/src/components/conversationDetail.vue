// ...existing code...
<script setup>
import { computed, ref, nextTick, onMounted, watch } from "vue";
import ChatHeader from "./chatHeader.vue";
import LabelAssigner from "./LabelAssigner.vue";
import ChatAudioPlayer from "./ChatAudioPlayer.vue";
import {
  extractMessageMediaUrl,
  getMessageRenderableMedia,
  inferMessageMediaType,
  shouldHideMediaCaption,
} from "@/utils/messageMedia";
import {
  cerrarChat,
  obtenerHistorialCliente,
  cargarMensajesConversacion,
  cargarMultimediaDeConversacion,
  esObjectIdConversacion,
  resolverConversacionId,
  resolveMediaDisplayUrl,
  inferMultimediaTipoFrontend,
  emitSocket,
  getSocket,
} from "@/composables/useSocket";
import { useChatStore } from "@/stores/chatStore";
import { resolveAgentIdFromSources } from "@/utils/agentId";
import {
  buildInternalConvId,
  parseInternalPeerId,
  sendInternalChatMessage,
  registerInternalIdentity,
} from "@/composables/useInternalChatSocket";
import {
  fetchMotivosCierreCatalogo,
  fetchTipificacionesCatalogo,
} from "@/composables/useCatalog";

const props = defineProps({
  conversation: {
    type: Object,
    default: null,
  },
  messages: {
    type: Array,
    default: () => [],
  },
  searchTerm: {
    type: String,
    default: "",
  },
});

const store = useChatStore();
const agenteIdActual = resolveAgentIdFromSources();

const emit = defineEmits(["send-message", "update-search-term"]);
const newMessage = ref("");
const searchOpen = ref(false);
const closeMotivosModalOpen = ref(false);
const closeMotivosLoading = ref(false);
const closeMotivosError = ref("");
const closeReasonModalOpen = ref(false);
const closeConfirmModalOpen = ref(false);
const closeSubmitting = ref(false);
const closeError = ref("");
const motivoSeleccionado = ref(null);
const tipificacionSeleccionadaId = ref("");
const HISTORIAL_PAGE_SIZE = 10;
const modalHistorialOpen = ref(false);
const historialLoading = ref(false);
const historialError = ref("");
const historialPersona = ref(null);
const historialData = ref([]);
const historialCurrentPage = ref(1);
const modalMensajesConvOpen = ref(false);
const mensajesConvId = ref("");
const mensajesConvLoadId = ref("");
const mensajesConvRows = ref([]);
const mensajesConvLoading = ref(false);
const contactProfileModalOpen = ref(false);
const editContactModalOpen = ref(false);
const editContactSubmitting = ref(false);
const editContactFeedback = ref("");
const editContactForm = ref({
  nombre: "",
  dni: "",
  telefono: "",
  email: "",
  ciudad: "",
  direccion: "",
  entidad: "",
});

// ── Contact actions ───────────────────────────────────
const isDestacado = computed(() => Boolean(props.conversation?.destacado));
const isBloqueado = computed(() => Boolean(props.conversation?.bloqueado));
const contactSidebarMode = ref("info");
const multimediaLoading = ref(false);
const multimediaError = ref("");
const multimediaItems = ref([]);
const multimediaLoadErrors = ref(new Set());
const multimediaSrcById = ref({});

const mediaDisplayUrl = (item) => {
  const id = String(item?.id || "");
  const override = multimediaSrcById.value[id];
  if (override) return override;
  return String(item?.url || item?.displayUrl || "").trim();
};

const onMultimediaLoadError = (item) => {
  const id = String(item?.id || "");
  const direct = String(item?.url || "").trim();
  const current = multimediaSrcById.value[id] || direct;
  const proxy = resolveMediaDisplayUrl(direct);

  if (proxy && current !== proxy) {
    multimediaSrcById.value = { ...multimediaSrcById.value, [id]: proxy };
    return;
  }

  multimediaLoadErrors.value = new Set([
    ...multimediaLoadErrors.value,
    id,
  ]);
};

const abrirMultimediaExterna = (item) => {
  const url = String(item?.url || "").trim();
  if (url) window.open(url, "_blank", "noopener,noreferrer");
};

const getMultimediaErrorMessage = (item) => {
  const url = String(item?.url || "").trim();
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.includes("supabase.co")) {
      return "Almacenamiento Supabase no disponible (proyecto inactivo o eliminado)";
    }
    if (host.includes("gupshup.io")) {
      return "Enlace de WhatsApp expirado";
    }
  } catch {
    /* ignore */
  }
  return "Archivo no disponible o enlace expirado";
};

const getMessageMediaUrl = (msg) => extractMessageMediaUrl(msg);

const getMessageMediaType = (msg) => getMessageRenderableMedia(msg).type;

const shouldRenderMessageMedia = (msg) => {
  const { url, type } = getMessageRenderableMedia(msg);
  return Boolean(url && type);
};

const isArchivoLabelText = (text) =>
  /^archivo\s*:/i.test(String(text || "").trim());

const getMessageDisplayText = (msg) => {
  const text = String(msg?.text || msg?.mensaje || msg?.texto || "").trim();
  if (!text) return "";
  const mediaType =
    getMessageMediaType(msg) ||
    inferMessageMediaType(msg, getMessageMediaUrl(msg));
  const mediaUrl = getMessageMediaUrl(msg);
  if (shouldHideMediaCaption(msg, mediaType)) return "";
  if (shouldRenderMessageMedia(msg)) return "";
  if (mediaUrl && isArchivoLabelText(text)) return "";
  return text;
};

const messageMediaUrl = (msg) => {
  const url = getMessageMediaUrl(msg);
  return url ? resolveMediaDisplayUrl(url) : "";
};

const multimediaTypeLabel = (tipo) => {
  const map = {
    imagen: "Imagen",
    image: "Imagen",
    video: "Video",
    audio: "Audio",
    documento: "Documento",
  };
  return map[String(tipo || "").toLowerCase()] || "Archivo";
};

const buildPersonAvatarUrl = (seedValue) => {
  const seed =
    String(seedValue || "persona")
      .trim()
      .toLowerCase() || "persona";
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  const positive = Math.abs(hash);
  const photoIndex = positive % 100;
  const family = positive % 2 === 0 ? "women" : "men";
  return `https://randomuser.me/api/portraits/${family}/${photoIndex}.jpg`;
};

const subtitle = computed(() => {
  if (!props.conversation) return "Selecciona una conversacion";
  return props.conversation.online ? "En linea" : "Ultima conexion reciente";
});

const headerAvatarSrc = computed(() => {
  const conv = props.conversation || {};
  const meta = conv.metadata || {};
  const direct =
    conv.fotoPerfil ||
    conv.avatarUrl ||
    conv.avatar ||
    conv.foto ||
    meta.fotoPerfil ||
    meta.avatarUrl ||
    meta.avatar ||
    meta.foto ||
    "";
  if (String(direct || "").trim()) return String(direct).trim();
  const nombre = String(conv.name || conv.nombre || "").trim();
  return buildPersonAvatarUrl(nombre || "contacto");
});

const searchTermModel = computed({
  get: () => props.searchTerm,
  set: (valor) => emit("update-search-term", String(valor || "")),
});

const motivosCierre = computed(() => store.motivosCierre || []);
const tipificaciones = computed(() => store.tipificaciones || []);

const conversationEstado = computed(() => {
  const conv = props.conversation;
  if (!conv) return "";
  return String(conv.estado ?? conv.status ?? conv.metadata?.estado ?? "")
    .toLowerCase()
    .trim();
});

const isInternalChat = computed(() => {
  const conv = props.conversation;
  if (!conv) return false;
  if (conv.isInternal) return true;
  return String(conv.id || "").startsWith("internal:");
});

const canCerrarConversacion = computed(() => {
  if (isInternalChat.value) return false;
  if (!props.conversation) return false;

  const convId = String(props.conversation.id || "").trim();
  const enColaActiva = store.activos.some((c) => String(c.id) === convId);
  const enColaNueva = store.nuevos.some((c) => String(c.id) === convId);
  if (enColaActiva || enColaNueva) return true;

  const estado = conversationEstado.value;
  if (!estado) return true;
  return estado !== "cerrada" && estado !== "closed";
});

const showCloseMenuInHeader = computed(
  () => Boolean(props.conversation) && !isInternalChat.value,
);

const cargarMotivosSiFaltan = async () => {
  if (!props.conversation) return;
  closeMotivosLoading.value = true;
  closeMotivosError.value = "";
  const lista = await fetchMotivosCierreCatalogo(store);
  closeMotivosLoading.value = false;
  if (!lista.length && !(store.motivosCierre || []).length) {
    closeMotivosError.value = "No se pudieron cargar los motivos de cierre.";
  }
};

const abrirModalMotivosCierre = async () => {
  if (!props.conversation) return;
  closeMotivosModalOpen.value = true;
  closeMotivosError.value = "";
  if ((store.motivosCierre || []).length === 0) {
    await cargarMotivosSiFaltan();
  }
};

const messagesContainerRef = ref(null);

function scrollMessagesToBottom() {
  nextTick(() => {
    const el = messagesContainerRef.value;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  });
}

onMounted(() => {
  cargarMotivosSiFaltan();
});

watch(
  () => props.messages.length,
  (len, prevLen) => {
    if (!props.conversation || len === 0) return;
    if (len >= (prevLen ?? 0)) scrollMessagesToBottom();
  },
);

watch(
  () => props.messages[props.messages.length - 1]?.id,
  () => {
    if (props.conversation) scrollMessagesToBottom();
  },
);

watch(
  () => props.conversation?.id,
  () => {
    closeMotivosModalOpen.value = false;
    closeReasonModalOpen.value = false;
    closeConfirmModalOpen.value = false;
    motivoSeleccionado.value = null;
    tipificacionSeleccionadaId.value = "";
    closeError.value = "";
  },
);

const tipificacionSeleccionada = computed(() => {
  const selectedId = Number(tipificacionSeleccionadaId.value);
  if (!selectedId) return null;
  return (
    tipificaciones.value.find((item) => Number(item.id) === selectedId) || null
  );
});

const historialItems = computed(() => {
  if (!Array.isArray(historialData.value)) return [];
  return historialData.value;
});

const historialTotalPaginas = computed(() => {
  return Math.max(
    1,
    Math.ceil(historialItems.value.length / HISTORIAL_PAGE_SIZE),
  );
});

const historialPageInfo = computed(() => {
  const total = historialItems.value.length;
  if (!total) return "Mostrando 0 de 0";
  const inicio = (historialCurrentPage.value - 1) * HISTORIAL_PAGE_SIZE + 1;
  const fin = Math.min(historialCurrentPage.value * HISTORIAL_PAGE_SIZE, total);
  return `Mostrando ${inicio}-${fin} de ${total}`;
});

const historialPagina = computed(() => {
  const inicio = (historialCurrentPage.value - 1) * HISTORIAL_PAGE_SIZE;
  const fin = inicio + HISTORIAL_PAGE_SIZE;
  return historialItems.value.slice(inicio, fin);
});

const mensajesConversacionVistos = computed(() => {
  return (mensajesConvRows.value || []).map((m) => {
    const emisor = m.emisor || m.autor || "";
    const text = m.text || m.mensaje || m.texto || "";
    const timeRaw = m.fecha || m.ts || m.timestamp || "";
    return {
      ...m,
      from:
        emisor === "agente" || emisor === "agent" ? "agent" : "contact",
      text,
      time: timeRaw
        ? formatearFechaHistorial(timeRaw)
        : "-",
    };
  });
});

const contactProfileData = computed(() => {
  const conv = props.conversation || {};
  const meta = conv.metadata || {};

  const nombre =
    String(conv.name || conv.nombre || "Contacto").trim() || "Contacto";
  const telefono =
    String(
      conv.telefono || conv.tels || conv.contacto_id || meta.telefono || "---",
    ).trim() || "---";
  const identificacion =
    String(
      conv.data || meta.data || meta.dni || conv.identificacion || "---",
    ).trim() || "---";
  const email = String(conv.email || meta.email || "---").trim() || "---";
  const ciudad = String(conv.ciudad || meta.ciudad || "---").trim() || "---";
  const direccion =
    String(conv.direccion || meta.direccion || "---").trim() || "---";
  const entidad = String(conv.entidad || meta.entidad || "---").trim() || "---";
  const canal =
    String(conv.origen || meta.origen || "Contacto").trim() || "Contacto";

  return {
    nombre,
    avatar: headerAvatarSrc.value,
    online: Boolean(conv.online),
    identificacion,
    telefono,
    email,
    ciudad,
    direccion,
    entidad,
    canal,
  };
});

const normalizarDocumento = (valor) => String(valor || "").trim();

const formatearFechaHistorial = (valor) => {
  if (!valor) return "-";
  const fecha = new Date(Number(valor) || valor);
  if (Number.isNaN(fecha.getTime())) return "-";
  return fecha.toLocaleString("es-CO", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

// Equivalente al legacy: solicitarHistorialClienteSocket({ convId, dni, limit })
const solicitarHistorialClienteSocket = async ({
  convId,
  dni,
  limit = 300,
} = {}) => {
  const convIdNormalizado = String(convId || "").trim();
  const dniNormalizado = normalizarDocumento(dni);
  return obtenerHistorialCliente({
    convId: convIdNormalizado || null,
    dni: dniNormalizado || null,
    limit,
  });
};

const mapearFilaHistorial = (fila, convIdFallback) => ({
  data: fila?.data || "-",
  fecha: formatearFechaHistorial(fila?.fecha),
  conversacion: fila?.conversacion || convIdFallback || "-",
  conversacionRef:
    fila?.conversacionRef ||
    fila?.conversacion ||
    convIdFallback ||
    "-",
  tipo: fila?.tipo || "Conversacion",
  cola: fila?.cola || "-",
  tipificacion: fila?.tipificacion || "-",
  comentario: fila?.comentario || "-",
  gestiono: fila?.gestiono || "-",
  telefono: fila?.telefono || "-",
  ordenTs: Number(fila?.ordenTs || fila?.fecha || 0) || 0,
});

const cargarHistorialCliente = async ({ convId, dni, limit = 300 } = {}) => {
  historialLoading.value = true;
  historialError.value = "";
  historialPersona.value = null;
  historialData.value = [];
  historialCurrentPage.value = 1;

  const resultado = await solicitarHistorialClienteSocket({
    convId,
    dni,
    limit,
  });
  historialLoading.value = false;

  if (!resultado?.ok) {
    historialError.value =
      resultado?.error || "No se pudo cargar el historial del cliente";
    return;
  }

  historialPersona.value = resultado.persona || null;
  const filas = (resultado.registros || []).map((fila) =>
    mapearFilaHistorial(fila, convId),
  );
  filaSorter(filas);
  historialData.value = filas.slice(0, 300);
};

const filaSorter = (filas) => {
  filas.sort((a, b) => (b.ordenTs || 0) - (a.ordenTs || 0));
};

const refrescarHistorial = async () => {
  if (!props.conversation) return;
  const dniBusqueda =
    props.conversation.data ||
    props.conversation.contactoId ||
    props.conversation.contacto_id ||
    props.conversation.telefono ||
    props.conversation.tels ||
    "";
  await cargarHistorialCliente({
    convId: props.conversation.id,
    dni: dniBusqueda,
    limit: 300,
  });
};

const prevHistorialPage = () => {
  if (historialCurrentPage.value > 1) historialCurrentPage.value -= 1;
};

const nextHistorialPage = () => {
  if (historialCurrentPage.value < historialTotalPaginas.value)
    historialCurrentPage.value += 1;
};

const elegirIdCargaMiniatura = (item, fallbackId = "") => {
  const ref = String(item?.conversacionRef || "").trim();
  if (esObjectIdConversacion(ref)) return ref;

  const conv = String(item?.conversacion || fallbackId || "").trim();
  if (esObjectIdConversacion(conv)) return conv;

  const personaConv = String(historialPersona.value?.convId || "").trim();
  if (esObjectIdConversacion(personaConv)) return personaConv;

  for (const row of historialItems.value || []) {
    const rowRef = String(row?.conversacionRef || "").trim();
    if (esObjectIdConversacion(rowRef)) return rowRef;
    const rowConv = String(row?.conversacion || "").trim();
    if (esObjectIdConversacion(rowConv)) return rowConv;
  }

  return ref || conv || fallbackId;
};

const abrirMensajesDeConvId = async (convIdOrItem) => {
  const item =
    convIdOrItem && typeof convIdOrItem === "object" ? convIdOrItem : null;
  const convIdPreferido = elegirIdCargaMiniatura(
    item,
    String(convIdOrItem || ""),
  );
  if (!convIdPreferido || convIdPreferido === "-") return;

  mensajesConvId.value = String(item?.conversacion || convIdPreferido);
  modalMensajesConvOpen.value = true;
  mensajesConvLoading.value = true;
  mensajesConvRows.value = [];

  let loadId = convIdPreferido;
  let mensajes = await cargarMensajesConversacion(loadId, {
    ignoreAgentCheck: true,
  });

  if (!mensajes.length) {
    const resuelto = await resolverConversacionId(loadId);
    if (resuelto && resuelto !== loadId) {
      loadId = resuelto;
      mensajes = await cargarMensajesConversacion(loadId, {
        ignoreAgentCheck: true,
      });
    }
  }

  mensajesConvLoadId.value = loadId;
  mensajesConvRows.value = Array.isArray(mensajes) ? mensajes : [];
  mensajesConvLoading.value = false;
};

const refrescarMensajesConv = async () => {
  if (!mensajesConvLoadId.value) return;
  mensajesConvLoading.value = true;
  const mensajes = await cargarMensajesConversacion(mensajesConvLoadId.value, {
    ignoreAgentCheck: true,
  });
  mensajesConvRows.value = Array.isArray(mensajes) ? mensajes : [];
  mensajesConvLoading.value = false;
};

const cerrarMensajesConvModal = () => {
  modalMensajesConvOpen.value = false;
  mensajesConvId.value = "";
  mensajesConvRows.value = [];
};

const abrirTelefono = () => {
  if (!props.conversation) return;
  const tel = String(props.conversation.telefono || "").trim();
  if (!tel) return;
  window.open(`tel:${tel}`, "_self");
};

const abrirPerfilContacto = () => {
  if (!props.conversation) return;
  contactProfileModalOpen.value = true;
};

const cerrarPerfilContacto = () => {
  contactProfileModalOpen.value = false;
  contactSidebarMode.value = "info";
};

const abrirEditarContacto = () => {
  const d = contactProfileData.value;
  editContactForm.value = {
    nombre: d.nombre === "Contacto" ? "" : d.nombre,
    dni: d.identificacion === "---" ? "" : d.identificacion,
    telefono: d.telefono === "---" ? "" : d.telefono,
    email: d.email === "---" ? "" : d.email,
    ciudad: d.ciudad === "---" ? "" : d.ciudad,
    direccion: d.direccion === "---" ? "" : d.direccion,
    entidad: d.entidad === "---" ? "" : d.entidad,
  };
  editContactFeedback.value = "";
  editContactModalOpen.value = true;
};

const cerrarEditarContacto = () => {
  editContactModalOpen.value = false;
};

const guardarEdicionContacto = () => {
  const nombre = String(editContactForm.value.nombre || "").trim();
  const telefono = String(editContactForm.value.telefono || "").trim();

  if (!nombre || !telefono) {
    editContactFeedback.value = "Nombre y telefono son requeridos.";
    return;
  }

  editContactSubmitting.value = true;
  editContactFeedback.value = "Guardando...";

  emitSocket(
    "editarContacto",
    {
      nombre,
      identificacion: String(editContactForm.value.dni || "").trim(),
      telefono,
      email: String(editContactForm.value.email || "").trim(),
      ciudad: String(editContactForm.value.ciudad || "").trim(),
      direccion: String(editContactForm.value.direccion || "").trim(),
      entidad: String(editContactForm.value.entidad || "").trim(),
      convId: props.conversation?.id,
    },
    (res) => {
      editContactSubmitting.value = false;
      if (res?.ok === false || res?.error) {
        editContactFeedback.value =
          res?.message || res?.error || "Error al guardar.";
        return;
      }
      editContactFeedback.value = "";
      editContactModalOpen.value = false;
    },
  );
};

const abrirModalHistorial = async () => {
  if (!props.conversation) return;
  modalHistorialOpen.value = true;
  await refrescarHistorial();
};

const cerrarModalHistorial = () => {
  modalHistorialOpen.value = false;
  historialCurrentPage.value = 1;
};

const cerrarModalMotivosCierre = () => {
  closeMotivosModalOpen.value = false;
};

const cerrarFlujoCierre = () => {
  closeMotivosModalOpen.value = false;
  closeReasonModalOpen.value = false;
  closeConfirmModalOpen.value = false;
  closeSubmitting.value = false;
  closeError.value = "";
  motivoSeleccionado.value = null;
  tipificacionSeleccionadaId.value = "";
};

const seleccionarEtiquetaDesdeMenu = () => {
  store.cerrarMenuYAbrirModalEtiquetas(
    store.labelMenuConvId,
    store.labelMenuTelefono,
  );
};

const cerrarMenuEtiquetas = () => {
  store.cerrarMenuEtiquetas();
};

const seleccionarMotivoCierre = async (motivo) => {
  motivoSeleccionado.value = motivo || null;
  tipificacionSeleccionadaId.value = "";
  closeError.value = "";
  closeMotivosModalOpen.value = false;

  if (tipificaciones.value.length === 0) {
    await fetchTipificacionesCatalogo(store);
  }

  closeReasonModalOpen.value = true;
};

const continuarConfirmacionCierre = () => {
  if (!motivoSeleccionado.value) {
    closeError.value = "Selecciona un motivo de cierre.";
    return;
  }
  if (!tipificacionSeleccionada.value) {
    closeError.value = "Selecciona una observacion antes de continuar.";
    return;
  }
  closeReasonModalOpen.value = false;
  closeConfirmModalOpen.value = true;
};

const volverAObservaciones = () => {
  closeConfirmModalOpen.value = false;
  closeReasonModalOpen.value = true;
};

const confirmarCierreChat = async () => {
  if (
    !props.conversation ||
    !motivoSeleccionado.value ||
    !tipificacionSeleccionada.value
  )
    return;

  closeSubmitting.value = true;
  closeError.value = "";

  const response = await cerrarChat({
    convId: props.conversation.id,
    idTipificacion: motivoSeleccionado.value.id,
    tipificacion: motivoSeleccionado.value.desc,
    idObservaciones: tipificacionSeleccionada.value.id,
    observaciones: tipificacionSeleccionada.value.desc,
    metadata: props.conversation,
  });

  closeSubmitting.value = false;

  if (!response?.success) {
    closeError.value = response?.error || "No se pudo cerrar la conversacion.";
    closeConfirmModalOpen.value = false;
    closeReasonModalOpen.value = true;
    return;
  }

  store.markConversationClosed(props.conversation.id);
  cerrarFlujoCierre();
};

const send = () => {
  const text = newMessage.value.trim();
  if (!text) return;
  emit("send-message", text);
  newMessage.value = "";
};

const toggleSearch = () => {
  searchOpen.value = !searchOpen.value;
  if (!searchOpen.value) emit("update-search-term", "");
};

// ── Contact action handlers ───────────────────────────
const toggleDestacado = () => {
  if (!props.conversation) return;
  const newValue = !isDestacado.value;
  let flag = newValue
    ? "destacado"
    : isBloqueado.value
      ? "bloqueado"
      : "normal";
  marcarContacto(props.conversation, flag);
};

const toggleBloqueado = () => {
  if (!props.conversation) return;
  const newValue = !isBloqueado.value;
  let flag = newValue
    ? "bloqueado"
    : isDestacado.value
      ? "destacado"
      : "normal";
  marcarContacto(props.conversation, flag);
};

const normalizarContacto = () => {
  if (!props.conversation) return;
  marcarContacto(props.conversation, "normal");
};

const marcarContacto = (contacto, flag) => {
  const socket = getSocket();
  let marca, estadoConv;
  switch (flag) {
    case "destacado":
      marca = "destacado";
      estadoConv = "abierta";
      break;
    case "bloqueado":
      marca = "bloqueado";
      estadoConv = "cerrada";
      break;
    case "normal":
    default:
      marca = "normal";
      estadoConv = "abierta";
      break;
  }
  socket.emit("actualizarMarca", contacto, marca, estadoConv);
  store.upsertConversation({
    ...contacto,
    destacado: marca === "destacado",
    bloqueado: marca === "bloqueado",
    estado: estadoConv,
  });
};

const abrirModalMultimedia = async () => {
  if (!props.conversation) return;
  contactSidebarMode.value = "multimedia";
  multimediaLoading.value = true;
  multimediaError.value = "";
  multimediaItems.value = [];
  multimediaLoadErrors.value = new Set();
  multimediaSrcById.value = {};

  const convId = String(props.conversation.id || "").trim();

  try {
    multimediaItems.value = await cargarMultimediaDeConversacion(
      convId,
      store.mensajesActivos || [],
    );
  } catch (error) {
    multimediaError.value = "No se pudo cargar la multimedia.";
    multimediaItems.value = [];
  } finally {
    multimediaLoading.value = false;
  }
};

watch(
  () => props.conversation?.id,
  async (convId) => {
    if (contactSidebarMode.value !== "multimedia" || !convId) return;
    multimediaLoading.value = true;
    multimediaError.value = "";
    try {
      multimediaItems.value = await cargarMultimediaDeConversacion(
        String(convId),
        store.mensajesActivos || [],
      );
    } catch {
      multimediaItems.value = [];
    } finally {
      multimediaLoading.value = false;
    }
  },
);

const volverAInfo = () => {
  contactSidebarMode.value = "info";
};

const eliminarContacto = () => {
  if (!props.conversation) return;
  if (!window.confirm("¿Seguro que deseas eliminar este contacto?")) return;
  emitSocket("eliminarContacto", { convId: props.conversation.id }, (res) => {
    if (res?.ok !== false) {
      store.markConversationClosed(props.conversation.id);
      cerrarPerfilContacto();
    }
  });
};

// ── Emoji panel ──────────────────────────────────────
const EMOJIS = {
  faces: [
    "😀",
    "😃",
    "😄",
    "😁",
    "😆",
    "😅",
    "🤣",
    "😂",
    "🙂",
    "🙃",
    "😉",
    "😊",
    "😇",
    "🥰",
    "😍",
    "🤩",
    "😘",
    "😗",
    "😚",
    "😙",
    "😋",
    "😛",
    "😜",
    "🤪",
    "😝",
    "🤑",
    "🤗",
    "🤭",
    "🤫",
    "🤔",
    "🤐",
    "🤨",
    "😐",
    "😑",
    "😶",
    "😏",
    "😒",
    "🙄",
    "😬",
    "🤥",
    "😔",
    "😪",
    "🤤",
    "😴",
    "😷",
    "🤒",
    "🤕",
    "🤢",
    "🤮",
    "🤧",
    "🥵",
    "🥶",
    "🥴",
    "😵",
    "🤯",
    "🤠",
    "🥳",
    "😎",
    "🤓",
    "🧐",
    "😕",
    "😟",
    "🙁",
    "☹️",
    "😮",
    "😯",
    "😲",
    "😳",
    "🥺",
    "😦",
    "😧",
    "😨",
    "😰",
    "😥",
    "😢",
    "😭",
    "😱",
    "😖",
    "😣",
    "😞",
    "😓",
    "😩",
    "😫",
    "🥱",
    "😤",
    "😡",
    "😠",
    "🤬",
    "😈",
    "👿",
    "💀",
    "☠️",
    "💩",
    "🤡",
    "👹",
    "👺",
    "👻",
    "👽",
    "👾",
    "🤖",
  ],
  people: [
    "👋",
    "🤚",
    "🖐️",
    "✋",
    "🖖",
    "👌",
    "🤌",
    "🤏",
    "✌️",
    "🤞",
    "🤟",
    "🤘",
    "🤙",
    "👈",
    "👉",
    "👆",
    "🖕",
    "👇",
    "☝️",
    "👍",
    "👎",
    "✊",
    "👊",
    "🤛",
    "🤜",
    "👏",
    "🙌",
    "👐",
    "🤲",
    "🤝",
    "🙏",
    "💪",
    "🦾",
    "🦵",
    "🦶",
    "👂",
    "🦻",
    "👃",
    "👀",
    "👅",
    "👄",
    "👶",
    "🧒",
    "👦",
    "👧",
    "🧑",
    "👱",
    "👨",
    "🧔",
    "👩",
    "🧓",
    "👴",
    "👵",
    "🙍",
    "🙎",
    "🙅",
    "🙆",
    "💁",
    "🙋",
    "🧏",
    "🙇",
    "🤦",
    "🤷",
    "💆",
    "💇",
    "🚶",
    "🧍",
    "🧎",
    "🏃",
    "💃",
    "🕺",
    "🧖",
    "🏊",
    "🚴",
    "🤸",
    "🏋️",
    "🤼",
    "🤽",
    "🤾",
    "🤺",
    "⛷️",
    "🏂",
    "🏌️",
    "🏇",
  ],
  food: [
    "🍏",
    "🍎",
    "🍐",
    "🍊",
    "🍋",
    "🍌",
    "🍉",
    "🍇",
    "🍓",
    "🫐",
    "🍈",
    "🍒",
    "🍑",
    "🥭",
    "🍍",
    "🥥",
    "🥝",
    "🍅",
    "🍆",
    "🥑",
    "🥦",
    "🥬",
    "🥒",
    "🌶️",
    "🫑",
    "🥕",
    "🧄",
    "🧅",
    "🥔",
    "🌽",
    "🍠",
    "🥐",
    "🥯",
    "🍞",
    "🥖",
    "🥨",
    "🧀",
    "🥚",
    "🍳",
    "🧈",
    "🥞",
    "🧇",
    "🥓",
    "🥩",
    "🍗",
    "🍖",
    "🌭",
    "🍔",
    "🍟",
    "🍕",
    "🫓",
    "🥪",
    "🥙",
    "🧆",
    "🌮",
    "🌯",
    "🥗",
    "🥘",
    "🥫",
    "🍝",
    "🍜",
    "🍲",
    "🍛",
    "🍣",
    "🍱",
    "🥟",
    "🍤",
    "🍙",
    "🍚",
    "🍘",
    "🍥",
    "🧁",
    "🍰",
    "🎂",
    "🍮",
    "🍭",
    "🍬",
    "🍫",
    "🍿",
    "🍩",
    "🍪",
    "🍯",
    "🥤",
    "🧋",
    "☕",
    "🍵",
    "🍺",
    "🍻",
    "🥂",
    "🍷",
    "🥃",
    "🍸",
    "🍹",
    "🍾",
  ],
  animals: [
    "🐶",
    "🐱",
    "🐭",
    "🐹",
    "🐰",
    "🦊",
    "🐻",
    "🐼",
    "🐨",
    "🐯",
    "🦁",
    "🐮",
    "🐷",
    "🐽",
    "🐸",
    "🐵",
    "🙈",
    "🙉",
    "🙊",
    "🐒",
    "🐔",
    "🐧",
    "🐦",
    "🐤",
    "🦆",
    "🦅",
    "🦉",
    "🦇",
    "🐺",
    "🐗",
    "🐴",
    "🦄",
    "🐝",
    "🐛",
    "🦋",
    "🐌",
    "🐞",
    "🐜",
    "🦟",
    "🦗",
    "🕷️",
    "🦂",
    "🐢",
    "🐍",
    "🦎",
    "🐙",
    "🦑",
    "🦐",
    "🦞",
    "🦀",
    "🐡",
    "🐠",
    "🐟",
    "🐬",
    "🐳",
    "🐋",
    "🦈",
    "🦭",
    "🐊",
    "🐅",
    "🐆",
    "🦓",
    "🦍",
    "🐘",
    "🦛",
    "🦏",
    "🐪",
    "🐫",
    "🦒",
    "🦘",
    "🐃",
    "🐂",
    "🐄",
    "🐎",
    "🐖",
    "🐏",
    "🐑",
    "🦙",
    "🐐",
    "🦌",
    "🐕",
    "🐩",
    "🐈",
    "🐓",
    "🦃",
    "🦚",
    "🦜",
    "🦢",
    "🐇",
    "🦝",
    "🦨",
    "🦡",
    "🦫",
    "🦦",
    "🦥",
    "🐁",
    "🐀",
    "🐿️",
    "🦔",
  ],
  objects: [
    "⌚",
    "📱",
    "💻",
    "🖥️",
    "⌨️",
    "🖱️",
    "💾",
    "💿",
    "📀",
    "📷",
    "📸",
    "📹",
    "🎥",
    "📞",
    "☎️",
    "📺",
    "📻",
    "🧭",
    "⏰",
    "⌛",
    "⏳",
    "📡",
    "🔋",
    "🔌",
    "💡",
    "🔦",
    "🕯️",
    "💰",
    "💵",
    "💸",
    "💳",
    "✉️",
    "📧",
    "📨",
    "📩",
    "📜",
    "📄",
    "📑",
    "📅",
    "📆",
    "📁",
    "📂",
    "📊",
    "📈",
    "📉",
    "📋",
    "📌",
    "📍",
    "✂️",
    "📎",
    "📏",
    "📐",
    "✏️",
    "🖊️",
    "🖋️",
    "🖌️",
    "🖍️",
    "📝",
    "🔍",
    "🔎",
    "🔑",
    "🗝️",
    "🔒",
    "🔓",
    "🔨",
    "⛏️",
    "🔧",
    "🔩",
    "🔫",
    "🛡️",
    "🔪",
    "⚔️",
    "🛠️",
    "🧰",
    "🪤",
    "🚗",
    "🚕",
    "🚙",
    "🚌",
    "🚎",
    "🏎️",
    "🚓",
    "🚑",
    "🚒",
    "✈️",
    "🚀",
    "🛸",
    "🚁",
    "🛶",
    "🚢",
    "🛴",
    "🚲",
    "🛵",
    "🏍️",
    "🚂",
    "🚃",
    "🚄",
    "🚅",
    "🏠",
    "🏡",
    "🏢",
    "🏣",
    "🏤",
    "🏥",
    "🏦",
    "🏨",
    "🏩",
    "🏪",
    "🏫",
    "🏬",
    "🏭",
    "🏯",
    "🏰",
    "💒",
    "🗼",
    "🗽",
    "⛪",
    "🕌",
    "🛕",
    "🕍",
    "⛩️",
    "🗾",
    "🎡",
    "🎢",
    "🎠",
  ],
  symbols: [
    "❤️",
    "🧡",
    "💛",
    "💚",
    "💙",
    "💜",
    "🖤",
    "🤍",
    "🤎",
    "💔",
    "💕",
    "💞",
    "💓",
    "💗",
    "💖",
    "💘",
    "💝",
    "💟",
    "☮️",
    "✝️",
    "☪️",
    "🕉️",
    "✡️",
    "☯️",
    "☦️",
    "⚛️",
    "☢️",
    "☣️",
    "♈",
    "♉",
    "♊",
    "♋",
    "♌",
    "♍",
    "♎",
    "♏",
    "♐",
    "♑",
    "♒",
    "♓",
    "🆔",
    "💯",
    "💢",
    "♨️",
    "🚫",
    "❌",
    "⭕",
    "🛑",
    "⛔",
    "📛",
    "❗",
    "❕",
    "❓",
    "❔",
    "‼️",
    "⁉️",
    "⚠️",
    "🚸",
    "♻️",
    "✅",
    "❎",
    "🌐",
    "💠",
    "💤",
    "🏧",
    "♿",
    "🎵",
    "🎶",
    "➕",
    "➖",
    "➗",
    "✖️",
    "💲",
    "💱",
    "™️",
    "©️",
    "®️",
    "✔️",
    "☑️",
    "🔴",
    "🟠",
    "🟡",
    "🟢",
    "🔵",
    "🟣",
    "⚫",
    "⚪",
    "🟤",
    "🔺",
    "🔻",
    "🔷",
    "🔶",
    "🔹",
    "🔸",
    "🔲",
    "🔳",
    "🟥",
    "🟧",
    "🟨",
    "🟩",
    "🟦",
    "🟪",
    "⬛",
    "⬜",
    "🟫",
    "🔔",
    "🔕",
    "📣",
    "📢",
    "🎉",
    "🎊",
    "🎈",
    "🎁",
    "🎀",
    "🏆",
    "🥇",
    "🥈",
    "🥉",
    "🎯",
    "🎮",
    "🎲",
    "🃏",
    "🀄",
    "🎴",
    "🎭",
    "🎨",
  ],
};
const emojiPanelOpen = ref(false);
const activeEmojiCategory = ref("faces");
const emojiCategories = [
  "faces",
  "people",
  "food",
  "animals",
  "objects",
  "symbols",
];
const emojiCategoryLabels = {
  faces: "😀",
  people: "👋",
  food: "🍎",
  animals: "🐶",
  objects: "💻",
  symbols: "❤️",
};
const messageInputRef = ref(null);

// ── Audio recording ───────────────────────────────────
const isRecording = ref(false);
const isPaused = ref(false);
const isProcessingAudioSend = ref(false);
const recordingTimeDisplay = ref("00:00");
let _mediaRecorder = null;
let _audioChunks = [];
let _audioStream = null;
let _recordingInterval = null;
let _totalRecordedDuration = 0;
let _recordingStartTime = 0;

const toggleEmojiPanel = () => {
  emojiPanelOpen.value = !emojiPanelOpen.value;
};

const closeEmojiPanel = () => {
  emojiPanelOpen.value = false;
};

const insertEmoji = (emoji) => {
  const input = messageInputRef.value;
  if (!input) {
    newMessage.value += emoji;
    return;
  }
  const start = input.selectionStart ?? newMessage.value.length;
  const end = input.selectionEnd ?? newMessage.value.length;
  newMessage.value =
    newMessage.value.slice(0, start) + emoji + newMessage.value.slice(end);
  nextTick(() => {
    input.focus();
    input.setSelectionRange(start + emoji.length, start + emoji.length);
  });
};

const selectEmojiCategory = (cat) => {
  activeEmojiCategory.value = cat;
};

const triggerFileUpload = () => {
  if (!props.conversation) return;
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "*/*";
  input.onchange = (e) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
  };
  input.click();
};

const getConversationPhone = () =>
  String(
    props.conversation?.tels ||
      props.conversation?.telefono ||
      props.conversation?.contacto_id ||
      "",
  );

const getInternalPeerId = () =>
  String(
    props.conversation?.peerAgentId ||
      parseInternalPeerId(props.conversation?.id) ||
      "",
  ).trim();

const getInternalStorageConvId = () => {
  const peerId = getInternalPeerId();
  return peerId ? buildInternalConvId(peerId) : "internal-general";
};

const inferTipoFromFile = (file) => {
  const mime = String(file?.type || "").toLowerCase();
  if (mime.startsWith("image/")) return "imagen";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("video/")) return "video";
  return inferMultimediaTipoFrontend("archivo", file?.name || "");
};

const sendInternalUploadedMedia = async (file, tipoOverride = null) => {
  const peerId = getInternalPeerId();
  if (!peerId || !file) return;

  const baseUrl = window.URL_BASE || "";
  const tipo = tipoOverride || inferTipoFromFile(file);
  const label = String(file.name || multimediaTypeLabel(tipo)).trim();
  const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  registerInternalIdentity(agenteIdActual);
  store.addInternalMessage(peerId, {
    id: tempId,
    direction: "out",
    fromAgentId: agenteIdActual,
    toAgentId: peerId,
    text: label,
    mensaje: label,
    tipo,
    timestamp: Date.now(),
  });

  const form = new FormData();
  form.append("file", file, file.name || "archivo");
  form.append("convId", getInternalStorageConvId());
  form.append("mode", "interno");
  form.append("toAgentId", peerId);

  try {
    const res = await fetch(`${baseUrl}/upload_file`, {
      method: "POST",
      body: form,
    });
    const data = await res.json();
    if (!data?.archivo_url) return;

    store.addInternalMessage(peerId, {
      id: tempId,
      direction: "out",
      fromAgentId: agenteIdActual,
      toAgentId: peerId,
      text: label,
      mensaje: label,
      tipo,
      archivo_url: data.archivo_url,
      archivoUrl: data.archivo_url,
      timestamp: Date.now(),
    });

    sendInternalChatMessage(
      peerId,
      { text: label, tipo, archivo_url: data.archivo_url },
      (ack) => {
        if (ack?.mensaje) {
          store.addInternalMessage(peerId, ack.mensaje, agenteIdActual);
        }
      },
    );
  } catch (error) {
    console.warn("Error subiendo archivo interno:", error);
  }
};

const sendUploadedMedia = async (file, tipoOverride = null) => {
  if (!props.conversation || !file) return;
  if (isInternalChat.value) {
    await sendInternalUploadedMedia(file, tipoOverride);
    return;
  }

  const baseUrl = window.URL_BASE || "";
  const convId = String(props.conversation.id || "");
  const numero = getConversationPhone();
  const tipo = tipoOverride || inferTipoFromFile(file);
  const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const label = String(file.name || multimediaTypeLabel(tipo)).trim();

  store.addMessage(convId, {
    id: tempId,
    tempId,
    emisor: "agente",
    tipo,
    text: label,
    mensaje: label,
    timestamp: Date.now(),
    origen: "web",
  });

  const form = new FormData();
  form.append("file", file, file.name || "archivo");
  form.append("convId", convId);
  form.append("numero", numero);

  try {
    const res = await fetch(`${baseUrl}/upload_file`, {
      method: "POST",
      body: form,
    });
    const data = await res.json();
    if (data?.archivo_url) {
      store.patchMessage(convId, tempId, {
        tipo,
        archivo_url: data.archivo_url,
        archivoUrl: data.archivo_url,
      });
      emitSocket("chat_message", {
        convId,
        text: label,
        tipo,
        archivo_url: data.archivo_url,
        numero,
        tempId,
      });
    }
  } catch (_) {
    /* silent */
  }
};

const sendInternalVoiceNote = async (blob) => {
  const peerId = getInternalPeerId();
  if (!peerId || !blob || blob.size === 0) return;

  const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  registerInternalIdentity(agenteIdActual);
  store.addInternalMessage(peerId, {
    id: tempId,
    direction: "out",
    fromAgentId: agenteIdActual,
    toAgentId: peerId,
    text: "Nota de voz",
    mensaje: "Nota de voz",
    tipo: "audio",
    timestamp: Date.now(),
  });

  const baseUrl = window.URL_BASE || "";
  const form = new FormData();
  form.append("audio", blob, `audio_${Date.now()}.webm`);
  form.append("mode", "interno");
  form.append("toAgentId", peerId);
  form.append("convId", getInternalStorageConvId());

  const res = await fetch(`${baseUrl}/upload_chat_audio`, {
    method: "POST",
    body: form,
  });
  const data = await res.json();

  if (!res.ok || !(data?.success || data?.ok) || !data?.archivo_url) {
    throw new Error(data?.message || "No se pudo enviar la nota de voz");
  }

  store.addInternalMessage(peerId, {
    id: tempId,
    direction: "out",
    fromAgentId: agenteIdActual,
    toAgentId: peerId,
    text: "Nota de voz",
    mensaje: "Nota de voz",
    tipo: "audio",
    archivo_url: data.archivo_url,
    archivoUrl: data.archivo_url,
    timestamp: Date.now(),
  });

  sendInternalChatMessage(
    peerId,
    {
      text: "Nota de voz",
      tipo: "audio",
      archivo_url: data.archivo_url,
    },
    (ack) => {
      if (ack?.mensaje) {
        store.addInternalMessage(peerId, ack.mensaje, agenteIdActual);
      }
    },
  );
};

const sendVoiceNote = async (blob) => {
  if (!props.conversation || !blob || blob.size === 0) return;
  if (isInternalChat.value) {
    await sendInternalVoiceNote(blob);
    return;
  }

  const baseUrl = window.URL_BASE || "";
  const convId = String(props.conversation.id || "");
  const numero = getConversationPhone();
  const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  store.addMessage(convId, {
    id: tempId,
    tempId,
    emisor: "agente",
    tipo: "audio",
    text: "Nota de voz",
    mensaje: "Nota de voz",
    timestamp: Date.now(),
    origen: "web",
    isPending: true,
  });

  const form = new FormData();
  form.append("audio", blob, `audio_${Date.now()}.webm`);
  form.append("convId", convId);
  form.append("numero", numero);
  form.append("tempId", tempId);

  const res = await fetch(`${baseUrl}/upload_chat_audio`, {
    method: "POST",
    body: form,
  });
  const data = await res.json();

  if (!res.ok || !(data?.success || data?.ok) || !data?.archivo_url) {
    throw new Error(data?.message || "No se pudo enviar la nota de voz");
  }

  store.patchMessage(convId, tempId, {
    tipo: "audio",
    archivo_url: data.archivo_url,
    archivoUrl: data.archivo_url,
    text: "Nota de voz",
    mensaje: "Nota de voz",
  });
};

const uploadFile = async (file) => {
  await sendUploadedMedia(file);
};

const _updateRecordingTime = () => {
  const elapsed =
    _totalRecordedDuration +
    (isPaused.value ? 0 : Date.now() - _recordingStartTime);
  const secs = Math.floor(elapsed / 1000);
  const mm = String(Math.floor(secs / 60)).padStart(2, "0");
  const ss = String(secs % 60).padStart(2, "0");
  recordingTimeDisplay.value = `${mm}:${ss}`;
};

const _resetRecordingState = () => {
  isRecording.value = false;
  isPaused.value = false;
  isProcessingAudioSend.value = false;
  recordingTimeDisplay.value = "00:00";
  _mediaRecorder = null;
  _audioChunks = [];
  if (_audioStream) {
    _audioStream.getTracks().forEach((track) => {
      if (track.readyState === "live") track.stop();
    });
  }
  _audioStream = null;
  if (_recordingInterval) {
    clearInterval(_recordingInterval);
    _recordingInterval = null;
  }
  _totalRecordedDuration = 0;
  _recordingStartTime = 0;
};

const startRecording = async () => {
  if (!props.conversation || isRecording.value || isProcessingAudioSend.value) {
    return;
  }

  try {
    _audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    _audioChunks = [];
    _totalRecordedDuration = 0;
    _recordingStartTime = Date.now();
    _mediaRecorder = new MediaRecorder(_audioStream);
    _mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) _audioChunks.push(e.data);
    };
    _mediaRecorder.start();
    isRecording.value = true;
    isPaused.value = false;
    if (_recordingInterval) clearInterval(_recordingInterval);
    _recordingInterval = setInterval(_updateRecordingTime, 500);
  } catch (_) {
    _resetRecordingState();
  }
};

const finishRecordingAndSend = () => {
  if (!isRecording.value || !_mediaRecorder || isProcessingAudioSend.value) {
    return;
  }

  isProcessingAudioSend.value = true;

  if (_recordingInterval) {
    clearInterval(_recordingInterval);
    _recordingInterval = null;
  }

  isRecording.value = false;
  isPaused.value = false;

  _mediaRecorder.onstop = async () => {
    try {
      if (_audioChunks.length > 0) {
        const blob = new Blob(_audioChunks, { type: "audio/webm" });
        await sendVoiceNote(blob);
      }
    } catch (error) {
      console.warn("Error enviando nota de voz:", error);
    } finally {
      _audioChunks = [];
      _resetRecordingState();
    }
  };

  try {
    if (_mediaRecorder.state !== "inactive") {
      _mediaRecorder.stop();
    }
  } catch (_) {
    _resetRecordingState();
  }

  if (_audioStream) {
    _audioStream.getTracks().forEach((track) => {
      if (track.readyState === "live") track.stop();
    });
    _audioStream = null;
  }
};

const stopAndSendRecording = () => {
  finishRecordingAndSend();
};

const cancelRecording = () => {
  if (_recordingInterval) {
    clearInterval(_recordingInterval);
    _recordingInterval = null;
  }

  if (_mediaRecorder) {
    _mediaRecorder.onstop = null;
    if (_mediaRecorder.state !== "inactive") {
      try {
        _mediaRecorder.stop();
      } catch (_) {
        /* ignore */
      }
    }
  }

  if (_audioStream) {
    _audioStream.getTracks().forEach((track) => {
      if (track.readyState === "live") track.stop();
    });
  }

  _audioChunks = [];
  _resetRecordingState();
};

const togglePauseRecording = () => {
  if (!_mediaRecorder || !isRecording.value) return;

  if (isPaused.value) {
    _mediaRecorder.resume();
    _recordingStartTime = Date.now();
    isPaused.value = false;
    if (_recordingInterval) clearInterval(_recordingInterval);
    _recordingInterval = setInterval(_updateRecordingTime, 500);
  } else {
    _mediaRecorder.pause();
    _totalRecordedDuration += Date.now() - _recordingStartTime;
    isPaused.value = true;
    if (_recordingInterval) {
      clearInterval(_recordingInterval);
      _recordingInterval = null;
    }
  }
};

const sendTextMessage = () => {
  if (isRecording.value) {
    finishRecordingAndSend();
    return;
  }
  if (!newMessage.value.trim()) {
    startRecording();
    return;
  }
  send();
};

const canSendText = computed(
  () => Boolean(newMessage.value.trim()) && !isRecording.value,
);
</script>

<template>
  <div
    class="detail"
    :class="{
      'detail-destacado': isDestacado,
      'detail-bloqueado': isBloqueado,
    }"
  >
    <ChatHeader
      :key="String(props.conversation?.id || 'sin-chat')"
      :avatar-src="headerAvatarSrc"
      :online="Boolean(props.conversation?.online)"
      :title="
        props.conversation?.name ||
        props.conversation?.nombre ||
        'Sin conversacion'
      "
      :subtitle="subtitle"
      :featured="isDestacado"
      :show-close-menu="showCloseMenuInHeader"
      @search="toggleSearch"
      @phone="abrirTelefono"
      @history="abrirModalHistorial"
      @close-menu="abrirModalMotivosCierre"
      @open-contact-profile="abrirPerfilContacto"
    >
    </ChatHeader>

    <div
      v-if="store.labelMenuOpen"
      class="label-menu-backdrop"
      @click="cerrarMenuEtiquetas"
    ></div>
    <div
      v-if="store.labelMenuOpen"
      class="label-menu-panel"
      :style="{ left: store.labelMenuX + 'px', top: store.labelMenuY + 'px' }"
    >
      <button
        type="button"
        class="label-menu-simple-item"
        @click="seleccionarEtiquetaDesdeMenu"
      >
        Etiquetas
      </button>
    </div>

    <div v-if="searchOpen" class="message-search-wrap">
      <input
        v-model="searchTermModel"
        type="text"
        class="message-search-input"
        placeholder="Buscar en esta conversacion..."
        :disabled="!props.conversation"
      />
    </div>

    <div ref="messagesContainerRef" class="messages" v-if="props.conversation">
      <div v-if="props.messages.length === 0" class="messages-empty">
        {{
          props.searchTerm
            ? "No se encontraron mensajes con ese texto."
            : "No hay mensajes en esta conversación."
        }}
      </div>
      <div
        v-for="msg in props.messages"
        :key="msg.id"
        class="msg-row"
        :class="msg.from === 'agent' ? 'right' : 'left'"
      >
        <div
          class="bubble"
          :class="{ 'bubble-has-media': shouldRenderMessageMedia(msg) }"
        >
          <template v-if="shouldRenderMessageMedia(msg) && getMessageMediaType(msg) === 'imagen'">
            <a
              class="bubble-media-link"
              :href="messageMediaUrl(msg)"
              target="_blank"
              rel="noopener noreferrer"
            >
              <img
                class="bubble-media-image"
                :src="messageMediaUrl(msg)"
                alt="Imagen compartida"
                loading="lazy"
              />
            </a>
          </template>
          <template v-else-if="shouldRenderMessageMedia(msg) && getMessageMediaType(msg) === 'video'">
            <video
              class="bubble-media-video"
              controls
              preload="metadata"
              :src="messageMediaUrl(msg)"
            ></video>
          </template>
          <template v-else-if="shouldRenderMessageMedia(msg) && getMessageMediaType(msg) === 'audio'">
            <ChatAudioPlayer :src="messageMediaUrl(msg)" />
          </template>
          <template v-else-if="shouldRenderMessageMedia(msg) && getMessageMediaType(msg) === 'documento'">
            <a
              class="bubble-media-doc"
              :href="messageMediaUrl(msg)"
              target="_blank"
              rel="noopener noreferrer"
            >
              <span class="bubble-media-doc-icon" aria-hidden="true">📄</span>
              <span class="bubble-media-doc-label">Documento</span>
            </a>
          </template>
          <p v-if="getMessageDisplayText(msg)" class="bubble-text">
            {{ getMessageDisplayText(msg) }}
          </p>
        </div>
      </div>
    </div>

    <div class="empty" v-else>Elige una conversacion para comenzar.</div>

    <LabelAssigner />

    <form class="composer" @submit.prevent="sendTextMessage">
      <!-- Voice recorder controls -->
      <div v-if="isRecording" class="composer-recorder-row">
        <button
          type="button"
          class="composer-icon-btn recorder-cancel-btn"
          title="Cancelar"
          @click="cancelRecording"
        >
          ✕
        </button>
        <div class="recording-status">
          <span class="recording-dot"></span>
          <span class="recording-time">{{ recordingTimeDisplay }}</span>
        </div>
        <button
          type="button"
          class="composer-icon-btn"
          :title="isPaused ? 'Reanudar' : 'Pausar'"
          @click="togglePauseRecording"
        >
          <svg
            v-if="isPaused"
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M8 5v14l11-7z" />
          </svg>
          <svg
            v-else
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
          </svg>
        </button>
        <button
          type="button"
          class="composer-icon-btn composer-send-btn"
          title="Enviar audio"
          @click="stopAndSendRecording"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
          </svg>
        </button>
      </div>

      <div v-else class="composer-input-row">
        <button
          type="button"
          class="composer-icon-btn"
          title="Adjuntar archivo"
          @click="triggerFileUpload"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path
              d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"
            />
          </svg>
        </button>
        <button
          type="button"
          class="composer-icon-btn"
          :class="{ active: emojiPanelOpen }"
          title="Emojis"
          @click="toggleEmojiPanel"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M8 13s1.5 2 4 2 4-2 4-2" />
            <line x1="9" y1="9" x2="9.01" y2="9" />
            <line x1="15" y1="9" x2="15.01" y2="9" />
          </svg>
        </button>
        <input
          ref="messageInputRef"
          v-model="newMessage"
          type="text"
          class="composer-text-input"
          :placeholder="
            isInternalChat
              ? 'Mensaje, adjunto o nota de voz al agente...'
              : 'Escribe un mensaje...'
          "
          @keydown.enter.prevent="sendTextMessage"
        />
        <button
          type="button"
          class="composer-icon-btn composer-send-btn"
          :title="canSendText ? 'Enviar mensaje' : 'Grabar audio'"
          :disabled="isProcessingAudioSend"
          @click="sendTextMessage"
        >
          <svg
            v-if="canSendText"
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
          </svg>
          <svg
            v-else
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="23" />
            <line x1="8" y1="23" x2="16" y2="23" />
          </svg>
        </button>
      </div>

      <!-- Emoji panel -->
      <div v-if="emojiPanelOpen" class="emoji-panel">
        <div class="emoji-tabs">
          <button
            v-for="cat in emojiCategories"
            :key="cat"
            type="button"
            :class="['emoji-tab', { active: activeEmojiCategory === cat }]"
            @click="selectEmojiCategory(cat)"
          >
            {{ emojiCategoryLabels[cat] }}
          </button>
        </div>
        <div class="emoji-grid">
          <button
            v-for="emoji in EMOJIS[activeEmojiCategory]"
            :key="emoji"
            type="button"
            class="emoji-item"
            @click="insertEmoji(emoji)"
          >
            {{ emoji }}
          </button>
        </div>
      </div>
    </form>

    <!-- Modal Perfil de Contacto -->
    <Teleport to="body">
      <div
        v-if="contactProfileModalOpen"
        class="contact-profile-overlay"
        @click.self="cerrarPerfilContacto"
      >
        <aside class="contact-profile-sidebar">
          <div class="contact-profile-header">
            <button
              type="button"
              class="contact-profile-close"
              @click="cerrarPerfilContacto"
            >
              x
            </button>

            <div class="contact-profile-photo-wrap">
              <img
                class="contact-profile-photo"
                :src="headerAvatarSrc"
                :alt="contactProfileData.nombre"
              />
            </div>
            <h3>{{ contactProfileData.nombre }}</h3>
            <p>{{ contactProfileData.canal || "Contacto" }}</p>
            <small>{{
              contactProfileData.online ? "En linea" : "Offline"
            }}</small>
          </div>

          <div
            class="contact-profile-body"
            v-if="contactSidebarMode === 'info'"
          >
            <button type="button" class="contact-profile-gear" title="Opciones">
              ⚙
            </button>

            <div class="contact-section-title">INFORMACION DE USUARIO</div>
            <div class="contact-card">
              <div class="contact-info-row">
                <strong>Documento:</strong>
                <span>{{ contactProfileData.identificacion || "-" }}</span>
              </div>
              <div class="contact-info-row">
                <strong>Teléfono:</strong>
                <span>{{ contactProfileData.telefono || "-" }}</span>
              </div>
              <div class="contact-info-row">
                <strong>Correo:</strong>
                <span>{{ contactProfileData.email || "-" }}</span>
              </div>
              <div class="contact-info-row">
                <strong>Ciudad:</strong>
                <span>{{ contactProfileData.ciudad || "-" }}</span>
              </div>
              <div class="contact-info-row">
                <strong>Dirección:</strong>
                <span>{{ contactProfileData.direccion || "-" }}</span>
              </div>
              <div class="contact-info-row">
                <strong>Entidad:</strong>
                <span>{{ contactProfileData.entidad || "-" }}</span>
              </div>
            </div>

            <div class="contact-section-title">ACCIONES</div>
            <div class="contact-options-list">
              <button
                type="button"
                class="contact-option-row"
                :class="{ active: isDestacado }"
                @click="toggleDestacado"
                title="Destacar contacto"
              >
                <span class="icon">★</span>
                <span>{{
                  isDestacado ? "Destacado" : "Destacar contacto"
                }}</span>
              </button>
              <button
                type="button"
                class="contact-option-row"
                :class="{ blocked: isBloqueado }"
                @click="toggleBloqueado"
                title="Bloquear contacto"
              >
                <span class="icon">🚫</span>
                <span>{{
                  isBloqueado ? "Desbloqueado" : "Bloquear contacto"
                }}</span>
              </button>
              <button
                type="button"
                class="contact-option-row"
                v-if="isDestacado || isBloqueado"
                @click="normalizarContacto"
                title="Normalizar contacto"
              >
                <span class="icon">🔄</span>
                <span>Normalizar</span>
              </button>
              <button
                type="button"
                class="contact-option-row"
                @click="abrirModalHistorial"
                title="Ver histórico"
              >
                <span class="icon">🧾</span>
                <span>Histórico</span>
              </button>
              <button
                type="button"
                class="contact-option-row"
                @click="abrirModalMultimedia"
                title="Ver multimedia"
              >
                <span class="icon">🖼</span>
                <span>Multimedia</span>
              </button>
              <button
                type="button"
                class="contact-option-row danger"
                @click="eliminarContacto"
                title="Eliminar contacto"
              >
                <span class="icon">🗑</span>
                <span>Eliminar</span>
              </button>
            </div>
            <button
              type="button"
              class="contact-edit-btn"
              @click="abrirEditarContacto"
            >
              <span class="icon">✏️</span>
              <span>Editar información</span>
            </button>
          </div>

          <div
            class="contact-profile-body"
            v-else-if="contactSidebarMode === 'multimedia'"
          >
            <button
              type="button"
              class="contact-edit-btn back-btn"
              @click="volverAInfo"
            >
              <span class="icon">←</span>
              <span>Volver a opciones</span>
            </button>
            <div class="contact-section-title">ARCHIVOS MULTIMEDIA</div>
            <div
              v-if="multimediaLoading"
              style="color: #5c6f54; font-size: 14px"
            >
              Cargando multimedia...
            </div>
            <div
              v-else-if="multimediaError"
              style="color: #588044; font-size: 14px"
            >
              {{ multimediaError }}
            </div>
            <div
              v-else-if="multimediaItems.length === 0"
              style="color: #5c6f54; font-size: 14px"
            >
              No hay archivos multimedia en esta conversación.
            </div>
            <div v-else class="multimedia-grid">
              <button
                v-for="item in multimediaItems"
                :key="item.id"
                type="button"
                class="multimedia-tile"
                :title="`Abrir ${multimediaTypeLabel(item.tipo)}`"
                @click="abrirMultimediaExterna(item)"
              >
                <template
                  v-if="item.tipo === 'imagen' || item.tipo === 'image'"
                >
                  <img
                    v-if="!multimediaLoadErrors.has(String(item.id))"
                    class="multimedia-tile-preview"
                    :src="mediaDisplayUrl(item)"
                    alt="Imagen"
                    loading="lazy"
                    @error.stop="onMultimediaLoadError(item)"
                  />
                  <div v-else class="multimedia-tile-fallback">
                    <span class="multimedia-tile-icon">🖼️</span>
                    <span class="multimedia-tile-type">Imagen</span>
                  </div>
                </template>
                <video
                  v-else-if="item.tipo === 'video'"
                  class="multimedia-tile-preview"
                  muted
                  preload="metadata"
                  :src="mediaDisplayUrl(item)"
                  @error.stop="onMultimediaLoadError(item)"
                ></video>
                <div
                  v-else-if="item.tipo === 'audio'"
                  class="multimedia-tile-fallback multimedia-tile-audio"
                >
                  <span class="multimedia-tile-icon">🎵</span>
                  <span class="multimedia-tile-type">Audio</span>
                </div>
                <div v-else class="multimedia-tile-fallback">
                  <span class="multimedia-tile-icon">📄</span>
                  <span class="multimedia-tile-type">Documento</span>
                </div>
                <span
                  v-if="item.tipo === 'imagen' || item.tipo === 'image' || item.tipo === 'video'"
                  class="multimedia-tile-badge"
                >
                  {{ multimediaTypeLabel(item.tipo) }}
                </span>
              </button>
            </div>
          </div>
        </aside>
      </div>
    </Teleport>

    <!-- Modal Editar Contacto -->
    <Teleport to="body">
      <div
        v-if="editContactModalOpen"
        class="edit-contact-overlay"
        @click.self="cerrarEditarContacto"
      >
        <div class="edit-contact-modal">
          <div class="edit-contact-header">
            <span>Editar Contacto</span>
            <button
              type="button"
              class="edit-contact-close"
              @click="cerrarEditarContacto"
            >
              ✕
            </button>
          </div>

          <div class="edit-contact-body">
            <form @submit.prevent="guardarEdicionContacto">
              <label class="edit-contact-label">NOMBRE</label>
              <input
                v-model="editContactForm.nombre"
                type="text"
                class="edit-contact-input"
                placeholder="Nombre"
              />

              <label class="edit-contact-label">DNI</label>
              <input
                v-model="editContactForm.dni"
                type="text"
                class="edit-contact-input"
                placeholder="DNI"
              />

              <label class="edit-contact-label">TELÉFONO</label>
              <input
                v-model="editContactForm.telefono"
                type="text"
                class="edit-contact-input"
                placeholder="Teléfono"
              />

              <label class="edit-contact-label">EMAIL</label>
              <input
                v-model="editContactForm.email"
                type="email"
                class="edit-contact-input"
                placeholder="Email"
              />

              <label class="edit-contact-label">CIUDAD</label>
              <input
                v-model="editContactForm.ciudad"
                type="text"
                class="edit-contact-input"
                placeholder="Ciudad"
              />

              <label class="edit-contact-label">DIRECCIÓN</label>
              <textarea
                v-model="editContactForm.direccion"
                class="edit-contact-input edit-contact-textarea"
                placeholder="Dirección"
              ></textarea>

              <label class="edit-contact-label">ENTIDAD</label>
              <input
                v-model="editContactForm.entidad"
                type="text"
                class="edit-contact-input"
                placeholder="Entidad"
              />

              <p v-if="editContactFeedback" class="edit-contact-feedback">
                {{ editContactFeedback }}
              </p>

              <div class="edit-contact-actions">
                <button
                  type="button"
                  class="edit-contact-cancel"
                  :disabled="editContactSubmitting"
                  @click="cerrarEditarContacto"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  class="edit-contact-save"
                  :disabled="editContactSubmitting"
                >
                  {{ editContactSubmitting ? "Guardando..." : "Guardar" }}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Modal Historial -->
    <Teleport to="body">
      <div
        v-if="modalHistorialOpen"
        class="historial-overlay"
        @click.self="cerrarModalHistorial"
      >
        <div class="historial-modal">
          <div class="historial-header">
            <div class="historial-title">Historial de tipificaciones</div>
            <div class="historial-actions">
              <button
                class="historial-refresh"
                type="button"
                @click="refrescarHistorial"
              >
                Refrescar
              </button>
              <button
                class="historial-close"
                type="button"
                @click="cerrarModalHistorial"
              >
                x
              </button>
            </div>
          </div>
          <div class="historial-body">
            <div v-if="historialPersona" class="persona-card">
              <div>
                <strong>Nombre:</strong> {{ historialPersona.nombre || "-" }}
              </div>
              <div>
                <strong>Telefono:</strong>
                {{ historialPersona.telefono || "-" }}
              </div>
              <div>
                <strong>Canal:</strong> {{ historialPersona.canal || "-" }}
              </div>
              <div>
                <strong>Entidad:</strong> {{ historialPersona.entidad || "-" }}
              </div>
            </div>

            <div v-if="historialLoading" class="historial-empty">
              Cargando historial...
            </div>
            <div v-else-if="historialError" class="historial-error">
              {{ historialError }}
            </div>
            <div
              v-else-if="historialItems.length === 0"
              class="historial-empty"
            >
              No hay historial para mostrar.
            </div>
            <div v-else>
              <table class="historial-table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Conv</th>
                    <th>Tipo</th>
                    <th>Cola</th>
                    <th>Tipificacion</th>
                    <th>Comentario</th>
                    <th>Gestiono</th>
                    <th>Telefono</th>
                    <th>Ver chat</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="(item, idx) in historialPagina"
                    :key="`${item.conversacion}_${idx}`"
                  >
                    <td>{{ item.fecha }}</td>
                    <td>{{ item.conversacion }}</td>
                    <td>{{ item.tipo }}</td>
                    <td>{{ item.cola }}</td>
                    <td>{{ item.tipificacion }}</td>
                    <td>{{ item.comentario }}</td>
                    <td>{{ item.gestiono }}</td>
                    <td>{{ item.telefono }}</td>
                    <td>
                      <button
                        v-if="item.conversacion && item.conversacion !== '-'"
                        class="historial-chat-btn"
                        type="button"
                        @click="abrirMensajesDeConvId(item)"
                      >
                        Ver miniatura
                      </button>
                      <span v-else class="historial-chat-unavailable">—</span>
                    </td>
                  </tr>
                </tbody>
              </table>

              <div class="historial-pagination">
                <button
                  type="button"
                  @click="prevHistorialPage"
                  :disabled="historialCurrentPage <= 1"
                >
                  Anterior
                </button>
                <span>{{ historialPageInfo }}</span>
                <button
                  type="button"
                  @click="nextHistorialPage"
                  :disabled="historialCurrentPage >= historialTotalPaginas"
                >
                  Siguiente
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Modal Mensajes de Conversacion -->
    <Teleport to="body">
      <div
        v-if="modalMensajesConvOpen"
        class="historial-overlay"
        @click.self="cerrarMensajesConvModal"
      >
        <div class="historial-modal mensajes-modal">
          <div class="historial-header">
            <div class="historial-title">
              Mensajes de la conversacion #{{ mensajesConvId }}
            </div>
            <div class="historial-actions">
              <button
                class="historial-refresh"
                type="button"
                @click="refrescarMensajesConv"
              >
                Refrescar
              </button>
              <button
                class="historial-close"
                type="button"
                @click="cerrarMensajesConvModal"
              >
                x
              </button>
            </div>
          </div>
          <div class="historial-body mensajes-body">
            <div v-if="mensajesConvLoading" class="historial-empty">
              Cargando mensajes...
            </div>
            <div
              v-else-if="mensajesConversacionVistos.length === 0"
              class="historial-empty"
            >
              No se encontraron mensajes para este id de conversacion.
            </div>
            <div v-else>
              <div
                v-for="msg in mensajesConversacionVistos"
                :key="msg.id"
                class="msg-row"
                :class="msg.from === 'agent' ? 'right' : 'left'"
              >
                <div class="bubble">
                  <div>{{ msg.text || "-" }}</div>
                  <div class="msg-time-mini">{{ msg.time }}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Modal Motivos de Cierre -->
    <Teleport to="body">
      <div
        v-if="closeMotivosModalOpen"
        class="historial-overlay"
        @click.self="cerrarModalMotivosCierre"
      >
        <div class="close-flow-modal close-motivos-modal">
          <div class="historial-header">
            <div class="historial-title">Cerrar chat</div>
            <button
              class="historial-close"
              type="button"
              @click="cerrarModalMotivosCierre"
            >
              x
            </button>
          </div>
          <div class="close-flow-body">
            <p class="close-motivos-copy">
              Selecciona el motivo de cierre para
              <strong>{{
                props.conversation?.name ||
                props.conversation?.nombre ||
                "esta conversacion"
              }}</strong
              >:
            </p>
            <div v-if="!canCerrarConversacion" class="close-menu-empty">
              Esta conversacion ya esta cerrada.
            </div>
            <div v-else-if="closeMotivosLoading" class="close-menu-empty">
              Cargando motivos de cierre...
            </div>
            <div v-else-if="closeMotivosError" class="historial-error">
              {{ closeMotivosError }}
            </div>
            <div v-else-if="motivosCierre.length > 0" class="close-motivos-list">
              <button
                v-for="(motivo, idx) in motivosCierre"
                :key="`${motivo.id}_${idx}`"
                type="button"
                class="close-motivo-option"
                @click="seleccionarMotivoCierre(motivo)"
              >
                {{ motivo.desc }}
              </button>
            </div>
            <div v-else class="close-menu-empty">
              No hay motivos de cierre disponibles.
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Modal Observaciones de Cierre -->
    <Teleport to="body">
      <div
        v-if="closeReasonModalOpen"
        class="historial-overlay"
        @click.self="cerrarFlujoCierre"
      >
        <div class="close-flow-modal">
          <div class="historial-header">
            <div class="historial-title">Observaciones de cierre</div>
            <button
              class="historial-close"
              type="button"
              @click="cerrarFlujoCierre"
            >
              x
            </button>
          </div>
          <div class="close-flow-body">
            <div class="close-flow-summary">
              <div>
                <strong>Motivo:</strong> {{ motivoSeleccionado?.desc || "-" }}
              </div>
              <div>
                <strong>Conversacion:</strong>
                {{
                  props.conversation?.name || props.conversation?.nombre || "-"
                }}
              </div>
            </div>
            <label class="close-flow-label" for="close-tipificacion"
              >Observacion</label
            >
            <select
              id="close-tipificacion"
              v-model="tipificacionSeleccionadaId"
              class="close-flow-select"
            >
              <option value="">Selecciona una observacion</option>
              <option
                v-for="item in tipificaciones"
                :key="item.id"
                :value="String(item.id)"
              >
                {{ item.desc }}
              </option>
            </select>
            <div v-if="tipificaciones.length === 0" class="close-menu-empty">
              No hay observaciones disponibles.
            </div>
            <div v-if="closeError" class="historial-error close-flow-error">
              {{ closeError }}
            </div>
            <div class="close-flow-actions">
              <button
                type="button"
                class="close-flow-secondary"
                @click="cerrarFlujoCierre"
              >
                Cancelar
              </button>
              <button
                type="button"
                class="close-flow-primary"
                @click="continuarConfirmacionCierre"
              >
                Continuar
              </button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Modal Confirmar Cierre -->
    <Teleport to="body">
      <div
        v-if="closeConfirmModalOpen"
        class="historial-overlay"
        @click.self="cerrarFlujoCierre"
      >
        <div class="close-flow-modal close-confirm-modal">
          <div class="historial-header">
            <div class="historial-title">Confirmar cierre</div>
            <button
              class="historial-close"
              type="button"
              @click="cerrarFlujoCierre"
            >
              x
            </button>
          </div>
          <div class="close-flow-body">
            <p class="close-confirm-copy">
              Vas a cerrar este chat con el motivo
              <strong>{{ motivoSeleccionado?.desc }}</strong> y la observacion
              <strong>{{ tipificacionSeleccionada?.desc }}</strong
              >.
            </p>
            <div v-if="closeError" class="historial-error close-flow-error">
              {{ closeError }}
            </div>
            <div class="close-flow-actions">
              <button
                type="button"
                class="close-flow-secondary"
                :disabled="closeSubmitting"
                @click="volverAObservaciones"
              >
                Volver
              </button>
              <button
                type="button"
                class="close-flow-danger"
                :disabled="closeSubmitting"
                @click="confirmarCierreChat"
              >
                {{ closeSubmitting ? "Cerrando..." : "Confirmar cierre" }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.detail {
  height: 100%;
  display: flex;
  flex-direction: column;
  position: relative;
}

.detail-destacado {
  background: linear-gradient(180deg, #fffbeb 0%, #ffffff 96px);
  box-shadow: inset 0 0 0 1px rgba(251, 191, 36, 0.22);
}

.detail-destacado::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: linear-gradient(90deg, #fde047 0%, #f59e0b 50%, #fde047 100%);
  z-index: 3;
  pointer-events: none;
}

.detail-bloqueado {
  opacity: 0.72;
  filter: grayscale(0.12);
}

.detail-bloqueado .messages,
.detail-bloqueado .composer {
  pointer-events: auto;
}

.close-motivos-modal {
  width: min(720px, 94vw);
}

.close-motivos-copy {
  margin: 0;
  font-size: 13px;
  color: #3f5238;
  line-height: 1.45;
}

.close-motivos-list {
  display: grid;
  gap: 8px;
}

.close-motivo-option {
  width: 100%;
  border: 1px solid #dde8d4;
  background: #fff;
  color: #2d3f24;
  text-align: left;
  border-radius: 10px;
  padding: 12px 14px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition:
    background 0.15s ease,
    border-color 0.15s ease;
}

.close-motivo-option:hover {
  background: #edf4e4;
  border-color: #7eb83b;
}

.close-menu-empty {
  font-size: 12px;
  color: #5f7257;
  text-align: center;
  padding: 8px 4px 2px;
}

.label-menu-backdrop {
  position: fixed;
  inset: 0;
  z-index: 29;
  background: transparent;
}

.label-menu-panel {
  position: fixed;
  z-index: 30;
  padding: 0;
  border: 1px solid var(--color-primary-soft);
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 14px 30px rgba(28, 43, 68, 0.16);
  display: flex;
}

.label-menu-simple-item {
  border: 0;
  background: #fff;
  color: #2d3f24;
  text-align: center;
  border-radius: 12px;
  padding: 8px 16px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
}

.label-menu-simple-item:hover {
  background: var(--color-primary-surface);
}

.messages {
  flex: 1;
  min-height: 0;
  padding: 16px;
  overflow: auto;
  background: #f3f9eb;
}

.message-search-wrap {
  padding: 6px 12px;
  border-bottom: 1px solid var(--color-primary-surface);
  background: #fff;
  display: flex;
  justify-content: flex-end;
}

.message-search-input {
  width: min(220px, 100%);
  height: 32px;
  border: 1px solid var(--color-primary-soft);
  border-radius: 8px;
  padding: 0 10px;
  font-size: 12px;
  outline: none;
}

.message-search-input:focus {
  border-color: var(--color-primary);
}

.message-search-input:disabled {
  background: #edf4e4;
  color: #7b8f73;
}

.messages-empty {
  font-size: 13px;
  color: #6f7f66;
  text-align: center;
  padding: 16px 8px;
}

.msg-row {
  display: flex;
  margin-bottom: 10px;
}

.msg-row.left {
  justify-content: flex-start;
}

.msg-row.right {
  justify-content: flex-end;
}

.bubble {
  max-width: 70%;
  border-radius: 12px;
  padding: 8px 12px;
  font-size: 14px;
}

.bubble-has-media {
  padding: 4px;
  overflow: hidden;
}

.bubble-has-media:has(.bubble-media-image),
.bubble-has-media:has(.bubble-media-video) {
  width: fit-content;
  max-width: min(280px, 70%);
}

.bubble-media-link {
  display: block;
  line-height: 0;
  width: fit-content;
  max-width: 100%;
}

.bubble-media-image {
  display: block;
  max-width: min(280px, 70vw);
  max-height: 240px;
  width: auto;
  height: auto;
  border-radius: 8px;
}

.bubble-media-video {
  display: block;
  width: auto;
  max-width: min(280px, 70vw);
  max-height: 240px;
  border-radius: 8px;
  background: #000;
}

.bubble-text {
  margin: 6px 4px 2px;
  white-space: pre-wrap;
  word-break: break-word;
}

.bubble-has-media:has(.bubble-text) {
  width: auto;
  max-width: 70%;
}

.bubble-media-audio {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 220px;
  padding: 4px 2px;
}

.bubble-media-audio-icon {
  font-size: 18px;
  flex-shrink: 0;
}

.bubble-media-audio audio {
  width: 100%;
  min-width: 0;
  height: 32px;
}

.bubble-media-doc {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 8px;
  text-decoration: none;
  transition: background 0.15s ease;
}

.left .bubble-media-doc {
  background: #f3f8ec;
  color: #3e5a34;
}

.right .bubble-media-doc {
  background: rgba(255, 255, 255, 0.14);
  color: #fff;
}

.bubble-media-doc:hover {
  filter: brightness(0.97);
}

.bubble-media-doc-icon {
  font-size: 20px;
  line-height: 1;
}

.bubble-media-doc-label {
  font-size: 13px;
  font-weight: 600;
}

.left .bubble {
  background: #ffffff;
  border: 1px solid #d4e4bf;
}

.right .bubble {
  background: #588044;
  border: 1px solid #588044;
  color: #ffffff;
}

.composer {
  display: flex;
  flex-direction: column;
  border-top: 1px solid var(--color-primary-soft);
  background: #fff;
  position: relative;
}

.composer-input-row,
.composer-recorder-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
}

.composer-text-input {
  flex: 1;
  min-width: 0;
  border: 1px solid #cdd8e9;
  border-radius: 20px;
  padding: 9px 14px;
  font-size: 14px;
  outline: none;
  background: var(--color-primary-surface);
}

.composer-text-input:focus {
  border-color: var(--color-primary);
  background: #fff;
}

.composer-icon-btn {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  border: 0;
  background: transparent;
  color: #6d8099;
  border-radius: 50%;
  display: grid;
  place-items: center;
  cursor: pointer;
  transition:
    background 0.14s,
    color 0.14s;
}

.composer-icon-btn:hover {
  background: var(--color-primary-surface);
  color: var(--color-primary);
}

.composer-icon-btn.active {
  background: var(--color-primary-soft);
  color: var(--color-primary);
}

.composer-send-btn {
  background: var(--color-primary);
  color: #fff;
}

.composer-send-btn:hover {
  background: var(--color-primary-hover);
  color: #fff;
}

.composer-send-btn:disabled,
.composer-record-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.composer-send-btn:disabled:hover,
.composer-record-btn:disabled:hover {
  background: inherit;
  color: inherit;
}

.composer-record-btn {
  background: var(--color-primary-surface);
  color: #4f6646;
}

.composer-record-btn:hover {
  background: #dcead5;
  color: #4f6646;
}

/* ── Voice recorder ── */
.composer-recorder-row {
  background: #edf4e4;
  border-bottom: 1px solid #dcead5;
}

.recorder-cancel-btn {
  color: #588044;
}

.recorder-cancel-btn:hover {
  background: #dcead5;
  color: #b32424;
}

.recording-status {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 6px;
}

.recording-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #588044;
  animation: blink 1s step-start infinite;
}

@keyframes blink {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0;
  }
}

.recording-time {
  font-size: 14px;
  font-weight: 600;
  color: #588044;
  font-variant-numeric: tabular-nums;
}

/* ── Emoji panel ── */
.emoji-panel {
  border-top: 1px solid var(--color-primary-soft);
  background: #fff;
  display: flex;
  flex-direction: column;
  max-height: 260px;
}

.emoji-tabs {
  display: flex;
  gap: 2px;
  padding: 6px 8px 4px;
  border-bottom: 1px solid var(--color-primary-surface);
  background: var(--color-primary-surface);
  overflow-x: auto;
  scrollbar-width: none;
}

.emoji-tabs::-webkit-scrollbar {
  display: none;
}

.emoji-tab {
  flex-shrink: 0;
  width: 36px;
  height: 30px;
  border: 1px solid transparent;
  background: transparent;
  border-radius: 8px;
  font-size: 17px;
  cursor: pointer;
  transition:
    background 0.12s,
    border-color 0.12s;
  display: grid;
  place-items: center;
}

.emoji-tab:hover {
  background: var(--color-primary-surface);
}

.emoji-tab.active {
  background: var(--color-primary-soft);
  border-color: #c5dab9;
}

.emoji-grid {
  flex: 1;
  overflow-y: auto;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(34px, 1fr));
  gap: 2px;
  padding: 6px 8px 8px;
}

.emoji-item {
  width: 34px;
  height: 34px;
  border: 0;
  background: transparent;
  font-size: 20px;
  cursor: pointer;
  border-radius: 6px;
  display: grid;
  place-items: center;
  transition: background 0.1s;
  line-height: 1;
}

.emoji-item:hover {
  background: var(--color-primary-surface);
}

.empty {
  flex: 1;
  display: grid;
  place-items: center;
  color: #5f7089;
  font-size: 14px;
}

/* ── Contact Profile Sidebar ── */
.contact-profile-overlay {
  position: fixed;
  inset: 0;
  background: rgba(18, 28, 43, 0.34);
  z-index: 1290;
  display: flex;
  justify-content: flex-end;
}

.contact-profile-sidebar {
  width: min(420px, 100vw);
  height: 100vh;
  background: linear-gradient(
    180deg,
    var(--color-primary-surface) 0%,
    var(--color-primary-surface) 100%
  );
  border-left: 1px solid #d7dde6;
  box-shadow: -10px 0 26px rgba(29, 42, 62, 0.18);
  display: grid;
  grid-template-rows: auto 1fr;
  animation: slideInRight 0.2s ease-out;
}

.contact-profile-header {
  position: relative;
  text-align: center;
  padding: 30px 16px 20px;
  border-bottom: 1px solid var(--color-primary-soft);
  background: linear-gradient(
    180deg,
    var(--color-primary-surface) 0%,
    var(--color-primary-surface) 100%
  );
}

.contact-profile-close {
  position: absolute;
  top: 14px;
  right: 16px;
  border: 1px solid var(--color-primary-soft);
  background: #ffffff;
  color: #6f7f66;
  font-size: 20px;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  cursor: pointer;
  transition: all 0.2s ease;
}

.contact-profile-close:hover {
  background: var(--color-primary-surface);
  border-color: #c5dab9;
  color: #566b4d;
}

.contact-profile-photo-wrap {
  margin: 0 auto 14px;
  width: 90px;
  height: 90px;
  border-radius: 50%;
  padding: 3px;
  background: linear-gradient(160deg, #7eb83b 0%, #588044 100%);
  box-shadow: 0 8px 24px rgba(38, 197, 93, 0.22);
}

.contact-profile-photo {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  object-fit: cover;
  background: #fff;
}

.contact-profile-header h3 {
  margin: 0;
  font-size: 22px;
  line-height: 1.15;
  font-weight: 700;
  color: #344a28;
}

.contact-profile-header p {
  margin: 6px 0 0;
  font-size: 14px;
  color: #687d5f;
}

.contact-profile-header small {
  display: block;
  margin-top: 6px;
  font-size: 12px;
  color: #8393a8;
}

.contact-profile-body {
  overflow: auto;
  padding: 16px 16px 24px;
  position: relative;
  background: transparent;
  display: grid;
  align-content: start;
}

.contact-profile-gear {
  display: none;
}

.contact-section-title {
  color: #6f7f66;
  font-size: 11px;
  margin: 16px 4px 6px;
  letter-spacing: 0.8px;
  text-transform: uppercase;
  font-weight: 700;
}

.contact-card {
  background: #ffffff;
  border: 1px solid var(--color-primary-soft);
  border-radius: 12px;
  box-shadow: 0 6px 16px rgba(34, 54, 86, 0.07);
}

.contact-info-row {
  display: flex;
  align-items: center;
  padding: 12px 14px;
  color: #5b6f55;
  font-size: 13px;
}

.contact-info-row strong {
  display: inline-block;
  color: #4f6646;
  min-width: 84px;
  font-weight: 700;
  margin-right: 8px;
}

.contact-card .contact-info-row + .contact-info-row {
  border-top: 1px solid var(--color-primary-soft);
}

/* ── Contact Options List ── */
.contact-options-list {
  display: grid;
  gap: 10px;
  margin-bottom: 16px;
}

.contact-option-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  background: #ffffff;
  border: 1px solid var(--color-primary-soft);
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(34, 54, 86, 0.04);
  font-size: 14px;
  font-weight: bold;
  color: #4d6447;
  cursor: pointer;
  transition: all 0.2s;
}

.contact-option-row .icon {
  font-size: 18px;
  width: 24px;
  text-align: center;
  color: #627b56;
}

.contact-option-row:hover {
  background: #f3f9eb;
  border-color: #c5dab9;
}

.contact-option-row.active {
  background: linear-gradient(135deg, #fffbeb 0%, #fef9c3 100%);
  color: #92400e;
  border-color: transparent;
  box-shadow:
    inset 0 0 0 2px #f59e0b,
    0 4px 14px rgba(245, 158, 11, 0.14);
}

.contact-option-row.active .icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: linear-gradient(145deg, #fde047 0%, #f59e0b 100%);
  color: #fff;
  font-size: 14px;
  text-shadow: 0 1px 2px rgba(146, 64, 14, 0.35);
}

.contact-option-row.blocked {
  background: #f3f4f6;
  color: #6b7280;
  border-color: transparent;
  box-shadow: inset 0 0 0 2px #9ca3af;
  opacity: 0.72;
}

.contact-option-row.blocked .icon {
  color: #9ca3af;
}

.contact-option-row.danger {
  background: #edf4e4;
  color: #588044;
  border-color: #c5dab9;
}

.contact-option-row.danger .icon {
  color: #588044;
}

.contact-edit-btn {
  width: 100%;
  margin-top: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 14px 20px;
  background: #ffffff;
  border: 1px solid #c5dab9;
  border-radius: 8px;
  box-shadow: none;
  font-size: 13px;
  font-weight: bold;
  letter-spacing: 0.5px;
  color: #1e293b;
  text-transform: uppercase;
  cursor: pointer;
  transition: all 0.2s;
}

.contact-edit-btn .icon {
  font-size: 18px;
  width: 24px;
  text-align: center;
  color: #334155;
}

.contact-edit-btn:hover {
  background: #f8fafc;
  border-color: #93ad97;
  color: #0f172a;
}

.contact-edit-btn.back-btn {
  margin-bottom: 16px;
  background: var(--color-primary-surface);
  border-color: var(--color-primary-soft);
  color: #4d6447;
  box-shadow: none;
}

.contact-edit-btn.back-btn .icon {
  color: #627b56;
}

.contact-edit-btn.back-btn:hover {
  background: #dcead5;
}

/* ── Multimedia Modal ── */
.multimedia-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(18, 28, 50, 0.52);
  z-index: 1400;
  display: grid;
  place-items: center;
  padding: 16px;
}

.multimedia-modal {
  width: min(700px, 95vw);
  max-height: 85vh;
  background: #fff;
  border-radius: 12px;
  overflow: hidden;
  display: grid;
  grid-template-rows: auto 1fr;
  box-shadow: 0 20px 50px rgba(20, 30, 60, 0.28);
}

.multimedia-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid var(--color-primary-soft);
  font-size: 15px;
  font-weight: 700;
  color: #2e4023;
}

.multimedia-modal-close {
  border: 0;
  background: transparent;
  color: #4e617d;
  font-size: 18px;
  cursor: pointer;
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border-radius: 6px;
}

.multimedia-modal-close:hover {
  background: #edf4e4;
}

.multimedia-modal-body {
  overflow: auto;
  padding: 16px;
  background: var(--color-primary-surface);
  font-size: 13px;
  color: #6f7f66;
}

.multimedia-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(108px, 1fr));
  gap: 10px;
}

.multimedia-tile {
  position: relative;
  aspect-ratio: 1;
  border: 1px solid var(--color-primary-soft);
  border-radius: 12px;
  overflow: hidden;
  background: #fff;
  padding: 0;
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.multimedia-tile:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(46, 64, 35, 0.12);
}

.multimedia-tile-preview {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  pointer-events: none;
}

.multimedia-tile-fallback {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  background: linear-gradient(160deg, #f7faf3 0%, #edf4e4 100%);
  color: #4a6340;
}

.multimedia-tile-audio {
  background: linear-gradient(160deg, #f3f8ff 0%, #e8f0fb 100%);
  color: #3f5678;
}

.multimedia-tile-icon {
  font-size: 28px;
  line-height: 1;
}

.multimedia-tile-type {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}

.multimedia-tile-badge {
  position: absolute;
  left: 6px;
  bottom: 6px;
  padding: 2px 7px;
  border-radius: 999px;
  background: rgba(18, 28, 20, 0.62);
  color: #fff;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.02em;
  pointer-events: none;
}

.multimedia-item {
  border: 1px solid var(--color-primary-soft);
  border-radius: 10px;
  overflow: hidden;
  background: #fff;
  display: flex;
  flex-direction: column;
}

.multimedia-item img,
.multimedia-item video {
  width: 100%;
  height: 120px;
  object-fit: cover;
}

.multimedia-item audio {
  width: 100%;
  padding: 8px;
}

.multimedia-item a {
  display: block;
  padding: 16px 12px;
  color: var(--color-primary-hover);
  font-size: 12px;
  word-break: break-all;
  text-decoration: none;
}

.multimedia-item a:hover {
  text-decoration: underline;
}

.multimedia-fallback {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 120px;
  padding: 12px;
  background: #f3f6f0;
  border-radius: 8px;
  color: #5c6f54;
  font-size: 12px;
  text-align: center;
}

.multimedia-open-btn {
  border: 1px solid #588044;
  background: #fff;
  color: #588044;
  border-radius: 6px;
  padding: 6px 10px;
  cursor: pointer;
  font-size: 12px;
}

.multimedia-open-btn:hover {
  background: #eef5ea;
}

/* ── Edit Contact Modal ── */
.edit-contact-overlay {
  position: fixed;
  inset: 0;
  background: rgba(18, 28, 50, 0.52);
  z-index: 1400;
  display: grid;
  place-items: center;
  padding: 16px;
}

.edit-contact-modal {
  width: min(580px, 100%);
  max-height: 90vh;
  background: #fff;
  border-radius: 10px;
  overflow: hidden;
  display: grid;
  grid-template-rows: auto 1fr;
  box-shadow: 0 20px 50px rgba(20, 30, 60, 0.28);
  animation: fadeScaleIn 0.18s ease-out;
}

@keyframes fadeScaleIn {
  from {
    opacity: 0;
    transform: scale(0.96);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.edit-contact-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  background: linear-gradient(
    135deg,
    var(--color-primary) 0%,
    var(--color-primary-hover) 50%,
    var(--color-primary-strong) 100%
  );
  color: #fff;
  font-size: 17px;
  font-weight: 700;
  letter-spacing: 0.2px;
}

.edit-contact-close {
  border: 0;
  background: transparent;
  color: rgba(255, 255, 255, 0.85);
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
  padding: 0;
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border-radius: 6px;
  transition: background 0.15s;
}

.edit-contact-close:hover {
  background: rgba(255, 255, 255, 0.18);
}

.edit-contact-body {
  overflow: auto;
  padding: 20px 24px 24px;
}

.edit-contact-label {
  display: block;
  font-size: 11px;
  font-weight: 700;
  color: #7b8f73;
  letter-spacing: 0.5px;
  margin-bottom: 6px;
  margin-top: 14px;
}

.edit-contact-label:first-of-type {
  margin-top: 0;
}

.edit-contact-input {
  display: block;
  width: 100%;
  height: 44px;
  border: 1px solid var(--color-primary-soft);
  border-radius: 8px;
  padding: 0 12px;
  font-size: 14px;
  color: #344a28;
  background: #fff;
  box-sizing: border-box;
  transition:
    border-color 0.15s,
    box-shadow 0.15s;
}

.edit-contact-input:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px rgba(126, 184, 59, 0.2);
}

.edit-contact-textarea {
  height: 88px;
  padding: 10px 12px;
  resize: vertical;
}

.edit-contact-feedback {
  margin: 10px 0 0;
  font-size: 12px;
  color: #588044;
}

.edit-contact-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 22px;
}

.edit-contact-cancel {
  border: 1px solid var(--color-primary-soft);
  background: #eef5e9;
  color: #50674a;
  border-radius: 8px;
  padding: 10px 20px;
  font-size: 13px;
  cursor: pointer;
}

.edit-contact-cancel:hover {
  background: var(--color-primary-surface);
}

.edit-contact-save {
  border: 0;
  background: linear-gradient(
    135deg,
    var(--color-primary) 0%,
    var(--color-primary-hover) 100%
  );
  color: #fff;
  border-radius: 8px;
  padding: 10px 28px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(126, 184, 59, 0.32);
}

.edit-contact-save:hover {
  background: linear-gradient(
    135deg,
    var(--color-primary-hover) 0%,
    var(--color-primary-strong) 100%
  );
}

.edit-contact-cancel:disabled,
.edit-contact-save:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* ── Historial Modal ── */
@keyframes slideInRight {
  from {
    transform: translateX(100%);
  }
  to {
    transform: translateX(0);
  }
}

.historial-overlay {
  position: fixed;
  inset: 0;
  background: rgba(20, 34, 56, 0.45);
  display: grid;
  place-items: center;
  z-index: 1200;
  padding: 20px;
}

.historial-modal {
  width: min(1140px, 96vw);
  max-height: 90vh;
  background: #fff;
  border-radius: 14px;
  border: 1px solid var(--color-primary-soft);
  display: grid;
  grid-template-rows: auto 1fr;
  overflow: hidden;
  box-shadow: 0 24px 60px rgba(20, 34, 56, 0.22);
}

.historial-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid var(--color-primary-soft);
}

.historial-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.historial-refresh {
  border: 1px solid var(--color-primary-soft);
  background: var(--color-primary-surface);
  color: #4a6a3e;
  border-radius: 8px;
  padding: 5px 10px;
  cursor: pointer;
  font-size: 12px;
}

.historial-title {
  font-size: 16px;
  font-weight: 700;
  color: #2e4023;
}

.historial-close {
  border: 1px solid var(--color-primary-soft);
  background: var(--color-primary-surface);
  color: #516a47;
  border-radius: 8px;
  padding: 4px 10px;
  cursor: pointer;
}

.historial-body {
  overflow: auto;
  padding: 16px 18px;
  background: var(--color-primary-surface);
  min-height: 0;
}

.persona-card {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 16px;
  padding: 14px 16px;
  margin-bottom: 14px;
  border: 1px solid var(--color-primary-soft);
  border-radius: 10px;
  background: #fff;
  font-size: 13px;
  color: #3f5c35;
}

.historial-table {
  width: 100%;
  border-collapse: collapse;
  background: #fff;
  border: 1px solid #d4e4bf;
  border-radius: 10px;
  overflow: hidden;
  font-size: 13px;
}

.historial-table th,
.historial-table td {
  padding: 10px 12px;
  border-bottom: 1px solid #e3ece4;
  text-align: left;
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.historial-table td:nth-child(4),
.historial-table td:nth-child(5),
.historial-table td:nth-child(6) {
  white-space: normal;
  max-width: 320px;
}

.historial-table th {
  background: #eef5e9;
  color: #355077;
  font-weight: 700;
}

.historial-chat-btn {
  border: 1px solid var(--color-primary-soft);
  background: var(--color-primary-surface);
  color: #4a6a3e;
  border-radius: 6px;
  padding: 3px 8px;
  cursor: pointer;
  font-size: 11px;
}

.historial-pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 0 0;
  font-size: 12px;
  color: #5f7257;
}

.historial-pagination button {
  border: 1px solid var(--color-primary-soft);
  background: var(--color-primary-surface);
  color: #4a6a3e;
  border-radius: 6px;
  padding: 4px 8px;
  cursor: pointer;
}

.historial-pagination button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.historial-empty {
  font-size: 13px;
  color: #6f7f66;
  text-align: center;
  padding: 20px 12px;
}

.historial-error {
  font-size: 13px;
  color: #588044;
  text-align: center;
  padding: 20px 12px;
}

.mensajes-modal {
  width: min(1140px, 96vw);
  max-height: 90vh;
}

.mensajes-body {
  max-height: none;
  min-height: 420px;
}

.msg-time-mini {
  margin-top: 6px;
  font-size: 11px;
  opacity: 0.7;
}

/* ── Close Flow Modal ── */
.close-flow-modal {
  width: min(680px, 94vw);
  max-height: 88vh;
  background: #fff;
  border-radius: 14px;
  border: 1px solid var(--color-primary-soft);
  overflow: hidden;
  box-shadow: 0 24px 60px rgba(20, 34, 56, 0.22);
  display: grid;
  grid-template-rows: auto 1fr;
}

.close-flow-body {
  padding: 18px 20px;
  display: grid;
  gap: 14px;
  background: var(--color-primary-surface);
  overflow: auto;
  min-height: 0;
}

.close-flow-summary {
  display: grid;
  gap: 6px;
  padding: 10px 12px;
  border: 1px solid var(--color-primary-soft);
  border-radius: 10px;
  background: #fff;
  font-size: 13px;
  color: #3f5c35;
}

.close-flow-label {
  font-size: 12px;
  font-weight: 700;
  color: #48663f;
}

.close-flow-select {
  width: 100%;
  height: 40px;
  border: 1px solid #c5dab9;
  border-radius: 10px;
  padding: 0 12px;
  outline: none;
  background: #fff;
  color: #334627;
}

.close-flow-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.close-flow-primary,
.close-flow-secondary,
.close-flow-danger {
  border: 0;
  border-radius: 10px;
  padding: 10px 14px;
  font-size: 13px;
  cursor: pointer;
}

.close-flow-primary {
  background: var(--color-primary);
  color: #fff;
}

.close-flow-secondary {
  background: var(--color-primary-surface);
  color: #48663f;
}

.close-flow-danger {
  background: #588044;
  color: #fff;
}

.close-flow-primary:disabled,
.close-flow-secondary:disabled,
.close-flow-danger:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.close-flow-error {
  padding: 0;
  text-align: left;
}

.close-confirm-copy {
  margin: 0;
  font-size: 14px;
  color: #2b3d58;
  line-height: 1.5;
}
</style>
