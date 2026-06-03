/**
 * Composable para manejar la lógica de chat, mensajes y conversaciones
 */

import { ref, computed, watch } from 'vue';
import { 
  getSocket, 
  emitSocket, 
  onSocket,
  cargarMensajesConversacion,
  enviarMensajeChat,
  abrirChat,
  cerrarChat,
  reabrirChat,
  obtenerHistorialCliente,
  obtenerListaContactos
} from './useSocket.js';
import { mostrarToast, notificarMensajeEntrante } from './useNotificaciones.js';

// Estado reactivo
export const cacheConvs = ref({});
export const currentConvId = ref(null);
export const unreadMessages = ref({});
export const filterText = ref('');
export const etiquetasSeleccionadas = ref([]);
export const ETIQUETAS = ref([
  { id: 1, nombre: 'Importante', color: '#588044' },
  { id: 2, nombre: 'Urgente', color: '#7eb83b' },
  { id: 3, nombre: 'Pendiente', color: '#6da132' },
  { id: 4, nombre: 'Resuelto', color: '#4d703c' },
]);
export const ETIQUETASPORCONV = ref({});
export const colorSeleccionado = ref('#588044');

// ============== PROPIEDADES COMPUTADAS ==============

export const conversacionesAbiertas = computed(() => {
  return Object.values(cacheConvs.value).filter(
    (c) => c.metadata?.estado !== 'cerrada'
  );
});

export const conversacionesCerradas = computed(() => {
  return Object.values(cacheConvs.value).filter(
    (c) => c.metadata?.estado === 'cerrada'
  );
});

export const conversacionesNuevas = computed(() => {
  return Object.values(cacheConvs.value).filter(
    (c) => c.metadata?.estado === 'nuevo'
  );
});

export const totalNoLeidos = computed(() => {
  return Object.values(unreadMessages.value).reduce((sum, count) => sum + count, 0);
});

// ============== ESTADOS PRIVADOS ==============

// Estados de conversación
const ESTADO_ABIERTA = 'abierta';
const ESTADO_NUEVO = 'nuevo';
const ESTADO_CERRADA = 'cerrada';

/**
 * Inicializa la composable de chat
 */
export function inicializarChat() {
  setupEmojiListeners();
  setupAttachListeners();
  setupContactosListeners();
}

/**
 * Limpia la caché de conversaciones
 */
export function limpiarCache() {
  cacheConvs.value = {};
  currentConvId.value = null;
  unreadMessages.value = {};
}

/**
 * Renderiza una conversación específica por ID
 */
export async function renderConv(cid) {
  const convId = String(cid).trim();
  if (!convId) {
    console.warn('ID de conversación inválido');
    return false;
  }

  try {
    currentConvId.value = convId;

    // Cargar mensajes si no están en caché
    if (!cacheConvs.value[convId]) {
      cacheConvs.value[convId] = {
        id: convId,
        messages: [],
        metadata: {},
      };

      const messages = await cargarMensajesConversacion(convId);
      cacheConvs.value[convId].messages = Array.isArray(messages) ? messages : [];
    }

    // Limpiar contador de no leídos
    if (unreadMessages.value[convId]) {
      unreadMessages.value[convId] = 0;
    }

    // Renderizar en el DOM
    renderizarMensajesEnDOM(convId);

    return true;
  } catch (error) {
    console.error('Error renderizando conversación:', error);
    mostrarToast('Error al cargar la conversación', 'error');
    return false;
  }
}

/**
 * Renderiza todos los mensajes de una conversación en el DOM
 */
function renderizarMensajesEnDOM(convId) {
  const conv = cacheConvs.value[convId];
  if (!conv || !conv.messages) return;

  const chatMessagesContainer = document.getElementById('chat-messages');
  if (!chatMessagesContainer) return;

  chatMessagesContainer.innerHTML = '';

  const mensajesUnicos = deduplicarMensajes(conv.messages);

  mensajesUnicos.forEach((msg) => {
    const msgElement = crearElementoMensaje(msg);
    if (msgElement) {
      chatMessagesContainer.appendChild(msgElement);
    }
  });

  // Scroll al final
  setTimeout(() => {
    chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
  }, 0);
}

