const API_BASE =
  process.env.NEXT_PUBLIC_CHAT_API_URL?.trim() || "http://localhost:3001";

export interface FiltrosReporte {
  entidad?: string;
  cola?: string;
  desde?: string;
  hasta?: string;
  estado?: string;
  limite?: number;
}

export interface MetricasResumen {
  total: number;
  activas: number;
  cerradasHoy: number;
  promedioDuracion: string;
}

export interface ConversacionReporte {
  id: string;
  telefono: string;
  dni: string;
  nombre: string;
  entidad: string;
  agente: string;
  cola: string;
  estado: string;
  inicio: string;
  fin: string | null;
  duracion: string;
  tipificacion: string;
  observaciones: string;
}

export interface ConversacionDetalle extends ConversacionReporte {
  legacyId?: string | number | null;
  origen: string;
  salaId: string | null;
  ultimaActividad: string | null;
  observaciones: string;
  etiqueta: string;
  totalMensajes: number;
  transferido: boolean;
  transferencias: {
    desde: string;
    hacia: string;
    fecha: string;
    motivo?: string;
  }[];
  contacto: {
    email: string;
    ciudad: string;
    documento: string;
    direccion: string;
  } | null;
}

export interface TransferenciaReporte {
  desde: string;
  hacia: string;
  desdeNombre: string;
  haciaNombre: string;
  fecha: string;
  comentario: string;
}

export interface ActividadAgente {
  id: string;
  telefono: string;
  nombre: string;
  agenteId: string;
  agenteNombre: string;
  cola: string;
  estado: string;
  inicio: string;
  fin: string | null;
  duracion: string;
  transferido: boolean;
  transferencias: TransferenciaReporte[];
}

export interface TransferenciaActiva {
  desde: string;
  hacia: string;
  desdeNombre: string;
  haciaNombre: string;
  fecha?: string;
}

export interface ConversacionActiva {
  id: string;
  salaId: string | null;
  telefono: string;
  nombre: string;
  agenteId: string;
  agenteNombre: string;
  cola: string;
  estado: string;
  inicio: string;
  duracion: string;
  mensajesCount: number;
  /** true = conversación con agente asignado (en vivo) */
  enVivo: boolean;
  sesionRuntime?: boolean;
  transferido?: boolean;
  transferencias?: TransferenciaActiva[];
  ultimaTransferencia?: TransferenciaActiva | null;
}

export interface MensajeChat {
  id: string;
  emisor: string;
  mensaje: string;
  tipo: string;
  fecha: string | null;
  origen: string | null;
  archivoUrl?: string | null;
}

export interface OpcionMenu {
  titulo: string;
  postback: string;
  cola: string;
  mensaje_espera: string;
}

export interface BotConfig {
  saludo_menu: string;
  opciones_menu: OpcionMenu[];
  mensaje_no_agentes: string;
  mensaje_despedida: string;
}

export interface Agente {
  id: string | number;
  usuario: string;
  nombre?: string;
  exten?: string;
}

export function buildAgentNameLookup(agentes: Agente[]) {
  const map = new Map<string, string>();
  agentes.forEach((ag) => {
    const nombre = String(ag.nombre || "").trim();
    if (!nombre) return;
    [ag.id, ag.exten, ag.usuario].forEach((key) => {
      const value = String(key ?? "").trim();
      if (value) map.set(value, nombre);
    });
  });
  return map;
}

export function resolveAgentDisplayName(
  agenteId: string | number | null | undefined,
  lookup: Map<string, string>,
  backendNombre?: string,
) {
  const id = String(agenteId ?? "").trim();
  const fromBackend = String(backendNombre || "").trim();
  if (fromBackend && fromBackend !== id) return fromBackend;
  if (!id) return "—";
  return lookup.get(id) || "—";
}

async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers || {}),
    },
  });
  const json = await res.json();
  if (!res.ok || json.ok === false) {
    throw new Error(json.error || "Error en la solicitud");
  }
  return json.data ?? json;
}

