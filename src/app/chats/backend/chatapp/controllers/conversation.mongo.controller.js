const Conversation = require("../models/Conversation.mongo");
const Message = require("../models/Message.mongo");
const redisClient = require("../config/redis");
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

// Obtener todas las conversaciones, filtrando por agenteId si se pasa userId, con cach avanzado
exports.getConversations = async (req, res) => {
  try {
    const agenteId = req.query.userId;
    const estado = req.query.estado || undefined;

    let cacheKey = agenteId
      ? `conversaciones:${agenteId}`
      : "conversaciones:all";
    if (estado) cacheKey += `:${estado}`;

    let cached = await getCache(cacheKey);
    if (cached) {
      const withId = cached.map((conv) => normalizeConversation(conv));
      return res.json(withId);
    }

    // Consulta nativa a la colección
    const db = require('mongoose').connection.db;
    const filter = {};
    if (agenteId) {
      const agenteIdNum = Number(agenteId);
      filter.$or = [
        { agenteId: agenteId },
        { agente_id: agenteId },
        { agenteId: agenteIdNum },
        { agente_id: agenteIdNum }
      ];
    }
    if (estado) filter.estado = estado;
    console.log("Filtro usado para buscar conversaciones:", filter);
    const conversations = await db.collection('conversaciones').find(filter).toArray();
    console.log("Conversaciones encontradas (nativo):", conversations);
    const withId = conversations.map((conv) => normalizeConversation(conv));
    await setCache(cacheKey, withId, CACHE_TTL.CONVERSACIONES);
    res.json(withId);
    // Normaliza una conversación, mapeando ambos formatos de campo
    function normalizeConversation(obj) {
      return {
        id: obj.id || obj._id,
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
        mensajes: Array.isArray(obj.mensajes)
          ? obj.mensajes.map(normalizeMessage)
          : obj.mensajes,
        metadata: obj.metadata,
      };
    }

    // Normaliza un mensaje, mapeando ambos formatos de campo
    function normalizeMessage(msg) {
      if (!msg) return msg;
      return {
        id: msg.id || msg._id,
        conversacionId: msg.conversacionId || msg.conversacion_id,
        autor: msg.autor || msg.emisor,
        texto: msg.texto || msg.mensaje || msg.text,
        fecha: msg.fecha || msg.timestamp,
        tipo: msg.tipo,
        leido: msg.leido,
        archivoUrl: msg.archivoUrl || msg.archivo_url,
        origen: msg.origen,
        // ...otros campos relevantes
      };
    }
  } catch (err) {
    res
      .status(500)
      .json({ error: "Error al obtener conversaciones", details: err });
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

// Obtener mensajes de una conversación con caché
exports.getMessages = async (req, res) => {
  try {
    const { conversacionId } = req.params;
    const cacheKey = `mensajes:${conversacionId}`;
    let cached = await getCache(cacheKey);
    if (cached) {
      // Normaliza ambos formatos
      return res.json(cached.map(normalizeMessage));
    }
    // Buscar por ambos formatos de campo
    const messages = await Message.find({
      $or: [{ conversacionId }, { conversacion_id: conversacionId }],
    });
    const normalized = messages.map(normalizeMessage);
    await setCache(cacheKey, normalized, CACHE_TTL.MENSAJES);
    res.json(normalized);
  } catch (err) {
    res.status(500).json({ error: "Error al obtener mensajes", details: err });
  }
};