/**
 * Deduplica mensajes por ID y timestamp
 */
function deduplicarMensajes(messages) {
  const unique = new Map();

  messages.forEach((msg) => {
    const key = msg.id || `${msg.timestamp}-${msg.texto}`;
    const existente = unique.get(key);

    if (!existente) {
      unique.set(key, msg);
    } else {
      // Si el nuevo mensaje es más completo (tiene más propiedades), reemplazar
      if (Object.keys(msg).length > Object.keys(existente).length) {
        unique.set(key, msg);
      }
    }
  });

  return Array.from(unique.values()).sort(
    (a, b) => (a.timestamp || 0) - (b.timestamp || 0)
  );
}

/**
 * Añade un nuevo mensaje a una conversación
 */
export function addMsg(m) {
  if (!m || typeof m !== 'object') {
    console.warn('Mensaje inválido');
    return false;
  }

  const convId = currentConvId.value || m.convId;
  if (!convId) {
    console.warn('Sin ID de conversación');
    return false;
  }

  if (!cacheConvs.value[convId]) {
    cacheConvs.value[convId] = {
      id: convId,
      messages: [],
      metadata: {},
    };
  }

  // Evitar duplicados
  const existe = cacheConvs.value[convId].messages.some(
    (msg) => msg.id === m.id || (msg.timestamp === m.timestamp && msg.texto === m.texto)
  );

  if (!existe) {
    cacheConvs.value[convId].messages.push(m);

    // Trigger reactivity
    cacheConvs.value[convId] = { ...cacheConvs.value[convId] };
  }

  // Renderizar si es la conversación actual
  if (convId === currentConvId.value) {
    const msgElement = crearElementoMensaje(m);
    const container = document.getElementById('chat-messages');
    if (container && msgElement) {
      container.appendChild(msgElement);
      container.scrollTop = container.scrollHeight;
    }
  }

  return true;
}

/**
 * Crea el elemento DOM de un mensaje con soporte para múltiples tipos
 */
function crearElementoMensaje(msg) {
  const messageDiv = document.createElement('div');
  messageDiv.className = `chat-message ${msg.origen === 'bot' ? 'bot-message' : 'user-message'}`;
  messageDiv.setAttribute('data-msg-id', msg.id || '');

  const timestamp = new Date(msg.timestamp).toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
  });

  let contenido = '';

  // Renderizar contenido según tipo
  if (msg.tipo === 'audio') {
    contenido = crearReproductorAudio(msg);
  } else if (msg.tipo === 'video') {
    contenido = `<video controls style="max-width: 300px; border-radius: 8px; margin: 8px 0;">
                  <source src="${msg.url}" type="video/mp4">
                  Tu navegador no soporta video
                </video>`;
  } else if (msg.tipo === 'imagen') {
    contenido = `<img src="${msg.url}" alt="Imagen" style="max-width: 300px; border-radius: 8px; margin: 8px 0; cursor: pointer;" data-url="${msg.url}" class="imagen-clickeable">`;
  } else if (msg.tipo === 'documento') {
    const nombreArchivo = msg.url.split('/').pop();
    contenido = `<a href="${msg.url}" target="_blank" class="btn btn-sm btn-outline-primary">
                  <i class="bx bx-download"></i> ${nombreArchivo}
                </a>`;
  } else if (msg.tipo === 'sistema') {
    messageDiv.className = 'chat-message sistema-message';
    contenido = `<em>${msg.texto}</em>`;
  } else {
    // Mensaje de texto
    contenido = `<p style="margin: 0; word-wrap: break-word;">${escaparHTML(msg.texto || '')}</p>`;
  }

  messageDiv.innerHTML = `
    <div class="message-wrapper">
      <div class="message-content">
        ${contenido}
      </div>
      <div class="message-time" style="font-size: 0.75rem; opacity: 0.6; margin-top: 4px;">
        ${timestamp}
      </div>
    </div>
  `;

  return messageDiv;
}

/**
 * Crea un reproductor de audio personalizado
 */
