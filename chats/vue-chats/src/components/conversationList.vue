<script setup>
const reopenModalOpen = ref(false);
const conversationToReopen = ref(null);

function handleConversationClick(item, sectionKey) {
  if (sectionKey === "closed") {
    conversationToReopen.value = item;
    reopenModalOpen.value = true;
  } else {
    selectConversation(item.id);
  }
}

function confirmReopenConversation() {
  if (!conversationToReopen.value) return;
  reabrirConversacion(conversationToReopen.value);
  reopenModalOpen.value = false;
  conversationToReopen.value = null;
}

function cancelReopenConversation() {
  reopenModalOpen.value = false;
  conversationToReopen.value = null;
}

import { computed, ref, watch, onMounted } from "vue";
import { useChatStore } from "@/stores/chatStore";
import { getSocket, emitSocket, abrirChat } from "@/composables/useSocket";
import LabelAssigner from "@/components/LabelAssigner.vue";
import { useContacts } from "@/composables/useContacts";
import {
  buildContactLookupFromList,
  findContactFromLookup,
  resolveConversationDisplayName,
  resolveContactDisplayName,
  resolveContactNameOnly,
  findConversationForContact,
  formatPhoneDisplay,
} from "@/utils/contactDisplay";
import { resolveAgentIdFromSources } from "@/utils/agentId";
import {
  buildInternalConvId,
  fetchInternalAgents,
  registerInternalIdentity,
} from "@/composables/useInternalChatSocket";
import { getApiBase } from "@/utils/apiBase";
import {
  confirmDelete,
  confirmSave,
  showError,
  showSuccess,
} from "@/utils/swal";
import {
  activarAlertasCompletas,
  estadoPermisoNotificacion,
  tienePermisoNotificacionConcedido,
  navegadorSoportaNotificaciones,
} from "@/composables/useNotificaciones";

const store = useChatStore();
const permisoNotificaciones = ref(estadoPermisoNotificacion());
const activandoAlertas = ref(false);

const mostrarBannerAlertas = computed(
  () =>
    navegadorSoportaNotificaciones() &&
    !tienePermisoNotificacionConcedido(),
);

const textoBannerAlertas = computed(() => {
  if (permisoNotificaciones.value === "denied") {
    return "Notificaciones bloqueadas. Actívalas en la configuración del navegador para este sitio.";
  }
  return "Haz clic para activar el sonido y las notificaciones del navegador al recibir mensajes.";
});

async function onActivarAlertas() {
  if (activandoAlertas.value) return;
  activandoAlertas.value = true;
  try {
    const res = await activarAlertasCompletas();
    permisoNotificaciones.value = res.permiso;
  } finally {
    activandoAlertas.value = false;
  }
}
const { contacts, fetchContacts, loading: loadingContacts } = useContacts();

async function cargarCatalogoEtiquetas() {
  try {
    const res = await fetch(`${getApiBase()}/api/conversations/labels`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        store.setEtiquetas(data);
        return;
      }
    }
    const fallback = await fetch(`${getApiBase()}/etiquetas`);
    if (!fallback.ok) return;
    const payload = await fallback.json();
    const lista = Array.isArray(payload?.data) ? payload.data : [];
    if (lista.length) store.setEtiquetas(lista);
  } catch (error) {
    console.error("Error cargando catálogo de etiquetas:", error);
  }
}

onMounted(() => {
  fetchContacts();
  cargarCatalogoEtiquetas();
});

watch(
  contacts,
  (items) => {
    if (!Array.isArray(items) || items.length === 0) return;
    store.enrichConversationsWithContactLookup(buildContactLookupFromList(items));
  },
  { immediate: true },
);

const getConversationDisplayName = (conv) => {
  const contact = findContactFromLookup(conv, buildContactLookupFromList(contacts.value));
  return resolveConversationDisplayName(conv, contact);
};

const allConversations = computed(() => Object.values(store.conversaciones || {}));

const getContactListName = (contact) =>
  resolveContactNameOnly(contact, allConversations.value);

const contactQualityScore = (contact) => {
  const name = getContactListName(contact);
  if (name && name !== "Sin nombre") return 3;
  return 1;
};

const contactDedupeKey = (contact) => {
  const phoneRaw = String(contact?.telefono || contact?.tels || "").replace(/\D/g, "");
  const phone =
    phoneRaw.length === 10 ? `57${phoneRaw}` : phoneRaw;
  if (phone) return `phone:${phone}`;
  const data = String(contact?.data || contact?.documento || "").trim();
  if (data) return `data:${data}`;
  return `id:${contact?.id || contact?.legacyId || ""}`;
};

const isContactActive = (contact) => {
  const estado = String(contact?.estadoConexion || "")
    .trim()
    .toLowerCase();

  if (!estado) return false;

  return ["online", "activo", "conectado", "disponible"].includes(estado);
};

const getContactConnectionLabel = (contact) => {
  const estado = String(contact?.estadoConexion || "").trim();
  if (estado) return estado.toUpperCase();
  return "SIN ESTADO";
};

const isConvDestacado = (item) =>
  Boolean(
    item?.destacado ||
      item?.metadata?.destacado ||
      String(item?.marca || "").toLowerCase() === "destacado",
  );

const isConvBloqueado = (item) =>
  Boolean(
    item?.bloqueado ||
      item?.metadata?.bloqueado ||
      String(item?.marca || "").toLowerCase() === "bloqueado",
  );

const props = defineProps({
  conversations: {
    type: Array,
    default: () => [],
  },
  selectedId: {
    type: [String, Number],
    default: null,
  },
  searchTerm: {
    type: String,
    default: "",
  },
  agentInfo: {
    type: Object,
    default: () => ({}),
  },
});

const emit = defineEmits([
  "select",
  "update-search-term",
  "agent-create-contact",
  "agent-view-contacts",
  "agent-status-change",
]);
const infoModalOpen = ref(false);
const contactoSeleccionado = ref(null);
const searchOpen = ref(false);
const agentModalOpen = ref(false);
const sidebarMode = ref("cliente"); // 'cliente', 'agente', 'multimedia', 'historico', 'acciones'
const tipoConversacion = ref("cliente"); // 'cliente' o 'interno'
const mediaItems = ref([]);
const historicoItems = ref([]);
const historialCargando = ref(false);
const mediasCargando = ref(false);

const abrirMediaItem = (media) => {
  const url = String(media?.displayUrl || media?.url || "").trim();
  if (url) window.open(url, "_blank", "noopener,noreferrer");
};

const abrirMultimedia = () => {
  sidebarMode.value = "multimedia";
};

const editForm = ref({
  nombre: "",
  telefono: "",
  email: "",
  ciudad: "",
  direccion: "",
  entidad: "",
  documento: "",
});
const crearContacto = ref(false);
const editandoContacto = ref(false);

const selectConversation = (id) => emit("select", id);

const normalizeEtiqueta = (etiqueta) => {
  if (!etiqueta) return null;

  const id = String(
    etiqueta.id ?? etiqueta._id ?? etiqueta.legacyId ?? "",
  ).trim();
  const nombre = String(etiqueta.nombre ?? etiqueta.desc ?? "").trim();

  if (!id && !nombre) return null;

  return {
    id: id || nombre,
    nombre,
    color: String(etiqueta.color || "#7EB83B").trim(),
  };
};

const getConversationTags = (conv) => {
  const sources = [
    store.etiquetasPorConv[conv?.id] || [],
    conv?.etiquetas || [],
    conv?.metadata?.etiquetas || [],
  ];

  const tags = [];
  const seen = new Set();

  for (const source of sources) {
    if (!Array.isArray(source)) continue;
    for (const etiqueta of source) {
      const normalized = normalizeEtiqueta(etiqueta);
      if (!normalized) continue;

      const key = `${normalized.id}:${normalized.nombre}`.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      tags.push(normalized);
    }
  }

  return tags;
};

const getConversationQueue = (conv) => {
  const rawQueue =
    conv?.cola ?? conv?.queue ?? conv?.metadata?.cola ?? conv?.metadata?.queue ?? "";
  const queue = String(rawQueue || "").trim();

  if (queue) return queue;

  const rawSala = String(conv?.salaId ?? conv?.metadata?.salaId ?? "").trim();
  if (rawSala) return `Sala ${rawSala}`;

  return "";
};

const getOriginLabel = (conv) => {
  const raw = String(conv?.origen || conv?.metadata?.origen || "").trim().toLowerCase();
  if (!raw) return "";
  if (raw.includes("whatsapp") || raw.includes("wpp")) return "WhatsApp";
  if (raw.includes("interno")) return "Interno";
  if (raw.includes("web")) return "Web";
  return raw.charAt(0).toUpperCase() + raw.slice(1);
};

const getPreviewText = (conv) => {
  const text = String(conv?.lastMessage || conv?.ultimoMensaje || "").trim();
  if (text) return text;
  return "Sin mensajes recientes";
};

const formatListTime = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return raw;
};

const matchesEtiquetaFilter = (conv) => {
  const filtros = Array.isArray(store.filtrosEtiquetasSeleccionadas)
    ? store.filtrosEtiquetasSeleccionadas
    : [];

  if (filtros.length === 0) return true;

  const tags = getConversationTags(conv);
  if (tags.length === 0) return false;

  return filtros.some((filterId) => {
    const etiquetaFiltro = store.etiquetas.find(
      (e) => String(e.id) === String(filterId),
    );

    return tags.some((tag) => {
      if (String(tag.id) === String(filterId)) return true;

      return (
        etiquetaFiltro &&
        String(tag.nombre || "").toLowerCase() ===
          String(etiquetaFiltro.nombre || "").toLowerCase()
      );
    });
  });
};

const searchTermModel = computed({
  get: () => props.searchTerm,
  set: (value) => emit("update-search-term", String(value || "")),
});

const toggleSearch = () => {
  searchOpen.value = !searchOpen.value;
  if (!searchOpen.value) {
    emit("update-search-term", "");
  }
};

const agentDisplayName = computed(() => {
  const nombre = String(props.agentInfo?.nombre || "").trim();
  return nombre || "Agente";
});

const agentOnline = computed(() => Boolean(props.agentInfo?.online));

const agentExtension = computed(() => {
  const ext = String(props.agentInfo?.extension || "").trim();
  return ext || "-";
});

const agentStatusLine = computed(() => {
  const ext = String(props.agentInfo?.extension || "").trim();
  const estadoRaw = String(props.agentInfo?.estado || "").trim();
  const estado =
    estadoRaw || (agentOnline.value ? "En linea" : "Desconectado");

  if (ext) return `Ext. ${ext} · ${estado}`;
  return estado;
});

const buildPersonAvatarUrl = (seedValue, role = "contact") => {
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
  const family =
    role === "agent"
      ? positive % 2 === 0
        ? "men"
        : "women"
      : positive % 2 === 0
        ? "women"
        : "men";
  return `https://randomuser.me/api/portraits/${family}/${photoIndex}.jpg`;
};

