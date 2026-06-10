import { ref, computed } from 'vue';
import { io } from 'socket.io-client';
import { getApiBase, getSocketConnectOptions } from '@/utils/apiBase';
import { extractMessageMediaUrl, inferMessageMediaType, buildMediaStoragePath, isMediaFilename } from '@/utils/messageMedia';

// Estado reactivo del socket
const socket = ref(null);
const socketInitialized = ref(false);

// Referencias reactivas globales necesarias
const cacheConvs = ref({});
const currentConvId = ref(null);
const unreadMessages = ref({});
const userId = ref(null);
const sipUsername = ref(null);

// Computed para verificar estado
const isSocketConnected = computed(() => socketInitialized.value && socket.value?.connected);

/**
 * Inicializa la conexión del socket
 */
export function iniciarSocket(userIdParam, callbacks = {}) {
  if (socketInitialized.value) {
    console.warn('Socket.IO ya ha sido inicializado. Evitando doble conexión.');
    return socket.value;
  }

  if (!userIdParam) {
    console.error('Error: No se detectó USER_ID');
    return null;
  }

  userId.value = userIdParam;
  socketInitialized.value = true;

  const socketOpts = getSocketConnectOptions();
  const sharedQuery = { query: { userId: userIdParam } };

  socket.value = socketOpts.url
    ? io(socketOpts.url, sharedQuery)
    : io({ ...socketOpts, ...sharedQuery });

  // Interceptar logs
  const originalOn = socket.value.on;
  socket.value.on = function (event, callback) {
    console.log(`[SOCKET] Evento recibido: ${event}`);
    return originalOn.call(this, event, callback);
  };

  // Eventos de conexión básicos
  socket.value.on('connect', () => {
    console.log('Cliente Socket.IO conectado con ID:', socket.value.id);
    const extenLS = sessionStorage.getItem('sipUsername') || localStorage.getItem('sipUsername');
    socket.value.emit('login', { userId: userIdParam, exten: extenLS });
    callbacks.onConnect?.();
  });

  socket.value.on('disconnect', (reason) => {
    console.warn(`Cliente Socket.IO DESCONECTADO. Razón: ${reason}`);
    callbacks.onDisconnect?.(reason);
  });

  socket.value.on('connect_error', (error) => {
    console.error('Cliente Socket.IO ERROR DE CONEXIÓN:', error);
    callbacks.onConnectError?.(error);
  });

  socket.value.on('reconnect', (attemptNumber) => {
    console.log(`Cliente Socket.IO RECONECTADO después de ${attemptNumber} intentos.`);
    const extenLS = sessionStorage.getItem('sipUsername') || localStorage.getItem('sipUsername');
    socket.value.emit('login', { userId: userId.value, exten: extenLS });
    callbacks.onReconnect?.();
  });

  socket.value.on('reconnect_error', (error) => {
    console.error('Cliente Socket.IO ERROR DE RECONEXIÓN:', error);
  });

  socket.value.on('reconnect_failed', () => {
    console.error('Cliente Socket.IO FALLO DE RECONEXIÓN total.');
  });

  return socket.value;
}

/**
 * Obtiene la instancia actual del socket
 */
export function getSocket() {
  return socket.value;
}

/**
 * Verifica si el socket está inicializado
 */
export function isSocketInitialized() {
  return isSocketConnected.value;
}

export { isSocketConnected };

/**
 * Emite un evento al servidor
 */
export function emitSocket(eventName, data, callback) {
  if (!isSocketConnected.value) {
    console.warn(`Socket no conectado. No se puede emitir evento: ${eventName}`);
    if (typeof callback === "function") {
      callback({
        ok: false,
        success: false,
        error: "Sin conexión al servidor. Recarga la página e intenta de nuevo.",
      });
    }
    return;
  }
  socket.value.emit(eventName, data, callback);
}

/**
 * Escucha un evento del servidor
 */
export function onSocket(eventName, callback) {
  if (!socket.value) {
    console.warn(`Socket no inicializado. No se puede escuchar evento: ${eventName}`);
    return;
  }
  socket.value.on(eventName, callback);
}

/**
 * Deja de escuchar un evento
 */
export function offSocket(eventName, callback) {
  if (!socket.value) return;
  socket.value.off(eventName, callback);
}

/**
 * Desconecta el socket
 */
export function desconectarSocket() {
  if (socket.value?.connected) {
    socket.value.disconnect();
    socket.value = null;
    socketInitialized.value = false;
  }
}

