<script setup>
import { computed, ref, watch, onMounted } from "vue";
import ConversationList from "./conversationList.vue";
import ConversationDetail from "./conversationDetail.vue";
import NotificationPanel from "./notificationPanel.vue";
import ContactOptionsModal from "./ContactOptionsModal.vue";
import { useChatStore } from "@/stores/chatStore";
import { useChatSocket } from "@/composables/useChatSocket";
import { resolveAgentIdFromSources } from "@/utils/agentId";
import { useAgentProfile } from "@/composables/useAgentProfile";
import { cargarMensajesConversacion, getSocket, cargarMultimediaDeConversacion, cambiarConversacion } from "@/composables/useSocket";

const store = useChatStore();
const agenteIdActual = resolveAgentIdFromSources();
const { sendMessage } = useChatSocket(agenteIdActual);
const { agentProfile, loadAgentProfile } = useAgentProfile();

onMounted(() => {
  loadAgentProfile();
});
const busquedaConversacion = ref("");
const busquedaMensaje = ref("");
const dismissedNotificationIds = ref([]);

// Modal de opciones de contacto
const modalVisible = ref(false);
const contactoActual = ref(null);
const socket = getSocket();
const multimediaData = ref(null);
const multimediaModalVisible = ref(false);
const cargasEnCurso = new Set();

async function cargarMensajesDeConversacion(convId, force = false) {
  const id = String(convId || "").trim();
  if (!id) return;

  const mensajesGuardados = Array.isArray(store.mensajesPorConv?.[id])
    ? store.mensajesPorConv[id].length
    : 0;
  if (!force && mensajesGuardados > 0) return;
  if (cargasEnCurso.has(id)) return;

  try {
    cargasEnCurso.add(id);
    const mensajes = await cargarMensajesConversacion(id);
    store.setConversationMessages(id, Array.isArray(mensajes) ? mensajes : []);
  } catch (error) {
    console.error(`Error cargando mensajes para ${id}:`, error);
  } finally {
    cargasEnCurso.delete(id);
  }
}

function abrirModalOpcionesContacto(contacto) {
  contactoActual.value = contacto;
  modalVisible.value = true;
}

function actualizarContacto(contacto) {
  let flag = "normal";
  if (contacto.destacado) flag = "destacado";
  else if (contacto.bloqueado) flag = "bloqueado";
  marcarContacto(contacto, flag);
}

function marcarContacto(contacto, flag) {
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
}

function mostrarHistorico(contacto) {
  // Aquí puedes abrir un modal o navegar a la vista de histórico
  alert("Mostrar histórico de: " + contacto.nombre);
}

async function mostrarMultimedia(contacto) {
  const convId = String(contacto?.id || contacto || "").trim();
  if (!convId) return;
  const mensajesLocales = Array.isArray(store.mensajesPorConv?.[convId])
    ? store.mensajesPorConv[convId]
    : [];
  multimediaData.value = await cargarMultimediaDeConversacion(
    convId,
    mensajesLocales,
  );
  multimediaModalVisible.value = true;
}

function abrirEditorContacto(contacto) {
  // Aquí puedes abrir un modal de edición
  alert("Editar contacto: " + contacto.nombre);
}

// onMounted(() => {
//   if (!store.initialized) {
//     // Datos de prueba eliminados para mostrar solo conversaciones reales
//   }
// });

const conversations = computed(() => [
  ...store.activos.map((c) => ({ ...c, name: c.nombre || c.name, estado: "abierta" })),
  ...store.nuevos.map((c) => ({ ...c, name: c.nombre || c.name, estado: "nuevo" })),
  ...store.cerrados.map((c) => ({ ...c, name: c.nombre || c.name, estado: "cerrada" })),
]);

watch(
  conversations,
  async (list) => {
    if (store.conversacionActivaId || !list.length) return;
    const primeraId = String(list[0].id || "").trim();
    if (!primeraId) return;
    store.selectConversation(primeraId);
    cambiarConversacion(null, primeraId).catch(() => {});
    await cargarMensajesDeConversacion(primeraId, true);
  },
  { immediate: true },
);

const conversationsFiltradas = computed(() => {
  const q = busquedaConversacion.value.trim().toLowerCase();
  if (!q) return conversations.value;
  return conversations.value.filter((c) => {
    const nombre = String(c.name || c.nombre || "").toLowerCase();
    const ultimo = String(c.lastMessage || "").toLowerCase();
    return nombre.includes(q) || ultimo.includes(q);
  });
});

const selectedConversationId = computed(() => store.conversacionActivaId);

const currentConversation = computed(() => {
  const conv = store.conversacionActiva;
  if (!conv) return null;
  const estado = String(
    conv.estado ?? conv.status ?? conv.metadata?.estado ?? "abierta",
  )
    .toLowerCase()
    .trim();
  return {
    ...conv,
    name: conv.nombre || conv.name,
    estado,
  };
});

const currentMessages = computed(() => {
  const q = busquedaMensaje.value.trim().toLowerCase();
  const mensajes = store.mensajesActivos.map((m) => ({
    ...m,
    from: m.emisor === "agente" || m.emisor === "agent" ? "agent" : "contact",
  }));
  if (!q) return mensajes;
  return mensajes.filter((m) => {
    const texto = String(m.text || m.mensaje || "").toLowerCase();
    return texto.includes(q);
  });
});

const notifications = computed(() => {
  const items = [];
  if (store.totalNoLeidos > 0) {
    items.push({
      id: "unread",
      type: "info",
      text: `${store.totalNoLeidos} mensaje(s) sin leer`,
    });
  }
  if (store.initialized) {
    items.push({
      id: "connected",
      type: "success",
      text: "Conectado al servidor",
    });
  }
  return items;
});