const agentAvatarSrc = computed(() => {
  const direct = String(props.agentInfo?.fotoPerfil || "").trim();
  if (direct) return direct;
  return buildPersonAvatarUrl(agentDisplayName.value, "agent");
});

const agentPerfil = computed(
  () => String(props.agentInfo?.perfil || "Asesor").trim() || "Asesor",
);
const agentUsuario = computed(
  () =>
    String(props.agentInfo?.usuario || agentDisplayName.value).trim() || "-",
);
const agentCorreo = computed(
  () => String(props.agentInfo?.correo || "-").trim() || "-",
);
const agentEstadoOpciones = ["Activo", "Ausente", "Ocupado", "Sin conexion"];
const agentEstadoSeleccionado = ref("Activo");
const agentViewMode = ref("profile");
const agentRefreshTick = ref(0);
const agentCreateSubmitting = ref(false);
const agentCreateFeedback = ref("");
const agentCreateForm = ref({
  nombre: "",
  identificacion: "",
  telefono: "",
  direccion: "",
  ciudad: "",
  entidad: "",
  email: "",
});

const normalizarTelefono = (value) => {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("57")) return digits;
  return `57${digits}`;
};

// Contactos del agente: deduplicados y ordenados por nombre
const agentContacts = computed(() => {
  agentRefreshTick.value;
  const map = new Map();

  for (const contact of contacts.value || []) {
    const key = contactDedupeKey(contact);
    const current = map.get(key);
    if (!current || contactQualityScore(contact) > contactQualityScore(current)) {
      map.set(key, contact);
    }
  }

  return [...map.values()].sort((a, b) =>
    getContactListName(a).localeCompare(getContactListName(b), "es", {
      sensitivity: "base",
    }),
  );
});

const abrirInfoAgente = () => {
  const inicial =
    String(props.agentInfo?.estado || "Activo").trim() || "Activo";
  agentEstadoSeleccionado.value = agentEstadoOpciones.includes(inicial)
    ? inicial
    : "Activo";
  agentCreateFeedback.value = "";
  agentViewMode.value = "profile";
  agentModalOpen.value = true;
};

const cerrarInfoAgente = () => {
  agentModalOpen.value = false;
  agentViewMode.value = "profile";
};

const cambiarEstadoAgente = (estado) => {
  agentEstadoSeleccionado.value = estado;
  emit("agent-status-change", estado);
};

const limpiarFormularioCrearContacto = () => {
  agentCreateForm.value = {
    nombre: "",
    identificacion: "",
    telefono: "",
    direccion: "",
    ciudad: "",
    entidad: "",
    email: "",
  };
};

const abrirCrearContactoDesdeAgente = () => {
  agentCreateFeedback.value = "";
  agentViewMode.value = "create";
  emit("agent-create-contact");
};

const verContactosDesdeAgente = () => {
  agentViewMode.value = "contacts";
  emit("agent-view-contacts");
};

const abrirPerfilDesdeContactos = () => {
  agentViewMode.value = "profile";
};

const refrescarContactosAgente = () => {
  agentRefreshTick.value += 1;
  fetchContacts();
};

const obtenerAgenteIdActual = () => resolveAgentIdFromSources();

async function reabrirConversacion(conversation) {
  if (!conversation?.id) return;

  const uid = obtenerAgenteIdActual();
  try {
    const respuesta = await abrirChat(conversation.id, uid);
    const failed =
      respuesta?.ok === false ||
      respuesta?.success === false ||
      Boolean(respuesta?.error);

    if (failed) {
      const message =
        respuesta?.error ||
        respuesta?.message ||
        "No se pudo reabrir la conversacion.";
      console.error("Error reabriendo conversacion:", message, respuesta);
      alert(message);
      return;
    }

    // Actualizacion optimista: el backend tambien propaga update_queues.
    store.upsertConversation({
      ...conversation,
      estado: "abierta",
    });
    selectConversation(conversation.id);
  } catch (error) {
    console.error("Error reabriendo conversacion:", error);
    alert("No se pudo reabrir la conversacion.");
  }
}

const guardarNuevoContactoAgente = () => {
  const nombre = String(agentCreateForm.value.nombre || "").trim();
  const telefono = normalizarTelefono(agentCreateForm.value.telefono);

  if (!nombre || !telefono) {
    agentCreateFeedback.value =
      "Completa nombre y telefono para crear el contacto.";
    return;
  }

  const payload = {
    nombre,
    identificacion: String(agentCreateForm.value.identificacion || "").trim(),
    telefono,
    direccion: String(agentCreateForm.value.direccion || "").trim(),
    ciudad: String(agentCreateForm.value.ciudad || "").trim(),
    entidad: String(agentCreateForm.value.entidad || "").trim(),
    email: String(agentCreateForm.value.email || "").trim(),
    agentId: obtenerAgenteIdActual(),
    origen: "Interno",
  };

  const socket = getSocket();
  if (!socket?.connected) {
    agentCreateFeedback.value =
      "No hay conexion de socket para guardar el contacto.";
    return;
  }

  agentCreateSubmitting.value = true;
  agentCreateFeedback.value = "Guardando contacto...";

  emitSocket("crearContacto", payload, (response) => {
    agentCreateSubmitting.value = false;

    const failed =
      response?.ok === false ||
      response?.success === false ||
      Boolean(response?.error);

    if (failed) {
      agentCreateFeedback.value =
        response?.mensaje ||
        response?.message ||
        response?.error ||
        "No se pudo crear el contacto.";
      return;
    }

    agentCreateFeedback.value = "Contacto creado correctamente.";
    refrescarContactosAgente();
    limpiarFormularioCrearContacto();

    const conv = response?.conversacion;
    const convId = String(conv?.id || "").trim();
    if (convId) {
      store.upsertConversation({
        id: convId,
        nombre,
        name: nombre,
        telefono,
        estado: conv.estado || "nuevo",
        agenteId: obtenerAgenteIdActual(),
        contactoId: payload.identificacion || telefono,
        metadata: {
          nombre,
          telefono,
          email: payload.email,
          ciudad: payload.ciudad,
          direccion: payload.direccion,
          entidad: payload.entidad,
          dni: payload.identificacion,
          data: payload.identificacion,
        },
      });
      abrirPanelContactoDesdeDatos(payload, conv);
    } else {
      agentViewMode.value = "contacts";
    }
  });
};

const abrirPanelContactoDesdeDatos = (data, conv = null) => {
  const convId = String(conv?.id || "").trim();
  contactoSeleccionado.value = {
    id: convId || "-",
    nombre: data.nombre,
    fotoPerfil: buildPersonAvatarUrl(data.nombre, "contact"),
    estado: "Desconectado",
    online: false,
    telefono: data.telefono,
    email: data.email || "-",
    ciudad: data.ciudad || "-",
    direccion: data.direccion || "-",
    entidad: data.entidad || "-",
    documento: data.identificacion || "-",
    origen: data.origen || "Interno",
    convEstado: String(conv?.estado || "nuevo").toLowerCase(),
    esRecienCreado: true,
  };
  sidebarMode.value = "cliente";
  infoModalOpen.value = true;
  tipoConversacion.value = "cliente";
  cerrarInfoAgente();
};

const mostrarIniciarConversacion = computed(() => {
  const id = String(contactoSeleccionado.value?.id || "").trim();
  return Boolean(id && id !== "-");
});

const iniciarConversacionLabel = computed(() => {
  const estado = String(
    contactoSeleccionado.value?.convEstado || "nuevo",
  ).toLowerCase();
  if (estado === "cerrada") return "REABRIR CONVERSACIÓN";
  if (estado === "abierta") return "ABRIR CHAT";
  return "INICIAR CONVERSACIÓN";
});

const iniciarConversacionContacto = async () => {
  const convId = String(contactoSeleccionado.value?.id || "").trim();
  if (!convId || convId === "-") return;

  const estado = String(
    contactoSeleccionado.value?.convEstado || "nuevo",
  ).toLowerCase();
  const uid = obtenerAgenteIdActual();

  if (estado === "cerrada") {
    await reabrirConversacion({
      id: convId,
      nombre: contactoSeleccionado.value?.nombre,
      telefono: contactoSeleccionado.value?.telefono,
    });
    emit("select", convId);
    cerrarInfoCliente();
    return;
  }

  if (estado === "nuevo" || estado === "pendiente") {
    try {
      const resp = await abrirChat(convId, uid);
      const failed =
        resp?.ok === false || resp?.success === false || Boolean(resp?.error);
      if (failed) {
        await showError(
          resp?.error ||
            resp?.message ||
            resp?.mensaje ||
            "No se pudo iniciar la conversación.",
        );
        return;
      }
      store.upsertConversation({
        id: convId,
        estado: "abierta",
        nombre: contactoSeleccionado.value?.nombre,
        name: contactoSeleccionado.value?.nombre,
        telefono: contactoSeleccionado.value?.telefono,
      });
    } catch {
      await showError("No se pudo iniciar la conversación.");
      return;
    }
  }

  emit("select", convId);
  cerrarInfoCliente();
};

const initialsFromName = (name) => {
  const clean = String(name || "").trim();
  if (!clean) return "C";
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
};

const getAvatarSrc = (conv) => {
  const meta = conv?.metadata || {};
  const direct =
    conv?.fotoPerfil ||
    conv?.avatarUrl ||
    conv?.avatar ||
    conv?.foto ||
    meta?.fotoPerfil ||
    meta?.avatarUrl ||
    meta?.avatar ||
    meta?.foto ||
    "";

  if (String(direct || "").trim()) return String(direct).trim();

  const nombre = String(conv?.name || conv?.nombre || "").trim();
  return buildPersonAvatarUrl(nombre || "contacto", "contact");
};

const estadoConexion = (conv) => (conv?.online ? "En linea" : "Desconectado");

const abrirInfoCliente = (event, conv) => {
  event.stopPropagation();
  const meta = conv?.metadata || {};
  contactoSeleccionado.value = {
    id: conv?.id || "-",
    nombre: conv?.name || conv?.nombre || "-",
    fotoPerfil: getAvatarSrc(conv),
    estado: estadoConexion(conv),
    online: Boolean(conv?.online),
    telefono:
      conv?.telefono ||
      conv?.tels ||
      conv?.contacto_id ||
      meta?.telefono ||
      meta?.tels ||
      "-",
    email: conv?.email || meta?.email || "-",
    ciudad: conv?.ciudad || meta?.ciudad || "-",
    direccion: conv?.direccion || meta?.direccion || "-",
    entidad: conv?.entidad || meta?.entidad || "-",
    documento: conv?.data || meta?.data || meta?.dni || "-",
    origen: conv?.origen || meta?.origen || "-",
    convEstado: String(conv?.estado || "nuevo").toLowerCase(),
    esRecienCreado: false,
  };
  infoModalOpen.value = true;
};