/**
 * Registra listeners de socket para eventos comunes
 */
export function registrarListenersSocket(handlers = {}) {
  if (!socket.value) {
    console.error('Socket no inicializado');
    return;
  }

  // Chat message
  socket.value.on('chat_message', ({ convId, msg }) => {
    const id = String(convId ?? msg?.conversacion_id ?? msg?.conversacionId ?? "").trim();
    console.log(`Mensaje recibido en conversación ${id}`);
    handlers.onChatMessage?.({ convId: id, msg });
  });

  // Estado de conversaciones
  socket.value.on('update_queues', (data) => {
    handlers.onUpdateQueues?.(data);
  });

  socket.value.on('init_state', (data) => {
    handlers.onInitState?.(data);
  });

  socket.value.on('conversation_state_changed', (data) => {
    handlers.onConversationStateChanged?.(data);
  });

  socket.value.on('active_conversations_count', (data) => {
    handlers.onActiveConversationsCount?.(data);
  });

  // Conversación asignada
  socket.value.on('chat_assigned', (c) => {
    handlers.onChatAssigned?.(c);
  });

  socket.value.on('conversacion_transferida', (data) => {
    handlers.onConversationTransferred?.(data);
  });

  socket.value.on('conversacion_recibida', (data) => {
    handlers.onConversationReceived?.(data);
  });

  // Llamada entrante (videollamada)
  socket.value.on('signal', ({ offer, valor }) => {
    handlers.onIncomingCall?.({ offer, valor });
  });

  // Respuesta de llamada
  socket.value.on('answer', (answer) => {
    handlers.onCallAnswer?.(answer);
  });

  // Candidato ICE
  socket.value.on('candidate', (candidate) => {
    handlers.onIceCandidate?.(candidate);
  });

  // Llamada finalizada
  socket.value.on('call_ended', ({ convId }) => {
    handlers.onCallEnded?.({ convId });
  });

  // Typing indicator
  socket.value.on('typing_front_push', (data) => {
    handlers.onTyping?.(data);
  });

  // Mensaje de error
  socket.value.on('error_msg', (message) => {
    handlers.onError?.(message);
  });

  // Chat tomado
  socket.value.on('chat_taken', ({ convId }) => {
    handlers.onChatTaken?.({ convId });
  });

  // Confirmación de mensaje
  socket.value.on('message_confirmed', ({ convId, msg, tempId }) => {
    handlers.onMessageConfirmed?.({ convId, msg, tempId });
  });

  // Estado del agente interno
  socket.value.on('estado_agente_interno', (payload) => {
    handlers.onInternalAgentStatus?.(payload);
  });

  // Mensaje de chat interno
  socket.value.on('internal_chat_message', (payload) => {
    handlers.onInternalChatMessage?.(payload);
  });

  // Lista de agentes internos
  socket.value.on('lista_agentes_internos', (payload) => {
    handlers.onInternalAgentsList?.(payload);
  });

  socket.value.on('internal_chat_error', (payload) => {
    handlers.onInternalChatError?.(payload);
  });

  // Colas disponibles
  socket.value.on('colas', (data) => {
    handlers.onQueuesAvailable?.(data);
  });

  // Asignación confirmada
  socket.value.on('asignacion_confirmada', (data) => {
    handlers.onAssignmentConfirmed?.(data);
  });

  // Cliente ya asignado
  socket.value.on('cliente_ya_asignado', ({ from }) => {
    handlers.onClientAlreadyAssigned?.({ from });
  });

  socket.value.on('solicitud_expirada', (data) => {
    handlers.onSupportRequestExpired?.(data);
  });

  socket.value.on('limite_conversaciones', (data) => {
    handlers.onSupportActiveLimit?.(data);
  });

  socket.value.on('soporte_asignado', (data) => {
    handlers.onSupportAssignedToOther?.(data);
  });

  // Mensaje de cliente (WhatsApp soporte)
  socket.value.on('mensaje_cliente', (data) => {
    handlers.onClientMessage?.(data);
  });

  // Conversación finalizada
  socket.value.on('conversacion_finalizada', (data) => {
    handlers.onConversationEnded?.(data);
  });

  // Cat\u00e1logo de etiquetas
  socket.value.on('etiquetas', (data) => {
    handlers.onEtiquetas?.(data);
  });

  socket.value.on('motivosCierre', (data) => {
    handlers.onMotivosCierre?.(data);
  });

  socket.value.on('tipificaciones', (data) => {
    handlers.onTipificaciones?.(data);
  });
}

