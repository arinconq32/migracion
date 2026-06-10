import { emitSocket } from "./useSocket";
import {
  mostrarToast,
  mostrarToastPermanente,
  alertarMensajeEntrante,
} from "./useNotificaciones";

const supportToastsByClient = new Map();

function dismissSupportToast(from, { showNotice = false, message = "" } = {}) {
  const key = String(from || "").trim();
  if (!key) return;

  const toast = supportToastsByClient.get(key);
  if (toast) {
    toast.remove();
    supportToastsByClient.delete(key);
  }

  if (showNotice) {
    mostrarToast(message || "Solicitud expirada por tiempo", "warning");
  }
}

export function clearAllSupportToasts() {
  for (const [, toast] of supportToastsByClient.entries()) {
    toast?.remove?.();
  }
  supportToastsByClient.clear();
}

export function handleSupportQueueAvailable(data, userId) {
  const from = String(data?.from || "").trim();
  if (!from) return;

  const targetUserId = String(data?.userId || "").trim();
  const currentUserId = String(userId || "").trim();
  if (targetUserId && currentUserId && targetUserId !== currentUserId) {
    return;
  }

  if (supportToastsByClient.has(from)) return;

  const colaLabel = data?.cola ? ` · Cola: ${data.cola}` : "";
  const message = `Nueva solicitud de WhatsApp desde <strong>${from}</strong>${colaLabel}. ¿Deseas aceptarla?`;

  alertarMensajeEntrante({
    titulo: "Solicitud de conversación",
    cuerpo: `Cliente ${from}${colaLabel}`,
    tag: `support-request-${from}`,
  });

  const toast = mostrarToastPermanente(
    message,
    "info",
    () => {
      emitSocket("agente_disponible", {
        from,
        numero: currentUserId,
        agenteId: currentUserId,
      });
      dismissSupportToast(from);
    },
    () => dismissSupportToast(from),
  );

  if (toast) {
    supportToastsByClient.set(from, toast);
  }
}

export function handleSupportRequestExpired({ from, mensaje } = {}) {
  dismissSupportToast(from, {
    showNotice: true,
    message: mensaje || "La solicitud de conversación expiró",
  });
}

export function handleSupportClientAlreadyAssigned({ from } = {}) {
  dismissSupportToast(from, {
    showNotice: true,
    message: "La conversación ya fue tomada por otro agente",
  });
}

export function handleSupportAssignedToOther({ from, mensaje } = {}) {
  dismissSupportToast(from, {
    showNotice: Boolean(mensaje),
    message: mensaje || "",
  });
}

export function handleSupportActiveLimit({ mensaje, maximo } = {}) {
  mostrarToast(
    mensaje ||
      `No puedes aceptar más conversaciones activas (máximo ${maximo || 3})`,
    "warning",
  );
}

export function handleSupportAssignmentConfirmed(data, syncConversations) {
  const from = String(data?.from || data?.numero || "").trim();
  if (from) dismissSupportToast(from);

  mostrarToast(
    data?.mensaje || `Conversación con ${from || "cliente"} asignada`,
    "success",
  );

  if (typeof syncConversations === "function") {
    void syncConversations(true);
  }
}