const cerrarInfoCliente = () => {
  infoModalOpen.value = false;
  contactoSeleccionado.value = null;
  sidebarMode.value = "cliente";
};

const abrirFormEditar = () => {
  const c = contactoSeleccionado.value;
  if (!c) return;
  editForm.value = {
    nombre: c.nombre === "-" ? "" : String(c.nombre || ""),
    telefono: c.telefono === "-" ? "" : String(c.telefono || ""),
    email: c.email === "-" ? "" : String(c.email || ""),
    documento: c.documento === "-" ? "" : String(c.documento || ""),
    ciudad: c.ciudad === "-" ? "" : String(c.ciudad || ""),
    direccion: c.direccion === "-" ? "" : String(c.direccion || ""),
    entidad: c.entidad === "-" ? "" : String(c.entidad || ""),
  };
  sidebarMode.value = "editForm";
};

const cancelarEdicion = () => {
  sidebarMode.value = "cliente";
};

const guardarEdicion = async () => {
  const nombre = String(editForm.value.nombre || "").trim();
  const telefono = String(editForm.value.telefono || "").trim();
  if (!nombre || !telefono) {
    await showError("Nombre y teléfono son requeridos.");
    return;
  }

  const confirmed = await confirmSave();
  if (!confirmed) return;

  const convId = String(contactoSeleccionado.value?.id || "").trim();
  emitSocket(
    "editarContacto",
    {
      nombre,
      telefono,
      identificacion: String(editForm.value.documento || "").trim(),
      email: String(editForm.value.email || "").trim(),
      ciudad: String(editForm.value.ciudad || "").trim(),
      direccion: String(editForm.value.direccion || "").trim(),
      entidad: String(editForm.value.entidad || "").trim(),
      convId,
    },
    async (res) => {
      if (res?.ok === false || res?.success === false) {
        await showError(
          res?.message || res?.mensaje || res?.error || "Error al guardar.",
        );
        return;
      }
      if (convId) {
        store.upsertConversation({
          id: convId,
          nombre,
          name: nombre,
          telefono,
          email: editForm.value.email,
          ciudad: editForm.value.ciudad,
          direccion: editForm.value.direccion,
          entidad: editForm.value.entidad,
          metadata: {
            nombre,
            telefono,
            email: editForm.value.email,
            ciudad: editForm.value.ciudad,
            direccion: editForm.value.direccion,
            entidad: editForm.value.entidad,
            dni: editForm.value.documento,
            data: editForm.value.documento,
          },
        });
        contactoSeleccionado.value = {
          ...contactoSeleccionado.value,
          nombre,
          telefono,
          email: editForm.value.email,
          ciudad: editForm.value.ciudad,
          direccion: editForm.value.direccion,
          entidad: editForm.value.entidad,
          documento: editForm.value.documento,
        };
      }
      sidebarMode.value = "cliente";
      fetchContacts();
      await showSuccess("Contacto actualizado correctamente.");
    },
  );
};

const eliminarContactoFn = async () => {
  const convId = String(contactoSeleccionado.value?.id || "").trim();
  if (!convId) return;

  const confirmed = await confirmDelete();
  if (!confirmed) return;

  emitSocket("eliminarContacto", { convId }, async (res) => {
    if (res?.ok === false || res?.success === false) {
      await showError(res?.message || res?.error || "No se pudo eliminar.");
      return;
    }
    store.removeConversation(convId);
    cerrarInfoCliente();
    fetchContacts();
    await showSuccess("Contacto eliminado correctamente.");
  });
};

const marcarContacto = (flag) => {
  const convId = String(contactoSeleccionado.value?.id || "").trim();
  if (!convId) return;
  let marca = "normal";
  let estadoConv = "abierta";
  if (flag === "destacado") {
    marca = "destacado";
    estadoConv = "abierta";
  } else if (flag === "bloqueado") {
    marca = "bloqueado";
    estadoConv = "cerrada";
  }
  const socket = getSocket();
  if (!socket?.connected) return;
  socket.emit(
    "actualizarMarca",
    contactoSeleccionado.value,
    marca,
    estadoConv,
  );
  store.upsertConversation({
    id: convId,
    destacado: marca === "destacado",
    bloqueado: marca === "bloqueado",
    estado: estadoConv,
    marca,
  });
};

const abrirHistorial = () => {
  sidebarMode.value = "historico";
};

const abrirEtiquetas = (e, conv) => {
  e.stopPropagation();
  const telefono = conv.telefono || conv.tels || conv.contacto_id || "";
  store.abrirModalEtiquetas(conv.id, telefono);
};

const etiquetasDeConv = (conv) => {
  return getConversationTags(conv);
};

const onCambiarFiltros = (event) => {
  const value = String(event.target.value || "").trim();
  if (!value) {
    store.limpiarFiltrosEtiquetas();
    return;
  }
  store.setFiltrosEtiquetas([value]);
};

const conversationsFiltered = computed(() => {
  const filtrosActivos = store.filtrosEtiquetasSeleccionadas;

  // Filtrar por tipo de conversación
  let convers = props.conversations.filter((conv) => {
    // Si tiene propiedad origen y es 'Interno', es interno, si no, es cliente
    if (tipoConversacion.value === "interno") {
      return (
        (conv.origen || conv.metadata?.origen || "").toLowerCase() === "interno"
      );
    } else {
      return (
        (conv.origen || conv.metadata?.origen || "").toLowerCase() !== "interno"
      );
    }
  });

  if (!Array.isArray(filtrosActivos) || filtrosActivos.length === 0) {
    return convers;
  }

  return convers.filter((conv) => matchesEtiquetaFilter(conv));
});

const groupedConversations = computed(() => {
  const groups = {
    active: [],
    new: [],
    closed: [],
  };

  for (const conversation of conversationsFiltered.value) {
    const rawState = String(conversation.estado || conversation.status || "")
      .toLowerCase()
      .trim();
    const status =
      rawState === "cerrada" || rawState === "closed"
        ? "closed"
        : rawState === "nuevo" || rawState === "new"
          ? "new"
          : "active";
    if (groups[status]) {
      groups[status].push(conversation);
    }
  }

  return groups;
});

const sections = computed(() => [
  {
    key: "active",
    label: "Chats activos",
    items: groupedConversations.value.active,
  },
  { key: "new", label: "Nuevos", items: groupedConversations.value.new },
  {
    key: "closed",
    label: "Cerrados",
    items: groupedConversations.value.closed,
  },
]);

const internalAgentItems = computed(() =>
  (store.agentesInternos || []).map((agent) => {
    const peerId = String(agent.id);
    const preview = store.ultimoInternoPorPeer?.[peerId];
    return {
      id: buildInternalConvId(agent.id),
      name: agent.nombre || `Agente ${agent.id}`,
      nombre: agent.nombre || `Agente ${agent.id}`,
      lastMessage:
        preview?.lastMessage || agent.ultimoMensaje || "Chat interno",
      lastMessageTime: preview?.lastMessageTime,
      online: agent.estado === "online",
      isInternalAgent: true,
      peerAgentId: peerId,
      unread: Number(store.noLeidosInternosPorPeer?.[peerId] || 0),
    };
  }),
);

const internalSections = computed(() => [
  {
    key: "agents",
    label: "Agentes en línea",
    items: internalAgentItems.value,
  },
]);

const listSections = computed(() =>
  tipoConversacion.value === "interno"
    ? internalSections.value
    : sections.value,
);

function refrescarAgentesInternos() {
  registerInternalIdentity(obtenerAgenteIdActual());
  fetchInternalAgents((agentes) => store.setAgentesInternos(agentes));
}

watch(
  tipoConversacion,
  (mode) => {
    store.setInternoListaVisible(mode === "interno");
    if (mode !== "interno") return;
    refrescarAgentesInternos();
  },
  { immediate: true },
);

onMounted(() => {
  const socket = getSocket();
  if (!socket) return;
  socket.on("connect", () => {
    if (tipoConversacion.value === "interno") refrescarAgentesInternos();
  });
});
</script>

