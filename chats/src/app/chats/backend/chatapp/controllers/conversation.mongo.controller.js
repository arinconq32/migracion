const Conversation = require("../models/Conversation.mongo");
const Message = require("../models/Message.mongo");
const redisClient = require("../config/redis");
const mongoose = require("mongoose");
const chatUtils = require("../utils/chatUtils");
const {
  enrichConversationsWithContacts,
} = require("../utils/contactResolver");
const { fetchMessagesForConversation } = require("../utils/messageQuery");
const CACHE_TTL = {
  CONVERSACIONES: 30,
  MENSAJES: 300,
};

async function getCache(key) {
  const data = await redisClient.get(key);
  return data ? JSON.parse(data) : null;
}

async function setCache(key, value, ttl = 30) {
  await redisClient.set(key, JSON.stringify(value), { EX: ttl });
}

async function invalidateRelatedCaches(convId, agenteId = null) {
  const keysToDelete = [`mensajes:${convId}`];
  if (agenteId) {
    keysToDelete.push(
      `conversaciones:${agenteId}:nuevo`,
      `conversaciones:${agenteId}:abierta`,
      `conversaciones:${agenteId}:cerrada`,
      `activeConversations:${agenteId}`,
    );
  }
  keysToDelete.push("conversaciones:pendientes");
  if (keysToDelete.length > 0) {
    await redisClient.del(keysToDelete);
  }
}

function normalizeLabel(item = {}) {
  return {
    id: item.id ?? item.legacyId ?? String(item._id || item.nombre || item.desc || ""),
    nombre: String(item.nombre || item.desc || "").trim(),
    color: String(item.color || "#7eb83b").trim(),
  };
}

function normalizeMessage(msg) {
  if (!msg) return msg;
  const autor = msg.autor || msg.emisor;
  const texto = msg.texto || msg.mensaje || msg.text || "";
  return {
    id: msg.id || msg._id,
    conversacionId: msg.conversacionId || msg.conversacion_id,
    autor,
    emisor: msg.emisor || autor,
    texto,
    text: msg.text || texto,
    mensaje: msg.mensaje || texto,
    fecha: msg.fecha || msg.timestamp || msg.ts,
    ts: msg.ts || msg.fecha || msg.timestamp,
    tipo: msg.tipo,
    leido: msg.leido,
    archivoUrl: msg.archivoUrl || msg.archivo_url,
    origen: msg.origen,
  };
}

function normalizeConversation(obj) {
  const etiquetasNormalizadas = Array.isArray(obj.etiquetas)
    ? obj.etiquetas.map(normalizeLabel).filter((l) => l.nombre)
    : (() => {
        const nombres = String(obj.etiqueta2 || obj.etiqueta_2 || obj.etiqueta || "")
          .replace(/^\|+|\|+$/g, "")
          .split("|")
          .map((value) => value.trim())
          .filter(Boolean);
        const colores = String(obj.color || "")
          .replace(/^\|+|\|+$/g, "")
          .split("|")
          .map((value) => value.trim());

        return nombres.map((nombre, index) =>
          normalizeLabel({
            id: `${obj.id || obj._id || nombre}-${index}`,
            nombre,
            color: colores[index] || obj.color || "#7EB83B",
          }),
        );
      })();

  const metadata = {
    ...(obj.metadata || {}),
    nombreWhatsApp:
      obj.metadata?.nombreWhatsApp ||
      obj.metadata?.pushName ||
      obj.nombreWhatsApp ||
      "",
    pushName: obj.metadata?.pushName || obj.pushName || "",
  };

  return {
    id: String(obj.id || obj._id || ""),
    nombre: obj.nombre || obj.name || metadata.nombreWhatsApp || metadata.pushName || "",
    name: obj.name || obj.nombre || metadata.nombreWhatsApp || metadata.pushName || "",
    telefono: obj.telefono,
    contactoId: obj.contactoId || obj.contacto_id,
    agenteId: obj.agenteId || obj.agente_id,
    estado: obj.estado,
    estadoConexion: obj.estadoConexion || obj.estado_conexion,
    marca: obj.marca,
    inicio: obj.inicio,
    fin: obj.fin,
    tipificaciones: obj.tipificaciones,
    etiqueta2: obj.etiqueta2 || obj.etiqueta_2,
    etiqueta: obj.etiqueta,
    color: obj.color,
    observaciones: obj.observaciones,
    origen: obj.origen,
    salaId: obj.salaId || obj.sala_id,
    cola: obj.cola,
    etiquetas: etiquetasNormalizadas,
    mensajes: Array.isArray(obj.mensajes)
      ? obj.mensajes.map(normalizeMessage)
      : obj.mensajes,
    metadata,
  };
}