function crearReproductorAudio(msg) {
  return `
    <div class="audio-player" style="display: flex; align-items: center; gap: 10px; background: rgba(0,0,0,0.05); padding: 8px 12px; border-radius: 8px;">
      <audio id="audio-${msg.id}" src="${msg.url}" preload="metadata" style="display: none;"></audio>
      <button class="btn-play-audio btn-sm" data-audio-id="audio-${msg.id}" style="width: 36px; height: 36px; padding: 0; border: none; background: #588044; color: white; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center;">
        <i class="bx bx-play"></i>
      </button>
      <div style="flex: 1;">
        <div style="height: 4px; background: #dcead5; border-radius: 2px; position: relative;">
          <div class="audio-progress" style="height: 100%; width: 0%; background: #7eb83b; border-radius: 2px;"></div>
        </div>
      </div>
      <span class="audio-duration" style="font-size: 0.75rem; min-width: 40px; text-align: right;">0:00</span>
    </div>
  `;
}

/**
 * Envía un mensaje (texto o voz)
 */
export async function enviar() {
  const inputField = document.getElementById('message-input');
  const convId = currentConvId.value;

  if (!convId) {
    mostrarToast('No hay conversación abierta', 'error');
    return;
  }

  const texto = (inputField?.value || '').trim();

  if (!texto) {
    mostrarToast('Ingresa un mensaje', 'warning');
    return;
  }

  try {
    // Enviar vía socket
    const tempId = Date.now().toString();
    await enviarMensajeChat({
      convId,
      text: texto,
      origen: 'cliente',
      tempId,
    });

    // Limpiar input
    if (inputField) {
      inputField.value = '';
    }

    // Agregar a caché localmente
    addMsg({
      id: tempId,
      convId,
      texto,
      timestamp: Date.now(),
      origen: 'cliente',
      tipo: 'texto',
    });

    mostrarToast('Mensaje enviado', 'success');
  } catch (error) {
    console.error('Error enviando mensaje:', error);
    mostrarToast('Error al enviar el mensaje', 'error');
  }
}

/**
 * Dibuja todas las conversaciones (lista)
 */
export async function drawAll(data) {
  const conversaciones = Array.isArray(data) ? data : [];

  try {
    // Procesar y filtrar conversaciones
    const procesadas = procesarConversaciones(conversaciones);
    const filtradas = aplicarFiltros(procesadas);

    // Renderizar en el DOM
    renderizarListaConversaciones(filtrada);
  } catch (error) {
    console.error('Error dibujando lista de conversaciones:', error);
  }
}

/**
 * Genera lista de conversaciones por tipo/estado
 */
export function list(tipo = 'abierta') {
  const allConvs = Object.values(cacheConvs.value);

  let filtradas = allConvs;

  if (tipo === 'abierta') {
    filtradas = allConvs.filter((c) => c.metadata?.estado !== ESTADO_CERRADA);
  } else if (tipo === 'nuevo') {
    filtradas = allConvs.filter((c) => c.metadata?.estado === ESTADO_NUEVO);
  } else if (tipo === 'cerrada') {
    filtradas = allConvs.filter((c) => c.metadata?.estado === ESTADO_CERRADA);
  }

  // Aplicar búsqueda y filtros de etiquetas
  filtradas = aplicarFiltros(filtradas);

  return filtradas.sort(
    (a, b) => (b.metadata?.lastMessageTime || 0) - (a.metadata?.lastMessageTime || 0)
  );
}

/**
 * Aplica filtros de búsqueda y etiquetas a conversaciones
 */
function aplicarFiltros(conversaciones) {
  let resultado = [...conversaciones];

  // Filtro por texto de búsqueda
  if (filterText.value) {
    const query = filterText.value.toLowerCase();
    resultado = resultado.filter((conv) => {
      const texto = (conv.metadata?.nombre || '').toLowerCase();
      return texto.includes(query);
    });
  }

  // Filtro por etiquetas
  if (etiquetasSeleccionadas.value.length > 0) {
    resultado = resultado.filter((conv) => {
      const etiquetasConv = ETIQUETASPORCONV.value[conv.id] || [];
      return etiquetasSeleccionadas.value.some((tag) => etiquetasConv.includes(tag));
    });
  }

  return resultado;
}

