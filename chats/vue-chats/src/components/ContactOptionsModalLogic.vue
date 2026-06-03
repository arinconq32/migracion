<script setup>
import { ref } from "vue";
import { useChatStore } from "@/stores/chatStore";
import { getSocket } from "@/composables/useSocket";
import ContactOptionsModal from "./ContactOptionsModal.vue";

const store = useChatStore();
const socket = getSocket();

const modalVisible = ref(false);
const contactoActual = ref(null);
const multimediaData = ref(null);
const multimediaModalVisible = ref(false);

function abrirModalOpcionesContacto(contacto) {
  contactoActual.value = contacto;
  modalVisible.value = true;
}

function actualizarContacto(contacto) {
  // Decide la acción según los flags del contacto
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

function mostrarMultimedia(contacto) {
  const multimediaId = contacto?.id || contacto;
  socket.emit("obtener_informacion_multimedia", multimediaId, (respuesta) => {
    multimediaData.value = respuesta.multimedia;
    multimediaModalVisible.value = true;
  });
}

function abrirEditorContacto(contacto) {
  // Aquí puedes abrir un modal de edición
  alert("Editar contacto: " + contacto.nombre);
}
</script>

<template>
  <ContactOptionsModal
    :visible="modalVisible"
    :contacto="contactoActual"
    @close="modalVisible = false"
    @update-contact="actualizarContacto"
    @show-historico="mostrarHistorico"
    @show-multimedia="mostrarMultimedia"
    @edit-contact="abrirEditorContacto"
  />
  <!-- Aquí puedes agregar el modal de multimedia si lo deseas -->
</template>
