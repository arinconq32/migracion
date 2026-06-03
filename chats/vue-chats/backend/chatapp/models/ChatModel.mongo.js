const Conversation = require("./Conversation.mongo");
const Message = require("./Message.mongo");
const { fetchMessagesForConversation } = require("../utils/messageQuery");
const MotivoCierre = require("./MotivoCierre");
const Etiqueta = require("./Etiqueta");
const Filtro = require("./Filtro");
const Tipificacion = require("./Tipificacion");
const redisClient = require("../config/redis");
const { safeGet, safeSet, safeDel } = redisClient;
const mongoose = require("mongoose");
const {
  dedupeConversationsByPhone,
} = require("../utils/conversationDedup");
const { extractMessageMediaUrl: extractMediaUrlBackend } = require("../utils/messageMedia");
const messageBuffer = require("../services/messageBuffer.service");

const CACHE_TTL = {
  CONVERSACIONES: 30,
  MENSAJES: 300,
  ETIQUETAS: 300,
  FILTROS: 300,
  MOTIVOS: 300,
  TIPIFICACIONES: 300,
};

async function getCache(key) {
  const data = await safeGet(key);
  return data ? JSON.parse(data) : null;
}

async function setCache(key, value, ttl = 30) {
  await safeSet(key, JSON.stringify(value), { EX: ttl });
}

class ChatModelMongo {
  normalizeCatalogItem(item = {}, descFields = ["descripcion", "nombre", "desc"]) {
    const id = item.id ?? item._id ?? item.legacyId ?? null;
    let desc = "";
    for (const field of descFields) {
      const value = String(item[field] || "").trim();
      if (value) {
        desc = value;
        break;
      }
    }
    return { id, desc, nombre: desc };
  }

  // Obtener motivos de cierre desde MongoDB con caché
  async getMotivosCierre() {
    const cacheKey = "motivos_cierre:v2";
    let cached = await getCache(cacheKey);
    if (cached) return cached;

    const db = mongoose.connection.db;
    let items = await db
      .collection("motivos_cierre")
      .find({ activo: { $ne: false } })
      .sort({ id: 1, _id: 1 })
      .toArray();

    if (!items.length) {
      items = await db.collection("tpfslvl1").find({}).sort({ _id: 1 }).toArray();
    }

    const normalized = items
      .map((item) =>
        this.normalizeCatalogItem(item, ["descripcion", "nombre", "desc", "name"]),
      )
      .filter((item) => item.desc || item.nombre);

    await setCache(cacheKey, normalized, CACHE_TTL.MOTIVOS);
    return normalized;
  }

  normalizeConversation(item = {}) {
    return {
      id: item.id ?? String(item._id || ""),
      _id: item._id,
      legacyId: item.legacyId ?? null,
      telefono: item.telefono,
      contactoId: item.contactoId || item.contacto_id,
      agenteId: item.agenteId || item.agente_id,
      estado: item.estado,
      estadoConexion: item.estadoConexion || item.estado_conexion,
      marca: item.marca,
      inicio: item.inicio,
      fin: item.fin,
      tipificaciones: item.tipificaciones,
      etiqueta2: item.etiqueta2 || item.etiqueta_2,
      etiqueta: item.etiqueta,
      color: item.color,
      observaciones: item.observaciones,
      origen: item.origen,
      salaId: item.salaId || item.sala_id,
      cola: item.cola,
      mensajes: Array.isArray(item.mensajes)
        ? item.mensajes.map((message) => this.normalizeMessage(message))
        : item.mensajes,
    };
  }