/**
 * Procesa datos crudos de conversaciones
 */
function procesarConversaciones(data) {
  return data.map((conv) => {
    if (!cacheConvs.value[conv.id]) {
      cacheConvs.value[conv.id] = {
        id: conv.id,
        messages: [],
        metadata: {},
      };
    }

    cacheConvs.value[conv.id].metadata = {
      ...cacheConvs.value[conv.id].metadata,
      ...conv,
      lastMessageTime: conv.lastMessageTime || Date.now(),
    };

    return cacheConvs.value[conv.id];
  });
}

/**
 * Renderiza la lista de conversaciones en el DOM
 */
function renderizarListaConversaciones(conversaciones) {
  const listContainer = document.getElementById('conversations-list');
  if (!listContainer) return;

  listContainer.innerHTML = '';

  conversaciones.forEach((conv) => {
    const item = document.createElement('div');
    item.className = 'conv-item';
    item.setAttribute('data-conv-id', conv.id);

    const unread = unreadMessages.value[conv.id] || 0;
    const unreadBadge = unread > 0 ? `<span class="badge bg-danger">${unread}</span>` : '';
    const etiquetas = obtenerBadgeColaConversacion(conv.id);

    item.innerHTML = `
      <div class="conv-header">
        <strong>${escaparHTML(conv.metadata?.nombre || 'Sin nombre')}</strong>
        ${unreadBadge}
      </div>
      <div class="conv-preview">${escaparHTML((conv.messages?.[conv.messages.length - 1]?.texto || '').substring(0, 50))}</div>
      ${etiquetas ? `<div class="conv-tags">${etiquetas}</div>` : ''}
    `;

    item.onclick = () => renderConv(conv.id);
    listContainer.appendChild(item);
  });
}

/**
 * Busca mensajes en la conversación actual
 */
export function buscarMensaje(texto) {
  const convId = currentConvId.value;
  if (!convId) return [];

  const conv = cacheConvs.value[convId];
  if (!conv || !conv.messages) return [];

  const query = texto.toLowerCase();
  return conv.messages.filter((msg) => 
    (msg.texto || '').toLowerCase().includes(query)
  );
}

/**
 * Abre un modal para ver/editar contacto
 */
export function mostrarModalContacto(convId) {
  try {
    const modal = document.getElementById('contact-modal');
    if (!modal) {
      console.warn('Modal de contacto no encontrado');
      return;
    }

    modal.setAttribute('data-convId', convId);

    const conv = cacheConvs.value[convId];
    if (conv && conv.metadata) {
      const { nombre = '', telefono = '', email = '' } = conv.metadata;
      
      const inputNombre = modal.querySelector('#contact-name');
      const inputTelefono = modal.querySelector('#contact-phone');
      const inputEmail = modal.querySelector('#contact-email');

      if (inputNombre) inputNombre.value = nombre;
      if (inputTelefono) inputTelefono.value = telefono;
      if (inputEmail) inputEmail.value = email;
    }

    const bsModal = new bootstrap.Modal(modal);
    bsModal.show();
  } catch (error) {
    console.error('Error abriendo modal de contacto:', error);
  }
}

/**
 * Guarda cambios de contacto
 */
export function marcar(convId) {
  try {
    const modal = document.getElementById('contact-modal');
    const inputNombre = modal?.querySelector('#contact-name');
    const inputTelefono = modal?.querySelector('#contact-phone');
    const inputEmail = modal?.querySelector('#contact-email');

    const nombreNuevo = (inputNombre?.value || '').trim();

    if (cacheConvs.value[convId]) {
      cacheConvs.value[convId].metadata = {
        ...cacheConvs.value[convId].metadata,
        nombre: nombreNuevo,
        telefono: (inputTelefono?.value || '').trim(),
        email: (inputEmail?.value || '').trim(),
      };

      // Trigger reactivity
      cacheConvs.value[convId] = { ...cacheConvs.value[convId] };
    }

    actualizarContactoEnCacheYUI(convId);
    mostrarToast('Contacto actualizado', 'success');

    const bsModal = bootstrap.Modal.getInstance(modal);
    bsModal?.hide();
  } catch (error) {
    console.error('Error guardando contacto:', error);
    mostrarToast('Error guardando contacto', 'error');
  }
}