<template>
  <div class="conversation-list">
    <div class="title-row">
      <div class="title-block">
        <div class="title">Conversaciones</div>
        <div
          class="agent-inline"
          role="button"
          tabindex="0"
          title="Ver perfil del asesor"
          @click="abrirInfoAgente"
          @keydown.enter.prevent="abrirInfoAgente"
          @keydown.space.prevent="abrirInfoAgente"
        >
          <div class="agent-inline-photo-wrap">
            <img
              class="agent-inline-photo"
              :src="agentAvatarSrc"
              :alt="agentDisplayName"
            />
            <span
              class="agent-inline-status-dot"
              :class="{ online: agentOnline }"
            ></span>
          </div>
          <div class="agent-inline-text">
            <div class="agent-inline-name">{{ agentDisplayName }}</div>
            <div class="agent-inline-status">{{ agentStatusLine }}</div>
          </div>
        </div>
      </div>
      <button
        type="button"
        class="title-icon-btn"
        title="Buscar conversaciones"
        @click="toggleSearch"
      >
        🔍
      </button>
    </div>

    <div v-if="searchOpen" class="list-search-wrap">
      <input
        v-model="searchTermModel"
        type="text"
        class="list-search-input"
        placeholder="Buscar conversación..."
      />
    </div>

    <div v-if="mostrarBannerAlertas" class="alertas-banner" role="status">
      <span class="alertas-banner-text">{{ textoBannerAlertas }}</span>
      <button
        type="button"
        class="alertas-banner-btn"
        :disabled="activandoAlertas"
        @click="onActivarAlertas"
      >
        {{ activandoAlertas ? "Activando…" : "Activar alertas" }}
      </button>
    </div>

    <!-- Selector de tipo de conversación -->
    <div class="tipo-conv-selector">
      <button
        :class="['tipo-btn', { active: tipoConversacion === 'cliente' }]"
        @click="tipoConversacion = 'cliente'"
        type="button"
      >
        <span class="tipo-btn-icon">💬</span> Clientes
      </button>
      <button
        :class="[
          'tipo-btn',
          'tipo-btn-interno',
          { active: tipoConversacion === 'interno', 'has-unread': store.tieneNoLeidosInternos },
        ]"
        @click="tipoConversacion = 'interno'"
        type="button"
        :aria-label="
          store.tieneNoLeidosInternos
            ? 'Interno, mensajes sin leer'
            : 'Interno'
        "
      >
        <span
          class="tipo-btn-icon-wrap"
          :class="{ 'has-notify': store.tieneNoLeidosInternos }"
        >
          <span class="tipo-btn-icon">👥</span>
          <span
            v-if="store.tieneNoLeidosInternos"
            class="tipo-btn-notify-halo"
            aria-hidden="true"
          ></span>
        </span>
        <span class="tipo-btn-label">Interno</span>
        <span
          v-if="store.tieneNoLeidosInternos"
          class="tipo-btn-notify-mark"
          aria-hidden="true"
        ></span>
      </button>
    </div>
    <div class="filters-row">
      <span class="filter-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" role="img" focusable="false">
          <path d="M3 5h18l-7 8v5l-4 2v-7L3 5z" />
        </svg>
      </span>
      <select
        class="filters-select"
        :value="String(store.filtrosEtiquetasSeleccionadas[0] || '')"
        @change="onCambiarFiltros"
      >
        <option value="">Todas las etiquetas</option>
        <option
          v-for="etiqueta in store.etiquetas"
          :key="etiqueta.id"
          :value="String(etiqueta.id)"
        >
          {{ etiqueta.nombre }}
        </option>
      </select>
    </div>

    <div class="sections-wrap">
      <p v-if="tipoConversacion === 'interno'" class="interno-hint">
        Agente actual (URL):
        <strong>{{ obtenerAgenteIdActual() }}</strong>
        — abre otra pestaña con otro
        <code>?agentId=</code> para probar entre agentes.
      </p>

      <section
        v-for="section in listSections"
        :key="section.key"
        class="section-block"
      >
        <div class="section-title-row">
          <div class="section-title">{{ section.label }}</div>
          <div class="section-count">{{ section.items.length }}</div>
        </div>

        <div v-if="section.items.length === 0" class="empty-section">
          {{
            tipoConversacion === "interno"
              ? "No hay otros agentes conectados"
              : "Sin conversaciones"
          }}
        </div>

        <div
          v-for="item in section.items"
          :key="item.id"
          class="contact-card"
          :class="{
            selected: item.id === props.selectedId,
            unread: Number(item.unread) > 0,
            'is-destacado': isConvDestacado(item),
            'is-bloqueado': isConvBloqueado(item),
          }"
          @click="handleConversationClick(item, section.key)"
        >
          <div class="contact-card-indicator" aria-hidden="true"></div>

          <div class="contact-avatar-wrap">
            <img
              class="contact-avatar"
              :src="getAvatarSrc(item)"
              :alt="getConversationDisplayName(item)"
              @click.stop="abrirInfoCliente($event, item)"
            />
            <span
              class="contact-status-dot"
              :class="{
                online: item.online,
                'active-chat': section.key === 'active',
              }"
              :title="item.online ? 'En línea' : 'Desconectado'"
            ></span>
          </div>

          <div class="contact-body">
            <div class="contact-header">
              <div class="contact-title-wrap">
                <span class="contact-name">
                  {{ getConversationDisplayName(item) }}
                  <span
                    v-if="isConvDestacado(item)"
                    class="star-badge"
                    aria-label="Destacado"
                  >
                    <span class="star-icon">★</span>
                  </span>
                </span>
                <span v-if="getOriginLabel(item)" class="contact-origin">
                  {{ getOriginLabel(item) }}
                </span>
              </div>
              <div class="contact-header-meta">
                <span v-if="formatListTime(item.lastMessageTime)" class="contact-time">
                  {{ formatListTime(item.lastMessageTime) }}
                </span>
                <span
                  v-if="item.unread && !item.isInternalAgent"
                  class="contact-badge"
                  >{{ item.unread }}</span
                >
                <span
                  v-else-if="item.unread && item.isInternalAgent"
                  class="contact-unread-dot"
                  aria-label="Sin leer"
                ></span>
              </div>
            </div>

            <p class="contact-preview">{{ getPreviewText(item) }}</p>

            <div
              v-if="etiquetasDeConv(item).length > 0"
              class="contact-footer"
            >
              <div class="contact-tags">
                <span
                  v-for="et in etiquetasDeConv(item).slice(0, 3)"
                  :key="`${item.id}-${et.id}`"
                  class="contact-tag"
                  :style="{
                    '--tag-color': et.color || '#588044',
                  }"
                >
                  {{ et.nombre }}
                </span>
              </div>
            </div>
          </div>

          <div class="contact-actions-col">
            <button
              class="contact-options-btn"
              type="button"
              @click.stop="abrirEtiquetas($event, item)"
              title="Etiquetas y opciones"
              aria-label="Etiquetas y opciones"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="5" r="1.6" />
                <circle cx="12" cy="12" r="1.6" />
                <circle cx="12" cy="19" r="1.6" />
              </svg>
            </button>
            <span
              v-if="getConversationQueue(item)"
              class="contact-queue-chip"
              :title="`Cola: ${getConversationQueue(item)}`"
            >
              {{ getConversationQueue(item) }}
            </span>
          </div>
          <!-- Modal de confirmación para reabrir conversación -->
          <Teleport to="body">
            <div
              v-if="reopenModalOpen"
              class="modal-reopen-overlay"
              @click.self="cancelReopenConversation"
            >
              <div class="modal-reopen">
                <div class="modal-reopen-title">¿Reabrir conversación?</div>
                <div class="modal-reopen-body">
                  ¿Deseas reabrir la conversación
                  <b>{{ conversationToReopen?.name }}</b
                  >? Esta acción la moverá a "Activos".
                </div>
                <div class="modal-reopen-actions">
                  <button
                    type="button"
                    class="modal-reopen-cancel"
                    @click="cancelReopenConversation"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    class="modal-reopen-confirm"
                    @click="confirmReopenConversation"
                  >
                    Sí, reabrir
                  </button>
                </div>
              </div>
            </div>
          </Teleport>
        </div>
      </section>
    </div>
  </div>

  <!-- El bloque <style scoped> debe ir fuera del template -->

  <LabelAssigner />

  <Teleport to="body">
    <div
      v-if="infoModalOpen"
      class="contacto-overlay"
      @click.self="cerrarInfoCliente"
    >
      <aside class="contacto-sidebar">
        <div class="contacto-header">
          <div class="contacto-header-photo-wrap">
            <img
              class="contacto-header-photo"
              :src="contactoSeleccionado?.fotoPerfil"
              :alt="contactoSeleccionado?.nombre || 'Contacto'"
            />
            <span
              class="contacto-header-status"
              :class="{ online: contactoSeleccionado?.online }"
            ></span>
          </div>
          <div class="contacto-header-text">
            <h3>{{ contactoSeleccionado?.nombre || "-" }}</h3>
            <p>{{ contactoSeleccionado?.estado || "-" }}</p>
          </div>
          <button
            type="button"
            class="contacto-close"
            @click="cerrarInfoCliente"
          >
            x
          </button>
        </div>

        <!-- CLIENTE MODE: Mostrar info y botones -->
        <div v-if="sidebarMode === 'cliente'" class="contacto-body">
          <div class="contacto-item">
            <strong>Telefono:</strong>
            {{ contactoSeleccionado?.telefono || "-" }}
          </div>
          <div class="contacto-item">
            <strong>Documento:</strong>
            {{ contactoSeleccionado?.documento || "-" }}
          </div>
          <div class="contacto-item">
            <strong>Email:</strong> {{ contactoSeleccionado?.email || "-" }}
          </div>
          <div class="contacto-item">
            <strong>Ciudad:</strong> {{ contactoSeleccionado?.ciudad || "-" }}
          </div>
          <div class="contacto-item">
            <strong>Direccion:</strong>
            {{ contactoSeleccionado?.direccion || "-" }}
          </div>
          <div class="contacto-item">
            <strong>Entidad:</strong> {{ contactoSeleccionado?.entidad || "-" }}
          </div>
          <div class="contacto-item">
            <strong>Canal:</strong> {{ contactoSeleccionado?.origen || "-" }}
          </div>
          <div class="contacto-item">
            <strong>Conversacion:</strong> #{{
              contactoSeleccionado?.id || "-"
            }}
          </div>

          <div
            v-if="mostrarIniciarConversacion"
            class="contacto-actions contacto-actions-start"
          >
            <button
              type="button"
              class="sidepanel-btn sidepanel-btn-primary"
              @click="iniciarConversacionContacto"
            >
              <span class="icon" aria-hidden="true">&#128172;</span>
              {{ iniciarConversacionLabel }}
            </button>
          </div>

          <div class="contacto-actions">
            <div class="action-group"><strong>Marcar como:</strong></div>
            <button
              type="button"
              class="sidepanel-btn"
              @click="marcarContacto('destacado')"
            >
              <span class="icon" aria-hidden="true">&#11088;</span> DESTACADO
            </button>
            <button
              type="button"
              class="sidepanel-btn"
              @click="marcarContacto('bloqueado')"
            >
              <span class="icon" aria-hidden="true">&#128274;</span> BLOQUEADO
            </button>
            <button
              type="button"
              class="sidepanel-btn"
              @click="marcarContacto('normal')"
            >
              <span class="icon" aria-hidden="true">&#10003;</span> NORMAL
            </button>
          </div>

          <div class="contacto-actions">
            <button type="button" class="sidepanel-btn" @click="abrirHistorial">
              <span class="icon" aria-hidden="true">&#128221;</span> HISTÓRICO
            </button>
            <button
              type="button"
              class="sidepanel-btn"
              @click="abrirMultimedia"
            >
              <span class="icon" aria-hidden="true">&#128247;</span> MULTIMEDIA
            </button>
            <button
              type="button"
              class="sidepanel-btn"
              @click="abrirFormEditar"
            >
              <span class="icon" aria-hidden="true">&#128393;</span> EDITAR
              INFORMACIÓN
            </button>
            <button
              type="button"
              class="sidepanel-btn danger"
              @click="eliminarContactoFn"
            >
              <span class="icon" aria-hidden="true">&#128465;</span> ELIMINAR
            </button>
          </div>
        </div>

        <!-- EDIT FORM MODE -->
        <div v-if="sidebarMode === 'editForm'" class="contacto-body">
          <form @submit.prevent="guardarEdicion" class="edit-form">
            <div class="form-group">
              <label>Nombre</label>
              <input v-model="editForm.nombre" type="text" />
            </div>
            <div class="form-group">
              <label>Teléfono</label>
              <input v-model="editForm.telefono" type="text" />
            </div>
            <div class="form-group">
              <label>Email</label>
              <input v-model="editForm.email" type="email" />
            </div>
            <div class="form-group">
              <label>Documento</label>
              <input v-model="editForm.documento" type="text" />
            </div>
            <div class="form-group">
              <label>Ciudad</label>
              <input v-model="editForm.ciudad" type="text" />
            </div>
            <div class="form-group">
              <label>Dirección</label>
              <input v-model="editForm.direccion" type="text" />
            </div>
            <div class="form-group">
              <label>Entidad</label>
              <input v-model="editForm.entidad" type="text" />
            </div>
            <div class="form-actions">
              <button type="submit" class="sidepanel-btn">
                <span class="icon" aria-hidden="true">&#128190;</span> GUARDAR
              </button>
              <button
                type="button"
                class="sidepanel-btn"
                @click="cancelarEdicion"
              >
                <span class="icon" aria-hidden="true">&#10006;</span> CANCELAR
              </button>
            </div>
          </form>
        </div>

        <!-- HISTORIC MODE -->
        <div
          v-if="sidebarMode === 'historico'"
          class="contacto-body scroll-section"
        >
          <button
            type="button"
            class="sidepanel-btn"
            @click="sidebarMode = 'cliente'"
          >
            <span class="icon" aria-hidden="true">&#8592;</span> VOLVER
          </button>
          <div v-if="historialCargando" class="loading">Cargando...</div>
          <div v-else-if="historicoItems.length === 0" class="empty">
            Sin histórico
          </div>
          <div v-else class="historico-list">
            <div
              v-for="item in historicoItems"
              :key="item.id"
              class="historico-item"
            >
              <p>
                <strong>{{ item.tipo || "Evento" }}</strong>
              </p>
              <p>{{ item.descripcion }}</p>
              <p class="timestamp">{{ item.fecha }}</p>
            </div>
          </div>
        </div>

        <!-- MULTIMEDIA MODE -->
        <div
          v-if="sidebarMode === 'multimedia'"
          class="contacto-body scroll-section"
        >
          <button
            type="button"
            class="action-btn"
            @click="sidebarMode = 'cliente'"
          >
            ← Volver
          </button>
          <div v-if="mediasCargando" class="loading">Cargando...</div>
          <div v-else-if="mediaItems.length === 0" class="empty">
            Sin multimedia
          </div>
          <div v-else class="media-grid">
            <button
              v-for="media in mediaItems"
              :key="media.id"
              type="button"
              class="media-tile"
              @click="abrirMediaItem(media)"
            >
              <img
                v-if="media.tipo === 'image' || media.tipo === 'imagen'"
                class="media-tile-preview"
                :src="media.displayUrl || media.url"
                alt="Imagen"
                loading="lazy"
              />
              <video
                v-else-if="media.tipo === 'video'"
                class="media-tile-preview"
                muted
                preload="metadata"
                :src="media.displayUrl || media.url"
              ></video>
              <div
                v-else
                class="media-tile-fallback"
                :class="{ 'media-tile-audio': media.tipo === 'audio' }"
              >
                <span class="media-tile-icon">
                  {{ media.tipo === 'audio' ? '🎵' : media.tipo === 'video' ? '🎬' : '📄' }}
                </span>
                <span class="media-tile-type">
                  {{
                    media.tipo === 'audio'
                      ? 'Audio'
                      : media.tipo === 'video'
                        ? 'Video'
                        : 'Documento'
                  }}
                </span>
              </div>
            </button>
          </div>
        </div>
      </aside>
    </div>

    <div
      v-if="agentModalOpen"
      class="contacto-overlay"
      @click.self="cerrarInfoAgente"
    >
      <aside class="contacto-sidebar contacto-sidebar-agent">
        <div
          v-if="agentViewMode === 'profile'"
          class="contacto-header contacto-header-agent"
        >
          <button
            type="button"
            class="contacto-close contacto-close-agent"
            @click="cerrarInfoAgente"
          >
            x
          </button>

          <div
            class="contacto-header-photo-wrap contacto-header-photo-wrap-agent"
          >
            <img
              class="contacto-header-photo"
              :src="agentAvatarSrc"
              :alt="agentDisplayName"
            />
          </div>

          <div class="contacto-header-text contacto-header-text-agent">
            <h3>{{ agentDisplayName }}</h3>
            <p>{{ agentPerfil }}</p>
          </div>
        </div>

        <div
          v-else-if="agentViewMode === 'contacts'"
          class="contacto-header contacto-header-agent-contacts"
        >
          <div class="agent-contacts-title-row">
            <h3>CONTACTOS</h3>
            <button
              type="button"
              class="agent-refresh-btn"
              title="Actualizar contactos"
              @click="refrescarContactosAgente"
            >
              ↻
            </button>
          </div>

          <button
            type="button"
            class="contacto-close contacto-close-agent"
            @click="cerrarInfoAgente"
          >
            x
          </button>
        </div>

        <div v-else class="contacto-header contacto-header-agent-contacts">
          <div class="agent-contacts-title-row">
            <h3>CREAR CONTACTO</h3>
          </div>

          <button
            type="button"
            class="contacto-close contacto-close-agent"
            @click="cerrarInfoAgente"
          >
            x
          </button>
        </div>

        <div
          v-if="agentViewMode === 'profile'"
          class="contacto-body contacto-body-agent"
        >
          <div class="agent-role-row">
            <span class="agent-role-icon" aria-hidden="true">🪪</span>
            <span>{{ agentPerfil }}</span>
          </div>

          <div class="agent-section-title">Informacion de usuario</div>

          <div class="agent-card agent-info-card">
            <div class="contacto-item contacto-item-agent">
              <strong>Usuario:</strong> {{ agentUsuario }}
            </div>
            <div class="contacto-item contacto-item-agent">
              <strong>Correo:</strong> {{ agentCorreo }}
            </div>
            <div class="contacto-item contacto-item-agent">
              <strong>Extension:</strong> {{ agentExtension }}
            </div>
          </div>

          <div class="agent-section-title">Estado de conexion</div>

          <div class="agent-card agent-status-card">
            <div
              class="agent-status-list"
              role="radiogroup"
              aria-label="Estado de conexion del asesor"
            >
              <label
                v-for="estado in agentEstadoOpciones"
                :key="estado"
                class="agent-status-item"
              >
                <input
                  type="radio"
                  name="estado-agente"
                  :checked="agentEstadoSeleccionado === estado"
                  @change="cambiarEstadoAgente(estado)"
                />
                <span>{{ estado }}</span>
              </label>
            </div>
          </div>

          <div class="agent-actions">
            <button
              type="button"
              class="sidepanel-btn"
              @click="abrirCrearContactoDesdeAgente"
            >
              <span class="icon" aria-hidden="true">&#10010;</span> CREAR
              CONTACTO
            </button>
            <button
              type="button"
              class="sidepanel-btn"
              @click="verContactosDesdeAgente"
            >
              <span class="icon" aria-hidden="true">&#128101;</span> VER
              CONTACTOS
            </button>
          </div>
        </div>

        <div
          v-else-if="agentViewMode === 'contacts'"
          class="contacto-body contacto-body-agent-contacts"
        >
          <div class="agent-section-title agent-contacts-list-title">
            Lista de contactos
          </div>

          <div v-if="agentContacts.length === 0" class="agent-contacts-empty">
            No hay contactos disponibles.
          </div>

          <div v-else class="agent-contacts-list">
            <article
              v-for="item in agentContacts"
              :key="contactDedupeKey(item)"
              class="agent-contact-card"
            >
              <div class="agent-contact-avatar" aria-hidden="true">👤</div>

              <div class="agent-contact-meta">
                <h4>{{ getContactListName(item) }}</h4>
              </div>

              <div
                class="agent-contact-state"
                :class="{ online: isContactActive(item) }"
              >
                <span class="agent-contact-state-dot"></span>
                <small>{{ getContactConnectionLabel(item) }}</small>
              </div>
            </article>
          </div>

          <button
            type="button"
            class="agent-floating-settings"
            title="Volver al perfil del asesor"
            @click="abrirPerfilDesdeContactos"
          >
            ⚙
          </button>
        </div>

        <div v-else class="contacto-body contacto-body-agent-contacts">
          <div class="agent-section-title agent-contacts-list-title">
            Formulario
          </div>

          <form
            class="agent-card agent-create-form"
            @submit.prevent="guardarNuevoContactoAgente"
          >
            <label class="agent-form-field">
              <span>Nombre</span>
              <input v-model="agentCreateForm.nombre" type="text" required />
            </label>
            <label class="agent-form-field">
              <span>Identificacion</span>
              <input v-model="agentCreateForm.identificacion" type="text" />
            </label>
            <label class="agent-form-field">
              <span>Telefono</span>
              <input v-model="agentCreateForm.telefono" type="text" required />
            </label>
            <label class="agent-form-field">
              <span>Direccion</span>
              <input v-model="agentCreateForm.direccion" type="text" />
            </label>
            <label class="agent-form-field">
              <span>Ciudad</span>
              <input v-model="agentCreateForm.ciudad" type="text" />
            </label>
            <label class="agent-form-field">
              <span>Entidad</span>
              <input v-model="agentCreateForm.entidad" type="text" />
            </label>
            <label class="agent-form-field">
              <span>Email</span>
              <input v-model="agentCreateForm.email" type="email" />
            </label>

            <div class="agent-create-actions">
              <button
                type="submit"
                class="sidepanel-btn"
                :disabled="agentCreateSubmitting"
              >
                <span class="icon" aria-hidden="true">&#128190;</span>
                {{
                  agentCreateSubmitting ? "GUARDANDO..." : "GUARDAR CONTACTO"
                }}
              </button>
              <button
                type="button"
                class="sidepanel-btn"
                :disabled="agentCreateSubmitting"
                @click="verContactosDesdeAgente"
              >
                <span class="icon" aria-hidden="true">&#128101;</span> VER
                CONTACTOS
              </button>
            </div>

            <p v-if="agentCreateFeedback" class="agent-create-feedback">
              {{ agentCreateFeedback }}
            </p>
          </form>

          <button
            type="button"
            class="agent-floating-settings"
            title="Volver al perfil del asesor"
            @click="abrirPerfilDesdeContactos"
          >
            ⚙
          </button>
        </div>
      </aside>
    </div>
  </Teleport>
