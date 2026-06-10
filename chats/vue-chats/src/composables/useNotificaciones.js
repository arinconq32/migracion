/**
 * Composable para manejar notificaciones del navegador y toasts
 */

export const CHAT_NOTIFY_MESSAGE_TYPE = "omnicanal-chat-notify";

let audioCtx = null;
let audioInicializado = false;
let dingAudioEl = null;
let sonidoDesbloqueado = false;
let beepDataUriCache = null;

function buildBeepDataUri() {
  if (beepDataUriCache) return beepDataUriCache;
  const sampleRate = 22050;
  const freq = 880;
  const duration = 0.16;
  const samples = Math.floor(sampleRate * duration);
  const dataSize = samples * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeStr = (offset, str) => {
    for (let i = 0; i < str.length; i += 1) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);
  for (let i = 0; i < samples; i += 1) {
    const t = i / sampleRate;
    const fade = 1 - t / duration;
    const amp = Math.sin(2 * Math.PI * freq * t) * fade * 0.38;
    view.setInt16(44 + i * 2, amp * 32767, true);
  }
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  beepDataUriCache = `data:audio/wav;base64,${btoa(binary)}`;
  return beepDataUriCache;
}

function getNotificationIcon() {
  try {
    const base = String(import.meta.env.BASE_URL || "/").replace(/\/?$/, "/");
    return new URL("favicon.ico", `${window.location.origin}${base}`).href;
  } catch {
    return undefined;
  }
}

export function estaEnIframe() {
  try {
    return typeof window !== "undefined" && window.parent !== window;
  } catch {
    return false;
  }
}

export function estadoPermisoNotificacion() {
  if (!navegadorSoportaNotificaciones()) return "unsupported";
  return Notification.permission;
}

export function alertasEstanActivas() {
  return (
    sonidoDesbloqueado &&
    (tienePermisoNotificacionConcedido() || estadoPermisoNotificacion() === "denied")
  );
}

/** Desbloquea audio sin reproducir sonido (requiere gesto del usuario antes). */
export async function unlockAudioContext() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (Ctx) {
      if (!audioCtx) audioCtx = new Ctx();
      if (audioCtx.state === "suspended") await audioCtx.resume();
      if (audioCtx.state === "running") sonidoDesbloqueado = true;
    }
    if (!dingAudioEl) {
      dingAudioEl = new Audio();
      dingAudioEl.preload = "auto";
      dingAudioEl.volume = 0.4;
      dingAudioEl.src = buildBeepDataUri();
    }
    sonidoDesbloqueado = true;
  } catch {
    /* ignore */
  }
}

function parentPuedeMostrarNotificaciones() {
  if (!estaEnIframe()) return false;
  try {
    return (
      window.parent &&
      "Notification" in window.parent &&
      window.parent.Notification.permission === "granted"
    );
  } catch {
    return false;
  }
}

async function reproducirSonidoWebAudio() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return false;
  if (!audioCtx) audioCtx = new Ctx();
  if (audioCtx.state === "suspended") await audioCtx.resume();
  if (audioCtx.state !== "running") return false;

  const t0 = audioCtx.currentTime;
  const playTone = (freq, start, duration, volume = 0.12) => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t0 + start);
    gain.gain.exponentialRampToValueAtTime(volume, t0 + start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + start + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(t0 + start);
    osc.stop(t0 + start + duration + 0.04);
  };

  playTone(523.25, 0, 0.1);
  playTone(659.25, 0.11, 0.16);
  return true;
}

async function reproducirSonidoFallback() {
  if (!dingAudioEl) {
    dingAudioEl = new Audio();
    dingAudioEl.volume = 0.4;
    dingAudioEl.src = buildBeepDataUri();
  }
  dingAudioEl.currentTime = 0;
  await dingAudioEl.play();
  return true;
}

/**
 * Sonido corto al recibir mensaje.
 */
export async function reproducirSonidoNuevoMensaje() {
  try {
    const webAudioOk = await reproducirSonidoWebAudio();
    if (webAudioOk) return;
    await reproducirSonidoFallback();
  } catch (error) {
    try {
      await reproducirSonidoFallback();
    } catch (fallbackError) {
      console.warn("No se pudo reproducir sonido de mensaje:", error, fallbackError);
    }
  }
}

function notificarViaVentanaPadre({ titulo, cuerpo, tag }) {
  if (!estaEnIframe()) return false;
  try {
    window.parent.postMessage(
      {
        type: CHAT_NOTIFY_MESSAGE_TYPE,
        titulo,
        cuerpo,
        tag,
        icon: getNotificationIcon(),
      },
      window.location.origin,
    );
    return true;
  } catch {
    return false;
  }
}

export function initAudioAlert() {
  if (audioInicializado) return;
  audioInicializado = true;
  const unlock = () => {
    void unlockAudioContext();
  };
  document.addEventListener("click", unlock, { passive: true });
  document.addEventListener("keydown", unlock, { passive: true });
  document.addEventListener("pointerdown", unlock, { passive: true });
}

/**
 * Pide permiso de notificaciones y desbloquea el audio (requiere clic del usuario).
 */
