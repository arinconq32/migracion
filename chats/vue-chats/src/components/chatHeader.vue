<script setup>
defineProps({
  avatarSrc: {
    type: String,
    default: "",
  },
  online: {
    type: Boolean,
    default: false,
  },
  title: {
    type: String,
    default: "Sin conversacion",
  },
  subtitle: {
    type: String,
    default: "Selecciona un chat para comenzar",
  },
  showCloseMenu: {
    type: Boolean,
    default: false,
  },
  featured: {
    type: Boolean,
    default: false,
  },
});

defineEmits([
  "phone",
  "history",
  "search",
  "close-menu",
  "open-contact-profile",
]);
</script>

<template>
  <header class="chat-header" :class="{ 'chat-header-featured': featured }">
    <div class="identity">
      <button
        type="button"
        class="header-avatar-btn"
        :class="{ 'header-avatar-btn-featured': featured }"
        :title="`Ver perfil de ${title}`"
        @click="$emit('open-contact-profile')"
      >
        <div class="header-avatar-wrap">
          <img
            v-if="avatarSrc"
            class="header-avatar"
            :src="avatarSrc"
            :alt="title"
          />
          <div v-else class="header-avatar header-avatar-fallback">
            {{ title.slice(0, 1).toUpperCase() }}
          </div>
          <span class="header-status-dot" :class="{ online }"></span>
        </div>
      </button>
      <div class="header-text">
        <div class="title-row">
          <div class="title">{{ title }}</div>
          <span v-if="featured" class="header-star-badge" aria-label="Destacado">
            <span class="header-star-icon">★</span>
          </span>
        </div>
        <div class="subtitle">{{ subtitle }}</div>
      </div>
    </div>
    <div class="actions">
      <button
        type="button"
        class="icon-btn"
        title="Buscar"
        @click="$emit('search')"
      >
        🔍
      </button>
      <button
        type="button"
        class="icon-btn"
        title="Telefono"
        @click="$emit('phone')"
      >
        📞
      </button>
      <button
        type="button"
        class="icon-btn"
        title="Historial"
        @click="$emit('history')"
      >
        🕘
      </button>
      <button
        v-if="showCloseMenu"
        type="button"
        class="icon-btn icon-btn-dots"
        title="Cerrar chat"
        aria-label="Cerrar chat"
        @click="$emit('close-menu')"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="5" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="12" cy="19" r="1.8" />
        </svg>
      </button>
    </div>
  </header>
</template>

<style scoped>
.chat-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid #dce9ca;
  background: #fff;
  transition:
    background 0.2s ease,
    border-color 0.2s ease,
    box-shadow 0.2s ease;
}

.chat-header-featured {
  background: linear-gradient(180deg, #fffbeb 0%, #ffffff 100%);
  border-bottom-color: rgba(251, 191, 36, 0.35);
  box-shadow: inset 0 3px 0 0 #f59e0b;
}

.header-text {
  min-width: 0;
}

.title-row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.header-star-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  flex-shrink: 0;
  background: linear-gradient(145deg, #fde047 0%, #f59e0b 100%);
  box-shadow:
    0 2px 8px rgba(245, 158, 11, 0.35),
    inset 0 1px 0 rgba(255, 255, 255, 0.55);
}

.header-star-icon {
  color: #fff;
  font-size: 12px;
  line-height: 1;
  text-shadow: 0 1px 2px rgba(146, 64, 14, 0.35);
}

.header-avatar-btn-featured .header-avatar,
.header-avatar-btn-featured .header-avatar-fallback {
  box-shadow:
    0 0 0 2px #fff,
    0 0 0 3px rgba(251, 191, 36, 0.55);
}

.identity {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.header-avatar-wrap {
  position: relative;
  width: 38px;
  height: 38px;
  flex-shrink: 0;
}

.header-avatar-btn {
  border: 0;
  background: transparent;
  padding: 0;
  border-radius: 50%;
  cursor: pointer;
}

.header-avatar-btn:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

.header-avatar {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  object-fit: cover;
  background: var(--color-primary-soft);
  display: block;
}

.header-avatar-fallback {
  display: grid;
  place-items: center;
  font-size: 13px;
  font-weight: 700;
  color: #334627;
}

.header-status-dot {
  position: absolute;
  right: -1px;
  bottom: 2px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--color-primary);
  border: 2px solid #fff;
}

.header-status-dot.online {
  background: var(--color-primary);
}

.title {
  font-size: 15px;
  font-weight: 700;
  color: #334627;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.subtitle {
  font-size: 12px;
  color: #5f7257;
}

.actions {
  display: flex;
  gap: 8px;
}

.actions button {
  border: 1px solid #cfe0ba;
  background: var(--color-primary-surface);
  color: #2f4a1f;
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 12px;
  cursor: pointer;
}

.icon-btn {
  min-width: 36px;
  height: 32px;
  display: grid;
  place-items: center;
  padding: 0;
  font-size: 16px;
}

.icon-btn-dots svg {
  width: 18px;
  height: 18px;
  fill: currentColor;
}
</style>