const OBJECT_ID_PATTERN = /^[a-f0-9]{24}$/i;

function getApiBaseUrl() {
  return getApiBase();
}

function normalizeMediaUrl(url) {
  return String(url || '').trim().replace(/^http:\/\//i, 'https://');
}

function resolveRelativeMediaUrl(url) {
  let raw = String(url || '').trim();
  if (!raw) return '';

  if (/^https?:\/\//i.test(raw)) {
    return normalizeMediaUrl(raw);
  }

  const apiBase = getApiBaseUrl().replace(/\/+$/, '');

  const storagePath = buildMediaStoragePath(raw);
  if (storagePath) {
    raw = storagePath;
  }

  if (raw.startsWith('/storage/chat-files/')) {
    return `${apiBase}${raw}`;
  }

  if (raw.startsWith('storage/chat-files/')) {
    return `${apiBase}/${raw}`;
  }

  if (/^(audio|file|video|image)\//i.test(raw)) {
    return `${apiBase}/storage/chat-files/${raw.replace(/^\/+/, '')}`;
  }

  if (raw.startsWith('/')) {
    return `${apiBase}${raw}`;
  }

  if (isMediaFilename(raw)) {
    return `${apiBase}/storage/chat-files/${raw.replace(/^\/+/, '')}`;
  }

  return raw;
}

/**
 * Sirve multimedia externa (Supabase, etc.) via proxy del backend para evitar CORS/bloqueos.
 */
export function resolveMediaDisplayUrl(url) {
  const normalized = resolveRelativeMediaUrl(url);
  if (!normalized) return '';

  try {
    const apiBase = getApiBaseUrl();
    const parsed = new URL(normalized);
    const apiOrigin = new URL(apiBase).origin;
    if (parsed.origin === apiOrigin) return normalized;
  } catch {
    return normalized;
  }

  return `${getApiBaseUrl()}/api/media/proxy?url=${encodeURIComponent(normalized)}`;
}

function enrichMultimediaItem(item = {}) {
  const url = normalizeMediaUrl(item.url);
  return {
    ...item,
    url,
    displayUrl: resolveMediaDisplayUrl(url),
  };
}

export function esObjectIdConversacion(value) {
  return OBJECT_ID_PATTERN.test(String(value || '').trim());
}

/**
 * Convierte legacyId / id parcial al ObjectId real de Mongo.
 */
export async function resolverConversacionId(rawId) {
  const id = String(rawId || '').trim();
  if (!id) return '';
  if (esObjectIdConversacion(id)) return id;

  try {
    const res = await fetch(
      `${getApiBaseUrl()}/api/conversations/resolve/${encodeURIComponent(id)}`,
    );
    if (!res.ok) return id;
    const data = await res.json();
    return String(data?.id || id).trim() || id;
  } catch {
    return id;
  }
}

export function cambiarConversacion(convIdAnterior, convIdNuevo) {
  return new Promise((resolve) => {
    if (!socket.value) {
      resolve({ ok: false, persisted: 0 });
      return;
    }

    socket.value.emit(
      'cambiar_conversacion',
      {
        convIdAnterior: convIdAnterior ? String(convIdAnterior) : null,
        convIdNuevo: convIdNuevo ? String(convIdNuevo) : null,
      },
      (response) => {
        resolve(response || { ok: true, persisted: 0 });
      },
    );
  });
}

/**
 * Solicita cargar mensajes de una conversación
 */
export function cargarMensajesConversacion(convId, options = {}) {
  return new Promise((resolve) => {
    const convIdNormalizado = String(convId || '').trim();
    if (!convIdNormalizado) {
      resolve([]);
      return;
    }

    const ignoreAgentCheck = Boolean(options.ignoreAgentCheck);

    const mapMessages = (mensajes) =>
      Array.isArray(mensajes) ? mensajes : [];

    const fetchMessagesFromApi = async () => {
      try {
        const res = await fetch(
          `${getApiBaseUrl()}/api/conversations/${encodeURIComponent(convIdNormalizado)}/messages?ignoreAgent=1`,
        );
        if (!res.ok) return [];
        const data = await res.json();
        return mapMessages(data);
      } catch {
        return [];
      }
    };

    if (!socket.value) {
      fetchMessagesFromApi().then(resolve);
      return;
    }

    socket.value.emit(
      'cargar_mensajes',
      { convId: convIdNormalizado, ignoreAgentCheck },
      async (mensajes) => {
        const rows = mapMessages(mensajes);
        if (rows.length > 0 || !ignoreAgentCheck) {
          resolve(rows);
          return;
        }
        resolve(await fetchMessagesFromApi());
      },
    );
  });
}

function normalizarListaMultimedia(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.multimedia)) return payload.multimedia;
  return [];
}