/**
 * Ver media compartido en conversación
 */
export function verMediaCompartido(convId) {
  const conv = cacheConvs.value[convId];
  if (!conv || !conv.messages) {
    mostrarToast('Sin medios en esta conversación', 'info');
    return;
  }

  const mediaMessages = conv.messages.filter(
    (m) => m.tipo === 'imagen' || m.tipo === 'video' || m.tipo === 'audio'
  );

  if (mediaMessages.length === 0) {
    mostrarToast('No hay medios compartidos', 'info');
    return;
  }

  console.log('Medios encontrados:', mediaMessages);
  mostrarToast(`${mediaMessages.length} medios encontrados`, 'info');
}

/**
 * Elimina un contacto
 */
export function eliminarContacto(convId) {
  if (!confirm('¿Eliminar esta conversación?')) return;

  try {
    delete cacheConvs.value[convId];
    delete unreadMessages.value[convId];

    if (currentConvId.value === convId) {
      currentConvId.value = null;
    }

    mostrarToast('Conversación eliminada', 'success');
  } catch (error) {
    console.error('Error eliminando contacto:', error);
    mostrarToast('Error eliminando conversación', 'error');
  }
}

/**
 * Abre modal para editar contacto
 */
export function abrirModalEditarContacto(convId) {
  mostrarModalContacto(convId);
}

/**
 * Actualiza contacto en caché y UI
 */
export function actualizarContactoEnCacheYUI(convId) {
  try {
    // Actualizar en lista
    const item = document.querySelector(`[data-conv-id="${convId}"]`);
    if (item && cacheConvs.value[convId]) {
      const nombre = cacheConvs.value[convId].metadata?.nombre || 'Sin nombre';
      const header = item.querySelector('.conv-header strong');
      if (header) {
        header.textContent = nombre;
      }
    }
  } catch (error) {
    console.warn('Error actualizando UI:', error);
  }
}

/**
 * Renderiza selector de emojis
 */
export function renderEmojis() {
  const container = document.getElementById('emoji-container');
  if (!container) return;

  const categorias = {
    caras: '😀😁😂😃😄😅😆😉😊😋😌😍😎😏😐😒😓😔😕😖😗😘😙😚😜😝😞😠😡😢😣😤😥😦😧😨😩😪😫',
    corazones: '❤️🧡💛💚💙💜🖤🤍🤎💔💕💞💓💗💖💘💝💟💌',
    manos: '👋🤚🖐️✋🖖👌🤌🤏✌️🤞🫰🤟🤘🤙👍👎👊👏🙌👐🤲🤝🤜🤛',
    comida: '🍏🍎🍐🍊🍋🍌🍉🍇🍓🍈🍒🍑🥭🍍🥥🥝🍅🍆🥑🥦🥬🥒🌶️',
  };

  let html = '<div class="emoji-picker">';

  for (const [cat, emojis] of Object.entries(categorias)) {
    html += `<div class="emoji-category" data-category="${cat}">`;
    for (const emoji of emojis) {
      html += `<button class="emoji-btn" data-emoji="${emoji}" style="font-size: 1.5rem; padding: 4px; border: none; background: none; cursor: pointer;">${emoji}</button>`;
    }
    html += '</div>';
  }

  html += '</div>';
  container.innerHTML = html;
}

/**
 * Configura listeners de emojis
 */
export function setupEmojiListeners() {
  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('emoji-btn')) {
      const emoji = e.target.getAttribute('data-emoji');
      const input = document.getElementById('message-input');
      if (input) {
        input.value += emoji;
        input.focus();
      }
    }
  });
}

/**
 * Muestra categoría de emojis
 */
export function showEmojiCategory(categoria) {
  const btns = document.querySelectorAll('.emoji-btn');
  btns.forEach((btn) => btn.style.display = 'none');

  const categoryBtns = document.querySelectorAll(`[data-category="${categoria}"] .emoji-btn`);
  categoryBtns.forEach((btn) => btn.style.display = 'inline-block');
}

/**
 * Configura listeners de attachments
 */