export async function activarAlertasCompletas() {
  initAudioAlert();
  await unlockAudioContext();

  if (navegadorSoportaNotificaciones() && Notification.permission === "default") {
    try {
      await Notification.requestPermission();
    } catch (error) {
      console.warn("Permiso de notificaciones rechazado:", error);
    }
  }

  return {
    permiso: estadoPermisoNotificacion(),
    sonido: sonidoDesbloqueado,
    enIframe: estaEnIframe(),
  };
}

export function esMensajeEntrante(msg = {}) {
  const emisor = String(msg.emisor || msg.autor || msg.from || "")
    .toLowerCase()
    .trim();
  if (msg.direction === "out") return false;
  if (msg.direction === "in") return true;
  return (
    emisor === "contact" ||
    emisor === "cliente" ||
    emisor === "client" ||
    emisor === "contacto"
  );
}

export function textoVistaPreviaMensaje(msg = {}) {
  const tipo = String(msg.tipo || msg.type || "texto").toLowerCase();
  const text = String(msg.text || msg.mensaje || msg.body || "").trim();
  if (text) return text.slice(0, 120);
  if (tipo === "imagen" || tipo === "image") return "📷 Imagen";
  if (tipo === "audio") return "🎤 Audio";
  if (tipo === "video") return "🎬 Video";
  if (tipo === "archivo" || tipo === "file" || tipo === "document") {
    return "📎 Archivo";
  }
  return "Nuevo mensaje";
}

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
export async function solicitarPermisoNotificacionSistema() {
  if (!navegadorSoportaNotificaciones()) {
    return "unsupported";
  }

  if (Notification.permission !== "default") {
    return Notification.permission;
  }

  try {
    return await Notification.requestPermission();
  } catch (error) {
    console.warn("No se pudo solicitar permiso de notificaciones:", error);
    return Notification.permission;
  }
}

/**
 * Muestra una notificación de mensaje entrante
 */
export function notificarMensajeEntrante({
  titulo = "Nueva alerta",
  cuerpo = "Tienes un nuevo mensaje",
  tag = "chat-alerta",
  onClick = null,
} = {}) {
  const tituloSeguro = String(titulo || "Nueva alerta").trim();
  const cuerpoSeguro = String(cuerpo || "Tienes un nuevo mensaje")
    .trim()
    .slice(0, 120);
  const tagSeguro = String(tag || "chat-alerta");
  let notificacionMostrada = false;

  if (tienePermisoNotificacionConcedido()) {
    try {
      const notification = new Notification(tituloSeguro, {
        body: cuerpoSeguro,
        icon: getNotificationIcon(),
        tag: tagSeguro,
        silent: true,
      });

      notification.onclick = () => {
        window.focus();
        notification.close();
        if (typeof onClick === "function") {
          onClick();
        }
      };
      notificacionMostrada = true;
    } catch (error) {
      console.warn("No se pudo mostrar notificación del navegador:", error);
    }
  } else if (parentPuedeMostrarNotificaciones()) {
    notificacionMostrada = notificarViaVentanaPadre({
      titulo: tituloSeguro,
      cuerpo: cuerpoSeguro,
      tag: tagSeguro,
    });
  }

  if (notificacionMostrada) {
    void reproducirSonidoNuevoMensaje();
  }

  return notificacionMostrada;
}

/**
 * Alerta completa: sonido + notificación del navegador (si hay permiso).
 */
export function alertarMensajeEntrante({
  titulo = "Nuevo mensaje",
  cuerpo = "",
  tag = "chat-alerta",
  onClick = null,
  notificacionNavegador = true,
} = {}) {
  if (!notificacionNavegador) return false;
  return notificarMensajeEntrante({
    titulo,
    cuerpo,
    tag,
    onClick,
  });
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

  const container = document.getElementById('toast-container-bottom');
  if (container) {
    const nodes = container.querySelectorAll('.toast-persistent .toast-body');
    nodes.forEach((body) => {
      if (body.textContent?.includes(key)) {
        body.closest('.toast-persistent')?.remove();
      }
    });
    if (!container.children.length) container.remove();
  }

  if (mostrarAviso) {
    mostrarToast(mensaje || 'Solicitud expirada por tiempo', 'warning');
  }
}

/**
 * Solicita permiso de notificación con un evento de usuario
 * (necesario en navegadores modernos)
 */
export function setupNotificacionesConPermiso() {
  initAudioAlert();
  const pedirPermiso = () => {
    void unlockAudioContext();
    if (Notification.permission === "default") {
      void solicitarPermisoNotificacionSistema();
    }
  };
  document.addEventListener("click", pedirPermiso, { passive: true });
  document.addEventListener("keydown", pedirPermiso, { passive: true });
}

export default {
  navegadorSoportaNotificaciones,
  tienePermisoNotificacionConcedido,
  solicitarPermisoNotificacionSistema,
  activarAlertasCompletas,
  estadoPermisoNotificacion,
  alertasEstanActivas,
  notificarMensajeEntrante,
  alertarMensajeEntrante,
  reproducirSonidoNuevoMensaje,
  esMensajeEntrante,
  textoVistaPreviaMensaje,
  initAudioAlert,
  unlockAudioContext,
  mostrarToast,
  mostrarToastPermanente,
  limpiarToastSoporte,
  setupNotificacionesConPermiso,
  CHAT_NOTIFY_MESSAGE_TYPE,
};