  normalizeMessage(item = {}) {
    const archivoRaw =
      item.archivoUrl ||
      item.archivo_url ||
      item.url ||
      item.mediaUrl ||
      item.media_url ||
      "";
    let archivoUrl = String(archivoRaw || "").trim();
    if (!archivoUrl) {
      archivoUrl = extractMediaUrlBackend(item);
    }

    return {
      id: item.id ?? item.legacyId ?? String(item._id || ""),
      _id: item._id,
      legacyId: item.legacyId ?? null,
      conversacionId: item.conversacionId || item.conversacion_id,
      conversacion_id: item.conversacion_id || item.conversacionId,
      autor: item.autor || item.emisor,
      emisor: item.emisor || item.autor,
      receptor_exten: item.receptor_exten,
      emisor_exten: item.emisor_exten,
      texto: item.texto || item.mensaje || item.text,
      mensaje: item.mensaje || item.texto || item.text,
      text: item.text || item.texto || item.mensaje,
      tipo: item.tipo,
      fecha: item.fecha || item.timestamp || item.ts,
      ts: item.ts || item.fecha || item.timestamp,
      timestamp: item.timestamp,
      archivoUrl: archivoUrl || null,
      archivo_url: archivoUrl || null,
      origen: item.origen,
      leido: item.leido,
      leido_en: item.leido_en,
      filename: item.filename || null,
    };
  }

  async invalidateEtiquetasCache() {
    await safeDel(["etiquetas:all", "filtros:all"]);
  }