export function setupAttachListeners() {
  document.addEventListener('change', async (e) => {
    if (e.target.id === 'file-input') {
      const file = e.target.files?.[0];
      if (file) {
        await uploadFile(file);
      }
    }
  });
}

/**
 * Sube un archivo
 */
export async function uploadFile(file) {
  if (!file) {
    mostrarToast('Selecciona un archivo', 'warning');
    return;
  }

  const convId = currentConvId.value;
  if (!convId) {
    mostrarToast('No hay conversación abierta', 'error');
    return;
  }

  try {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('convId', convId);

    const response = await fetch('/upload_file', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) throw new Error('Error uploading file');

    const result = await response.json();
    mostrarToast('Archivo subido', 'success');

    addMsg({
      id: Date.now().toString(),
      convId,
      texto: `Archivo: ${file.name}`,
      url: result.url,
      timestamp: Date.now(),
      origen: 'cliente',
      tipo: 'documento',
    });
  } catch (error) {
    console.error('Error uploading file:', error);
    mostrarToast('Error subiendo archivo', 'error');
  }
}

/**
 * Lista etiquetas por conversación
 */
export function listarEtiquetasPorConv(convId) {
  return ETIQUETASPORCONV.value[convId] || [];
}

/**
 * Convierte etiquetas a formato de display
 */
export function convertirEtiquetasFormato(convId) {
  const etiquetasIds = listarEtiquetasPorConv(convId);
  return etiquetasIds
    .map((id) => ETIQUETAS.value.find((e) => e.id === id))
    .filter(Boolean);
}

/**
 * Obtiene badge de cola/etiquetas para conversación
 */
export function obtenerBadgeColaConversacion(convId) {
  const etiquetas = convertirEtiquetasFormato(convId);
  if (etiquetas.length === 0) return '';

  return etiquetas
    .map(
      (e) =>
        `<span class="badge" style="background-color: ${e.color}; margin-right: 4px;">${e.nombre}</span>`
    )
    .join('');
}

/**
 * Configura listeners de contactos
 */
function setupContactosListeners() {
  document.addEventListener('click', (e) => {
    if (e.target.id === 'btn-contact-edit') {
      const convId = e.target.getAttribute('data-convId');
      abrirModalEditarContacto(convId);
    }
    if (e.target.id === 'btn-contact-media') {
      const convId = e.target.getAttribute('data-convId');
      verMediaCompartido(convId);
    }
    if (e.target.id === 'btn-contact-delete') {
      const convId = e.target.getAttribute('data-convId');
      eliminarContacto(convId);
    }
  });
}

/**
 * Escapa caracteres HTML
 */
function escaparHTML(texto) {
  const div = document.createElement('div');
  div.textContent = texto;
  return div.innerHTML;
}

// ============== WATCHERS ==============

// Vigilar cambios en conversaciones y actualizar UI
watch(
  () => cacheConvs.value,
  () => {
    // Aquí puede ir lógica para sincronizar con componentes
  },
  { deep: true }
);

// Vigilar cambios en filtros
watch([filterText, etiquetasSeleccionadas], () => {
  // Triggering reactivity for filtered lists
});

// ============== EXPORT DEFAULT ==============

// Exportar composable
export default {
  // Estado reactivo
  cacheConvs,
  currentConvId,
  unreadMessages,
  filterText,
  etiquetasSeleccionadas,
  ETIQUETAS,
  ETIQUETASPORCONV,
  colorSeleccionado,

  // Computadas
  conversacionesAbiertas,
  conversacionesCerradas,
  conversacionesNuevas,
  totalNoLeidos,

  // Funciones
  inicializarChat,
  limpiarCache,
  renderConv,
  addMsg,
  enviar,
  drawAll,
  list,
  buscarMensaje,
  mostrarModalContacto,
  marcar,
  verMediaCompartido,
  eliminarContacto,
  abrirModalEditarContacto,
  actualizarContactoEnCacheYUI,
  renderEmojis,
  setupEmojiListeners,
  showEmojiCategory,
  setupAttachListeners,
  uploadFile,
  listarEtiquetasPorConv,
  convertirEtiquetasFormato,
  obtenerBadgeColaConversacion,
};
