/**
 * Composable para manejar notificaciones del navegador y toasts
 */

import { ref } from 'vue';

/**
 * Verifica si el navegador soporta notificaciones
 */
export function navegadorSoportaNotificaciones() {
  return typeof window !== 'undefined' && 'Notification' in window;
}

/**
 * Verifica si ya hay permiso para mostrar notificaciones
 */
export function tienePermisoNotificacionConcedido() {
  return (
    navegadorSoportaNotificaciones() && 
    Notification.permission === 'granted'
  );
}

/**
 * Solicita permiso para mostrar notificaciones del sistema
 */
export function solicitarPermisoNotificacionSistema() {
  if (!navegadorSoportaNotificaciones()) {
    return;
  }

  if (Notification.permission !== 'default') {
    return;
  }

  Notification.requestPermission().catch((error) => {
    console.warn('No se pudo solicitar permiso de notificaciones:', error);
  });
}

/**
 * Muestra una notificación de mensaje entrante
 */
export function notificarMensajeEntrante({ 
  titulo = 'Nueva alerta', 
  cuerpo = 'Tienes un nuevo mensaje', 
  tag = 'chat-alerta',
  mostrarToast = true, 
  onClick = null 
} = {}) {
  
  const tituloSeguro = String(titulo || 'Nueva alerta').trim();
  const cuerpoSeguro = String(cuerpo || 'Tienes un nuevo mensaje').trim().slice(0, 120);

  if (mostrarToast && typeof showToast === 'function') {
    showToast(`${tituloSeguro}: ${cuerpoSeguro}`, 'info');
  }

  // Solo mostrar notificación del sistema si:
  // 1. Tenemos permiso
  // 2. La pestaña NO está activa
  if (!tienePermisoNotificacionConcedido() || document.hidden !== true) {
    return;
  }

  try {
    const notification = new Notification(tituloSeguro, {
      body: cuerpoSeguro,
      icon: 'assets/img/avatars/1.png',
      tag: String(tag || 'chat-alerta'),
      renotify: true,
    });

    notification.onclick = () => {
      window.focus();
      notification.close();
      if (typeof onClick === 'function') {
        onClick();
      }
    };
  } catch (error) {
    console.warn('No se pudo mostrar notificación del navegador:', error);
  }
}

/**
 * Muestra un toast con Bootstrap
 */
export function mostrarToast(message, type = 'info') {
  let toastContainer = document.getElementById('toast-container');

  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'toast-container';
    toastContainer.className = 'toast-container position-fixed top-0 end-0 p-3';
    toastContainer.style.zIndex = '9999';
    document.body.appendChild(toastContainer);
  }

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.setAttribute('role', 'alert');
  toast.setAttribute('aria-live', 'assertive');
  toast.setAttribute('aria-atomic', 'true');

  const types = {
    success: { icon: 'bx-check-circle', colorHex: '#588044', title: 'Éxito' },
    error: { icon: 'bx-error-circle', colorHex: '#588044', title: 'Error' },
    warning: { icon: 'bx-error', colorHex: '#7eb83b', title: 'Advertencia' },
    info: { icon: 'bx-info-circle', colorHex: '#7eb83b', title: 'Información' },
  };

  const config = types[type] || types.info;

  toast.innerHTML = `
    <div class="toast-header py-2">
      <i class='bx ${config.icon} me-2' style='font-size: 1rem; color: ${config.colorHex};'></i>
      <strong class="me-auto" style="font-size: 0.875rem;">${config.title}</strong>
      <button type="button" class="btn-close btn-close-sm" data-bs-dismiss="toast" aria-label="Close"></button>
    </div>
    <div class="toast-body pt-2 pb-4" style="font-size: 0.875rem; white-space: normal; word-wrap: break-word;">
      ${message}
    </div>
  `;

  toastContainer.appendChild(toast);

  const bsToast = new bootstrap.Toast(toast, {
    autohide: true,
    delay: 5000,
  });

  bsToast.show();

  toast.addEventListener('hidden.bs.toast', () => {
    toast.remove();
    if (toastContainer.children.length === 0) {
      toastContainer.remove();
    }
  });

  console.log('Toast:', message);
}

/**
 * Muestra un toast persistente con botones de acción
 */
