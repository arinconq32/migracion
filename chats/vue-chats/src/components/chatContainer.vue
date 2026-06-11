<script setup>
import { computed, ref, watch, onMounted } from "vue";
import { storeToRefs } from "pinia";
import ConversationList from "./conversationList.vue";
import ConversationDetail from "./conversationDetail.vue";
import NotificationPanel from "./notificationPanel.vue";
import ContactOptionsModal from "./ContactOptionsModal.vue";
import { useChatStore } from "@/stores/chatStore";
import { useChatSocket } from "@/composables/useChatSocket";
import { resolveAgentIdFromSources } from "@/utils/agentId";
import {
  buildInternalConvId,
  parseInternalPeerId,
  openInternalChat,
  mapInternalMessagesForUi,
} from "@/composables/useInternalChatSocket";
import { useAgentProfile } from "@/composables/useAgentProfile";
import { cargarMensajesConversacion, getSocket, cargarMultimediaDeConversacion, cambiarConversacion, abrirChat, promoverNuevoSiHayCupo, emitSocket } from "@/composables/useSocket";
import { mostrarToast } from "@/composables/useNotificaciones";

const store = useChatStore();
const { mensajesInternosPorPeer, conversacionActivaId, internalMessagesRevision } =
  storeToRefs(store);
const agenteIdActual = resolveAgentIdFromSources();
const { sendMessage, sendInternalMessage } = useChatSocket(agenteIdActual);
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
    if (parseInternalPeerId(conversacionActivaId.value)) return;
    if (conversacionActivaId.value || !list.length) return;
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

const selectedConversationId = computed(() => conversacionActivaId.value);

const activeInternalPeerId = computed(() =>
  parseInternalPeerId(conversacionActivaId.value),
);

const currentConversation = computed(() => {
  const peerId = activeInternalPeerId.value;
  if (peerId) {
    return {
      id: buildInternalConvId(peerId),
      name: `Agente ${peerId}`,
      nombre: `Agente ${peerId}`,
      estado: "abierta",
      isInternal: true,
      peerAgentId: peerId,
      online: true,
    };
  }

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
  void internalMessagesRevision.value;
  const q = busquedaMensaje.value.trim().toLowerCase();
  const peerId = activeInternalPeerId.value;
  const source = peerId
    ? mensajesInternosPorPeer.value[peerId] || []
    : store.mensajesActivos;
  const mensajes = source.map((m) => ({
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
  const items = [...store.transferNotifications];
  if (store.totalNoLeidos > 0) {
    items.push({
      id: "unread",
      type: "info",
      text: `${store.totalNoLeidos} mensaje(s) sin leer`,
      persistent: false,
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
  const anterior = conversacionActivaId.value;
  const nextId = String(id || "").trim();
  if (!nextId) return;

  const peerId = parseInternalPeerId(nextId);
  busquedaMensaje.value = "";

  if (peerId) {
    store.selectConversation(nextId);
    openInternalChat(peerId, agenteIdActual, (res) => {
      if (res?.ok && Array.isArray(res.mensajes)) {
        store.mergeInternalMessages(
          peerId,
          mapInternalMessagesForUi(res.mensajes, agenteIdActual),
        );
      }
    });
    return;
  }

  const conv =
    store.conversaciones[nextId] ||
    store.activos.find((c) => String(c.id) === nextId) ||
    store.nuevos.find((c) => String(c.id) === nextId) ||
    store.cerrados.find((c) => String(c.id) === nextId);

  const estado = String(conv?.estado || "abierta").toLowerCase();
  store.selectConversation(nextId);

  try {
    if (estado === "nuevo" || estado === "pendiente") {
      const anteriorValido =
        anterior && String(anterior) !== nextId && !parseInternalPeerId(anterior)
          ? anterior
          : null;
      const result = await promoverNuevoSiHayCupo({
        convId: nextId,
        userId: agenteIdActual,
        conv: conv || {},
        convIdAnterior: anteriorValido,
      });
      store.upsertConversation({
        ...(conv || {}),
        id: nextId,
        estado: result.estado,
      });
    } else if (estado === "abierta") {
      if (anterior && String(anterior) !== nextId && !parseInternalPeerId(anterior)) {
        await cambiarConversacion(anterior, nextId);
      } else {
        await cambiarConversacion(null, nextId);
      }
    } else if (estado === "cerrada") {
      const resp = await abrirChat(nextId, agenteIdActual);
      const failed =
        resp?.success === false ||
        resp?.ok === false ||
        Boolean(resp?.error);
      if (failed) {
        console.error(
          "No se pudo reabrir la conversación:",
          resp?.error || resp,
        );
      } else {
        store.upsertConversation({
          ...(conv || {}),
          id: nextId,
          estado: "abierta",
        });
      }
      if (anterior && String(anterior) !== nextId) {
        await cambiarConversacion(anterior, nextId);
      } else {
        await cambiarConversacion(null, nextId);
      }
    }
  } catch (error) {
    console.error("Error al preparar conversación:", error);
  }

  await cargarMensajesDeConversacion(nextId, true);
};

const ensureAgentCanSend = () => {
  if (store.agentPuedeEnviarMensajes) return true;
  mostrarToast(store.mensajeBloqueoPorEstadoAgente(), "warning");
  return false;
};

const onSendMessage = (text) => {
  if (!ensureAgentCanSend()) return;
  if (!text || !conversacionActivaId.value) return;
  const peerId = activeInternalPeerId.value;
  if (peerId) {
    sendInternalMessage(peerId, text);
    return;
  }
  sendMessage(conversacionActivaId.value, text);
};

const onUpdateSearchTerm = (value) => {
  busquedaMensaje.value = String(value || "");
};

const onUpdateConversationSearchTerm = (value) => {
  busquedaConversacion.value = String(value || "");
};

const onAgentStatusChange = (estado) => {
  const nextEstado = String(estado || "Activo").trim() || "Activo";
  const previousEstado = store.agentEstadoConexion;
  store.setAgentEstadoConexion(nextEstado);
  emitSocket("cambiar_estado_agente", { estado: nextEstado }, (response) => {
    if (response?.ok === false) {
      store.setAgentEstadoConexion(previousEstado);
      mostrarToast(
        response?.error || "No se pudo actualizar el estado del agente",
        "error",
      );
    }
  });
};

const onCloseNotification = (id) => {
  const normalizedId = String(id || "").trim();
  if (!normalizedId) return;
  if (dismissedNotificationIds.value.includes(normalizedId)) return;
  dismissedNotificationIds.value = [
    ...dismissedNotificationIds.value,
    normalizedId,
  ];
  store.dismissTransferNotification(normalizedId);
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
        @agent-status-change="onAgentStatusChange"
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