export function inferMultimediaTipoFrontend(tipo, url) {
  const tipoNorm = String(tipo || '').toLowerCase().trim();
  if (tipoNorm.includes('image') || tipoNorm.includes('imagen') || tipoNorm === 'photo') {
    return 'imagen';
  }
  if (tipoNorm.includes('video')) return 'video';
  if (tipoNorm.includes('audio') || tipoNorm.includes('voice')) return 'audio';
  const ext = String(url || '').split('?')[0].split('.').pop()?.toLowerCase();
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(ext)) return 'imagen';
  if (['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(ext)) return 'video';
  if (['mp3', 'ogg', 'wav', 'aac', 'm4a', 'opus'].includes(ext)) return 'audio';
  return 'documento';
}

export function mapMensajesAMultimedia(mensajes = []) {
  const items = [];
  const seen = new Set();

  for (let i = 0; i < mensajes.length; i += 1) {
    const msg = mensajes[i] || {};
    const url = extractMessageMediaUrl(msg);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const normalizedUrl = normalizeMediaUrl(url);
    items.push(enrichMultimediaItem({
      id: String(msg.id || msg._id || msg.tempId || `media-${i}`),
      tipo: inferMessageMediaType(msg, url) || inferMultimediaTipoFrontend(msg.tipo, url),
      url: normalizedUrl,
      nombre: String(msg.nombre || msg.mensaje || msg.text || msg.texto || url.split('/').pop() || 'Archivo'),
      fecha: msg.fecha || msg.ts || msg.timestamp || null,
    }));
  }

  return items;
}

/**
 * Obtiene archivos multimedia de una conversación.
 */
export function obtenerMultimediaConversacion(convId) {
  return new Promise((resolve) => {
    const convIdNormalizado = String(convId || '').trim();
    if (!convIdNormalizado) {
      resolve([]);
      return;
    }

    const fetchMultimediaFromApi = async () => {
      try {
        const res = await fetch(
          `${getApiBaseUrl()}/api/conversations/${encodeURIComponent(convIdNormalizado)}/multimedia`,
        );
        if (!res.ok) return [];
        const data = await res.json();
        return normalizarListaMultimedia(data);
      } catch {
        return [];
      }
    };

    const finalize = async (items) => {
      if (Array.isArray(items) && items.length > 0) {
        resolve(items);
        return;
      }
      resolve(await fetchMultimediaFromApi());
    };

    if (!socket.value?.connected) {
      fetchMultimediaFromApi().then(resolve);
      return;
    }

    let settled = false;
    const timer = setTimeout(async () => {
      if (settled) return;
      settled = true;
      resolve(await fetchMultimediaFromApi());
    }, 2500);

    socket.value.emit('obtener_informacion_multimedia', convIdNormalizado, async (respuesta) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      await finalize(normalizarListaMultimedia(respuesta));
    });
  });
}

/**
 * Carga multimedia de una conversación: API/socket, mensajes en cache o mensajes remotos.
 */
export async function cargarMultimediaDeConversacion(convId, mensajesLocales = []) {
  const id = String(convId || '').trim();
  if (!id) return [];

  let resolvedId = id;
  if (!esObjectIdConversacion(id)) {
    const resuelto = await resolverConversacionId(id);
    if (resuelto) resolvedId = resuelto;
  }

  const idsToTry = [...new Set([resolvedId, id].filter(Boolean))];
  const mergeItems = (list) => {
    const merged = [];
    const seen = new Set();
    for (const item of list) {
      const url = String(item?.url || '').trim();
      if (!url || seen.has(url)) continue;
      seen.add(url);
      merged.push(item);
    }
    return merged;
  };

  let items = mergeItems(mapMensajesAMultimedia(mensajesLocales));
  if (items.length > 0) return items.map(enrichMultimediaItem);

  for (const convKey of idsToTry) {
    const remoto = await obtenerMultimediaConversacion(convKey);
    items = mergeItems(remoto);
    if (items.length > 0) return items.map(enrichMultimediaItem);
  }

  for (const convKey of idsToTry) {
    const mensajes = await cargarMensajesConversacion(convKey, {
      ignoreAgentCheck: true,
    });
    items = mergeItems(mapMensajesAMultimedia(mensajes));
    if (items.length > 0) return items.map(enrichMultimediaItem);
  }

  return [];
}