// Obtener todas las conversaciones, filtrando por agenteId si se pasa userId, con caché avanzado
exports.getConversations = async (req, res) => {
  try {
    const agenteId = req.query.userId;
    const estado = req.query.estado || undefined;
    const db = mongoose.connection.db;

    let cacheKey = agenteId
      ? `conversaciones:${agenteId}`
      : "conversaciones:all";
    if (estado) cacheKey += `:${estado}`;

    let rawConversations = await getCache(cacheKey);
    // Lista vacía cacheada ([] es truthy) bloqueaba la UI tras un userId incorrecto.
    if (
      Array.isArray(rawConversations) &&
      rawConversations.length === 0 &&
      agenteId
    ) {
      rawConversations = null;
      await redisClient.del(cacheKey).catch(() => {});
    }

    if (!rawConversations) {
      const filter = {};
      if (agenteId) {
        const agenteIdNum = Number(agenteId);
        filter.$or = [
          { agenteId: agenteId },
          { agente_id: agenteId },
          { agenteId: agenteIdNum },
          { agente_id: agenteIdNum },
        ];
      }
      if (estado) filter.estado = estado;

      rawConversations = await db.collection("conversaciones").find(filter).toArray();
      const normalizedOnly = rawConversations.map((conv) => normalizeConversation(conv));
      // No cachear listas vacías por agente (evita pantalla en blanco tras ID incorrecto).
      if (normalizedOnly.length > 0 || !agenteId) {
        await setCache(cacheKey, normalizedOnly, CACHE_TTL.CONVERSACIONES);
      }
      rawConversations = normalizedOnly;
    } else {
      rawConversations = rawConversations.map((conv) => normalizeConversation(conv));
    }

    const enriched = await enrichConversationsWithContacts(db, rawConversations);
    res.json(enriched);
  } catch (err) {
    res
      .status(500)
      .json({ error: "Error al obtener conversaciones", details: err });
  }
};

exports.resolveConversation = async (req, res) => {
  try {
    const rawId = String(req.params.rawId || "").trim();
    if (!rawId) {
      return res.status(400).json({ ok: false, error: "rawId es requerido" });
    }

    let conv = null;
    if (global.chatModel?.findConversationByAnyId) {
      conv = await global.chatModel.findConversationByAnyId(rawId);
    }

    if (!conv) {
      const filters = [{ _id: rawId }, { id: rawId }, { legacyId: rawId }];
      const numeric = Number(rawId);
      if (Number.isFinite(numeric)) {
        filters.push({ legacyId: numeric }, { id: numeric });
      }
      if (mongoose.Types.ObjectId.isValid(rawId)) {
        filters.push({ _id: new mongoose.Types.ObjectId(rawId) });
      }
      conv = await mongoose.connection.db
        .collection("conversaciones")
        .findOne({ $or: filters });
    }

    if (!conv) {
      return res.status(404).json({ ok: false, error: "Conversacion no encontrada" });
    }

    res.json({
      ok: true,
      id: String(conv._id || conv.id || ""),
      legacyId: conv.legacyId ?? conv.id ?? null,
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: "Error al resolver conversacion",
      details: String(err?.message || err),
    });
  }
};

exports.getHistorialCliente = async (req, res) => {
  try {
    const convId = req.query.convId || null;
    const dni = req.query.dni || null;
    const limit = req.query.limit || 300;

    if (!global.chatModel?.getHistorialClientePorConvId) {
      return res.status(501).json({
        ok: false,
        error: "Historial de cliente no disponible en este backend",
        persona: null,
        registros: [],
      });
    }

    const result = await global.chatModel.getHistorialClientePorConvId(
      convId,
      limit,
      dni,
    );

    res.json({
      ok: true,
      persona: result.persona || null,
      registros: Array.isArray(result.registros) ? result.registros : [],
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: "Error al obtener historial del cliente",
      details: String(err?.message || err),
      persona: null,
      registros: [],
    });
  }
};