const visibleNotifications = computed(() =>
  notifications.value.filter(
    (item) => !dismissedNotificationIds.value.includes(item.id),
  ),
);

const agenteActual = computed(() => {
  const profile = agentProfile.value;
  const nombre = String(
    profile?.nombre ||
      window.AGENT_NAME ||
      window.AGENTE_NOMBRE ||
      sessionStorage.getItem("agentName") ||
      sessionStorage.getItem("nombreAgente") ||
      localStorage.getItem("agentName") ||
      localStorage.getItem("nombreAgente") ||
      "Agente",
  ).trim();
  const fotoPerfil = String(
    window.AGENT_AVATAR ||
      window.AGENTE_FOTO ||
      sessionStorage.getItem("agentAvatar") ||
      sessionStorage.getItem("fotoAgente") ||
      localStorage.getItem("agentAvatar") ||
      localStorage.getItem("fotoAgente") ||
      "",
  ).trim();
  const online = Boolean(store.initialized);
  const perfil = String(
    window.AGENT_PROFILE ||
      window.AGENTE_PERFIL ||
      sessionStorage.getItem("agentProfile") ||
      sessionStorage.getItem("perfilAgente") ||
      localStorage.getItem("agentProfile") ||
      localStorage.getItem("perfilAgente") ||
      "Asesor",
  ).trim();
  const usuario = String(
    profile?.usuario ||
      window.AGENT_USER ||
      window.AGENTE_USUARIO ||
      sessionStorage.getItem("agentUser") ||
      sessionStorage.getItem("usuarioAgente") ||
      localStorage.getItem("agentUser") ||
      localStorage.getItem("usuarioAgente") ||
      nombre,
  ).trim();
  const correo = String(
    window.AGENT_EMAIL ||
      window.AGENTE_CORREO ||
      sessionStorage.getItem("agentEmail") ||
      sessionStorage.getItem("correoAgente") ||
      localStorage.getItem("agentEmail") ||
      localStorage.getItem("correoAgente") ||
      "",
  ).trim();
  const extension = String(
    profile?.extension ||
      window.AGENT_EXTENSION ||
      window.sipUsername ||
      sessionStorage.getItem("sipUsername") ||
      localStorage.getItem("sipUsername") ||
      "",
  ).trim();
  return {
    nombre,
    fotoPerfil,
    online,
    estado: online ? "En linea" : "Desconectado",
    perfil,
    usuario,
    correo,
    extension,
  };
});

const onSelectConversation = async (id) => {
  const anterior = store.conversacionActivaId;
  const nextId = String(id || "").trim();
  if (!nextId) return;

  store.selectConversation(nextId);
  busquedaMensaje.value = "";

  const flushPromise =
    anterior && String(anterior) !== nextId
      ? cambiarConversacion(anterior, nextId)
      : cambiarConversacion(null, nextId);
  flushPromise.catch(() => {});

  await cargarMensajesDeConversacion(nextId, true);
};

const onSendMessage = (text) => {
  if (!text || !store.conversacionActivaId) return;
  sendMessage(store.conversacionActivaId, text);
};

const onUpdateSearchTerm = (value) => {
  busquedaMensaje.value = String(value || "");
};

const onUpdateConversationSearchTerm = (value) => {
  busquedaConversacion.value = String(value || "");
};

const onCloseNotification = (id) => {
  const normalizedId = String(id || "").trim();
  if (!normalizedId) return;
  if (dismissedNotificationIds.value.includes(normalizedId)) return;
  dismissedNotificationIds.value = [
    ...dismissedNotificationIds.value,
    normalizedId,
  ];
};
</script>

<template>
  <div class="chat-layout">
    <aside class="left-panel">
      <ConversationList
        :conversations="conversationsFiltradas"
        :selected-id="selectedConversationId"
        :search-term="busquedaConversacion"
        :agent-info="agenteActual"
        @select="onSelectConversation"
        @update-search-term="onUpdateConversationSearchTerm"
      />
    </aside>

    <section class="main-panel">
      <ConversationDetail
        :conversation="currentConversation"
        :messages="currentMessages"
        :search-term="busquedaMensaje"
        @update-search-term="onUpdateSearchTerm"
        @send-message="onSendMessage"
        @open-contact-options="abrirModalOpcionesContacto(currentConversation)"
      />
    </section>

    <ContactOptionsModal
      :visible="modalVisible"
      :contacto="contactoActual"
      @close="modalVisible = false"
      @update-contact="actualizarContacto"
      @show-historico="mostrarHistorico"
      @show-multimedia="mostrarMultimedia"
      @edit-contact="abrirEditorContacto"
    />

    <NotificationPanel
      :items="visibleNotifications"
      @close="onCloseNotification"
    />
  </div>
</template>

<style scoped>
.chat-layout {
  display: grid;
  grid-template-columns: 320px 1fr;
  gap: 16px;
  height: 100vh;
  width: 100%;
  margin: 0;
  padding: 12px;
  background: linear-gradient(160deg, #f4f9ec 0%, #e8f3da 100%);
  overflow: hidden;
}

.left-panel,
.main-panel {
  background: #ffffff;
  border: 1px solid #d4e4bf;
  border-radius: 14px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

@media (max-width: 900px) {
  .chat-layout {
    grid-template-columns: 1fr;
    grid-template-rows: 320px 1fr;
    min-height: 100vh;
  }
}
</style>