/**
 * Solicita el histórico de un cliente
 */
export async function obtenerHistorialCliente({ convId, dni, limit = 300 } = {}) {
  const convIdNormalizado = String(convId || '').trim();
  const dniNormalizado = String(dni || '').trim();

  if (!convIdNormalizado && !dniNormalizado) {
    return {
      ok: false,
      persona: null,
      registros: [],
      error: 'Filtros inválidos para historial',
    };
  }

  const fetchHistorialFromApi = async () => {
    const apiBase = getApiBase();
    const params = new URLSearchParams();
    if (convIdNormalizado) params.set('convId', convIdNormalizado);
    if (dniNormalizado) params.set('dni', dniNormalizado);
    params.set('limit', String(limit));

    const res = await fetch(`${apiBase}/api/conversations/historial/cliente?${params}`);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const data = await res.json();
    return {
      ok: data?.ok !== false,
      persona: data.persona || null,
      registros: Array.isArray(data.registros) ? data.registros : [],
      error: data?.error || null,
    };
  };

  if (socket.value?.connected) {
    const socketResult = await new Promise((resolve) => {
      socket.value.emit(
        'obtener_historial_cliente',
        {
          convId: convIdNormalizado || null,
          dni: dniNormalizado || null,
          limit,
        },
        (respuesta) => {
          if (!respuesta?.ok) {
            resolve({
              ok: false,
              persona: null,
              registros: [],
              error: respuesta?.error || 'Error al obtener histórico',
            });
            return;
          }

          resolve({
            ok: true,
            persona: respuesta.persona || null,
            registros: Array.isArray(respuesta.registros) ? respuesta.registros : [],
          });
        },
      );
    });

    if (socketResult.ok) return socketResult;
  }

  try {
    return await fetchHistorialFromApi();
  } catch (error) {
    return {
      ok: false,
      persona: null,
      registros: [],
      error: error.message || 'Error al obtener histórico',
    };
  }
}

/**
 * Solicita la lista de contactos
 */
export function obtenerListaContactos() {
  return new Promise((resolve) => {
    if (!socket.value) {
      resolve({ success: false, contactos: [] });
      return;
    }

    socket.value.emit('obtener_lista_contactos', (respuesta) => {
      resolve({
        success: true,
        contactos: respuesta?.contacto || [],
      });
    });
  });
}

/**
 * Solicita información de contacto
 */
export function obtenerInformacionContacto(numeroAgente) {
  return new Promise((resolve) => {
    if (!socket.value) {
      resolve({ success: false });
      return;
    }

    socket.value.emit('obtener_informacion_contacto', numeroAgente, (respuesta) => {
      resolve({
        success: true,
        contacto: respuesta?.contacto || {},
      });
    });
  });
}

/**
 * Emite un mensaje de chat
 */
export function enviarMensajeInterno(
  { toAgentId, text, tipo = 'texto', archivo_url, archivoUrl } = {},
  callback,
) {
  if (!isSocketConnected.value) {
    console.warn('Socket no conectado. No se puede enviar mensaje interno.');
    callback?.({ ok: false, error: 'Socket no conectado' });
    return;
  }
  const target = String(toAgentId || '').trim();
  const body = String(text || '').trim();
  const mediaUrl = String(archivo_url || archivoUrl || '').trim();
  const tipoNorm = String(tipo || 'texto').trim().toLowerCase() || 'texto';
  if (!target || (!body && !mediaUrl)) {
    callback?.({ ok: false, error: 'Destino o contenido vacío' });
    return;
  }
  socket.value.emit(
    'internal_chat_message',
    {
      toAgentId: target,
      text: body || '',
      tipo: tipoNorm,
      archivo_url: mediaUrl || null,
    },
    (res) => callback?.(res),
  );
}

export function enviarMensajeChat({ convId, text, origen = 'web', numero = null, tempId = null }) {
  if (!isSocketConnected.value) {
    console.warn('Socket no conectado. Mensaje no enviado.');
    return;
  }

  socket.value.emit('chat_message', {
    convId,
    text,
    origen,
    numero,
    tempId,
  });
}

