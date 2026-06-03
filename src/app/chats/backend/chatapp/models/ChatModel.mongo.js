const Conversation = require("./Conversation.mongo");
const Message = require("./Message.mongo");
const MotivoCierre = require("./MotivoCierre");
const Etiqueta = require("./Etiqueta");
const Filtro = require("./Filtro");
const Tipificacion = require("./Tipificacion");
const redisClient = require("../config/redis");

const CACHE_TTL = {
  CONVERSACIONES: 30,
  MENSAJES: 300,
  ETIQUETAS: 300,
  FILTROS: 300,
  MOTIVOS: 300,
  TIPIFICACIONES: 300,
};

async function getCache(key) {
  const data = await redisClient.get(key);
  return data ? JSON.parse(data) : null;
}

async function setCache(key, value, ttl = 30) {
  await redisClient.set(key, JSON.stringify(value), { EX: ttl });
}

class ChatModelMongo {
  // Obtener tipificaciones (stub)
  async getTipificaciones() {
    // Devuelve un array vacío o datos de ejemplo
    return [];
  }
  constructor() {}

  // Obtener motivos de cierre desde MongoDB con caché
  async getMotivosCierre() {
    const cacheKey = "motivos_cierre:all";
    let cached = await getCache(cacheKey);
    if (cached) return cached;
    const motivos = await MotivoCierre.find({ activo: true }).sort({ id: 1 });
    await setCache(cacheKey, motivos, CACHE_TTL.MOTIVOS);
    return motivos;
  }

  // Obtener etiquetas con caché
  async getEtiquetas() {
    const cacheKey = "etiquetas:all";
    let cached = await getCache(cacheKey);
    if (cached) return cached;
    const etiquetas = await Etiqueta.find({ activo: true }).sort({ nombre: 1 });
    await setCache(cacheKey, etiquetas, CACHE_TTL.ETIQUETAS);
    return etiquetas;
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
    const cacheKey = "tipificaciones:all";
    let cached = await getCache(cacheKey);
    if (cached) return cached;
    const tipificaciones = await Tipificacion.find({ activo: true }).sort({
      nombre: 1,
    });
    await setCache(cacheKey, tipificaciones, CACHE_TTL.TIPIFICACIONES);
    return tipificaciones;
  }

  async countActiveConversations(agentId) {
    return Conversation.countDocuments({
      agenteId: agentId,
      estado: "abierta",
    });
  }

  async updateConversationState(convId, estado, agenteId, abrir = true) {
    const update = { estado };
    if (abrir && agenteId) update.agenteId = agenteId;
    await Conversation.findByIdAndUpdate(convId, update);
  }

  // Obtener mensajes solo si la conversación pertenece al agente
  async getMensajes(convId, agenteId = null) {
    const Conversation = require("./Conversation.mongo");
    const conv = await Conversation.findById(convId);
    if (!conv) return [];
    if (agenteId && String(conv.agenteId) !== String(agenteId)) return [];
    return Message.find({ conversacionId: convId }).sort({ fecha: 1 });
  }

  async insertMessage(convId, autor, texto, tipo = "texto") {
    const msg = new Message({ conversacionId: convId, autor, texto, tipo });
    await msg.save();
    await Conversation.findByIdAndUpdate(convId, {
      $push: { mensajes: msg._id },
    });
    return msg._id;
  }
  // backend/chatapp/models/ChatModel.mongo.js
  // Obtener solo las conversaciones del agente
  async getConversaciones(agenteId, estado) {
    return await require("./Conversation.mongo")
      .find({
        agenteId,
        estado,
      })
      .sort({ inicio: -1 });
  }

  // Obtener conversaciones pendientes (estado: 'nuevo')
  async getPendientes() {
    return await Conversation.find({ estado: "nuevo" }).sort({ inicio: -1 });
  }
}

module.exports = ChatModelMongo;
