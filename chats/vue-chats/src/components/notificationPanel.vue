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
    <div
      v-for="item in items"
      :key="item.id"
      class="toast"
      :class="item.type"
      role="alert"
    >
      <div class="toast-content">
        <p v-if="item.title" class="toast-title">{{ item.title }}</p>
        <p class="toast-text">{{ item.text }}</p>
      </div>
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
  min-width: 280px;
  max-width: 360px;
  background: #fff;
  border: 1px solid #d4e4bf;
  color: #334627;
  border-left: 4px solid var(--color-primary);
  padding: 12px 10px 12px 14px;
  border-radius: 10px;
  box-shadow: 0 8px 22px rgba(25, 42, 70, 0.14);
  font-size: 13px;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.toast-content {
  flex: 1;
  min-width: 0;
}

.toast-title {
  margin: 0 0 4px;
  font-size: 13px;
  font-weight: 700;
  color: #24351d;
}

.toast-text {
  margin: 0;
  line-height: 1.45;
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

.toast.transfer-out {
  border-left-color: #d97706;
  background: #fffaf0;
}

.toast.transfer-in {
  border-left-color: #2563eb;
  background: #f0f7ff;
}
</style>