function buildQuery(filtros: FiltrosReporte = {}) {
  const params = new URLSearchParams();
  if (filtros.entidad) params.set("entidad", filtros.entidad);
  if (filtros.cola) params.set("cola", filtros.cola);
  if (filtros.desde) params.set("desde", filtros.desde);
  if (filtros.hasta) params.set("hasta", filtros.hasta);
  if (filtros.estado) params.set("estado", filtros.estado);
  if (filtros.limite) params.set("limite", String(filtros.limite));
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export async function getResumen(filtros: FiltrosReporte = {}) {
  return fetchApi<{
    metricas: MetricasResumen;
    grafico: { categorias: string[]; series: { name: string; data: number[] }[] };
  }>(`/api/reportes-chats/resumen${buildQuery(filtros)}`);
}

export async function getConversaciones(filtros: FiltrosReporte = {}) {
  return fetchApi<ConversacionReporte[]>(
    `/api/reportes-chats/conversaciones${buildQuery(filtros)}`,
  );
}

export async function getActividadAgentes(filtros: FiltrosReporte = {}) {
  return fetchApi<ActividadAgente[]>(
    `/api/reportes-chats/agentes${buildQuery(filtros)}`,
  );
}

export async function getConversacionesActivas() {
  return fetchApi<ConversacionActiva[]>("/api/reportes-chats/activas");
}

export async function getConversacionDetalle(conversacionId: string) {
  return fetchApi<ConversacionDetalle>(
    `/api/reportes-chats/conversaciones/${conversacionId}`,
  );
}

export async function getMensajes(conversacionId: string) {
  return fetchApi<MensajeChat[]>(
    `/api/reportes-chats/mensajes/${conversacionId}`,
  );
}

export async function transferirConversacion(payload: {
  conversacionId: string;
  agenteDestino: string;
  agenteOrigen?: string;
  motivo?: string;
}) {
  const res = await fetch(`${API_BASE}/api/reportes-chats/transferir`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  if (!res.ok || json.ok === false) {
    throw new Error(json.error || "No se pudo transferir");
  }
  return json;
}

export async function enviarMensajeSupervisor(payload: {
  conversacionId: string;
  mensaje: string;
  supervisorId?: string;
}) {
  const res = await fetch(`${API_BASE}/api/reportes-chats/supervisor-mensaje`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  if (!res.ok || json.ok === false) {
    throw new Error(json.error || "No se pudo enviar el mensaje");
  }
  return json;
}

export async function getBotConfig() {
  return fetchApi<BotConfig>("/api/reportes-chats/bot-config");
}

export async function saveBotConfig(config: BotConfig) {
  const res = await fetch(`${API_BASE}/api/reportes-chats/bot-config`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
  const json = await res.json();
  if (!res.ok || json.ok === false) {
    throw new Error(json.error || "No se pudo guardar la configuración");
  }
  return json;
}

export async function getEntidades() {
  return fetchApi<string[]>("/api/reportes-chats/entidades");
}

export async function getColas() {
  return fetchApi<string[]>("/api/reportes-chats/colas");
}

export interface ContactoReporte {
  id: string;
  nombre: string;
  telefono: string;
  documento: string;
  email: string;
  entidad: string;
  ciudad: string;
  estado: string;
  estadoRaw: string;
  estadoConexion: string;
  activo: boolean;
}

export async function getContactosReporte(params?: {
  search?: string;
  limite?: number;
  skip?: number;
}) {
  const qs = new URLSearchParams();
  if (params?.search) qs.set("search", params.search);
  if (params?.limite) qs.set("limite", String(params.limite));
  if (params?.skip) qs.set("skip", String(params.skip));
  const query = qs.toString();
  return fetchApi<{ items: ContactoReporte[]; total: number }>(
    `/api/reportes-chats/contactos${query ? `?${query}` : ""}`,
  );
}

export async function deleteContactoReporte(contactoId: string) {
  const res = await fetch(
    `${API_BASE}/api/reportes-chats/contactos/${encodeURIComponent(contactoId)}`,
    { method: "DELETE" },
  );
  const json = await res.json();
  if (!res.ok || json.ok === false) {
    throw new Error(json.error || "No se pudo eliminar el contacto");
  }
  return json;
}

export async function getAgentes() {
  const res = await fetch(`${API_BASE}/api/usuarios`);
  if (!res.ok) throw new Error("No se pudieron cargar los agentes");
  return res.json() as Promise<Agente[]>;
}
