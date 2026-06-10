import type { MensajeChat } from "@/lib/reportesChatsApi";

export function esMensajeSupervisor(emisor?: string, origen?: string | null) {
  const o = String(origen || "").toLowerCase().trim();
  const e = String(emisor || "").toLowerCase().trim();
  return o === "supervisor" || e === "supervisor";
}

export function normalizeEmisor(emisor: string, origen?: string | null) {
  if (esMensajeSupervisor(emisor, origen)) return "supervisor";
  const value = String(emisor || "").toLowerCase().trim();
  if (value === "cliente" || value === "user" || value === "customer") {
    return "cliente";
  }
  if (value === "agente" || value === "agent") return "agente";
  if (value === "sistema" || value === "system") return "sistema";
  if (value === "bot") return "bot";
  if (/^\+?\d{8,}$/.test(value)) return "cliente";
  return value || "sistema";
}

export function emisorLabel(emisor: string, origen?: string | null) {
  const map: Record<string, string> = {
    cliente: "Cliente",
    agente: "Agente",
    supervisor: "Supervisor",
    sistema: "Sistema",
    bot: "Bot",
  };
  return map[normalizeEmisor(emisor, origen)] || emisor;
}

export function parseFecha(value: string | number | null | undefined) {
  if (value == null || value === "") return null;
  const date =
    typeof value === "number" ? new Date(value) : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatHora(value: string | number | null | undefined) {
  const date = parseFecha(value);
  if (!date) return "";
  return date.toLocaleTimeString("es-CO", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDia(value: string | number | null | undefined) {
  const date = parseFecha(value);
  if (!date) return "";
  return date.toLocaleDateString("es-CO", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export function textoMensaje(m: MensajeChat) {
  const texto = String(m.mensaje || "")
    .trim()
    .replace(/^\[supervisor\]\s*/i, "");
  if (texto) return texto;
  if (m.archivoUrl) return "📎 Archivo adjunto";
  return "—";
}

export function displayContacto(nombre?: string, telefono?: string) {
  const cleanNombre = String(nombre || "").trim();
  if (
    cleanNombre &&
    cleanNombre !== "—" &&
    cleanNombre !== "Sin nombre" &&
    !/^\+?\d{8,}$/.test(cleanNombre)
  ) {
    return cleanNombre;
  }
  return cleanNombre || telefono || "—";
}

function esNombreGenerico(nombre: string) {
  if (!nombre || nombre === "—" || nombre === "Sin nombre") return true;
  if (/^\+?\d{8,}$/.test(nombre)) return true;
  if (/^cliente(\s|$)/i.test(nombre)) return true;
  if (/^contacto\s+desconocido/i.test(nombre)) return true;
  if (/^conversacion(\s|$)/i.test(nombre)) return true;
  return false;
}

function limpiarNombreContacto(nombre: string) {
  let clean = nombre.split("|")[0].trim();
  const commaParts = clean.split(",");
  if (
    commaParts.length > 1 &&
    /^\d+[a-z]?$/i.test(String(commaParts[1] || "").trim())
  ) {
    clean = commaParts[0].trim();
  }
  return clean;
}

export function nombreContactoReporte(nombre?: string) {
  const raw = String(nombre || "").trim();
  const cleanNombre = limpiarNombreContacto(raw);
  if (cleanNombre && !esNombreGenerico(cleanNombre)) {
    return cleanNombre;
  }
  return "Sin nombre";
}

function telefonoVisible(telefono?: string) {
  const tel = String(telefono || "").trim();
  if (!tel || tel === "—") return "";
  const digits = tel.replace(/\D/g, "");
  if (digits.length < 4) return "";
  return tel;
}

export function etiquetaConversacionActiva(conv: {
  nombre?: string;
  telefono?: string;
  id?: string;
  cola?: string;
}) {
  const nombre = nombreContactoReporte(conv.nombre);
  if (nombre !== "Sin nombre") return nombre;

  const tel = telefonoVisible(conv.telefono);
  if (tel) return `Sin nombre · ${tel}`;

  const cola = String(conv.cola || "").trim();
  if (cola && cola !== "—") return `Sin nombre · ${cola}`;

  const id = String(conv.id || "").trim();
  if (id) return `Sin nombre · #${id.slice(-6)}`;

  return "Sin nombre";
}

export function agruparPorDia(mensajes: MensajeChat[]) {
  const grupos: { dia: string | null; items: MensajeChat[] }[] = [];
  let diaActual = "";

  for (const msg of mensajes) {
    const date = parseFecha(msg.fecha);
    const dia = date ? date.toDateString() : "sin-fecha";
    if (dia !== diaActual) {
      diaActual = dia;
      grupos.push({ dia: msg.fecha, items: [] });
    }
    grupos[grupos.length - 1].items.push(msg);
  }

  return grupos;
}

export function estiloBurbuja(emisor: string, origen?: string | null) {
  const tipo = normalizeEmisor(emisor, origen);
  const esCliente = tipo === "cliente";
  const esSupervisor = tipo === "supervisor";
  const esSistema = tipo === "sistema" || tipo === "bot";

  return {
    tipo,
    esCliente,
    esSupervisor,
    esSistema,
    alineacion: esSistema
      ? "justify-center"
      : esCliente
        ? "justify-start"
        : "justify-end",
    clase:
      esSistema
        ? "max-w-[90%] bg-gray-200/80 text-gray-600 italic dark:bg-gray-800"
        : esSupervisor
          ? "max-w-[78%] bg-amber-50 text-amber-900 ring-1 ring-amber-200 dark:bg-amber-500/10 dark:ring-amber-500/30"
          : esCliente
            ? "max-w-[78%] bg-white text-gray-800 ring-1 ring-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:ring-gray-700"
            : "max-w-[78%] bg-gray-800 text-white dark:bg-gray-700",
  };
}
