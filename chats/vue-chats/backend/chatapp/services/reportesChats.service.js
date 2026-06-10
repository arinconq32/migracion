const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const messageBuffer = require("./messageBuffer.service");
const { fetchMessagesForConversation } = require("../utils/messageQuery");
const {
  buildContactLookup,
  enrichConversation,
  resolveContactNameFromContact,
  findContactForConversation,
} = require("../utils/contactResolver");

const CONFIG_FILE = path.join(__dirname, "..", "..", "chatbot-config.json");

const DEFAULT_OPCIONES = [
  {
    titulo: "🛠️ Soporte",
    postback: "btn_soporte",
    cola: "LuisPruebas",
    mensaje_espera:
      "🛠️ *Conectando con Soporte*\n\n⏳ Buscando agente disponible...\n\n_Por favor espera un momento._",
  },
  {
    titulo: "💰 Ventas",
    postback: "btn_ventas",
    cola: "colaVentas",
    mensaje_espera:
      "💰 *Conectando con Ventas*\n\n⏳ Buscando agente disponible...\n\n_Por favor espera un momento._",
  },
  {
    titulo: "🔧 Mantenimiento",
    postback: "btn_mantenimiento",
    cola: "colaMantenimiento",
    mensaje_espera:
      "🔧 *Conectando con Mantenimiento*\n\n⏳ Buscando agente disponible...\n\n_Por favor espera un momento._",
  },
];

const CONFIG_DEFAULTS = {
  saludo_menu: "👋 ¡Bienvenido!\n\n¿En qué podemos ayudarte hoy?",
  opciones_menu: DEFAULT_OPCIONES,
  mensaje_no_agentes:
    "⏰ No hay agentes disponibles en este momento.\n\nHas vuelto al chatbot automático.",
  mensaje_despedida: "👋 ¡Hasta pronto! Fue un placer atenderte.",
};

function parseDate(value, endOfDay = false) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  if (endOfDay) {
    date.setHours(23, 59, 59, 999);
  } else {
    date.setHours(0, 0, 0, 0);
  }
  return date;
}

function phoneLookupKey(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length > 10) return digits.slice(-10);
  return digits;
}

function limpiarNombreContacto(nombre) {
  let clean = String(nombre || "").split("|")[0].trim();
  const commaParts = clean.split(",");
  if (
    commaParts.length > 1 &&
    /^\d+[a-z]?$/i.test(String(commaParts[1] || "").trim())
  ) {
    clean = commaParts[0].trim();
  }
  return clean || "Sin nombre";
}

function formatEstadoContacto(estado) {
  const e = String(estado || "").toLowerCase().trim();
  if (!e || e === "—") return "—";
  if (e === "abierta" || e === "activa") return "Abierta";
  if (e === "cerrada" || e === "cerrado" || e === "closed") return "Cerrada";
  if (e === "nuevo") return "Nuevo";
  if (e === "pendiente") return "Pendiente";
  return estado;
}

function activaDedupKey(item) {
  const phone = phoneLookupKey(item.telefono);
  if (phone) return `phone:${phone}`;
  const contactoId = String(item.contactoId || item.contacto_id || item.data || "").trim();
  if (contactoId) return `contact:${contactoId}`;
  const id = String(item.id || "").trim();
  return id ? `id:${id}` : `id:unknown-${Math.random()}`;
}

function activaPriority(item) {
  let score = 0;
  if (item.sesionRuntime) score += 1000;
  const estado = String(item.estado || "").toLowerCase();
  const agenteId = String(item.agenteId || "").trim();
  const conAgente = Boolean(agenteId && agenteId !== "—");
  if (conAgente && (estado === "abierta" || estado === "activa")) score += 500;
  if (estado === "abierta" || estado === "activa") score += 100;
  if (estado === "pendiente") score += 50;
  if (item.enVivo) score += 200;
  const ts = new Date(item.inicio || item.ultimaActividad || 0).getTime();
  return { score, ts: Number.isNaN(ts) ? 0 : ts };
}

function deduplicateActivas(list = []) {
  const map = new Map();
  for (const item of list) {
    const key = activaDedupKey(item);
    const prev = map.get(key);
    if (!prev) {
      map.set(key, item);
      continue;
    }
    const a = activaPriority(prev);
    const b = activaPriority(item);
    if (b.score > a.score || (b.score === a.score && b.ts >= a.ts)) {
      map.set(key, { ...item, salaId: item.salaId || prev.salaId });
    } else {
      map.set(key, { ...prev, salaId: prev.salaId || item.salaId });
    }
  }
  return [...map.values()].sort((left, right) => {
    const a = activaPriority(left);
    const b = activaPriority(right);
    if (b.score !== a.score) return b.score - a.score;
    return b.ts - a.ts;
  });
}

function normalizeAgentKey(value) {
  if (value === null || value === undefined) return "";
  let normalized = String(value).trim().toLowerCase();
  if (normalized.includes("/")) normalized = normalized.split("/").pop();
  if (normalized.includes("@")) normalized = normalized.split("@")[0];
  return normalized;
}

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function normalizeEmisor(emisor, origen) {
  const value = String(emisor || "").toLowerCase().trim();
  if (value === "cliente" || value === "user" || value === "customer") {
    return "cliente";
  }
  if (value === "agente" || value === "agent") return "agente";
  if (value === "supervisor" || String(origen || "").toLowerCase() === "supervisor") {
    return "supervisor";
  }
  if (value === "sistema" || value === "system") return "sistema";
  if (value === "bot") return "bot";
  if (/^\+?\d{8,}$/.test(value)) return "cliente";
  return value || "sistema";
}

