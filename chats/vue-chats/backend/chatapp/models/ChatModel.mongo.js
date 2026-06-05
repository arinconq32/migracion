const Conversation = require("./Conversation.mongo");
const Message = require("./Message.mongo");
const { fetchMessagesForConversation, buildMessageFilters } = require("../utils/messageQuery");
const MotivoCierre = require("./MotivoCierre");
const Etiqueta = require("./Etiqueta");
const Filtro = require("./Filtro");
const Tipificacion = require("./Tipificacion");
const redisClient = require("../config/redis");
const { safeGet, safeSet, safeDel } = redisClient;
const mongoose = require("mongoose");
const {
  conversationPhoneKey,
  dedupeConversationsByPhone,
  dedupeConversationsByPhonePerEstado,
  isConversationNewer,
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
    const telefono = String(item.telefono || item.tels || "").trim();
    const nombre = String(
      item.nombre || item.nombreContacto || item.name || "",
    ).trim();
    return {
      id: item.id ?? String(item._id || ""),
      _id: item._id,
      legacyId: item.legacyId ?? null,
      telefono,
      tels: telefono,
      nombre,
      name: nombre,
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

  isInternoConversation(conv = {}) {
    return (
      String(conv.origen || conv.metadata?.origen || "")
        .trim()
        .toLowerCase() === "interno"
    );
  }

  isInconsistentAbierta(conv = {}) {
    return (
      String(conv.estado || "").toLowerCase() === "abierta" && Boolean(conv.fin)
    );
  }

  isSupersededActiveConversation(abierta, cerradosRaw = []) {
    const phoneKey = conversationPhoneKey(abierta);
    if (!phoneKey) return false;

    const abiertaId = String(abierta.id ?? abierta._id ?? "");
    const abiertaInicio = new Date(abierta.inicio || 0).getTime();
    if (!Number.isFinite(abiertaInicio) || abiertaInicio <= 0) {
      return false;
    }

    return cerradosRaw.some((cerrada) => {
      const cerradaId = String(cerrada.id ?? cerrada._id ?? "");
      if (cerradaId && cerradaId === abiertaId) return false;
      if (conversationPhoneKey(cerrada) !== phoneKey) return false;

      const cerradaInicio = new Date(cerrada.inicio || 0).getTime();
      if (!Number.isFinite(cerradaInicio) || cerradaInicio <= abiertaInicio) {
        return false;
      }

      const cerradaFin = new Date(
        cerrada.fin || cerrada.ultima_actividad || 0,
      ).getTime();
      return Number.isFinite(cerradaFin) && cerradaFin >= cerradaInicio;
    });
  }

  async getVisibleQueueState(agenteId) {
    const activosRaw = await this.getConversaciones(agenteId, "abierta");
    const cerradosRaw = await this.getConversaciones(agenteId, "cerrada");
    const nuevosRaw = dedupeConversationsByPhonePerEstado([
      ...(await this.getPendientes()),
      ...(agenteId ? await this.getConversaciones(agenteId, "nuevo") : []),
    ]);

    const deduped = dedupeConversationsByPhonePerEstado([
      ...activosRaw,
      ...cerradosRaw,
      ...nuevosRaw,
    ]);

    const activos = deduped
      .filter((conversation) => conversation.estado === "abierta")
      .filter((conversation) => !this.isInconsistentAbierta(conversation))
      .filter(
        (conversation) =>
          !this.isSupersededActiveConversation(conversation, cerradosRaw),
      );

    return {
      activos,
      nuevos: deduped.filter((conversation) => conversation.estado === "nuevo"),
      cerrados: deduped.filter((conversation) => conversation.estado === "cerrada"),
    };
  }

  async invalidateAgentConversationCaches(agenteId) {
    const uid = String(agenteId || "").trim();
    if (!uid) return;
    await safeDel([
      `conversaciones:${uid}`,
      `conversaciones:${uid}:abierta`,
      `conversaciones:${uid}:cerrada`,
      `activeConversations:${uid}`,
    ]);
  }

  async countActiveConversations(agenteId) {
    const { activos } = await this.getVisibleQueueState(agenteId);
    return activos.filter((conv) => !this.isInternoConversation(conv)).length;
  }

  filterClienteActivos(activos = []) {
    return activos.filter((conv) => !this.isInternoConversation(conv));
  }

  async reconcileInconsistentAbierta(agenteId) {
    const uid = String(agenteId || "").trim();
    if (!uid) return 0;

    const db = mongoose.connection.db;
    const agenteFilter = this.buildAgentIdFilter(uid);
    if (!agenteFilter) return 0;

    const broken = await db.collection("conversaciones").find({
      $or: [{ agenteId: agenteFilter }, { agente_id: agenteFilter }],
      estado: "abierta",
      fin: { $exists: true, $ne: null },
    }).toArray();

    let fixed = 0;
    for (const conv of broken) {
      await db.collection("conversaciones").updateOne(
        { _id: conv._id },
        {
          $unset: { fin: "" },
          $set: { ultima_actividad: new Date() },
        },
      );
      fixed += 1;
    }

    if (fixed > 0) {
      await this.invalidateAgentConversationCaches(uid);
      console.log(
        `🔧 Agente ${uid}: reparadas ${fixed} conversación(es) abierta(s) con fin residual en BD`,
      );
    }

    return fixed;
  }

  async reconcileStaleInactiveAbierta(agenteId, runtimeService = null) {
    const uid = String(agenteId || "").trim();
    if (!uid) return 0;

    const staleMinutes = Number(process.env.ACTIVE_STALE_MINUTES || 60);
    const staleMs = staleMinutes * 60 * 1000;
    const liveIds =
      typeof runtimeService?.getLiveConversationIds === "function"
        ? runtimeService.getLiveConversationIds(uid)
        : new Set();

    const activosRaw = await this.getConversaciones(uid, "abierta");
    let closed = 0;

    for (const conv of activosRaw) {
      const convId = String(conv.id || "");
      if (!convId || liveIds.has(convId)) continue;

      const lastTs = new Date(
        conv.ultima_actividad || conv.inicio || 0,
      ).getTime();
      if (!Number.isFinite(lastTs) || Date.now() - lastTs < staleMs) continue;

      await this.updateConversationState(conv.id, "cerrada", uid, false, {
        tipificacion: "Cierre automático (inactiva en BD)",
      });
      closed += 1;
    }

    if (closed > 0) {
      await this.invalidateAgentConversationCaches(uid);
      console.log(
        `🔧 Agente ${uid}: cerradas ${closed} conversación(es) activas inactivas en BD`,
      );
    }

    return closed;
  }

  async reconcileInternoAbiertaToNuevo(agenteId) {
    const uid = String(agenteId || "").trim();
    if (!uid) return 0;

    const agenteFilter = this.buildAgentIdFilter(uid);
    if (!agenteFilter) return 0;

    const db = mongoose.connection.db;
    const result = await db.collection("conversaciones").updateMany(
      {
        $or: [{ agenteId: agenteFilter }, { agente_id: agenteFilter }],
        estado: "abierta",
        origen: { $regex: /^interno$/i },
      },
      {
        $set: { estado: "nuevo", ultima_actividad: new Date() },
        $unset: { fin: "" },
      },
    );

    if (result.modifiedCount > 0) {
      await this.invalidateAgentConversationCaches(uid);
      console.log(
        `🔧 Agente ${uid}: ${result.modifiedCount} conversación(es) interna(s) devuelta(s) a nuevos`,
      );
    }

    return result.modifiedCount || 0;
  }

  async repairActiveConversations(agenteId) {
    const uid = String(agenteId || "").trim();
    if (!uid) return { activos: [], reconciled: 0 };

    const reconciled =
      (await this.reconcileInconsistentAbierta(uid)) +
      (await this.reconcileOrphanedActiveConversations(uid));

    const state = await this.getVisibleQueueState(uid);
    return { ...state, reconciled };
  }

  async syncActiveConversations(agenteId) {
    return this.repairActiveConversations(agenteId);
  }

  async reconcileOrphanedActiveConversations(agenteId) {
    const uid = String(agenteId || "").trim();
    if (!uid) return 0;

    const activosRaw = await this.getConversaciones(uid, "abierta");
    const cerradosRaw = await this.getConversaciones(uid, "cerrada");

    let closed = 0;
    for (const conv of activosRaw) {
      if (!this.isSupersededActiveConversation(conv, cerradosRaw)) continue;

      await this.updateConversationState(conv.id, "cerrada", uid, false, {
        tipificacion: "Cierre automático (conversación superada)",
      });
      closed += 1;
    }

    if (closed > 0) {
      await this.invalidateAgentConversationCaches(uid);
      console.log(
        `🔧 Agente ${uid}: cerradas ${closed} conversación(es) abierta(s) huérfanas en BD`,
      );
    }

    return closed;
  }

  async getNextPendingConversation(agentId = null) {
    const uid = String(agentId || "").trim();
    if (uid) {
      const active = await this.countActiveConversations(uid);
      const maxActive = Number(process.env.MAX_ACTIVE_CONVERSATIONS || 3);
      if (active >= maxActive) return null;

      const assigned = await Conversation.findOne({
        estado: "nuevo",
        origen: { $not: /^interno$/i },
        $or: [{ agenteId: uid }, { agente_id: uid }],
      })
        .sort({ inicio: 1 })
        .lean();
      if (assigned?._id) return String(assigned._id);
    }

    const pending = await Conversation.findOne({
      estado: "nuevo",
      origen: { $not: /^interno$/i },
    })
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

    const normalizedAgent = String(agenteId || conv.agenteId || conv.agente_id || "").trim();
    const currentEstado = String(conv.estado || "").toLowerCase();
    const nextEstado = String(estado || "").toLowerCase();
    const alreadyOpenForAgent =
      currentEstado === "abierta" &&
      normalizedAgent &&
      String(conv.agenteId || conv.agente_id || "").trim() === normalizedAgent;

    if (
      nextEstado === "abierta" &&
      abrir &&
      normalizedAgent &&
      !alreadyOpenForAgent
    ) {
      const active = await this.countActiveConversations(normalizedAgent);
      const maxActive = Number(process.env.MAX_ACTIVE_CONVERSATIONS || 3);
      if (active >= maxActive) {
        const error = new Error("ACTIVE_LIMIT_REACHED");
        throw error;
      }
    }

    const update = {
      estado,
      ultima_actividad: new Date(),
    };

    if (abrir && agenteId) {
      update.agenteId = agenteId;
      update.agente_id = agenteId;
    }

    const unset = {};
    if (nextEstado === "abierta") {
      unset.fin = "";
      if (currentEstado === "cerrada") {
        update.inicio = new Date();
      }
    }

    if (nextEstado === "cerrada") {
      update.fin = new Date();
      if (extra.tipificacion) {
        update.tipificacion = {
          id: extra.idTipificacion ?? null,
          desc: extra.tipificacion,
          observacion: extra.observaciones ?? "",
        };
        update.tipificaciones = extra.tipificacion;
        update.motivo_cierre = extra.tipificacion;
      }
      if (extra.observaciones) update.observaciones = extra.observaciones;
      if (extra.idTipificacion != null) {
        update.id_tipificacion = extra.idTipificacion;
        update.id_motivo_cierre = extra.idTipificacion;
      }
      if (extra.idObservaciones != null) {
        update.id_observaciones = extra.idObservaciones;
      }
    }

    const db = mongoose.connection.db;
    const updateOp = { $set: update };
    if (Object.keys(unset).length > 0) {
      updateOp.$unset = unset;
    }

    await db.collection("conversaciones").updateOne({ _id: conv._id }, updateOp);

    const agentKey = String(
      agenteId || conv.agenteId || conv.agente_id || "",
    ).trim();
    if (agentKey) {
      await this.invalidateAgentConversationCaches(agentKey);
    }
    await safeDel([`conversaciones:all`, `mensajes:${convId}`]);
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
  buildAgentIdFilter(agenteId) {
    const uid = String(agenteId || "").trim();
    if (!uid) return null;
    const numeric = Number(uid);
    if (Number.isFinite(numeric)) {
      return { $in: [uid, numeric, String(numeric)] };
    }
    return uid;
  }

  createConversationIdentity() {
    const oid = new mongoose.Types.ObjectId();
    const idStr = String(oid);
    return { _id: oid, id: idStr, legacyId: idStr };
  }

  async getLatestConversationByPhone(phone) {
    const db = mongoose.connection.db;
    const filters = [];
    for (const variant of this.phoneHistoryVariants(phone)) {
      filters.push({ telefono: variant }, { tels: variant });
    }
    if (!filters.length) return null;

    const docs = await db.collection("conversaciones").find({ $or: filters }).toArray();
    if (!docs.length) return null;

    return docs.reduce((best, current) =>
      isConversationNewer(current, best) ? current : best,
    );
  }

  async getOpenConversationByPhone(phone) {
    const db = mongoose.connection.db;
    const filters = [];
    for (const variant of this.phoneHistoryVariants(phone)) {
      filters.push({ telefono: variant }, { tels: variant });
    }
    if (!filters.length) return null;

    return db.collection("conversaciones").findOne(
      {
        $or: filters,
        estado: { $in: ["abierta", "nuevo", "pendiente"] },
      },
      { sort: { inicio: -1, _id: -1 } },
    );
  }

  async upsertConversationForClient({
    telefono,
    nombre = "Desconocido",
    cola = null,
    agenteId = null,
    salaId = null,
    estado = null,
    contactoId = null,
    origen = "whatsapp",
  }) {
    const db = mongoose.connection.db;
    const col = db.collection("conversaciones");
    const phone = String(telefono || "").trim();
    const normalizedAgent = agenteId ? String(agenteId).trim() : null;
    const dataContacto = String(contactoId || phone).trim();
    const now = new Date();

    const requestedState = String(estado || "").toLowerCase();
    let targetState =
      requestedState ||
      (normalizedAgent ? "abierta" : "nuevo");
    if (normalizedAgent && targetState === "abierta") {
      const active = await this.countActiveConversations(normalizedAgent);
      const maxActive = Number(process.env.MAX_ACTIVE_CONVERSATIONS || 3);
      if (active >= maxActive) targetState = "nuevo";
    }

    // Solo reutilizar hilos abiertos/nuevos; nunca sobrescribir conversaciones cerradas.
    const existing = await this.getOpenConversationByPhone(phone);

    if (existing?._id) {
      const update = {
        telefono: phone,
        tels: phone,
        nombre: nombre || existing.nombre || existing.nombreContacto,
        nombreContacto: nombre || existing.nombreContacto,
        contactoId: dataContacto,
        contacto_id: dataContacto,
        ultima_actividad: now,
        origen: origen || existing.origen || "whatsapp",
      };
      if (cola) update.cola = cola;
      if (salaId) update.salaId = salaId;
      if (normalizedAgent) {
        update.agenteId = normalizedAgent;
        update.agente_id = normalizedAgent;
        const currentEstado = String(existing.estado || "").toLowerCase();
        if (!(currentEstado === "abierta" && targetState === "nuevo")) {
          update.estado = targetState;
        }
      }
      await col.updateOne({ _id: existing._id }, { $set: update });
      if (normalizedAgent) {
        await this.invalidateAgentConversationCaches(normalizedAgent);
      }
      const refreshed = await col.findOne({ _id: existing._id });
      return this.normalizeConversation(refreshed);
    }

    const identity = this.createConversationIdentity();
    const insert = {
      _id: identity._id,
      id: identity.id,
      legacyId: identity.legacyId,
      telefono: phone,
      tels: phone,
      contactoId: dataContacto,
      contacto_id: dataContacto,
      nombre,
      nombreContacto: nombre,
      agenteId: normalizedAgent,
      agente_id: normalizedAgent,
      estado: targetState,
      estadoConexion: "ausente",
      marca: "normal",
      origen: origen || "whatsapp",
      inicio: now,
      ultima_actividad: now,
      cola: cola || null,
      salaId: salaId || null,
      observaciones: "observacion",
      etiqueta2: "etiqueta2",
    };

    const result = await col.insertOne(insert);
    if (normalizedAgent) {
      await this.invalidateAgentConversationCaches(normalizedAgent);
    }
    await safeDel("conversaciones:all");
    return this.normalizeConversation({ _id: result.insertedId, ...insert });
  }

  // backend/chatapp/models/ChatModel.mongo.js
  // Obtener solo las conversaciones del agente
  async getConversaciones(agenteId, estado) {
    const agenteFilter = this.buildAgentIdFilter(agenteId);
    if (!agenteFilter) return [];

    const conversations = await Conversation.find({
      $or: [{ agenteId: agenteFilter }, { agente_id: agenteFilter }],
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

  normalizeInternalAgentId(value) {
    return String(value ?? "")
      .trim()
      .toLowerCase();
  }

  getInternalConversationKey(agentA, agentB) {
    const [left, right] = [
      this.normalizeInternalAgentId(agentA),
      this.normalizeInternalAgentId(agentB),
    ].sort();
    return `internal-room-${left}-${right}`;
  }

  buildInternalConversationIdFilters(conversacionId) {
    const raw = String(conversacionId ?? "").trim();
    const filters = [{ conversacionId: raw }, { conversacion_id: raw }];
    const asNum = Number(raw);
    if (Number.isFinite(asNum)) {
      filters.push({ conversacionId: asNum }, { conversacion_id: asNum });
    }
    if (mongoose.Types.ObjectId.isValid(raw)) {
      const oid = new mongoose.Types.ObjectId(raw);
      filters.push({ conversacionId: oid }, { conversacion_id: oid });
    }
    return filters;
  }

  mapInternalMessageRow(row, viewerAgentId = null) {
    const fromAgentId = String(row.emisorExten || row.emisor_exten || row.emisor || "");
    const toAgentId = String(
      row.receptorExten || row.receptor_exten || row.receptor || "",
    );
    const viewer = this.normalizeInternalAgentId(viewerAgentId);
    let direction = row.direction || null;
    if (!direction && viewer) {
      direction =
        this.normalizeInternalAgentId(fromAgentId) === viewer ? "out" : "in";
    }

    return {
      id: String(row._id || row.id || row.legacyId || ""),
      conversacionId: String(row.conversacionId || row.conversacion_id || ""),
      fromAgentId,
      toAgentId,
      text: row.mensaje || row.text || "",
      tipo: row.tipo || "texto",
      archivo_url: row.archivoUrl || row.archivo_url || null,
      direction,
      timestamp:
        row.ts instanceof Date
          ? row.ts.getTime()
          : Number(row.timestamp) || Date.now(),
    };
  }

  async obtenerOCrearConversacionInterna(agenteAExten, agenteBExten) {
    const agenteOrigen = this.normalizeInternalAgentId(agenteAExten);
    const agenteDestino = this.normalizeInternalAgentId(agenteBExten);
    const salaInternaKey = this.getInternalConversationKey(
      agenteOrigen,
      agenteDestino,
    );

    const db = mongoose.connection.db;
    const col = db.collection("conversaciones_agente");
    let doc = await col.findOne({ salaInternaKey });

    if (!doc) {
      const now = new Date();
      const insert = {
        salaInternaKey,
        telefono: salaInternaKey,
        agenteOrigen,
        agenteDestino,
        estado: "abierta",
        origen: "interno",
        inicio: now,
        ultimaActividad: now,
      };
      const result = await col.insertOne(insert);
      doc = { _id: result.insertedId, ...insert };
    }

    return {
      id: String(doc._id),
      salaInternaKey: doc.salaInternaKey || salaInternaKey,
    };
  }

  async listarMensajesInternosPorConversacion(
    conversacionId,
    limite = 50,
    viewerAgentId = null,
  ) {
    const limiteSeguro = Math.max(1, Math.min(Number(limite) || 50, 200));
    const db = mongoose.connection.db;
    const filters = this.buildInternalConversationIdFilters(conversacionId);
    if (!filters.length) return [];

    const rows = await db
      .collection("mensajes_internos")
      .find({ $or: filters })
      .sort({ ts: 1, _id: 1 })
      .limit(limiteSeguro)
      .toArray();

    return rows.map((row) => this.mapInternalMessageRow(row, viewerAgentId));
  }

  async guardarMensajeInternoEnBaseDatos({
    conversacionId,
    emisorExten,
    receptorExten,
    mensaje,
    tipo = "texto",
    archivoUrl = null,
    direction = null,
  }) {
    const db = mongoose.connection.db;
    const convFilters = this.buildInternalConversationIdFilters(conversacionId);
    const conv = convFilters.length
      ? await db.collection("conversaciones_agente").findOne({ $or: convFilters })
      : null;

    const convObjectId =
      conv?._id ||
      (mongoose.Types.ObjectId.isValid(String(conversacionId))
        ? new mongoose.Types.ObjectId(String(conversacionId))
        : null);

    if (!convObjectId) {
      throw new Error("INTERNAL_CONVERSATION_NOT_FOUND");
    }

    const now = new Date();
    const doc = {
      conversacionId: convObjectId,
      emisorExten: String(emisorExten || ""),
      receptorExten: String(receptorExten || ""),
      mensaje: String(mensaje || ""),
      tipo: tipo || "texto",
      ts: now,
      archivoUrl: archivoUrl || null,
      direction: direction || null,
    };

    const result = await db.collection("mensajes_internos").insertOne(doc);
    await db.collection("conversaciones_agente").updateOne(
      { _id: convObjectId },
      { $set: { ultimaActividad: now } },
    );

    return String(result.insertedId);
  }

  buildContactLookupFilters(conv = {}, fallback = {}) {
    const filters = [];
    const seen = new Set();
    const add = (filter) => {
      const key = JSON.stringify(filter);
      if (seen.has(key)) return;
      seen.add(key);
      filters.push(filter);
    };

    const contactoId = String(
      conv?.contactoId ||
        conv?.contacto_id ||
        conv?.data ||
        fallback.identificacion ||
        fallback.data ||
        "",
    ).trim();
    const telefono = String(
      conv?.telefono || conv?.tels || fallback.telefono || "",
    ).trim();

    if (contactoId) {
      add({ data: contactoId });
      add({ dni: contactoId });
      add({ documento: contactoId });
      if (mongoose.Types.ObjectId.isValid(contactoId)) {
        add({ _id: new mongoose.Types.ObjectId(contactoId) });
      }
    }

    for (const variant of this.phoneHistoryVariants(telefono)) {
      add({ tels: variant });
      add({ telefono: variant });
      add({ data: variant });
    }

    return filters;
  }

  buildConvIdFilters(convId, conv = null) {
    const filters = this.buildConversationLookupFilters(convId);
    if (conv?._id) {
      filters.push({ idConv: conv._id }, { idConv: String(conv._id) });
      const legacy = conv.legacyId ?? conv.id;
      if (legacy != null && legacy !== "") {
        filters.push(
          { idConv: legacy },
          { idConv: String(legacy) },
          { idConv: Number(legacy) },
        );
      }
    }
    return filters;
  }

  async editarContacto(payload = {}) {
    const nombre = String(payload.nombre || "").trim();
    const telefono = String(payload.telefono || "").trim();
    const identificacion = String(
      payload.identificacion || payload.dni || payload.data || telefono,
    ).trim();
    const email = String(payload.email || "").trim();
    const ciudad = String(payload.ciudad || "").trim();
    const direccion = String(payload.direccion || "").trim();
    const entidad = String(payload.entidad || "").trim();
    const convId = String(payload.convId || payload.idConv || "").trim();

    if (!nombre || !telefono) {
      return {
        success: false,
        ok: false,
        mensaje: "Nombre y teléfono son campos requeridos",
      };
    }

    const db = mongoose.connection.db;
    const conv = convId ? await this.findConversationByAnyId(convId) : null;
    const contactFilters = this.buildContactLookupFilters(conv || {}, {
      identificacion,
      telefono,
    });

    const update = {
      nombre,
      tels: telefono,
      telefono,
      dni: identificacion,
      data: identificacion,
      email,
      ciudad,
      direccion,
      entidad,
      actualizadoEn: new Date(),
    };

    let contact = contactFilters.length
      ? await db.collection("contactos").findOne({ $or: contactFilters })
      : null;

    if (contact?._id) {
      await db
        .collection("contactos")
        .updateOne({ _id: contact._id }, { $set: update });
    } else {
      const insert = { ...update, creadoEn: new Date(), activo: true };
      const result = await db.collection("contactos").insertOne(insert);
      contact = { _id: result.insertedId, ...insert };
    }

    if (conv?._id) {
      await db.collection("conversaciones").updateOne(
        { _id: conv._id },
        {
          $set: {
            telefono,
            tels: telefono,
            contactoId: identificacion,
            contacto_id: identificacion,
            data: identificacion,
            nombre,
            nombreContacto: nombre,
            email,
            ciudad,
            direccion,
            entidad,
          },
        },
      );
      await safeDel(`mensajes:${convId}`);
      const agentKey = String(conv.agenteId || conv.agente_id || "").trim();
      if (agentKey) await safeDel(`conversaciones:${agentKey}`);
    }

    const refreshed = await db
      .collection("contactos")
      .findOne({ _id: contact._id });

    return {
      success: true,
      ok: true,
      mensaje: "Contacto actualizado correctamente",
      contacto: refreshed,
    };
  }

  async insertContacto(nombre, telefono) {
    const db = mongoose.connection.db;
    const phone = String(telefono || "").trim();
    const nombreNorm = String(nombre || "").trim() || "Desconocido";
    if (!phone) return phone;

    const phoneFilters = [];
    for (const variant of this.phoneHistoryVariants(phone)) {
      phoneFilters.push({ tels: variant }, { telefono: variant }, { data: variant });
    }

    const existing = phoneFilters.length
      ? await db.collection("contactos").findOne({ $or: phoneFilters })
      : null;

    if (existing?._id) {
      const nombreActual = String(existing.nombre || "").trim();
      if (
        nombreNorm &&
        nombreNorm !== "Desconocido" &&
        (!nombreActual || nombreActual === "Desconocido")
      ) {
        await db
          .collection("contactos")
          .updateOne({ _id: existing._id }, { $set: { nombre: nombreNorm } });
      }
      return String(existing.data || existing.tels || phone);
    }

    const dataKey = String(phone).replace(/\D/g, "") || phone;
    await db.collection("contactos").insertOne({
      nombre: nombreNorm,
      data: dataKey,
      dni: dataKey,
      tels: phone,
      telefono: phone,
      creadoEn: new Date(),
      activo: true,
    });
    return dataKey;
  }

  async crearContacto(payload = {}) {
    const nombre = String(payload.nombre || "").trim();
    const telefono = String(payload.telefono || "").trim();
    const identificacion = String(
      payload.identificacion || payload.dni || payload.data || telefono,
    ).trim();
    const direccion = String(payload.direccion || "").trim();
    const ciudad = String(payload.ciudad || "").trim();
    const entidad = String(payload.entidad || "").trim();
    const email = String(payload.email || "").trim();
    const convId = String(payload.idConv || payload.convId || "").trim();
    const agentId = String(
      payload.agentId || payload.agenteId || payload.userId || "",
    ).trim();

    if (!nombre || !telefono) {
      return {
        success: false,
        ok: false,
        mensaje: "Nombre y teléfono son requeridos",
      };
    }

    const db = mongoose.connection.db;
    const duplicateFilters = [];
    for (const variant of this.phoneHistoryVariants(telefono)) {
      duplicateFilters.push({ tels: variant }, { telefono: variant });
    }
    if (identificacion) {
      duplicateFilters.push({ data: identificacion }, { dni: identificacion });
    }

    const existing = duplicateFilters.length
      ? await db.collection("contactos").findOne({ $or: duplicateFilters })
      : null;

    const contactUpdate = {
      nombre,
      tels: telefono,
      telefono,
      data: identificacion,
      dni: identificacion,
      direccion,
      ciudad,
      entidad,
      email,
      actualizadoEn: new Date(),
      activo: true,
    };

    let contacto;
    if (existing?._id) {
      await db
        .collection("contactos")
        .updateOne({ _id: existing._id }, { $set: contactUpdate });
      contacto = await db.collection("contactos").findOne({ _id: existing._id });
    } else {
      const doc = {
        ...contactUpdate,
        idConv: convId || null,
        agenteId: agentId || null,
        creadoPor: agentId || null,
        origen: String(payload.origen || "manual").trim(),
        creadoEn: new Date(),
      };
      const result = await db.collection("contactos").insertOne(doc);
      contacto = { _id: result.insertedId, ...doc };
    }

    let conversacion = null;
    if (convId) {
      const conv = await this.findConversationByAnyId(convId);
      if (conv?._id) {
        await db.collection("conversaciones").updateOne(
          { _id: conv._id },
          {
            $set: {
              contactoId: identificacion,
              contacto_id: identificacion,
              telefono,
              tels: telefono,
              nombre,
              nombreContacto: nombre,
              ...(agentId ? { agenteId, agente_id: agentId } : {}),
            },
          },
        );
        conversacion = this.normalizeConversation(
          await db.collection("conversaciones").findOne({ _id: conv._id }),
        );
      }
    }

    if (!conversacion) {
      conversacion = await this.upsertConversationForClient({
        telefono,
        nombre,
        agenteId: agentId,
        contactoId: identificacion,
        cola: entidad || null,
        origen: String(payload.origen || "manual").trim() || "whatsapp",
        estado: "nuevo",
      });
    }

    if (agentId) await safeDel(`conversaciones:${agentId}`);

    return {
      success: true,
      ok: true,
      mensaje: existing
        ? "Contacto actualizado y vinculado a conversación"
        : "Contacto creado correctamente",
      contacto,
      conversacion,
    };
  }

  async eliminarContacto(data = {}) {
    try {
      const convId = String(data.convId || data.id || "").trim();
      if (!convId) {
        return { success: false, ok: false, message: "convId requerido" };
      }

      const db = mongoose.connection.db;
      const conv = await this.findConversationByAnyId(convId);
      if (!conv?._id) {
        return { success: false, ok: false, message: "Conversación no encontrada" };
      }

      const msgFilters = buildMessageFilters(convId, conv);
      const msgResult = msgFilters.length
        ? await db.collection("mensajes").deleteMany({ $or: msgFilters })
        : { deletedCount: 0 };

      const convCommentFilters = this.buildConvIdFilters(convId, conv);
      const comResult = convCommentFilters.length
        ? await db.collection("comentarios_chats").deleteMany({
            $or: convCommentFilters,
          })
        : { deletedCount: 0 };

      const convResult = await db
        .collection("conversaciones")
        .deleteOne({ _id: conv._id });

      const contactFilters = this.buildContactLookupFilters(conv, {});
      const contactResult = contactFilters.length
        ? await db.collection("contactos").deleteMany({ $or: contactFilters })
        : { deletedCount: 0 };

      await safeDel(`mensajes:${convId}`);
      const agentKey = String(conv.agenteId || conv.agente_id || "").trim();
      if (agentKey) await safeDel(`conversaciones:${agentKey}`);

      if (typeof messageBuffer.clearBufferedMessages === "function") {
        await messageBuffer.clearBufferedMessages(convId);
      }

      if (convResult.deletedCount !== 1) {
        return {
          success: false,
          ok: false,
          step: 2,
          message: "Error eliminando conversación",
        };
      }

      return {
        success: true,
        ok: true,
        deletedMessages: msgResult.deletedCount || 0,
        deletedConversation: convResult.deletedCount || 0,
        deletedContact: contactResult.deletedCount || 0,
        deletedComments: comResult.deletedCount || 0,
      };
    } catch (error) {
      return {
        success: false,
        ok: false,
        step: 0,
        message: `Error del sistema: ${error.message}`,
      };
    }
  }
}

module.exports = ChatModelMongo;