function isInternoConversation(conv = {}) {
  return (
    String(conv?.origen || conv?.metadata?.origen || "")
      .trim()
      .toLowerCase() === "interno"
  );
}

/**
 * Abre un chat nuevo: pasa a activo si hay cupo; si no, queda en nuevos.
 */
export async function promoverNuevoSiHayCupo({
  convId,
  userId,
  conv = {},
  convIdAnterior = null,
} = {}) {
  const id = String(convId || "").trim();
  const uid = String(userId || "").trim();
  if (!id || !uid) {
    return { promoted: false, estado: "nuevo", error: "Datos incompletos" };
  }

  const anterior = String(convIdAnterior || "").trim() || null;

  if (isInternoConversation(conv)) {
    await cambiarConversacion(anterior, id);
    return { promoted: false, estado: "nuevo" };
  }

  const resp = await abrirChat(id, uid);
  const failed =
    resp?.success === false || resp?.ok === false || Boolean(resp?.error);

  if (!failed) {
    if (anterior && anterior !== id) {
      await cambiarConversacion(anterior, id);
    }
    return { promoted: true, estado: "abierta", response: resp };
  }

  await cambiarConversacion(anterior, id);
  return {
    promoted: false,
    estado: "nuevo",
    error: resp?.error,
    response: resp,
  };
}

/**
 * Solicita abrir un chat
 */
export function abrirChat(convId, userId) {
  return new Promise((resolve) => {
    if (!isSocketConnected.value) {
      resolve({ success: false });
      return;
    }

    socket.value.emit('open_chat', { convId, userId }, (respuesta) => {
      resolve(respuesta || { success: false });
    });
  });
}

/**
 * Solicita cerrar un chat
 */
export function cerrarChat({ convId, idTipificacion, tipificacion, idObservaciones, observaciones, metadata }) {
  return new Promise((resolve) => {
    if (!socket.value?.connected) {
      resolve({
        success: false,
        error: "Sin conexión al servidor. Recarga la página e intenta de nuevo.",
      });
      return;
    }

    const timeoutId = setTimeout(() => {
      resolve({
        success: false,
        error: "Tiempo de espera agotado al cerrar la conversación.",
      });
    }, 12000);

    socket.value.emit('close_chat', {
      convId,
      idTipificacion,
      tipificacion,
      idObservaciones,
      observaciones,
      metadata,
    }, (response) => {
      clearTimeout(timeoutId);
      resolve(response || { success: false, error: "Respuesta vacía del servidor" });
    });
  });
}

/**
 * Solicita reabrir un chat cerrado
 */
export function reabrirChat(convId, uid) {
  return new Promise((resolve) => {
    if (!isSocketConnected.value) {
      resolve({ success: false });
      return;
    }

    socket.value.emit('reopen_chat', { convId, uid }, (respuesta) => {
      resolve(respuesta || { success: false });
    });
  });
}

/**
 * Obtiene el conteo de conversaciones activas desde BD
 */
export function obtenerConteoActivos(userId) {
  return new Promise((resolve) => {
    if (!isSocketConnected.value) {
      resolve(0);
      return;
    }

    const timeoutId = setTimeout(() => {
      resolve(0);
    }, 1500);

    socket.value.emit('request_active_conversations_count', { userId }, (respuesta) => {
      clearTimeout(timeoutId);
      const count = Number(respuesta?.count);
      resolve(Number.isFinite(count) ? Math.max(0, count) : 0);
    });
  });
}

export default {
  // Estado reactivo
  socket,
  socketInitialized,
  cacheConvs,
  currentConvId,
  unreadMessages,
  userId,
  sipUsername,
  isSocketConnected,

  // Funciones
  iniciarSocket,
  getSocket,
  isSocketInitialized,
  emitSocket,
  onSocket,
  offSocket,
  desconectarSocket,
  registrarListenersSocket,
  cargarMensajesConversacion,
  cambiarConversacion,
  obtenerHistorialCliente,
  obtenerListaContactos,
  obtenerInformacionContacto,
  enviarMensajeChat,
  enviarMensajeInterno,
  abrirChat,
  promoverNuevoSiHayCupo,
  cerrarChat,
  reabrirChat,
  obtenerConteoActivos,
  resolveMediaDisplayUrl,
};