function normalizeFecha(value) {
  if (value == null || value === "") return null;
  const date =
    typeof value === "number" ? new Date(value) : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function textoMensaje(item = {}) {
  const texto = String(
    item.mensaje || item.texto || item.text || item.body || "",
  )
    .trim()
    .replace(/^\[supervisor\]\s*/i, "");
  if (texto) return texto;

  const archivoUrl = String(
    item.archivoUrl || item.archivo_url || item.url || item.mediaUrl || "",
  ).trim();

  const tipo = String(item.tipo || "").toLowerCase();
  if (tipo.includes("image") || tipo.includes("imagen") || tipo === "photo") {
    return archivoUrl ? "📷 Imagen" : "[Imagen]";
  }
  if (tipo.includes("audio") || tipo.includes("voice")) {
    return archivoUrl ? "🎵 Audio" : "[Audio]";
  }
  if (tipo.includes("video")) return archivoUrl ? "🎬 Video" : "[Video]";
  if (tipo.includes("sticker")) return "[Sticker]";
  if (archivoUrl) return "📎 Archivo adjunto";
  if (tipo && tipo !== "texto") return `[${tipo}]`;
  return "";
}

function mergeMensajes(persisted = [], live = []) {
  const map = new Map();
  for (const item of [...persisted, ...live]) {
    const id = String(
      item.id || item._id || `${item.timestamp || item.fecha || ""}-${item.mensaje || item.texto || ""}`,
    );
    if (!map.has(id)) map.set(id, item);
  }

  return [...map.values()].sort((a, b) => {
    const ta = new Date(a.fecha || a.timestamp || a.ts || 0).getTime();
    const tb = new Date(b.fecha || b.timestamp || b.ts || 0).getTime();
    return ta - tb;
  });
}

function mapMensajeReporte(item = {}) {
  const emisor = normalizeEmisor(item.emisor || item.autor, item.origen);
  const mensaje = textoMensaje(item);
  const archivoUrl = String(
    item.archivoUrl || item.archivo_url || item.url || item.mediaUrl || "",
  ).trim();

  return {
    id: String(item.id || item._id || `${item.timestamp || Date.now()}`),
    emisor,
    mensaje,
    tipo: item.tipo || "texto",
    fecha: normalizeFecha(item.fecha || item.timestamp || item.ts),
    origen: item.origen || null,
    archivoUrl: archivoUrl || null,
  };
}

function buildDateFilter(desde, hasta) {
  const filter = {};
  const start = parseDate(desde);
  const end = parseDate(hasta, true);
  if (start || end) {
    filter.inicio = {};
    if (start) filter.inicio.$gte = start;
    if (end) filter.inicio.$lte = end;
  }
  return filter;
}

class ReportesChatsService {
  constructor({ runtimeService = null, chatModel = null } = {}) {
    this.runtimeService = runtimeService;
    this.chatModel = chatModel;
  }

  setRuntimeService(service) {
    this.runtimeService = service;
  }

  setChatModel(model) {
    this.chatModel = model;
  }

  pickAgentDisplayName(agentNames, agenteId) {
    const id = String(agenteId || "").trim();
    if (!id) return "—";
    const nombre = String(agentNames.get(id) || "").trim();
    if (nombre && nombre !== id) return nombre;
    return "—";
  }

  formatAgentLabel(agentNames, agenteId) {
    const id = String(agenteId || "").trim();
    if (!id) return "—";
    const nombre = this.pickAgentDisplayName(agentNames, id);
    return nombre !== "—" ? nombre : id;
  }

  buildActivasDbFilter() {
    return {
      estado: { $in: ["abierta", "nuevo", "pendiente", "activa", "activo"] },
    };
  }

  esConversacionEnVivo(item, estado) {
    const e = String(estado || item?.estado || "").toLowerCase();
    const agenteId = String(item?.agenteId || "").trim();
    const conAgente = Boolean(agenteId && agenteId !== "—");
    if (item?.sesionRuntime) return true;
    return conAgente && (e === "abierta" || e === "activa");
  }

  async findConversationRecord(conversacionId) {
    const db = this.getDb();
    const { ObjectId } = mongoose.Types;
    const convId = String(conversacionId || "").trim();
    if (!convId) return null;

    if (this.chatModel?.findConversationByAnyId) {
      const found = await this.chatModel.findConversationByAnyId(convId);
      if (found) return found;
    }

    let query = { _id: convId };
    if (ObjectId.isValid(convId)) {
      query = {
        $or: [{ _id: new ObjectId(convId) }, { id: convId }],
      };
    }
    return db.collection("conversaciones").findOne(query);
  }

  async resolveAgentIdentity(agentRef) {
    const ref = String(agentRef || "").trim();
    if (!ref) return null;

    try {
      const UsuarioModel = require("../models/UsuarioModel.mysql");
      const usuarios = await UsuarioModel.getAllUsuarios();
      const found = usuarios.find((u) => {
        const keys = [u.id, u._id, u.exten, u.usuario, u.agente]
          .map((key) => String(key || "").trim())
          .filter(Boolean);
        return (
          keys.includes(ref) ||
          keys.some((key) => normalizeAgentKey(key) === normalizeAgentKey(ref))
        );
      });

      if (found) {
        return {
          crmId: String(found.id || found._id || ref).trim(),
          exten: String(found.exten || "").trim() || null,
          usuario: String(found.usuario || "").trim() || null,
          nombre: String(found.nombre || found.name || "").trim() || null,
        };
      }
    } catch (_) {
      // fallback al valor recibido
    }

    return {
      crmId: ref,
      exten: null,
      usuario: null,
      nombre: null,
    };
  }

  async resolveAgentNames(agentIds = []) {
    const ids = [
      ...new Set(
        agentIds.map((id) => String(id || "").trim()).filter(Boolean),
      ),
    ];
    const agentNames = new Map();
    if (!ids.length) return agentNames;

    if (this.chatModel?.getAgentDisplayName) {
      await Promise.all(
        ids.map(async (id) => {
          try {
            const name = String(
              (await this.chatModel.getAgentDisplayName(id)) || "",
            ).trim();
            if (name && name !== id) agentNames.set(id, name);
          } catch (_) {
            // fallback vía tabla crm
          }
        }),
      );
    }

    const missing = ids.filter((id) => !agentNames.has(id));
    if (!missing.length) return agentNames;

    try {
      const UsuarioModel = require("../models/UsuarioModel.mysql");
      const usuarios = await UsuarioModel.getAllUsuarios();
      const byKey = new Map();
      usuarios.forEach((u) => {
        const nombre = String(u.nombre || u.name || "").trim();
        if (!nombre) return;
        [u.exten, u.id, u._id, u.usuario, u.agente].forEach((key) => {
          const value = String(key || "").trim();
          if (!value) return;
          byKey.set(value, nombre);
          const normalized = normalizeAgentKey(value);
          if (normalized) byKey.set(normalized, nombre);
        });
      });
      missing.forEach((id) => {
        const nombre = byKey.get(id) || byKey.get(normalizeAgentKey(id));
        if (nombre) agentNames.set(id, nombre);
      });
    } catch (_) {
      // sin nombres adicionales
    }

    return agentNames;
  }

  getDb() {
    return mongoose.connection.db;
  }

  async getEntidades() {
    const db = this.getDb();
    const values = await db.collection("contactos").distinct("entidad");
    return values
      .map((v) => String(v || "").trim())
      .filter((v) => v && v !== "-")
      .sort((a, b) => a.localeCompare(b, "es"));
  }

  async getColas() {
    const db = this.getDb();
    const fromConv = await db.collection("conversaciones").distinct("cola");
    const fromConfig = this.getBotConfig().opciones_menu.map((o) => o.cola);
    const all = [...fromConv, ...fromConfig]
      .map((v) => String(v || "").trim())
      .filter(Boolean);
    return [...new Set(all)].sort((a, b) => a.localeCompare(b, "es"));
  }

  applyEstadoFilter(filter, estado) {
    const normalized = String(estado || "").trim().toLowerCase();
    if (!normalized || normalized === "todos") return filter;

    if (normalized === "abierta" || normalized === "abierto") {
      filter.estado = { $in: ["abierta", "nuevo", "pendiente", "activa"] };
    } else if (normalized === "cerrada" || normalized === "cerrado") {
      filter.estado = { $in: ["cerrada", "cerrado"] };
    } else {
      filter.estado = normalized;
    }

    return filter;
  }

  async buildConversationFilter({ entidad, cola, desde, hasta, estado }) {
    const filter = { ...buildDateFilter(desde, hasta) };
    if (cola) filter.cola = cola;
    this.applyEstadoFilter(filter, estado);

    if (entidad) {
      const db = this.getDb();
      const contactos = await db
        .collection("contactos")
        .find({ entidad })
        .project({ tels: 1, telefono: 1, data: 1 })
        .toArray();
      const phones = new Set();
      contactos.forEach((c) => {
        [c.tels, c.telefono, c.data].forEach((p) => {
          const v = String(p || "").trim();
          if (v) phones.add(v);
        });
      });
      if (phones.size === 0) {
        return { _id: null };
      }
      filter.$or = [
        { telefono: { $in: [...phones] } },
        { contactoId: { $in: [...phones] } },
        { contacto_id: { $in: [...phones] } },
      ];
    }

    return filter;
  }

  async getResumen({ entidad, cola, desde, hasta }) {
    const db = this.getDb();
    const filter = await this.buildConversationFilter({
      entidad,
      cola,
      desde,
      hasta,
    });

    if (filter._id === null) {
      return {
        metricas: { total: 0, activas: 0, cerradasHoy: 0, promedioDuracion: "—" },
        grafico: { categorias: [], series: [] },
      };
    }

    const conversaciones = await db
      .collection("conversaciones")
      .find(filter)
      .toArray();

    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    let totalDuracion = 0;
    let conDuracion = 0;
    let activas = 0;
    let cerradasHoy = 0;

    const porDia = new Map();

    for (const conv of conversaciones) {
      const estado = String(conv.estado || "").toLowerCase();
      if (estado === "abierta" || estado === "nuevo" || estado === "pendiente") {
        activas++;
      }

      const fin = conv.fin ? new Date(conv.fin) : null;
      if (fin && fin >= hoy && estado === "cerrada") {
        cerradasHoy++;
      }

      const inicio = new Date(conv.inicio || 0);
      const finMs = fin ? fin.getTime() : Date.now();
      const inicioMs = inicio.getTime();
      if (Number.isFinite(inicioMs) && inicioMs > 0) {
        totalDuracion += finMs - inicioMs;
        conDuracion++;
        const key = inicio.toISOString().slice(0, 10);
        porDia.set(key, (porDia.get(key) || 0) + 1);
      }
    }

    const categorias = [...porDia.keys()].sort();
    const series = categorias.map((k) => porDia.get(k));

    return {
      metricas: {
        total: conversaciones.length,
        activas,
        cerradasHoy,
        promedioDuracion: formatDuration(
          conDuracion ? totalDuracion / conDuracion : 0,
        ),
      },
      grafico: {
        categorias,
        series: [{ name: "Conversaciones", data: series }],
      },
    };
  }

  async getConversaciones({ entidad, cola, desde, hasta, limite = 50 }) {
    const db = this.getDb();
    const filter = await this.buildConversationFilter({
      entidad,
      cola,
      desde,
      hasta,
    });

    if (filter._id === null) return [];

    const rows = await db
      .collection("conversaciones")
      .find(filter)
      .sort({ inicio: -1 })
      .limit(Number(limite) || 50)
      .toArray();

    const contactoIds = [
      ...new Set(
        rows
          .map((r) => String(r.contactoId || r.contacto_id || r.telefono || ""))
          .filter(Boolean),
      ),
    ];

    const contactos = contactoIds.length
      ? await db
          .collection("contactos")
          .find({
            $or: [
              { tels: { $in: contactoIds } },
              { telefono: { $in: contactoIds } },
              { data: { $in: contactoIds } },
              { dni: { $in: contactoIds } },
              { documento: { $in: contactoIds } },
            ],
          })
          .toArray()
      : [];

    const contactoByPhone = new Map();
    contactos.forEach((c) => {
      [c.tels, c.telefono, c.data, c.dni, c.documento].forEach((p) => {
        const v = String(p || "").trim();
        if (v) contactoByPhone.set(v, c);
      });
    });

    return rows.map((conv) => {
      const phone = String(conv.telefono || conv.tels || "").trim();
      const contacto =
        contactoByPhone.get(phone) ||
        contactoByPhone.get(String(conv.contactoId || conv.contacto_id || ""));
      const inicio = new Date(conv.inicio || 0);
      const fin = conv.fin ? new Date(conv.fin) : null;
      const duracionMs = fin
        ? fin.getTime() - inicio.getTime()
        : Date.now() - inicio.getTime();

      const tipificacion = this.chatModel?.extractHistoryTipificacion
        ? this.chatModel.extractHistoryTipificacion(conv)
        : conv.tipificaciones || conv.etiqueta || "—";
      const observaciones = this.chatModel?.extractHistoryObservacion
        ? this.chatModel.extractHistoryObservacion(conv)
        : conv.observaciones || "—";
      const dni =
        contacto?.dni ||
        contacto?.documento ||
        contacto?.data ||
        conv.dni ||
        "—";

      return {
        id: String(conv._id || conv.id || ""),
        telefono: phone || "—",
        dni,
        nombre: conv.nombre || conv.nombreContacto || contacto?.nombre || "—",
        entidad: contacto?.entidad || "—",
        agente: conv.agenteId || conv.agente_id || "—",
        cola: conv.cola || "—",
        estado: conv.estado || "—",
        inicio: conv.inicio,
        fin: conv.fin || null,
        duracion: formatDuration(duracionMs),
        tipificacion,
        observaciones,
      };
    });
  }

  async getActividadAgentes({ entidad, cola, desde, hasta, estado, limite = 100 }) {
    const db = this.getDb();
    const filter = await this.buildConversationFilter({
      entidad,
      cola,
      desde,
      hasta,
      estado,
    });

    if (filter._id === null) return [];

    const rows = await db
      .collection("conversaciones")
      .find({
        ...filter,
        $or: [
          { agenteId: { $exists: true, $ne: null, $ne: "" } },
          { agente_id: { $exists: true, $ne: null, $ne: "" } },
        ],
      })
      .sort({ inicio: -1 })
      .limit(Number(limite) || 100)
      .toArray();

    const agentIds = new Set();
    rows.forEach((conv) => {
      const agenteId = String(conv.agenteId || conv.agente_id || "").trim();
      if (agenteId) agentIds.add(agenteId);
      [conv.agente_origen_exten, conv.agente_destino_exten].forEach((value) => {
        const id = String(value || "").trim();
        if (id) agentIds.add(id);
      });
      const transferencias = Array.isArray(conv.metadata?.transferencias)
        ? conv.metadata.transferencias
        : [];
      transferencias.forEach((t) => {
        [t.desde, t.hacia, t.agenteOrigen, t.agenteDestino].forEach((value) => {
          const id = String(value || "").trim();
          if (id) agentIds.add(id);
        });
      });
    });

    const agentNames = await this.resolveAgentNames([...agentIds]);

    return rows.map((conv) => {
      const convId = String(conv._id || conv.id || "");
      const agenteId = String(conv.agenteId || conv.agente_id || "").trim();
      const inicio = new Date(conv.inicio || 0);
      const fin = conv.fin ? new Date(conv.fin) : null;
      const duracionMs = fin
        ? fin.getTime() - inicio.getTime()
        : Date.now() - inicio.getTime();

      const transferencias = Array.isArray(conv.metadata?.transferencias)
        ? conv.metadata.transferencias
        : [];
      const transferido =
        transferencias.length > 0 ||
        Boolean(conv.agente_origen_exten || conv.agente_destino_exten);

      return {
        id: convId,
        telefono: conv.telefono || conv.tels || "—",
        nombre: conv.nombre || conv.nombreContacto || "—",
        agenteId,
        agenteNombre: this.pickAgentDisplayName(agentNames, agenteId),
        cola: conv.cola || "—",
        estado: conv.estado || "—",
        inicio: conv.inicio,
        fin: conv.fin || null,
        duracion: formatDuration(duracionMs),
        transferido,
        transferencias: transferencias.map((t) => {
          const desde = String(t.desde || t.agenteOrigen || "").trim() || "—";
          const hacia = String(t.hacia || t.agenteDestino || "").trim() || "—";
          return {
            desde,
            hacia,
            desdeNombre: this.formatAgentLabel(agentNames, desde),
            haciaNombre: this.formatAgentLabel(agentNames, hacia),
            fecha: t.fecha || t.timestamp || null,
            comentario: String(t.motivo || t.comentario || "").trim() || "—",
          };
        }),
        agenteOrigen: conv.agente_origen_exten || null,
        agenteDestino: conv.agente_destino_exten || null,
      };
    });
  }

  async enrichActivasConContacto(activas) {
    if (!activas.length) return activas;

    const db = this.getDb();
    const { ObjectId } = mongoose.Types;
    const ids = [...new Set(activas.map((item) => item.id).filter(Boolean))];

    const convQueries = [];
    const objectIds = ids.filter((id) => ObjectId.isValid(id));
    if (objectIds.length) {
      convQueries.push({
        _id: { $in: objectIds.map((id) => new ObjectId(id)) },
      });
    }
    if (ids.length) {
      convQueries.push({ id: { $in: ids } });
    }

    const conversaciones = convQueries.length
      ? await db.collection("conversaciones").find({ $or: convQueries }).toArray()
      : [];

    const convById = new Map();
    conversaciones.forEach((conv) => {
      convById.set(String(conv._id || conv.id || ""), conv);
    });

    const mergedForLookup = activas.map((item) => {
      const conv = convById.get(item.id) || {};
      return {
        ...conv,
        _id: conv._id || item.id,
        id: item.id,
        telefono: item.telefono || conv.telefono || conv.tels || "",
        tels: item.telefono || conv.tels || conv.telefono || "",
        agenteId: item.agenteId || conv.agenteId || conv.agente_id,
        agente_id: item.agenteId || conv.agente_id || conv.agenteId,
        estado: item.estado || conv.estado,
        cola: item.cola || conv.cola,
      };
    });

    const lookup = await buildContactLookup(db, mergedForLookup);
    const enriched = mergedForLookup.map((conv) =>
      enrichConversation(conv, lookup),
    );
    const enrichedById = new Map();
    enriched.forEach((conv) => {
      enrichedById.set(String(conv._id || conv.id || ""), conv);
    });

    const agentIds = new Set();
    activas.forEach((item) => {
      const agenteId = String(item.agenteId || "").trim();
      if (agenteId && agenteId !== "—") agentIds.add(agenteId);
      const conv = convById.get(item.id);
      if (!conv) return;
      [conv.agente_origen_exten, conv.agente_destino_exten].forEach((value) => {
        const id = String(value || "").trim();
        if (id) agentIds.add(id);
      });
      const transferencias = Array.isArray(conv.metadata?.transferencias)
        ? conv.metadata.transferencias
        : [];
      transferencias.forEach((t) => {
        [t.desde, t.hacia, t.agenteOrigen, t.agenteDestino].forEach((value) => {
          const id = String(value || "").trim();
          if (id) agentIds.add(id);
        });
      });
    });
    const agentNames = await this.resolveAgentNames([...agentIds]);

    return activas.map((item) => {
      const conv = convById.get(item.id);
      const enrichedConv = enrichedById.get(item.id);
      const mergedConv = { ...(conv || {}), ...(enrichedConv || {}) };
      const contact = findContactForConversation(mergedConv, lookup);
      const nombre = resolveContactNameFromContact(contact, mergedConv);
      const telefono =
        String(enrichedConv?.telefono || item.telefono || "").trim() || "—";
      const agenteId = String(item.agenteId || "").trim();
      const conAgente = Boolean(agenteId && agenteId !== "—");
      const estado = String(item.estado || conv?.estado || "").toLowerCase();
      const enVivo = this.esConversacionEnVivo(item, estado);
      const transferencias = Array.isArray(conv?.metadata?.transferencias)
        ? conv.metadata.transferencias
        : [];
      const transferido =
        transferencias.length > 0 ||
        Boolean(conv?.agente_origen_exten || conv?.agente_destino_exten);
      const transferenciasFmt = transferencias.map((t) => {
        const desde = String(t.desde || t.agenteOrigen || "").trim();
        const hacia = String(t.hacia || t.agenteDestino || "").trim();
        return {
          desde,
          hacia,
          desdeNombre: this.formatAgentLabel(agentNames, desde),
          haciaNombre: this.formatAgentLabel(agentNames, hacia),
          fecha: t.fecha || t.timestamp,
        };
      });
      const ultimaTransferencia =
        transferenciasFmt[transferenciasFmt.length - 1] || null;

      const contactoId = String(
        contact?.data ||
          contact?.contactoId ||
          conv?.contactoId ||
          conv?.contacto_id ||
          conv?.data ||
          item.contactoId ||
          "",
      ).trim();

      return {
        ...item,
        telefono,
        nombre,
        contactoId,
        enVivo,
        agenteNombre: conAgente
          ? this.formatAgentLabel(agentNames, agenteId)
          : "—",
        transferido,
        transferencias: transferenciasFmt,
        ultimaTransferencia,
      };
    });
  }

  async getConversacionesActivas() {
    const activas = [];
    const seenIds = new Set();
    const runtime = this.runtimeService;

    const pushActiva = (item) => {
      const id = String(item.id || "").trim();
      if (!id || seenIds.has(id)) return;
      seenIds.add(id);
      activas.push(item);
    };

    if (runtime?.activeRooms) {
      for (const room of runtime.activeRooms.values()) {
        if (!room) continue;
        const roomEstado = String(room.estado || "activa").toLowerCase();
        if (["cerrada", "cerrado", "closed"].includes(roomEstado)) continue;
        const agenteId = String(room.agente || room.agenteId || "").trim();
        if (!agenteId) continue;
        pushActiva({
          id: String(room.convId || ""),
          salaId: room.id,
          telefono: room.cliente || "—",
          agenteId,
          cola: room.cola || "—",
          estado: roomEstado || "activa",
          inicio: new Date(room.timestamp || Date.now()),
          duracion: formatDuration(Date.now() - (room.timestamp || Date.now())),
          mensajesCount: room.mensajes?.length || 0,
          sesionRuntime: true,
        });
      }
    }

    const db = this.getDb();
    const dbActivas = await db
      .collection("conversaciones")
      .find(this.buildActivasDbFilter())
      .sort({ ultima_actividad: -1, inicio: -1, _id: -1 })
      .limit(150)
      .toArray();

    for (const conv of dbActivas) {
      const id = String(conv._id || conv.id || "");
      if (!id || seenIds.has(id)) continue;
      const agenteId = String(conv.agenteId || conv.agente_id || "").trim();
      const inicio = new Date(conv.inicio || conv.ultima_actividad || 0);
      pushActiva({
        id,
        salaId: conv.salaId || conv.sala_id || null,
        telefono: conv.telefono || conv.tels || "",
        nombre: conv.nombre || conv.nombreContacto || "",
        contactoId: conv.contactoId || conv.contacto_id || conv.data || "",
        agenteId: agenteId || "—",
        cola: conv.cola || "—",
        estado: conv.estado,
        inicio: conv.inicio,
        ultimaActividad: conv.ultima_actividad || conv.inicio,
        duracion: formatDuration(Date.now() - inicio.getTime()),
        mensajesCount: 0,
      });
    }

    const enriched = await this.enrichActivasConContacto(activas);
    return deduplicateActivas(enriched);
  }

  async getConversacionDetalle(conversacionId) {
    const db = this.getDb();
    const { ObjectId } = mongoose.Types;
    let query = { _id: conversacionId };
    if (ObjectId.isValid(conversacionId)) {
      query = {
        $or: [{ _id: new ObjectId(conversacionId) }, { id: conversacionId }],
      };
    }

    const conv = await db.collection("conversaciones").findOne(query);
    if (!conv) return null;

    const phone = String(conv.telefono || conv.tels || "").trim();
    const contactoIds = [
      phone,
      String(conv.contactoId || conv.contacto_id || ""),
    ].filter(Boolean);

    let contacto = null;
    if (contactoIds.length) {
      contacto = await db.collection("contactos").findOne({
        $or: [
          { tels: { $in: contactoIds } },
          { telefono: { $in: contactoIds } },
          { data: { $in: contactoIds } },
        ],
      });
    }

    const inicio = new Date(conv.inicio || 0);
    const fin = conv.fin ? new Date(conv.fin) : null;
    const duracionMs = fin
      ? fin.getTime() - inicio.getTime()
      : Date.now() - inicio.getTime();

    const convId = String(conv._id || conv.id || "");
    let totalMensajes = 0;
    if (this.chatModel?.getMensajes) {
      const mensajes = await this.chatModel.getMensajes(convId);
      totalMensajes = Array.isArray(mensajes) ? mensajes.length : 0;
    } else {
      totalMensajes = await db.collection("mensajes").countDocuments({
        $or: [{ conversacionId: convId }, { conversacion_id: convId }],
      });
    }

    const transferencias = Array.isArray(conv.metadata?.transferencias)
      ? conv.metadata.transferencias
      : [];

    return {
      id: convId,
      legacyId: conv.legacyId ?? conv.id ?? null,
      telefono: phone || "—",
      nombre: conv.nombre || conv.nombreContacto || contacto?.nombre || "—",
      entidad: contacto?.entidad || "—",
      agente: conv.agenteId || conv.agente_id || "—",
      cola: conv.cola || "—",
      estado: conv.estado || "—",
      origen: conv.origen || "—",
      salaId: conv.salaId || conv.sala_id || null,
      inicio: conv.inicio,
      fin: conv.fin || null,
      ultimaActividad: conv.ultima_actividad || null,
      duracion: formatDuration(duracionMs),
      tipificacion: conv.tipificaciones || conv.etiqueta || "—",
      observaciones: conv.observaciones || "—",
      etiqueta: conv.etiqueta2 || conv.etiqueta || "—",
      totalMensajes,
      transferido:
        transferencias.length > 0 ||
        Boolean(conv.agente_origen_exten || conv.agente_destino_exten),
      transferencias: transferencias.map((t) => ({
        desde: t.desde || t.agenteOrigen || "—",
        hacia: t.hacia || t.agenteDestino || "—",
        fecha: t.fecha || t.timestamp,
        motivo: t.motivo || "",
      })),
      contacto: contacto
        ? {
            email: contacto.email || "—",
            ciudad: contacto.ciudad || "—",
            documento: contacto.dni || contacto.documento || contacto.data || "—",
            direccion: contacto.direccion || "—",
          }
        : null,
    };
  }

  async getMensajesConversacion(conversacionId) {
    const convId = String(conversacionId || "").trim();
    if (!convId) return [];

    const conv = await this.findConversationRecord(convId);
    const phone = String(conv?.telefono || conv?.tels || "").trim();
    let mensajes = [];

    if (this.chatModel?.getMensajes) {
      mensajes = await this.chatModel.getMensajes(convId, null, {
        ignoreAgentCheck: true,
      });
    }

    if (!mensajes.length && conv) {
      const db = this.getDb();
      const rows = await fetchMessagesForConversation(db, convId, conv);
      const normalized = this.chatModel?.normalizeMessage
        ? rows.map((item) => this.chatModel.normalizeMessage(item))
        : rows;
      mensajes = mergeMensajes(mensajes, normalized);
    }

    if (phone) {
      const db = this.getDb();
      const phoneRows = await db
        .collection("mensajes")
        .find({
          $or: [
            { conversacionId: phone },
            { conversacion_id: phone },
            { telefono: phone },
            { tels: phone },
          ],
        })
        .sort({ ts: 1, fecha: 1, timestamp: 1, _id: 1 })
        .toArray();
      const normalizedPhone = this.chatModel?.normalizeMessage
        ? phoneRows.map((item) => this.chatModel.normalizeMessage(item))
        : phoneRows;
      mensajes = mergeMensajes(mensajes, normalizedPhone);
    }

    const buffered = await messageBuffer.getBufferedMessages(convId);
    if (buffered.length) {
      const normalizedBuffered = this.chatModel?.normalizeMessage
        ? buffered.map((item) => this.chatModel.normalizeMessage(item))
        : buffered;
      mensajes = mergeMensajes(mensajes, normalizedBuffered);
    }

    const runtime = this.runtimeService;
    if (runtime?.activeRooms) {
      for (const room of runtime.activeRooms.values()) {
        const roomConvId = String(room.convId || "").trim();
        const roomPhone = String(room.cliente || "").trim();
        if (roomConvId !== convId && roomPhone !== phone) continue;
        if (Array.isArray(room.mensajes) && room.mensajes.length) {
          mensajes = mergeMensajes(mensajes, room.mensajes);
        }
      }
    }

    return (mensajes || [])
      .map((item) => mapMensajeReporte(item))
      .filter((item) => item.mensaje || item.archivoUrl);
  }

  async transferirConversacion({
    conversacionId,
    agenteDestino,
    agenteOrigen,
    motivo = "",
  }) {
    const db = this.getDb();
    const { ObjectId } = mongoose.Types;
    let query = { _id: conversacionId };
    if (ObjectId.isValid(conversacionId)) {
      query = { $or: [{ _id: new ObjectId(conversacionId) }, { id: conversacionId }] };
    }

    const conv = await db.collection("conversaciones").findOne(query);
    if (!conv) {
      return { ok: false, error: "Conversación no encontrada" };
    }

    const origenRef = String(
      agenteOrigen || conv.agenteId || conv.agente_id || "",
    ).trim();
    const destinoRef = String(agenteDestino || "").trim();
    if (!destinoRef) {
      return { ok: false, error: "Agente destino requerido" };
    }

    const origenAgent = await this.resolveAgentIdentity(origenRef);
    const destinoAgent = await this.resolveAgentIdentity(destinoRef);
    const origen = String(origenAgent?.crmId || origenRef).trim();
    const destino = String(destinoAgent?.crmId || destinoRef).trim();

    if (origen === destino) {
      return { ok: false, error: "El agente destino debe ser distinto al origen" };
    }

    const transferRecord = {
      desde: origen,
      hacia: destino,
      desdeExten: origenAgent?.exten || null,
      haciaExten: destinoAgent?.exten || null,
      fecha: new Date().toISOString(),
      motivo: String(motivo || "").trim(),
    };

    const metadata = {
      ...(conv.metadata || {}),
      transferencias: [
        ...(Array.isArray(conv.metadata?.transferencias)
          ? conv.metadata.transferencias
          : []),
        transferRecord,
      ],
    };

    await db.collection("conversaciones").updateOne(
      { _id: conv._id },
      {
        $set: {
          agenteId: destino,
          agente_id: destino,
          agente_origen_exten: origenAgent?.exten || origenRef,
          agente_destino_exten: destinoAgent?.exten || destinoRef,
          metadata,
          ultima_actividad: new Date(),
        },
      },
    );

    const convId = String(conv._id || conv.id || "");

    if (this.chatModel?.invalidateAgentConversationCaches) {
      await this.chatModel.invalidateAgentConversationCaches(origen);
      await this.chatModel.invalidateAgentConversationCaches(destino);
      if (origenAgent?.exten) {
        await this.chatModel.invalidateAgentConversationCaches(origenAgent.exten);
      }
      if (destinoAgent?.exten) {
        await this.chatModel.invalidateAgentConversationCaches(destinoAgent.exten);
      }
    }

    const formatAgentLabel = (agent) => {
      if (!agent) return "";
      const nombre = String(agent.nombre || agent.usuario || "").trim();
      const exten = String(agent.exten || "").trim();
      if (!nombre) return "";
      if (exten && exten !== "undefined") return `${nombre} (ext. ${exten})`;
      return nombre;
    };

    if (this.runtimeService?.notifyConversationTransfer) {
      await this.runtimeService.notifyConversationTransfer({
        convId,
        conv,
        agenteOrigen: origen,
        agenteDestino: destino,
        motivo: transferRecord.motivo,
        desdeNombre: formatAgentLabel(origenAgent),
        haciaNombre: formatAgentLabel(destinoAgent),
        desdeExten: origenAgent?.exten || null,
        haciaExten: destinoAgent?.exten || null,
      });
    }

    try {
      const chatUtils = require("../utils/chatUtils");
      const refs = [
        origen,
        destino,
        origenAgent?.exten,
        destinoAgent?.exten,
      ];
      await chatUtils.broadcastForAgentRefs(refs, { log: false });
    } catch (_) {
      // sin sockets activos
    }

    return { ok: true, transferencia: transferRecord };
  }

  async enviarMensajeSupervisor({ conversacionId, mensaje, supervisorId }) {
    const text = String(mensaje || "").trim();
    if (!text) {
      return { ok: false, error: "Mensaje vacío" };
    }

    const db = this.getDb();
    const { ObjectId } = mongoose.Types;
    let query = { _id: conversacionId };
    if (ObjectId.isValid(conversacionId)) {
      query = { $or: [{ _id: new ObjectId(conversacionId) }, { id: conversacionId }] };
    }

    const conv = await db.collection("conversaciones").findOne(query);
    if (!conv) {
      return { ok: false, error: "Conversación no encontrada" };
    }

    const convId = String(conv._id || conv.id);
    const agenteId = String(conv.agenteId || conv.agente_id || "").trim();

    if (this.runtimeService?.sendSupervisorMessage) {
      return this.runtimeService.sendSupervisorMessage({
        convId,
        mensaje: text,
        supervisorId: String(supervisorId || "supervisor").trim(),
        agenteId,
        cliente: conv.telefono || conv.tels,
      });
    }

    if (this.chatModel?.insertMessage) {
      const messageId = await this.chatModel.insertMessage(
        convId,
        "agente",
        text,
        "texto",
        { origen: "supervisor", emisor_exten: agenteId || supervisorId },
      );
      return { ok: true, messageId };
    }

    return { ok: false, error: "Servicio de mensajes no disponible" };
  }

  getBotConfig() {
    try {
      if (fs.existsSync(CONFIG_FILE)) {
        const raw = fs.readFileSync(CONFIG_FILE, "utf8");
        const parsed = JSON.parse(raw);
        return { ...CONFIG_DEFAULTS, ...parsed };
      }
    } catch (e) {
      console.warn("Error leyendo chatbot-config.json:", e.message);
    }
    return { ...CONFIG_DEFAULTS };
  }

  saveBotConfig(config) {
    const merged = { ...CONFIG_DEFAULTS, ...config };
    if (typeof merged.opciones_menu === "string") {
      try {
        merged.opciones_menu = JSON.parse(merged.opciones_menu);
      } catch {
        merged.opciones_menu = DEFAULT_OPCIONES;
      }
    }
    if (!Array.isArray(merged.opciones_menu)) {
      merged.opciones_menu = DEFAULT_OPCIONES;
    }

    fs.writeFileSync(CONFIG_FILE, JSON.stringify(merged, null, 2), "utf8");
    return merged;
  }

  async getContactos({ search, limite = 300, skip = 0 } = {}) {
    const db = this.getDb();
    const { ObjectId } = mongoose.Types;
    const limit = Math.min(Math.max(Number(limite) || 300, 1), 2000);
    const offset = Math.max(Number(skip) || 0, 0);

    const filter = {};
    const term = String(search || "").trim();
    if (term) {
      const regex = new RegExp(
        term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        "i",
      );
      filter.$or = [
        { nombre: regex },
        { tels: regex },
        { telefono: regex },
        { data: regex },
        { dni: regex },
        { email: regex },
        { entidad: regex },
      ];
    }

    const [contacts, total] = await Promise.all([
      db
        .collection("contactos")
        .find(filter)
        .sort({ nombre: 1, _id: 1 })
        .skip(offset)
        .limit(limit)
        .toArray(),
      db.collection("contactos").countDocuments(filter),
    ]);

    if (!contacts.length) return { items: [], total };

    const dataIds = new Set();
    const phones = new Set();
    contacts.forEach((c) => {
      const data = String(c.data || c.dni || "").trim();
      if (data) dataIds.add(data);
      const telRaw = String(c.tels || c.telefono || "").trim();
      telRaw
        .split("|")
        .map((p) => p.trim())
        .filter(Boolean)
        .forEach((part) => {
          phones.add(part);
          const key = phoneLookupKey(part);
          if (key) phones.add(key);
        });
    });

    const convFilters = [];
    if (dataIds.size) {
      const ids = [...dataIds];
      convFilters.push(
        { contactoId: { $in: ids } },
        { contacto_id: { $in: ids } },
        { data: { $in: ids } },
      );
    }
    if (phones.size) {
      const plist = [...phones];
      convFilters.push({ telefono: { $in: plist } }, { tels: { $in: plist } });
    }

    const conversaciones = convFilters.length
      ? await db
          .collection("conversaciones")
          .find({ $or: convFilters })
          .sort({ inicio: -1 })
          .limit(5000)
          .toArray()
      : [];

    const latestConvByKey = new Map();
    for (const conv of conversaciones) {
      const ts = new Date(conv.ultima_actividad || conv.inicio || 0).getTime();
      const keys = [];
      const phone = phoneLookupKey(conv.telefono || conv.tels || "");
      if (phone) keys.push(`phone:${phone}`);
      const data = String(
        conv.contactoId || conv.contacto_id || conv.data || "",
      ).trim();
      if (data) keys.push(`data:${data}`);
      for (const key of keys) {
        const prev = latestConvByKey.get(key);
        if (!prev || ts > prev.ts) {
          latestConvByKey.set(key, { conv, ts });
        }
      }
    }

    const items = contacts.map((doc) => {
      const id = String(doc._id || doc.id || "");
      const telefono = String(doc.tels || doc.telefono || "")
        .split("|")[0]
        .trim();
      const data = String(doc.data || doc.dni || "").trim();
      let latest = null;
      if (data) latest = latestConvByKey.get(`data:${data}`)?.conv;
      if (!latest && telefono) {
        const pk = phoneLookupKey(telefono);
        latest = latestConvByKey.get(`phone:${pk}`)?.conv;
      }
      const estadoRaw = String(latest?.estado || "").trim();
      const estadoConexion = String(
        doc.estadoConexion ||
          doc.estado_conexion ||
          latest?.estadoConexion ||
          latest?.estado_conexion ||
          "",
      ).trim();

      return {
        id,
        nombre: limpiarNombreContacto(doc.nombre),
        telefono: telefono || "—",
        documento: data || String(doc.dni || "").trim() || "—",
        email: String(doc.email || "").trim() || "—",
        entidad: String(doc.entidad || "").trim() || "—",
        ciudad: String(doc.ciudad || "").trim() || "—",
        estado: formatEstadoContacto(estadoRaw),
        estadoRaw: estadoRaw || "—",
        estadoConexion: estadoConexion || "—",
        activo: doc.activo !== false && doc.activo !== 0,
      };
    });

    return { items, total };
  }

  async deleteContacto(contactoId) {
    const db = this.getDb();
    const { ObjectId } = mongoose.Types;
    const id = String(contactoId || "").trim();
    if (!id) return { ok: false, error: "ID requerido" };

    const filters = [{ data: id }, { _id: id }];
    if (ObjectId.isValid(id)) {
      filters.unshift({ _id: new ObjectId(id) });
    }

    const result = await db.collection("contactos").deleteOne({ $or: filters });
    if (!result.deletedCount) {
      return { ok: false, error: "Contacto no encontrado" };
    }
    return { ok: true };
  }

  async reloadBotConfig() {
    const botUrl = String(process.env.BOT_RELOAD_URL || "").trim();
    if (!botUrl) {
      const port = process.env.PORT_BOT || 4000;
      const defaultUrl = `http://localhost:${port}/api/internal/reload-bot-config`;
      try {
        const response = await fetch(defaultUrl, { method: "POST" });
        const data = await response.json().catch(() => ({}));
        return { ok: response.ok, data, url: defaultUrl };
      } catch (e) {
        return { ok: false, error: e.message, url: defaultUrl };
      }
    }

    try {
      const response = await fetch(botUrl, { method: "POST" });
      const data = await response.json().catch(() => ({}));
      return { ok: response.ok, data, url: botUrl };
    } catch (e) {
      return { ok: false, error: e.message, url: botUrl };
    }
  }
}

module.exports = new ReportesChatsService();
