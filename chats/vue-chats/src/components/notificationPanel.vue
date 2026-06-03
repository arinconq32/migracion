<script setup>
defineProps({
  items: {
    type: Array,
    default: () => [],
  },
});

const emit = defineEmits(["close"]);

const closeItem = (id) => {
  emit("close", id);
};
</script>

<template>
  <div class="notification-panel">
    <div v-for="item in items" :key="item.id" class="toast" :class="item.type">
      <span class="toast-text">{{ item.text }}</span>
      <button
        type="button"
        class="toast-close"
        aria-label="Cerrar notificacion"
        @click="closeItem(item.id)"
      >
        ✕
      </button>
    </div>
  </div>
</template>

<style scoped>
.notification-panel {
  position: fixed;
  right: 20px;
  bottom: 20px;
  display: grid;
  gap: 8px;
  z-index: 30;
}

.toast {
  min-width: 260px;
  max-width: 320px;
  background: #fff;
  border: 1px solid #d4e4bf;
  color: #334627;
  border-left: 4px solid var(--color-primary);
  padding: 10px 8px 10px 12px;
  border-radius: 10px;
  box-shadow: 0 6px 18px rgba(25, 42, 70, 0.12);
  font-size: 13px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.toast-text {
  flex: 1;
  min-width: 0;
}

.toast-close {
  border: 0;
  background: transparent;
  color: #5f7257;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  cursor: pointer;
  line-height: 1;
  font-size: 14px;
  display: grid;
  place-items: center;
}

.toast-close:hover {
  background: var(--color-primary-surface);
  color: #334627;
}

.toast.success {
  border-left-color: var(--color-primary);
}

.toast.info {
  border-left-color: var(--color-primary);
}
</style>