// Crear una nueva conversación y limpiar caché relacionado
exports.createConversation = async (req, res) => {
  try {
    const conversation = new Conversation(req.body);
    await conversation.save();
    await invalidateRelatedCaches(conversation._id, conversation.agenteId);
    res.status(201).json(conversation);
  } catch (err) {
    res
      .status(400)
      .json({ error: "Error al crear conversación", details: err });
  }
};

// Agregar mensaje a una conversación y actualizar caché
exports.addMessage = async (req, res) => {
  try {
    const { conversacionId } = req.params;
    const message = new Message({ ...req.body, conversacionId });
    await message.save();
    await Conversation.findByIdAndUpdate(conversacionId, {
      $push: { mensajes: message._id },
    });
    // Actualizar caché de mensajes
    const cacheKey = `mensajes:${conversacionId}`;
    let cached = (await getCache(cacheKey)) || [];
    cached.push(message);
    await setCache(cacheKey, cached, CACHE_TTL.MENSAJES);
    res.status(201).json(message);
  } catch (err) {
    res.status(400).json({ error: "Error al agregar mensaje", details: err });
  }
};

exports.getMultimedia = async (req, res) => {
  try {
    const { conversacionId } = req.params;
    if (global.chatModel?.getMultimediaByConvId) {
      const multimedia = await global.chatModel.getMultimediaByConvId(
        conversacionId,
      );
      return res.json({ ok: true, multimedia });
    }
    res.json({ ok: true, multimedia: [] });
  } catch (err) {
    res.status(500).json({
      ok: false,
      multimedia: [],
      error: "Error al obtener multimedia",
      details: String(err?.message || err),
    });
  }
};

// Obtener mensajes de una conversación con caché
exports.getMessages = async (req, res) => {
  try {
    const { conversacionId } = req.params;
    const ignoreAgentCheck = String(req.query.ignoreAgent || "") === "1";

    const cacheKey = `mensajes:${conversacionId}`;
    let cached = await getCache(cacheKey);
    if (cached) {
      return res.json(cached.map(normalizeMessage));
    }

    const db = mongoose.connection.db;
    const conv = global.chatModel?.findConversationByAnyId
      ? await global.chatModel.findConversationByAnyId(conversacionId)
      : await db.collection("conversaciones").findOne({
          _id: mongoose.Types.ObjectId.isValid(conversacionId)
            ? new mongoose.Types.ObjectId(conversacionId)
            : conversacionId,
        });

    const messages = await fetchMessagesForConversation(
      db,
      conversacionId,
      conv,
    );
    const normalized = messages.map((m) => normalizeMessage(m));
    await setCache(cacheKey, normalized, CACHE_TTL.MENSAJES);
    res.json(normalized);
  } catch (err) {
    res.status(500).json({ error: "Error al obtener mensajes", details: err });
  }
};

exports.getLabels = async (_req, res) => {
  try {
    const db = mongoose.connection.db;
    const labels = await db
      .collection("etiquetas")
      .find({})
      .sort({ nombre: 1 })
      .toArray();
    res.json(labels.map(normalizeLabel).filter((l) => l.nombre));
  } catch (err) {
    res.status(500).json({ error: "Error al obtener etiquetas", details: err });
  }
};

async function invalidateEtiquetasCache() {
  await redisClient.del(["etiquetas:all", "filtros:all"]);
}

async function syncEtiquetasCatalog() {
  if (global.chatModel?.invalidateEtiquetasCache) {
    await global.chatModel.invalidateEtiquetasCache();
  } else {
    await invalidateEtiquetasCache();
  }
  await chatUtils.broadcastEtiquetasCatalog();
}