  async createEtiqueta(nombre, color = "#7eb83b") {
    const nombreNormalizado = String(nombre || "").trim();
    const colorNormalizado = String(color || "#7eb83b").trim();
    if (!nombreNormalizado) {
      return { success: false, status: 400, error: "nombre es requerido" };
    }

    const db = mongoose.connection.db;
    const etiquetasCol = db.collection("etiquetas");

    const existing = await etiquetasCol.findOne({
      nombre: {
        $regex: new RegExp(
          `^${nombreNormalizado.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
          "i",
        ),
      },
    });
    if (existing) {
      return { success: false, status: 409, error: "La etiqueta ya existe" };
    }

    const maxDoc = await etiquetasCol
      .find({ id: { $type: "number" } })
      .sort({ id: -1 })
      .limit(1)
      .toArray();
    const nextId = Number(maxDoc?.[0]?.id || 0) + 1;
    const doc = { id: nextId, nombre: nombreNormalizado, color: colorNormalizado };

    await etiquetasCol.insertOne(doc);
    await this.invalidateEtiquetasCache();

    return {
      success: true,
      etiqueta: {
        id: nextId,
        nombre: nombreNormalizado,
        color: colorNormalizado,
      },
    };
  }

  async deleteEtiqueta(labelId) {
    const rawId = String(labelId || "").trim();
    if (!rawId) {
      return { success: false, status: 400, error: "labelId es requerido" };
    }

    const db = mongoose.connection.db;
    const etiquetasCol = db.collection("etiquetas");

    const numericId = Number(rawId);
    const deleteFilter = Number.isFinite(numericId)
      ? { $or: [{ id: numericId }, { id: rawId }, { _id: rawId }] }
      : { $or: [{ id: rawId }, { _id: rawId }] };

    const existing = await etiquetasCol.findOne(deleteFilter);
    if (!existing) {
      return { success: false, status: 404, error: "Etiqueta no encontrada" };
    }

    await etiquetasCol.deleteOne({ _id: existing._id });

    const nombre = String(existing.nombre || "").trim();
    if (nombre) {
      await db.collection("conversaciones").updateMany(
        {},
        { $pull: { etiquetas: { nombre } } },
      );
    }

    await this.invalidateEtiquetasCache();

    return { success: true, id: rawId, nombre };
  }

  // Obtener etiquetas con caché
  async getEtiquetas() {
    const cacheKey = "etiquetas:all";
    let cached = await getCache(cacheKey);
    if (cached) return cached;
    const etiquetas = await Etiqueta.find({}).sort({ nombre: 1 }).lean();
    const normalized = etiquetas.map((item) => ({
      id: item.id ?? item.legacyId ?? String(item._id),
      nombre: item.nombre || item.desc || "",
      color: item.color || "#7eb83b",
    }));
    await setCache(cacheKey, normalized, CACHE_TTL.ETIQUETAS);
    return normalized;
  }

  // Obtener filtros con caché
  async getFiltros() {
    const cacheKey = "filtros:all";
    let cached = await getCache(cacheKey);
    if (cached) return cached;
    const filtros = await Filtro.find({ activo: true }).sort({ nombre: 1 });
    await setCache(cacheKey, filtros, CACHE_TTL.FILTROS);
    return filtros;
  }

  // Obtener tipificaciones con caché
  async getTipificaciones() {
    const cacheKey = "tipificaciones:v2";
    let cached = await getCache(cacheKey);
    if (cached) return cached;

    const db = mongoose.connection.db;
    let items = await db.collection("tipificaciones").find({}).sort({ id: 1, _id: 1 }).toArray();

    if (!items.length) {
      items = await db.collection("tpfslvl2").find({}).sort({ _id: 1 }).toArray();
    }

    const normalized = items
      .map((item) =>
        this.normalizeCatalogItem(item, [
          "tipificacion",
          "observacion",
          "nombre",
          "descripcion",
          "desc",
        ]),
      )
      .filter((item) => item.id != null && item.desc);

    await setCache(cacheKey, normalized, CACHE_TTL.TIPIFICACIONES);
    return normalized;
  }

  toHistoryTimestamp(value) {
    if (!value) return 0;
    if (typeof value === "number") return value;
    const direct = new Date(value);
    if (Number.isFinite(direct.getTime())) return direct.getTime();
    const normalized = String(value).trim().replace(" ", "T");
    const parsed = new Date(normalized);
    return Number.isFinite(parsed.getTime()) ? parsed.getTime() : 0;
  }

  extractHistoryTipificacion(conv = {}) {
    const tip = conv.tipificacion ?? conv.tipificaciones;
    if (tip && typeof tip === "object") {
      return (
        String(tip.texto || tip.descripcion || tip.nombre || tip.desc || "").trim() ||
        "-"
      );
    }
    return String(tip || "-").trim() || "-";
  }

  extractHistoryObservacion(conv = {}) {
    const tip = conv.tipificacion;
    if (tip && typeof tip === "object") {
      const obs = String(tip.observacion || "").trim();
      if (obs) return obs;
    }
    return String(conv.observaciones || "Sin comentario").trim() || "Sin comentario";
  }

  buildConversationLookupFilters(rawId) {
    const raw = String(rawId || "").trim();
    if (!raw) return [];

    const filters = [{ _id: raw }, { id: raw }, { legacyId: raw }];
    const numeric = Number(raw);
    if (Number.isFinite(numeric)) {
      filters.push({ legacyId: numeric }, { id: numeric });
    }
    if (mongoose.Types.ObjectId.isValid(raw)) {
      filters.push({ _id: new mongoose.Types.ObjectId(raw) });
    }
    return filters;
  }

  async findConversationByAnyId(convId) {
    const filters = this.buildConversationLookupFilters(convId);
    if (!filters.length) return null;

    const db = mongoose.connection.db;
    return db.collection("conversaciones").findOne({ $or: filters });
  }

  phoneHistoryVariants(value) {
    const digits = String(value || "").replace(/\D/g, "");
    if (!digits) return [];
    const variants = new Set([digits]);
    if (digits.length === 12 && digits.startsWith("57")) {
      variants.add(digits.slice(2));
    }
    if (digits.length === 10) {
      variants.add(`57${digits}`);
    }
    return [...variants];
  }

  async findContactForHistory({ contactoId, telefono, dni }) {
    const db = mongoose.connection.db;
    const contactosCol = db.collection("contactos");
    const dniNorm = String(dni || "").trim();
    const contactoNorm = String(contactoId || "").trim();
    const phoneList = this.phoneHistoryVariants(telefono);

    if (contactoNorm) {
      const byData = await contactosCol.findOne({ data: contactoNorm });
      if (byData) return byData;
    }

    for (const phone of phoneList) {
      const byPhone = await contactosCol.findOne({
        $or: [{ tels: phone }, { telefono: phone }],
      });
      if (byPhone) return byPhone;
    }

    if (dniNorm) {
      return contactosCol.findOne({
        $or: [{ data: dniNorm }, { dni: dniNorm }, { documento: dniNorm }],
      });
    }

    return null;
  }

  async getHistorialClientePorConvId(
    convId,
    maxRegistros = 300,
    dniCliente = null,
  ) {
    try {
      const db = mongoose.connection.db;
      const col = db.collection("conversaciones");
      const limite =
        Number(maxRegistros) > 0 ? Math.min(Number(maxRegistros), 1000) : 300;
      const convIdNormalizado = String(convId || "").trim();
      const dniNormalizado = String(dniCliente || "").trim() || null;

      if (!convIdNormalizado && !dniNormalizado) {
        return { persona: null, registros: [] };
      }

      let base = convIdNormalizado
        ? await this.findConversationByAnyId(convIdNormalizado)
        : null;

      if (!base && dniNormalizado) {
        const contact = await this.findContactForHistory({ dni: dniNormalizado });
        if (contact) {
          const tel = String(contact.tels || contact.telefono || "").trim();
          const data = String(contact.data || "").trim();
          const relatedFilters = [];
          if (data) {
            relatedFilters.push({ contactoId: data }, { contacto_id: data });
          }
          for (const variant of this.phoneHistoryVariants(tel)) {
            relatedFilters.push({ telefono: variant }, { contactoId: variant });
          }
          if (relatedFilters.length) {
            base = await col
              .findOne({ $or: relatedFilters })
              .sort({ inicio: -1, fin: -1, _id: -1 });
          }
        }
      }

      if (!base) {
        return { persona: null, registros: [] };
      }

      const contact = await this.findContactForHistory({
        contactoId: base.contactoId || base.contacto_id || base.data,
        telefono: base.telefono || base.contactoId,
        dni: dniNormalizado,
      });

      const telefono = String(
        base.telefono || base.contactoId || contact?.tels || "",
      ).trim();
      const contactoId = String(
        base.contactoId || base.contacto_id || contact?.data || "",
      ).trim();

      const persona = {
        nombre:
          String(contact?.nombre || base.nombre || "")
            .split("|")[0]
            .trim() || "-",
        telefono: telefono || "-",
        canal: base.origen ? String(base.origen).toUpperCase() : "-",
        entidad: contact?.entidad || base.entidad || "-",
        data: contactoId || "-",
        dni:
          String(
            dniNormalizado || contact?.dni || contact?.documento || "",
          ).trim() || "-",
        agente: base.agenteId || base.agente_id || "-",
        convId: String(base._id || base.id || convIdNormalizado),
      };

      const relatedFilters = [{ _id: base._id }];
      if (telefono) {
        for (const variant of this.phoneHistoryVariants(telefono)) {
          relatedFilters.push({ telefono: variant }, { contactoId: variant });
        }
      }
      if (contactoId) {
        relatedFilters.push(
          { contactoId: contactoId },
          { contacto_id: contactoId },
        );
      }

      const convRows = await col
        .find({ $or: relatedFilters })
        .sort({ inicio: -1, fin: -1, _id: -1 })
        .limit(100)
        .toArray();

      const registrosConv = convRows.map((row) => {
          const ts = this.toHistoryTimestamp(
            row.fin || row.inicio || row.ultima_actividad,
          );
          const convRef = String(row._id || "");
          const convLabel =
            row.legacyId !== undefined && row.legacyId !== null
              ? String(row.legacyId)
              : convRef || String(row.id || "-");
          return {
            data: contactoId || persona.data || "-",
            fecha: ts,
            comentario: this.extractHistoryObservacion(row),
            tipificacion: this.extractHistoryTipificacion(row),
            entidad: contact?.entidad || persona.entidad || "-",
            gestiono: row.agenteId || row.agente_id || persona.agente || "-",
            cola: row.cola || "-",
            telefono: telefono || persona.telefono || "-",
            tipoContacto: row.origen || "webchat",
            tipo: "Conversacion",
            conversacion: convLabel,
            conversacionRef: convRef || convLabel,
            ordenTs: ts,
          };
        });

      const comentariosCol = db.collection("comentarios_chats");
      const comentarioFilters = [];
      if (telefono) {
        for (const variant of this.phoneHistoryVariants(telefono)) {
          comentarioFilters.push({ telefono: variant }, { data: variant });
        }
      }
      if (contactoId) {
        comentarioFilters.push({ data: contactoId });
      }
      if (dniNormalizado) {
        comentarioFilters.push({ data: dniNormalizado });
      }

      let comentarioRows = [];
      if (comentarioFilters.length) {
        comentarioRows = await comentariosCol
          .find({ $or: comentarioFilters })
          .sort({ fecha: -1, _id: -1 })
          .limit(limite)
          .toArray();
      }

      const idConvValues = [
        ...new Set(
          comentarioRows
            .map((row) => String(row.idConv || "").trim())
            .filter(Boolean),
        ),
      ];
      const convRefByIdConv = new Map();
      if (idConvValues.length) {
        const lookupFilters = [];
        for (const idConv of idConvValues) {
          lookupFilters.push({ legacyId: idConv }, { id: idConv });
          const numeric = Number(idConv);
          if (Number.isFinite(numeric)) {
            lookupFilters.push({ legacyId: numeric }, { id: numeric });
          }
        }
        const linkedConvs = await col.find({ $or: lookupFilters }).toArray();
        for (const linked of linkedConvs) {
          const ref = String(linked._id || "");
          if (!ref) continue;
          if (linked.legacyId !== undefined && linked.legacyId !== null) {
            convRefByIdConv.set(String(linked.legacyId), ref);
          }
          if (linked.id !== undefined && linked.id !== null) {
            convRefByIdConv.set(String(linked.id), ref);
          }
        }
      }

      const registrosComentarios = comentarioRows.map((row) => {
        const ts = this.toHistoryTimestamp(row.fecha);
        const idConv = String(row.idConv || "-");
        const convRef = convRefByIdConv.get(idConv) || null;
        return {
          data: row.data || contactoId || persona.data || "-",
          fecha: ts,
          comentario: row.resultado2 || row.comentario || "Sin comentario",
          tipificacion: row.resultado1 || "-",
          entidad: row.entidad || persona.entidad || "-",
          gestiono: row.usuario || persona.agente || "-",
          cola: row.colas || "-",
          telefono: row.telefono || telefono || persona.telefono || "-",
          tipoContacto: row.tipo_contacto || "webchat",
          tipo: "Conversacion",
          conversacion: idConv,
          conversacionRef: convRef,
          ordenTs: ts,
        };
      });

      const registros = [...registrosConv, ...registrosComentarios]
        .sort((a, b) => (b.ordenTs || 0) - (a.ordenTs || 0))
        .slice(0, limite);

      return { persona, registros };
    } catch (error) {
      console.error("Error en getHistorialClientePorConvId:", error.message);
      return { persona: null, registros: [] };
    }
  }

  async countActiveConversations(agenteId) {
    const agenteIdNum = Number(agenteId);
    const agenteFilter = Number.isFinite(agenteIdNum)
      ? { $in: [agenteId, agenteIdNum, String(agenteIdNum)] }
      : agenteId;

    return Conversation.countDocuments({
      $or: [{ agenteId: agenteFilter }, { agente_id: agenteFilter }],
      estado: "abierta",
    });
  }

  async getNextPendingConversation(agentId = null) {
    const uid = String(agentId || "").trim();
    if (uid) {
      const active = await this.countActiveConversations(uid);
      const maxActive = Number(process.env.MAX_ACTIVE_CONVERSATIONS || 3);
      if (active >= maxActive) return null;

      const assigned = await Conversation.findOne({
        estado: "nuevo",
        $or: [{ agenteId: uid }, { agente_id: uid }],
      })
        .sort({ inicio: 1 })
        .lean();
      if (assigned?._id) return String(assigned._id);
    }

    const pending = await Conversation.findOne({ estado: "nuevo" })
      .sort({ inicio: 1 })
      .lean();
    return pending?._id ? String(pending._id) : null;
  }

  async updateConversationState(
    convId,
    estado,
    agenteId,
    abrir = true,
    extra = {},
  ) {
    const conv = await this.findConversationByAnyId(convId);
    if (!conv?._id) {
      throw new Error(`Conversación no encontrada: ${convId}`);
    }

    const update = {
      estado,
      ultima_actividad: new Date(),
    };

    if (abrir && agenteId) {
      update.agenteId = agenteId;
      update.agente_id = agenteId;
    }

    if (estado === "cerrada") {
      update.fin = new Date();
      if (extra.tipificacion) {
        update.tipificacion = {
          id: extra.idTipificacion ?? null,
          desc: extra.tipificacion,
          observacion: extra.observaciones ?? "",
        };
      }
      if (extra.observaciones) update.observaciones = extra.observaciones;
      if (extra.idTipificacion != null) update.id_tipificacion = extra.idTipificacion;
      if (extra.idObservaciones != null) {
        update.id_observaciones = extra.idObservaciones;
      }
    }

    const db = mongoose.connection.db;
    await db
      .collection("conversaciones")
      .updateOne({ _id: conv._id }, { $set: update });
  }

  // Obtener mensajes de una conversación (opcionalmente validando agente)
  async getMensajes(convId, agenteId = null, options = {}) {
    const convIdStr = String(convId || "").trim();
    if (!convIdStr) return [];

    const conv = await this.findConversationByAnyId(convIdStr);
    if (!conv) return [];

    const convAgent = conv.agenteId ?? conv.agente_id;
    if (
      !options.ignoreAgentCheck &&
      agenteId &&
      String(convAgent) !== String(agenteId)
    ) {
      return [];
    }

    const db = mongoose.connection.db;
    const items = await fetchMessagesForConversation(db, convIdStr, conv);
    const persisted = items.map((item) => this.normalizeMessage(item));
    const buffered = await messageBuffer.getBufferedMessages(convIdStr);
    const normalizedBuffered = buffered.map((item) => this.normalizeMessage(item));
    return messageBuffer.mergeMessages(persisted, normalizedBuffered);
  }

  async bufferMessage(convId, autor, texto, tipo = "texto", extra = {}) {
    return this.insertMessage(convId, autor, texto, tipo, extra);
  }

  async flushMessagesToMongo(convId) {
    return messageBuffer.persistToMongo(convId, this);
  }

  inferMultimediaTipo(tipo, url) {
    const tipoNorm = String(tipo || "").toLowerCase().trim();
    if (
      tipoNorm.includes("image") ||
      tipoNorm.includes("imagen") ||
      tipoNorm === "photo" ||
      tipoNorm === "sticker"
    ) {
      return "imagen";
    }
    if (tipoNorm.includes("video")) return "video";
    if (tipoNorm.includes("audio") || tipoNorm.includes("voice")) return "audio";
    if (
      tipoNorm.includes("doc") ||
      tipoNorm.includes("file") ||
      tipoNorm.includes("pdf") ||
      tipoNorm.includes("archivo")
    ) {
      return "documento";
    }

    const ext = String(url || "")
      .split("?")[0]
      .split(".")
      .pop()
      ?.toLowerCase();
    if (["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg"].includes(ext)) {
      return "imagen";
    }
    if (["mp4", "webm", "mov", "avi", "mkv"].includes(ext)) return "video";
    if (["mp3", "ogg", "wav", "aac", "m4a", "opus"].includes(ext)) {
      return "audio";
    }
    return "documento";
  }

  inferMultimediaNombre(msg = {}, url = "") {
    const fromMsg = String(
      msg.nombreArchivo || msg.nombre || msg.mensaje || msg.texto || msg.text || "",
    ).trim();
    if (fromMsg && fromMsg.length < 120 && !fromMsg.startsWith("http")) {
      return fromMsg;
    }
    const cleanUrl = String(url || "").split("?")[0];
    const fileName = cleanUrl.split("/").pop();
    return fileName || "Archivo";
  }

  mapMessageToMultimediaItem(msg = {}, index = 0) {
    const url = String(
      msg.archivoUrl || msg.archivo_url || msg.url || "",
    )
      .trim()
      .replace(/^http:\/\//i, "https://");
    if (!url) return null;

    const tipo = this.inferMultimediaTipo(msg.tipo, url);

    return {
      id: String(msg.id || msg._id || msg.legacyId || `media-${index}`),
      tipo,
      url,
      previewUrl: url,
      nombre: this.inferMultimediaNombre(msg, url),
      fecha: msg.fecha || msg.ts || msg.timestamp || null,
    };
  }

  buildMessageFilters(convIdStr, conv = null) {
    const filters = [
      { conversacionId: convIdStr },
      { conversacion_id: convIdStr },
    ];

    if (conv) {
      const convMongoIdStr = String(conv._id || "").trim();
      const convObjectId =
        convMongoIdStr && mongoose.Types.ObjectId.isValid(convMongoIdStr)
          ? new mongoose.Types.ObjectId(convMongoIdStr)
          : mongoose.Types.ObjectId.isValid(convIdStr)
            ? new mongoose.Types.ObjectId(convIdStr)
            : null;

      if (convMongoIdStr) {
        filters.push(
          { conversacionId: convMongoIdStr },
          { conversacion_id: convMongoIdStr },
        );
      }
      if (convObjectId) filters.push({ conversacionId: convObjectId });

      if (conv.legacyId !== undefined && conv.legacyId !== null) {
        const legacyId = conv.legacyId;
        filters.push(
          { conversacion_id: legacyId },
          { conversacion_id: String(legacyId) },
          { conversacionId: legacyId },
          { conversacionId: String(legacyId) },
        );
      }
    }

    return filters;
  }

  async getMultimediaByConvId(convId) {
    const convIdStr = String(convId || "").trim();
    if (!convIdStr) return [];

    const conv = await this.findConversationByAnyId(convIdStr);
    if (!conv) return [];

    const db = mongoose.connection.db;
    const rows = await fetchMessagesForConversation(db, convIdStr, conv, {
      mediaOnly: true,
    });

    const items = [];
    const seen = new Set();

    for (let i = 0; i < rows.length; i += 1) {
      const item = this.mapMessageToMultimediaItem(
        this.normalizeMessage(rows[i]),
        i,
      );
      if (!item || seen.has(item.url)) continue;
      seen.add(item.url);
      items.push(item);
    }

    return items;
  }

  async insertMessage(convId, autor, texto, tipo = "texto", extra = {}) {
    const convIdStr = String(convId || "").trim();
    const archivoUrl =
      extra.archivo_url || extra.archivoUrl || extra.url || null;

    const msg = new Message({
      conversacionId: convIdStr,
      conversacion_id: convIdStr,
      autor,
      emisor: autor,
      texto: texto || "",
      text: texto || "",
      mensaje: texto || "",
      tipo: tipo || "texto",
      ts: extra.timestamp ? new Date(extra.timestamp) : new Date(),
      timestamp: extra.timestamp || Date.now(),
      origen: extra.origen || "web",
      ...(archivoUrl ? { archivoUrl, archivo_url: archivoUrl } : {}),
    });

    msg.id = extra.id || extra.tempId || String(msg._id);
    msg.legacyId = msg.legacyId ?? msg.id;

    await msg.save();

    await safeDel(`mensajes:${convIdStr}`);

    console.log(
      `[Mongo] Mensaje guardado conv=${convIdStr} id=${msg._id} texto="${String(texto || "").slice(0, 40)}"`,
    );

    const conv = await this.findConversationByAnyId(convIdStr);
    if (conv?._id) {
      await Conversation.updateOne(
        { _id: conv._id },
        { $push: { mensajes: msg._id } },
      );
    }

    return msg.id ?? msg.legacyId ?? String(msg._id);
  }
  // backend/chatapp/models/ChatModel.mongo.js
  // Obtener solo las conversaciones del agente
  async getConversaciones(agenteId, estado) {
    const conversations = await require("./Conversation.mongo")
      .find({
        agenteId,
        estado,
      })
      .sort({ inicio: -1 })
      .lean();

    const normalized = conversations.map((item) =>
      this.normalizeConversation(item),
    );
    return dedupeConversationsByPhone(normalized);
  }

  // Obtener conversaciones pendientes (estado: 'nuevo')
  async getPendientes() {
    const conversations = await Conversation.find({ estado: "nuevo" })
      .sort({ inicio: -1 })
      .lean();

    const normalized = conversations.map((item) =>
      this.normalizeConversation(item),
    );
    return dedupeConversationsByPhone(normalized);
  }
}

module.exports = ChatModelMongo;