</template>

<style scoped>
/* --- Listado de conversaciones --- */
.contact-card {
  display: grid;
  grid-template-columns: 3px 44px minmax(0, 1fr) 64px;
  align-items: center;
  gap: 10px;
  padding: 16px 14px 16px 0;
  margin: 0;
  min-height: 82px;
  box-sizing: border-box;
  background: #fff;
  border: none;
  border-bottom: 1px solid #e8efe3;
  border-radius: 0;
  box-shadow: none;
  cursor: pointer;
  transition:
    background 0.16s ease,
    border-color 0.16s ease;
  position: relative;
}

.contact-card:hover {
  background: #f8fbf5;
}

.contact-card.selected {
  background: #f2f7ec;
  border-bottom-color: #d8e6cc;
}

.contact-card.is-destacado {
  background: linear-gradient(105deg, #fffbeb 0%, #fffef8 42%, #ffffff 100%);
  border-bottom-color: rgba(251, 191, 36, 0.28);
  box-shadow:
    inset 0 0 0 1px rgba(251, 191, 36, 0.18),
    0 6px 18px rgba(245, 158, 11, 0.06);
}

.contact-card.is-destacado::after {
  content: "";
  position: absolute;
  left: 0;
  top: 10px;
  bottom: 10px;
  width: 4px;
  border-radius: 0 6px 6px 0;
  background: linear-gradient(180deg, #fde047 0%, #f59e0b 52%, #d97706 100%);
  box-shadow: 0 0 12px rgba(245, 158, 11, 0.42);
}

.contact-card.is-destacado:hover {
  background: linear-gradient(105deg, #fef3c7 0%, #fffbeb 48%, #ffffff 100%);
  box-shadow:
    inset 0 0 0 1px rgba(251, 191, 36, 0.32),
    0 8px 22px rgba(245, 158, 11, 0.1);
}

.contact-card.is-destacado.selected {
  background: linear-gradient(105deg, #fef08a 0%, #fef9c3 45%, #fffbeb 100%);
  box-shadow:
    inset 0 0 0 1px rgba(234, 179, 8, 0.42),
    0 4px 16px rgba(245, 158, 11, 0.14);
}

.contact-card.is-destacado .contact-card-indicator {
  background: transparent;
}

.contact-card.is-destacado .contact-avatar {
  border-color: #fcd34d;
  box-shadow:
    0 0 0 2px #fff,
    0 0 0 3px rgba(251, 191, 36, 0.28);
}

.contact-card.is-bloqueado {
  opacity: 0.48;
  filter: grayscale(0.2);
}

.contact-card.is-bloqueado:hover {
  opacity: 0.62;
}

.contact-card.is-bloqueado.is-destacado {
  opacity: 0.52;
}

.contact-card.is-bloqueado.is-destacado::after {
  background: linear-gradient(180deg, #d4d4d8 0%, #a1a1aa 100%);
  box-shadow: none;
}

.contact-card.unread .contact-name {
  color: #24361c;
}

.contact-card-indicator {
  align-self: stretch;
  border-radius: 0 3px 3px 0;
  background: transparent;
  transition: background 0.16s ease;
}

.contact-card.selected .contact-card-indicator {
  background: var(--color-primary, #588044);
}

.contact-card.unread:not(.selected) .contact-card-indicator {
  background: #8fb56a;
}

.contact-avatar-wrap {
  position: relative;
  width: 44px;
  height: 44px;
  flex-shrink: 0;
  align-self: center;
}

.contact-avatar {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  object-fit: cover;
  background: #edf3e7;
  border: 1px solid #dfe9d6;
}

.contact-status-dot {
  position: absolute;
  right: 1px;
  bottom: 1px;
  width: 11px;
  height: 11px;
  border-radius: 50%;
  border: 2px solid #fff;
  background: #c5cdbf;
}

.contact-status-dot.online,
.contact-status-dot.active-chat {
  background: #588044;
}

.contact-body {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-self: center;
  padding: 2px 0;
}

.contact-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
}

.contact-title-wrap {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.contact-name {
  font-size: 14px;
  font-weight: 600;
  color: #2f4324;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: flex;
  align-items: center;
  gap: 4px;
  line-height: 1.25;
}

.star-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  flex-shrink: 0;
  background: linear-gradient(145deg, #fde047 0%, #f59e0b 100%);
  box-shadow:
    0 2px 7px rgba(245, 158, 11, 0.32),
    inset 0 1px 0 rgba(255, 255, 255, 0.55);
}

.star-icon {
  color: #fff;
  font-size: 11px;
  flex-shrink: 0;
  line-height: 1;
  text-shadow: 0 1px 2px rgba(146, 64, 14, 0.35);
}

.contact-origin {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  max-width: 100%;
  padding: 1px 6px;
  border-radius: 4px;
  background: #eef4e8;
  color: #5a6f52;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  line-height: 1.4;
}

.contact-header-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.contact-time {
  font-size: 11px;
  color: #8a9982;
  font-weight: 500;
  white-space: nowrap;
}

.contact-preview {
  margin: 0;
  font-size: 12px;
  line-height: 1.35;
  color: #66755f;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.contact-card.unread .contact-preview {
  color: #3f5238;
  font-weight: 500;
}

.contact-badge {
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  display: inline-grid;
  place-items: center;
  border-radius: 999px;
  background: var(--color-primary, #588044);
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
}

.contact-footer {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  min-width: 0;
  padding-top: 1px;
}

.contact-actions-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 5px;
  align-self: stretch;
  min-width: 52px;
  padding: 1px 6px 1px 0;
}

.contact-queue-chip {
  display: block;
  width: 100%;
  max-width: 58px;
  padding: 2px 4px;
  border-radius: 4px;
  border: 1px solid #dde8d4;
  background: #f7faf4;
  color: #4a5f43;
  font-size: 9px;
  font-weight: 600;
  line-height: 1.25;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.contact-tags {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
  min-width: 0;
}

.contact-tag {
  display: inline-flex;
  align-items: center;
  max-width: 120px;
  padding: 2px 7px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--tag-color, #588044) 16%, #fff);
  color: color-mix(in srgb, var(--tag-color, #588044) 72%, #1a2e14);
  border: 1px solid color-mix(in srgb, var(--tag-color, #588044) 28%, #fff);
  font-size: 10px;
  font-weight: 600;
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.contact-options-btn {
  flex-shrink: 0;
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #8a9982;
  cursor: pointer;
  opacity: 0.45;
  transition:
    opacity 0.15s ease,
    background 0.15s ease,
    color 0.15s ease;
}

.contact-card:hover .contact-options-btn,
.contact-card.selected .contact-options-btn {
  opacity: 1;
}

.contact-options-btn svg {
  width: 16px;
  height: 16px;
  fill: currentColor;
}

.contact-options-btn:hover {
  background: #edf3e7;
  color: #588044;
}

/* --- FIN listado --- */
.modal-reopen-overlay {
  position: fixed;
  inset: 0;
  background: rgba(30, 40, 60, 0.22);
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
}
.modal-reopen {
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 8px 32px 0 rgba(30, 40, 60, 0.18);
  padding: 28px 30px 22px 30px;
  min-width: 280px;
  max-width: 92vw;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.modal-reopen-title {
  font-size: 17px;
  font-weight: 700;
  color: #334627;
  margin-bottom: 10px;
}
.modal-reopen-body {
  font-size: 14px;
  color: #4f6646;
  margin-bottom: 18px;
  text-align: center;
}
.modal-reopen-actions {
  display: flex;
  gap: 14px;
}
.modal-reopen-cancel {
  background: var(--color-primary-surface);
  color: #516a47;
  border: 1px solid var(--color-primary-soft);
  border-radius: 8px;
  padding: 7px 18px;
  font-size: 13px;
  cursor: pointer;
}
.modal-reopen-cancel:hover {
  background: var(--color-primary-surface);
}
.modal-reopen-confirm {
  background: var(--color-primary);
  color: #fff;
  border: none;
  border-radius: 8px;
  padding: 7px 22px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 2px 8px 0 rgba(31, 122, 255, 0.1);
}
.modal-reopen-confirm:hover {
  background: var(--color-primary-hover);
}
.conversation-list {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.sections-wrap {
  overflow: auto;
  height: 100%;
}

.section-block {
  padding-bottom: 0;
  border-bottom: none;
}

.section-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 14px;
  background: #f4f7f1;
  border-top: 1px solid #e8efe3;
  border-bottom: 1px solid #e8efe3;
  position: sticky;
  top: 0;
  z-index: 1;
}

.section-title {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #5a6f52;
}

.section-count {
  min-width: 22px;
  height: 22px;
  padding: 0 7px;
  display: grid;
  place-items: center;
  border-radius: 999px;
  background: #fff;
  border: 1px solid #dde8d4;
  color: #3f5238;
  font-size: 11px;
  font-weight: 700;
}

.empty-section {
  padding: 16px 14px;
  font-size: 12px;
  color: #8a9982;
  text-align: center;
  border-bottom: 1px solid #e8efe3;
}

.title-row {
  padding: 14px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border-bottom: 1px solid var(--color-primary-soft);
}

.title {
  padding: 0;
  font-size: 15px;
  font-weight: 700;
}

.title-block {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.agent-inline {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  cursor: pointer;
  border-radius: 10px;
  padding: 4px 6px;
  transition: background-color 0.18s ease;
}

.agent-inline:hover,
.agent-inline:focus-visible {
  background: var(--color-primary-surface);
  outline: none;
}

.agent-inline-photo-wrap {
  position: relative;
  width: 42px;
  height: 42px;
  flex-shrink: 0;
}

.agent-inline-photo {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  object-fit: cover;
  background: var(--color-primary-soft);
}

.agent-inline-status-dot {
  position: absolute;
  right: 0;
  bottom: 1px;
  width: 11px;
  height: 11px;
  border-radius: 50%;
  background: #879874;
  border: 2px solid #fff;
}

.agent-inline-status-dot.online {
  background: var(--color-primary);
}

.agent-inline-text {
  min-width: 0;
  display: grid;
  gap: 1px;
}

.agent-inline-name {
  font-size: 12px;
  font-weight: 700;
  color: #3b5531;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.agent-inline-status {
  font-size: 11px;
  color: #627857;
}

.title-icon-btn {
  width: 32px;
  height: 32px;
  border: 1px solid var(--color-primary-soft);
  background: var(--color-primary-surface);
  color: #2f4324;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  display: grid;
  place-items: center;
}

.list-search-wrap {
  padding: 8px 14px;
  border-bottom: 1px solid var(--color-primary-soft);
  background: var(--color-primary-surface);
}

.list-search-input {
  width: 100%;
  height: 32px;
  border: 1px solid var(--color-primary-soft);
  border-radius: 8px;
  padding: 0 10px;
  font-size: 12px;
  outline: none;
}

.list-search-input:focus {
  border-color: var(--color-primary);
}

.filters-row {
  padding: 10px 14px;
  border-bottom: 1px solid var(--color-primary-soft);
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
}

.filter-icon {
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  border: 1px solid var(--color-primary-soft);
  border-radius: 8px;
  background: #7eb83b;
  color: white;
}

.filter-icon svg {
  width: 15px;
  height: 15px;
  display: block;
  fill: currentColor;
}

.filters-select {
  width: 100%;
  height: 36px;
  padding: 6px 8px;
  border: 1px solid var(--color-primary-soft);
  border-radius: 8px;
  background: var(--color-primary-surface);
  color: #3d5632;
  font-size: 12px;
}

.conversation-item {
  border-bottom: 1px solid var(--color-primary-surface);
}

.conversation-row {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr) 34px 28px;
  align-items: center;
  gap: 10px;
  width: 100%;
  border: 0;
  background: #fff;
  text-align: left;
  padding: 12px 14px;
  cursor: pointer;
}

.conversation-row:hover {
  background: var(--color-primary-surface);
}

.conversation-row.active {
  background: var(--color-primary-soft);
}

.conversation-row.is-destacado {
  box-shadow: inset 4px 0 0 0 #f59e0b;
  background: linear-gradient(90deg, #fffbeb 0%, #ffffff 100%);
}

.avatar {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  position: relative;
  padding: 0;
  overflow: visible;
  border: 0;
  background: transparent;
  display: block;
}

.avatar-photo {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  object-fit: cover;
  background: var(--color-primary-soft);
}

.avatar-fallback {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  display: none;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  color: #334627;
  background: var(--color-primary-soft);
}

.avatar-photo:not([src]),
.avatar-photo[src=""] {
  display: none;
}

.avatar-photo:not([src]) + .avatar-fallback,
.avatar-photo[src=""] + .avatar-fallback {
  display: flex;
}

.avatar-status-dot {
  position: absolute;
  right: -2px;
  bottom: 1px;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #879874;
  border: 2px solid #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}

.avatar-status-dot.online {
  background: var(--color-primary);
}

.avatar-status-dot.nuevo {
  background: #7eb83b;
  animation: newChatPulse 1.2s ease-in-out infinite;
  box-shadow: 0 0 0 0 rgba(244, 197, 66, 0.6);
}

@keyframes newChatPulse {
  0% {
    transform: scale(1);
    box-shadow: 0 0 0 0 rgba(244, 197, 66, 0.65);
  }
  70% {
    transform: scale(1.18);
    box-shadow: 0 0 0 7px rgba(244, 197, 66, 0);
  }
  100% {
    transform: scale(1);
    box-shadow: 0 0 0 0 rgba(244, 197, 66, 0);
  }
}

.name {
  font-size: 14px;
  font-weight: 600;
  color: #334627;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.meta {
  min-width: 0;
  overflow: hidden;
}

.preview {
  font-size: 12px;
  color: #5f7257;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.badge {
  width: 22px;
  height: 20px;
  line-height: 20px;
  border-radius: 10px;
  background: var(--color-primary);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  padding: 0;
  justify-self: end;
  font-weight: 700;
  box-sizing: border-box;
  transition:
    background 0.15s,
    color 0.15s;
}

.badge.empty {
  background: #edf4e4 !important;
  color: #7b8f73 !important;
  width: 22px !important;
  min-width: 22px !important;
  max-width: 22px !important;
  height: 16px !important;
  min-height: 16px !important;
  max-height: 16px !important;
  line-height: 16px !important;
  border-radius: 8px !important;
  font-size: 11px !important;
  padding: 0 !important;
  margin: 0 !important;
  align-self: center !important;
}

.btn-label {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  background: none;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  color: #7b8f73;
  font-size: 14px;
  padding: 0;
  flex-shrink: 0;
  justify-self: end;
}

.btn-label:hover {
  background: var(--color-primary-soft);
  color: var(--color-primary);
}

.conv-etiquetas {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
  padding: 2px 14px 6px 56px;
  background: #fff;
}

.et-chip {
  display: inline-block;
  padding: 1px 7px;
  border-radius: 10px;
  color: #fff;
  font-size: 10px;
  font-weight: 500;
}

.contacto-overlay {
  position: fixed;
  inset: 0;
  background: rgba(16, 26, 42, 0.35);
  z-index: 1300;
  display: flex;
  justify-content: flex-end;
}

.contacto-sidebar {
  width: min(360px, 100vw);
  height: 100vh;
  background: #fff;
  display: grid;
  grid-template-rows: auto 1fr;
  border-left: 1px solid #dcead5;
  box-shadow: -10px 0 30px rgba(24, 41, 66, 0.12);
  animation: slideInRight 0.22s ease-out;
}

.contacto-header {
  padding: 14px;
  border-bottom: 1px solid #e3ece4;
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 10px;
  align-items: center;
}

.contacto-header-photo-wrap {
  position: relative;
  width: 52px;
  height: 52px;
}

.contacto-header-photo {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  object-fit: cover;
  background: #dcead5;
}

.contacto-header-status {
  position: absolute;
  left: 50%;
  bottom: -5px;
  transform: translateX(-50%);
  width: 11px;
  height: 11px;
  border-radius: 50%;
  background: #879874;
  border: 2px solid #fff;
}

.contacto-header-status.online {
  background: var(--color-primary);
}

.contacto-header-text h3 {
  margin: 0;
  font-size: 15px;
  color: #334627;
}

.contacto-header-text p {
  margin: 2px 0 0;
  font-size: 12px;
  color: #667994;
}

.contacto-close {
  border: 1px solid #cfe0ba;
  background: var(--color-primary-surface);
  border-radius: 8px;
  padding: 2px 8px;
  cursor: pointer;
  color: #50674a;
  font-size: 14px;
}

.contacto-body {
  overflow: auto;
  padding: 12px 14px 18px;
  background: var(--color-primary-surface);
  display: grid;
  gap: 8px;
}

.contacto-sidebar-agent {
  background: linear-gradient(
    180deg,
    var(--color-primary-surface) 0%,
    var(--color-primary-surface) 100%
  );
}

.contacto-header-agent {
  position: relative;
  grid-template-columns: 1fr;
  text-align: center;
  padding: 20px 16px 16px;
  border-bottom: 1px solid var(--color-primary-soft);
  background: linear-gradient(
    180deg,
    var(--color-primary-surface) 0%,
    var(--color-primary-surface) 100%
  );
}

.contacto-header-agent-contacts {
  position: relative;
  grid-template-columns: 1fr;
  padding: 18px 20px;
  border-bottom: 1px solid var(--color-primary-soft);
  background: #f3f5f8;
}

.agent-contacts-title-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
}

.agent-contacts-title-row h3 {
  margin: 0;
  font-size: 18px;
  letter-spacing: 0.5px;
  color: #566980;
}

.agent-refresh-btn {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  border: 1px solid var(--color-primary);
  background: var(--color-primary-surface);
  color: var(--color-primary);
  font-size: 18px;
  line-height: 1;
  display: grid;
  place-items: center;
  cursor: pointer;
  transition: all 0.2s ease;
}

.agent-refresh-btn:hover {
  background: #edf4e4;
  transform: rotate(18deg);
}

.contacto-close-agent {
  position: absolute;
  right: 12px;
  top: 10px;
  border: 1px solid var(--color-primary-soft);
  background: #ffffff;
  color: #6f7f66;
  font-size: 20px;
  line-height: 1;
  width: 32px;
  height: 32px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  transition: all 0.2s ease;
}

.contacto-close-agent:hover {
  background: var(--color-primary-surface);
  border-color: #c5dab9;
  color: #566b4d;
}

.contacto-header-photo-wrap-agent {
  margin: 0 auto;
  width: 120px;
  height: 120px;
  border-radius: 50%;
  padding: 3px;
  background: linear-gradient(
    160deg,
    var(--color-primary-soft) 0%,
    var(--color-primary) 100%
  );
  box-shadow: 0 8px 24px rgba(51, 78, 137, 0.18);
}

.contacto-header-text-agent h3 {
  font-size: 22px;
  font-weight: 700;
  color: #344a28;
  line-height: 1.15;
  margin-top: 12px;
}

.contacto-header-text-agent p {
  font-size: 13px;
  color: #687d5f;
  margin-top: 6px;
}

.contacto-body-agent {
  padding: 14px 14px 24px;
  background: transparent;
  gap: 12px;
}

.contacto-body-agent-contacts {
  position: relative;
  padding: 14px 12px 20px;
  background: #f3f5f8;
  display: grid;
  gap: 10px;
  align-content: start;
}

.agent-role-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid #dcead5;
  border-radius: 12px;
  color: #5f7257;
  font-size: 14px;
  font-weight: 600;
  background: #ffffff;
}

.agent-role-icon {
  font-size: 14px;
  opacity: 0.9;
}

.agent-section-title {
  color: #6f7f66;
  font-size: 11px;
  margin: 6px 4px 0;
  letter-spacing: 0.8px;
  text-transform: uppercase;
  font-weight: 700;
}

.agent-card {
  background: #ffffff;
  border: 1px solid var(--color-primary-soft);
  border-radius: 12px;
  box-shadow: 0 6px 16px rgba(34, 54, 86, 0.07);
}

.contacto-item-agent {
  background: transparent;
  border: 0;
  border-radius: 0;
  padding: 10px 12px;
  color: #5b6f55;
  font-size: 13px;
}

.contacto-item-agent strong {
  display: inline-block;
  color: #4f6646;
  min-width: 72px;
  margin-right: 6px;
  font-weight: 700;
}

.agent-info-card .contacto-item-agent + .contacto-item-agent {
  border-top: 1px solid var(--color-primary-soft);
}

.agent-status-list {
  display: grid;
  gap: 2px;
  padding: 8px;
}

.agent-status-item {
  display: flex;
  align-items: center;
  gap: 12px;
  color: #5f7257;
  font-size: 13px;
  padding: 8px;
  border-radius: 8px;
  cursor: pointer;
}

.agent-status-item:hover {
  background: var(--color-primary-surface);
}

.agent-status-item input {
  width: 16px;
  height: 16px;
  accent-color: var(--color-primary-hover);
}

.agent-actions {
  margin: 6px 0 0;
  display: grid;
  gap: 10px;
}

/* Eliminar estilos antiguos de botones de acción de agente para evitar fondo azul y permitir el estilo unificado sidepanel-btn */

.agent-contacts-list-title {
  margin: 0 2px 8px;
}

.agent-contacts-empty {
  border: 1px dashed #c5dab9;
  border-radius: 10px;
  background: #ffffff;
  color: #7d8ca1;
  padding: 14px;
  text-align: center;
  font-size: 13px;
}

.agent-contacts-list {
  display: grid;
  gap: 10px;
}

.agent-contact-card {
  display: grid;
  grid-template-columns: 54px minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  background: #f0f2f5;
  border: 1px solid #c5dab9;
  border-radius: 12px;
  padding: 10px 12px;
}

.agent-contact-avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: 20px;
  color: #ffffff;
  background: linear-gradient(
    180deg,
    var(--color-primary) 0%,
    var(--color-primary-hover) 100%
  );
}

.agent-contact-meta {
  min-width: 0;
}

.agent-contact-meta h4 {
  margin: 0;
  font-size: 16px;
  color: #3a4553;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.agent-contact-meta p {
  margin: 4px 0 0;
  font-size: 13px;
  color: #6f7680;
}

.agent-contact-state {
  display: grid;
  justify-items: center;
  gap: 6px;
  min-width: 68px;
}

.agent-contact-state-dot {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: #76808b;
  border: 4px solid #d8dde4;
  box-shadow: inset 0 0 0 6px #5e6773;
}

.agent-contact-state.online .agent-contact-state-dot {
  background: #58a82a;
  border-color: #c8e6b0;
  box-shadow: inset 0 0 0 6px #3d7a1f;
}

.agent-contact-state small {
  font-size: 10px;
  letter-spacing: 0.4px;
  color: #8a929c;
  font-weight: 700;
}

.agent-contact-state.online small {
  color: #3d8b2a;
}

.agent-floating-settings {
  position: absolute;
  right: -14px;
  top: 100px;
  width: 44px;
  height: 58px;
  border: 0;
  border-radius: 10px 0 0 10px;
  background: #7bbd37;
  color: #ffffff;
  font-size: 22px;
  display: grid;
  place-items: center;
  cursor: pointer;
  box-shadow: -6px 6px 16px rgba(51, 69, 38, 0.2);
}

.agent-floating-settings:hover {
  background: #69a92d;
}

.agent-create-form {
  display: grid;
  gap: 10px;
  padding: 12px;
}

.agent-form-field {
  display: grid;
  gap: 4px;
}

.agent-form-field span {
  font-size: 11px;
  color: #72829a;
  letter-spacing: 0.2px;
}

.agent-form-field input {
  height: 36px;
  border: 1px solid #cfe0ba;
  border-radius: 8px;
  padding: 0 10px;
  font-size: 13px;
  color: #33465f;
  background: #fbfcff;
}

.agent-form-field input:focus {
  outline: none;
  border-color: #588044;
  box-shadow: 0 0 0 3px rgba(106, 134, 243, 0.12);
}

.agent-create-actions {
  display: grid;
  gap: 8px;
  margin-top: 4px;
}

.agent-create-feedback {
  margin: 4px 2px 0;
  font-size: 12px;
  color: #4f617a;
}

.contacto-item {
  font-size: 13px;
  color: #3e5a34;
  background: #fff;
  border: 1px solid var(--color-primary-soft);
  border-radius: 10px;
  padding: 8px 10px;
}

.contacto-actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--color-primary-soft);
}

/* --- UNIFICACIÓN DE BOTONES LATERALES --- */
.sidepanel-btn {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border: 1px solid #e0e6f2;
  background: #fff;
  border-radius: 10px;
  cursor: pointer;
  font-size: 13px;
  font-family: "Inter", "Segoe UI", Arial, sans-serif;
  font-weight: 600;
  color: #22304a;
  letter-spacing: 0.7px;
  text-transform: uppercase;
  transition: all 0.18s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: none;
  outline: none;
  text-align: left;
}

.sidepanel-btn .icon {
  font-size: 18px;
  opacity: 0.82;
  display: flex;
  align-items: center;
}

.sidepanel-btn:hover {
  background: #edf4e4;
  border-color: #7eb83b;
  color: #1a4fa3;
}

.sidepanel-btn.danger {
  background: #edf4e4;
  border-color: #cfe0ba;
  color: #c41e1e;
}

.sidepanel-btn.danger:hover {
  background: #edf4e4;
  border-color: #7eb83b;
  color: #a31212;
}

.sidepanel-btn-primary {
  background: #7eb83b;
  border-color: #6aa832;
  color: #fff;
  font-weight: 600;
}

.sidepanel-btn-primary:hover {
  background: #6aa832;
  border-color: #5a9228;
  color: #fff;
}

.contacto-actions-start {
  margin-bottom: 4px;
  padding-bottom: 12px;
  border-bottom: 1px solid #e5e7eb;
}

.form-group {
  display: grid;
  gap: 4px;
  margin-bottom: 10px;
}

.form-group label {
  font-size: 12px;
  font-weight: 600;
  color: #2f4324;
}

.form-group input {
  width: 100%;
  height: 32px;
  border: 1px solid var(--color-primary-soft);
  border-radius: 6px;
  padding: 0 8px;
  font-size: 12px;
}

.form-group input:focus {
  border-color: var(--color-primary);
  outline: none;
  box-shadow: 0 0 0 3px rgba(31, 122, 255, 0.1);
}

.form-actions {
  display: flex;
  gap: 8px;
  margin-top: 16px;
}

.form-actions .action-btn {
  flex: 1;
}

.scroll-section {
  display: flex;
  flex-direction: column;
}

.historico-list,
.media-grid {
  display: grid;
  gap: 8px;
  margin-top: 12px;
}

.historico-item {
  background: var(--color-primary-surface);
  border: 1px solid var(--color-primary-soft);
  border-radius: 8px;
  padding: 10px;
  font-size: 12px;
}

.historico-item p {
  margin: 0;
}

.historico-item .timestamp {
  font-size: 11px;
  color: #999;
  margin-top: 4px;
}

.media-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
  margin-top: 12px;
}

.media-tile {
  aspect-ratio: 1;
  border: 1px solid var(--color-primary-soft);
  border-radius: 10px;
  overflow: hidden;
  background: #fff;
  padding: 0;
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.media-tile:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(46, 64, 35, 0.1);
}

.media-tile-preview {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  pointer-events: none;
}

.media-tile-fallback {
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

.media-tile-audio {
  background: linear-gradient(160deg, #f3f8ff 0%, #e8f0fb 100%);
  color: #3f5678;
}

.media-tile-icon {
  font-size: 24px;
  line-height: 1;
}

.media-tile-type {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}

.media-item {
  background: var(--color-primary-surface);
  border: 1px solid var(--color-primary-soft);
  border-radius: 8px;
  overflow: hidden;
  padding: 8px;
  text-align: center;
}

.media-item img {
  width: 100%;
  height: 80px;
  object-fit: cover;
  border-radius: 6px;
  margin-bottom: 4px;
}

.media-item p {
  margin: 0;
  font-size: 11px;
  color: #3e5a34;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.media-placeholder {
  width: 100%;
  height: 80px;
  background: var(--color-primary-soft);
  display: grid;
  place-items: center;
  border-radius: 6px;
  color: #627857;
  font-size: 12px;
  margin-bottom: 4px;
}

.loading,
.empty {
  text-align: center;
  padding: 20px 10px;
  color: #999;
  font-size: 12px;
}

@keyframes slideInRight {
  from {
    transform: translateX(100%);
  }
  to {
    transform: translateX(0);
  }
}

.interno-hint {
  margin: 0 0 8px;
  padding: 8px 10px;
  font-size: 11px;
  line-height: 1.4;
  color: #475569;
  background: #eef2ff;
  border-radius: 8px;
}

.interno-hint code {
  font-size: 10px;
}

.alertas-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin: 0 0 8px;
  padding: 8px 10px;
  border-radius: 10px;
  background: linear-gradient(135deg, #fff8f0 0%, #f0f7e8 100%);
  border: 1px solid rgba(88, 128, 68, 0.25);
}

.alertas-banner-text {
  flex: 1;
  font-size: 11px;
  line-height: 1.35;
  color: #3d4f32;
}

.alertas-banner-btn {
  flex-shrink: 0;
  border: none;
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 11px;
  font-weight: 600;
  color: #fff;
  background: linear-gradient(145deg, #6b9a52 0%, #588044 100%);
  cursor: pointer;
  box-shadow: 0 2px 6px rgba(88, 128, 68, 0.25);
}

.alertas-banner-btn:disabled {
  opacity: 0.7;
  cursor: wait;
}

.alertas-banner-btn:hover:not(:disabled) {
  filter: brightness(1.05);
}

.tipo-conv-selector {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 10px;
  padding: 10px 0 2px 0;
  margin-bottom: 6px;
}
.tipo-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  border: 1.2px solid var(--color-primary-soft);
  background: var(--color-primary-surface);
  color: #2f4324;
  border-radius: 13px;
  padding: 3.5px 12px 3.5px 9px;
  font-size: 12.2px;
  font-weight: 600;
  cursor: pointer;
  transition:
    background 0.18s,
    color 0.18s,
    border 0.18s,
    box-shadow 0.18s;
  box-shadow: 0 1.5px 6px 0 rgba(31, 122, 255, 0.05);
  letter-spacing: 0.05px;
  outline: none;
}
.tipo-btn .tipo-btn-icon {
  font-size: 13px;
}
.tipo-btn.active {
  background: var(--color-primary-soft);
  color: var(--color-primary);
  border: 1.2px solid var(--color-primary);
  box-shadow: 0 1.5px 7px 0 rgba(31, 122, 255, 0.1);
  transform: translateY(-0.5px) scale(1.025);
}
.tipo-btn:hover:not(.active),
.tipo-btn:focus-visible:not(.active) {
  background: #edf4e4;
  color: var(--color-primary-hover);
  border: 1.2px solid var(--color-primary-hover);
  box-shadow: 0 1.5px 6px 0 rgba(37, 99, 235, 0.08);
}

.tipo-btn-interno {
  gap: 5px;
  padding-right: 10px;
}

.tipo-btn-interno.has-unread:not(.active) {
  border-color: rgba(220, 90, 72, 0.45);
  background: linear-gradient(180deg, #fff8f6 0%, #f5efe8 100%);
  box-shadow:
    0 0 0 1px rgba(220, 90, 72, 0.1),
    0 2px 8px rgba(220, 90, 72, 0.12);
}

.tipo-btn-interno.has-unread.active {
  box-shadow:
    0 0 0 1px rgba(220, 90, 72, 0.2),
    0 1.5px 7px 0 rgba(31, 122, 255, 0.1);
}

.tipo-btn-icon-wrap {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.tipo-btn-icon-wrap.has-notify .tipo-btn-icon {
  transform: scale(0.96);
}

.tipo-btn-notify-halo {
  position: absolute;
  inset: -3px;
  border-radius: 50%;
  background: radial-gradient(
    circle,
    rgba(248, 113, 113, 0.55) 0%,
    rgba(248, 113, 113, 0) 68%
  );
  animation: interno-notify-halo 2.2s ease-in-out infinite;
  pointer-events: none;
}

.tipo-btn-notify-mark {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
  align-self: center;
  background: linear-gradient(145deg, #fb923c 0%, #ef4444 55%, #dc2626 100%);
  box-shadow:
    0 0 0 2px #fff,
    0 0 0 3px rgba(239, 68, 68, 0.18),
    0 2px 6px rgba(220, 38, 38, 0.35);
  animation: interno-notify-mark 2.2s ease-in-out infinite;
}

.tipo-btn-label {
  line-height: 1;
}

@keyframes interno-notify-halo {
  0%,
  100% {
    opacity: 0.55;
    transform: scale(0.92);
  }
  50% {
    opacity: 1;
    transform: scale(1.08);
  }
}

@keyframes interno-notify-mark {
  0%,
  100% {
    transform: scale(1);
    opacity: 1;
  }
  50% {
    transform: scale(1.12);
    opacity: 0.88;
  }
}

.contact-unread-dot {
  flex-shrink: 0;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  align-self: center;
  background: linear-gradient(145deg, #fb923c 0%, #ef4444 55%, #dc2626 100%);
  box-shadow:
    0 0 0 2px #fff,
    0 0 0 3px rgba(239, 68, 68, 0.15),
    0 1px 4px rgba(220, 38, 38, 0.28);
}
</style>