export function mostrarToastPermanente(
  message,
  type = 'info',
  onAccept = null,
  onCancel = null
) {
  let toastContainer = document.getElementById('toast-container-bottom');

  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'toast-container-bottom';
    toastContainer.className = 'toast-container position-fixed bottom-0 end-0 p-3';
    toastContainer.style.zIndex = '9999';
    document.body.appendChild(toastContainer);
  }

  const toast = document.createElement('div');
  toast.className = 'toast toast-persistent show';
  toast.setAttribute('role', 'alert');
  toast.setAttribute('aria-live', 'assertive');
  toast.setAttribute('aria-atomic', 'true');

  const types = {
    success: {
      icon: 'bx-check-circle',
      colorHex: '#588044',
      title: 'Éxito',
      bgColor: '#edf4e4',
      borderColor: '#7eb83b',
    },
    error: {
      icon: 'bx-error-circle',
      colorHex: '#588044',
      title: 'Error',
      bgColor: '#e3ece4',
      borderColor: '#588044',
    },
    warning: {
      icon: 'bx-error',
      colorHex: '#7eb83b',
      title: 'Advertencia',
      bgColor: '#f3f9eb',
      borderColor: '#7eb83b',
    },
    info: {
      icon: 'bx-info-circle',
      colorHex: '#7eb83b',
      title: 'Información',
      bgColor: '#edf4e4',
      borderColor: '#7eb83b',
    },
  };

  const config = types[type] || types.info;

  const buttonsHTML =
    onAccept || onCancel
      ? `
    <div class="toast-actions" style="display: flex; gap: 10px; margin-top: 15px; justify-content: flex-end;">
      ${
        onCancel
          ? `
        <button class="btn btn-sm btn-secondary toast-cancel-btn" style="padding: 6px 16px; border-radius: 6px;">
          Cancelar
        </button>
      `
          : ''
      }
      ${
        onAccept
          ? `
        <button class="btn btn-sm btn-primary toast-accept-btn" style="padding: 6px 16px; border-radius: 6px; background: #588044; border-color: #588044;">
          Aceptar
        </button>
      `
          : ''
      }
    </div>
  `
      : '';

  toast.innerHTML = `
    <div class="toast-header py-2" style="background-color: ${config.bgColor}; border-bottom: 2px solid ${config.borderColor};">
      <i class='bx ${config.icon} me-2 pulse-icon' style='font-size: 1.2rem; color: ${config.colorHex};'></i>
      <strong class="me-auto" style="font-size: 0.875rem;">${config.title}</strong>
      <button type="button" class="btn-close btn-close-sm toast-close-btn" aria-label="Close"></button>
    </div>
    <div class="toast-body pt-2 pb-3" style="font-size: 0.875rem; white-space: normal; word-wrap: break-word; background-color: white;">
      ${message}
      ${buttonsHTML}
    </div>
  `;

  toast.style.animation = 'slideInRight 0.4s ease-out';
  toastContainer.appendChild(toast);

  const cerrarToast = () => {
    toast.style.animation = 'slideOutRight 0.3s ease-in';
    setTimeout(() => {
      toast.remove();
      if (toastContainer.children.length === 0) {
        toastContainer.remove();
      }
    }, 300);
  };

  const acceptBtn = toast.querySelector('.toast-accept-btn');
  const cancelBtn = toast.querySelector('.toast-cancel-btn');
  const closeBtn = toast.querySelector('.toast-close-btn');

  if (acceptBtn && onAccept) {
    acceptBtn.onclick = () => {
      onAccept();
      cerrarToast();
    };
  }

  if (cancelBtn && onCancel) {
    cancelBtn.onclick = () => {
      onCancel();
      cerrarToast();
    };
  }

  closeBtn.onclick = cerrarToast;

  console.log('Toast persistente:', message);
  return toast;
}

/**
 * Limpia un toast de soporte por ID
 */
export function limpiarToastSoporte(
  from,
  { mostrarAviso = false, mensaje = '' } = {}
) {
  const key = String(from || '').trim();
  if (!key) return;

  // Aquí iría la lógica para mantener registro de toasts activos
  // Por ahora es una función de referencia

  if (mostrarAviso) {
    mostrarToast(mensaje || 'Solicitud expirada por tiempo', 'warning');
  }
}

/**
 * Solicita permiso de notificación con un evento de usuario
 * (necesario en navegadores modernos)
 */
export function setupNotificacionesConPermiso() {
  // Solicitar permiso tras la primera interacción
  document.addEventListener(
    'click',
    solicitarPermisoNotificacionSistema,
    { once: true }
  );
  document.addEventListener(
    'keydown',
    solicitarPermisoNotificacionSistema,
    { once: true }
  );
}

export default {
  navegadorSoportaNotificaciones,
  tienePermisoNotificacionConcedido,
  solicitarPermisoNotificacionSistema,
  notificarMensajeEntrante,
  mostrarToast,
  mostrarToastPermanente,
  limpiarToastSoporte,
  setupNotificacionesConPermiso,
};