exports.createLabel = async (req, res) => {
  try {
    const nombre = String(req.body?.nombre || "").trim();
    const color = String(req.body?.color || "#7eb83b").trim();
    if (!nombre) {
      return res.status(400).json({ error: "nombre es requerido" });
    }

    if (global.chatModel?.createEtiqueta) {
      const result = await global.chatModel.createEtiqueta(nombre, color);
      if (!result.success) {
        return res.status(result.status || 500).json({ error: result.error });
      }
      await chatUtils.broadcastEtiquetasCatalog();
      return res.status(201).json(normalizeLabel(result.etiqueta));
    }

    const db = mongoose.connection.db;
    const etiquetasCol = db.collection("etiquetas");

    const existing = await etiquetasCol.findOne({
      nombre: { $regex: new RegExp(`^${nombre.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
    });
    if (existing) {
      return res.status(409).json({ error: "La etiqueta ya existe" });
    }

    const maxDoc = await etiquetasCol.find({ id: { $type: "number" } }).sort({ id: -1 }).limit(1).toArray();
    const nextId = Number(maxDoc?.[0]?.id || 0) + 1;

    const doc = { id: nextId, nombre, color };
    await etiquetasCol.insertOne(doc);
    await syncEtiquetasCatalog();
    res.status(201).json(normalizeLabel(doc));
  } catch (err) {
    res.status(500).json({ error: "Error al crear etiqueta", details: err });
  }
};

exports.deleteLabel = async (req, res) => {
  try {
    const rawId = String(req.params?.labelId || "").trim();
    if (!rawId) {
      return res.status(400).json({ error: "labelId es requerido" });
    }

    if (global.chatModel?.deleteEtiqueta) {
      const result = await global.chatModel.deleteEtiqueta(rawId);
      if (!result.success) {
        return res.status(result.status || 500).json({ error: result.error });
      }
      await chatUtils.broadcastEtiquetasCatalog();
      return res.json({ success: true, id: rawId, nombre: result.nombre });
    }

    const db = mongoose.connection.db;
    const etiquetasCol = db.collection("etiquetas");

    const numericId = Number(rawId);
    const deleteFilter = Number.isFinite(numericId)
      ? { $or: [{ id: numericId }, { id: rawId }, { _id: rawId }] }
      : { $or: [{ id: rawId }, { _id: rawId }] };

    const existing = await etiquetasCol.findOne(deleteFilter);
    if (!existing) {
      return res.status(404).json({ error: "Etiqueta no encontrada" });
    }

    await etiquetasCol.deleteOne({ _id: existing._id });

    const nombre = String(existing.nombre || "").trim();
    if (nombre) {
      await db.collection("conversaciones").updateMany(
        {},
        { $pull: { etiquetas: { nombre } } },
      );
    }

    await syncEtiquetasCatalog();
    res.json({ success: true, id: rawId, nombre });
  } catch (err) {
    res.status(500).json({ error: "Error al eliminar etiqueta", details: err });
  }
};

exports.getConversationLabels = async (req, res) => {
  try {
    const convId = String(req.params?.conversacionId || "").trim();
    if (!convId) {
      return res.status(400).json({ error: "conversacionId es requerido" });
    }

    const db = mongoose.connection.db;
    const filters = [{ _id: convId }, { id: convId }];
    if (mongoose.Types.ObjectId.isValid(convId)) {
      filters.unshift({ _id: new mongoose.Types.ObjectId(convId) });
    }

    const conv = await db.collection("conversaciones").findOne({ $or: filters });

    const labels = Array.isArray(conv?.etiquetas) ? conv.etiquetas : [];
    res.json(labels.map(normalizeLabel).filter((l) => l.nombre));
  } catch (err) {
    res.status(500).json({ error: "Error al obtener etiquetas de conversación", details: err });
  }
};

exports.setConversationLabels = async (req, res) => {
  try {
    const convId = String(req.params?.conversacionId || "").trim();
    if (!convId) {
      return res.status(400).json({ error: "conversacionId es requerido" });
    }

    const rawLabels = Array.isArray(req.body?.etiquetas) ? req.body.etiquetas : [];
    const labels = rawLabels
      .map((l) => normalizeLabel(l))
      .filter((l) => l.nombre)
      .slice(0, 4);

    const db = mongoose.connection.db;
    const filters = [{ _id: convId }, { id: convId }];
    if (mongoose.Types.ObjectId.isValid(convId)) {
      filters.unshift({ _id: new mongoose.Types.ObjectId(convId) });
    }

    const updateResult = await db.collection("conversaciones").updateOne(
      { $or: filters },
      { $set: { etiquetas: labels } },
    );

    if (!updateResult?.matchedCount) {
      return res.status(404).json({ error: "Conversación no encontrada" });
    }

    const conv = await db.collection("conversaciones").findOne({ $or: filters });
    await invalidateRelatedCaches(
      convId,
      conv?.agenteId || conv?.agente_id || null,
    );

    res.json({ success: true, etiquetas: labels });
  } catch (err) {
    res.status(500).json({ error: "Error al guardar etiquetas", details: err });
  }
};
