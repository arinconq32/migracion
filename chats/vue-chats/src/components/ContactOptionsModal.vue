<template>
  <div v-if="visible" class="modal-backdrop">
    <div class="modal-content">
      <h3>Opciones de contacto</h3>
      <div class="contact-info">
        <span>{{ contacto?.nombre }}</span>
        <span v-if="contacto?.destacado" class="badge badge-warning"
          >Destacado</span
        >
        <span v-if="contacto?.bloqueado" class="badge badge-danger"
          >Bloqueado</span
        >
      </div>
      <ul class="modal-actions">
        <li>
          <button @click="toggleDestacar" :disabled="contacto?.destacado">
            Destacar
          </button>
        </li>
        <li>
          <button @click="toggleBloquear" :disabled="contacto?.bloqueado">
            Bloquear
          </button>
        </li>
        <li>
          <button
            @click="normalizarContacto"
            :disabled="!contacto?.destacado && !contacto?.bloqueado"
          >
            Normalizar
          </button>
        </li>
        <li>
          <button @click="verHistorico">Ver histórico</button>
        </li>
        <li>
          <button @click="verMultimedia">Ver multimedia</button>
        </li>
        <li>
          <button @click="editarContacto">Editar</button>
        </li>
        <li>
          <button @click="$emit('close')">Cerrar</button>
        </li>
      </ul>
    </div>
  </div>
</template>

<script>
export default {
  name: "ContactOptionsModal",
  props: {
    visible: { type: Boolean, required: true },
    contacto: { type: Object, required: true },
  },
  emits: [
    "close",
    "update-contact",
    "show-historico",
    "show-multimedia",
    "edit-contact",
  ],
  methods: {
    toggleDestacar() {
      // Marca como destacado
      this.$emit("update-contact", {
        ...this.contacto,
        destacado: true,
        bloqueado: false,
      });
    },
    toggleBloquear() {
      // Marca como bloqueado
      this.$emit("update-contact", {
        ...this.contacto,
        bloqueado: true,
        destacado: false,
      });
    },
    normalizarContacto() {
      // Quita destacado y bloqueado
      this.$emit("update-contact", {
        ...this.contacto,
        destacado: false,
        bloqueado: false,
      });
    },
    verHistorico() {
      this.$emit("show-historico", this.contacto);
    },
    verMultimedia() {
      this.$emit("show-multimedia", this.contacto);
    },
    editarContacto() {
      this.$emit("edit-contact", this.contacto);
    },
  },
};
</script>

<style scoped>
.modal-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.modal-content {
  background: #fff;
  padding: 2rem;
  border-radius: 8px;
  min-width: 320px;
}
.contact-info {
  margin-bottom: 1rem;
}
.badge {
  margin-left: 0.5rem;
  padding: 0.2em 0.5em;
  border-radius: 4px;
  font-size: 0.9em;
}
.badge-warning {
  background: #edf4e4;
  color: #588044;
}
.badge-danger {
  background: #dcead5;
  color: #588044;
}
.modal-actions {
  list-style: none;
  padding: 0;
}
.modal-actions li {
  margin-bottom: 0.5rem;
}
.modal-actions button {
  width: 100%;
  padding: 0.5em 1em;
  border: none;
  border-radius: 4px;
  background: #588044;
  color: #fff;
  cursor: pointer;
  transition: background 0.2s;
}
.modal-actions button:hover {
  background: #7eb83b;
}
.modal-actions button:disabled {
  background: #b8ccb9;
  cursor: not-allowed;
}
</style>
