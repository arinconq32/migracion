// Obtener motivos de cierre desde MongoDB
async function getMotivosCierre(req, res, next) {
  try {
    const motivos = await chatService.getMotivosCierre();
    const normalized = (Array.isArray(motivos) ? motivos : []).map((m) => ({
      id: m.id ?? m._id,
      desc: m.desc || m.descripcion || m.nombre || "",
      nombre: m.nombre || m.descripcion || m.desc || "",
    }));
    res.json({ ok: true, data: normalized });
  } catch (error) {
    next(error);
  }
}

// Obtener etiquetas desde MongoDB
async function getEtiquetas(req, res, next) {
  try {
    const etiquetas = await global.chatModel.getEtiquetas();
    // Normaliza los campos a camelCase
    const normalized = etiquetas.map((e) => ({
      id: e.id || e._id,
      nombre: e.nombre,
      color: e.color,
      descripcion: e.descripcion || e.descripcion_corta,
    }));
    res.json({ ok: true, data: normalized });
  } catch (error) {
    next(error);
  }
}

// Obtener filtros desde MongoDB
async function getFiltros(req, res, next) {
  try {
    const filtros = await global.chatModel.getFiltros();
    res.json({ ok: true, data: filtros });
  } catch (error) {
    next(error);
  }
}

// Obtener tipificaciones desde MongoDB
async function getTipificaciones(req, res, next) {
  try {
    const tipificaciones = await global.chatModel.getTipificaciones();
    const normalized = (Array.isArray(tipificaciones) ? tipificaciones : []).map(
      (t) => ({
        id: t.id ?? t._id ?? t.id_tipificacion,
        desc:
          t.desc ||
          t.tipificacion ||
          t.observacion ||
          t.nombre ||
          t.descripcion ||
          "",
        nombre:
          t.nombre ||
          t.tipificacion ||
          t.observacion ||
          t.descripcion ||
          t.desc ||
          "",
      }),
    );
    res.json({ ok: true, data: normalized });
  } catch (error) {
    next(error);
  }
}
const chatService = require("../services/chat.service");

let runtimeService = null;

function setRuntimeService(service) {
  runtimeService = service;
}

function health(_req, res) {
  res.json({ ok: true, module: "chat-controller", ts: Date.now() });
}

function getMessages(_req, res, next) {
  try {
    const messages = chatService.getMessages();
    const normalized = messages.map((m) => ({
      id: m.id || m._id,
      conversacionId: m.conversacionId || m.conversacion_id,
      emisor: m.emisor,
      mensaje: m.mensaje || m.text,
      tipo: m.tipo,
      archivoUrl: m.archivoUrl || m.archivo_url,
      timestamp: m.timestamp,
      origen: m.origen,
    }));
    res.json({ ok: true, data: normalized });
  } catch (error) {
    next(error);
  }
}

function sendMessage(req, res, next) {
  try {
    const created = chatService.sendMessage({
      userId: req.user && req.user.id ? req.user.id : "anonymous",
      text: req.body.text,
      roomId: req.body.roomId || "general",
    });

    res.status(201).json({ ok: true, data: created });
  } catch (error) {
    next(error);
  }
}

async function webhook(req, res, next) {
  try {
    if (!runtimeService) {
      res
        .status(503)
        .json({ ok: false, error: "runtime service not configured" });
      return;
    }

    const result = await runtimeService.handleWebhook(req.body || {});
    res.status(result.status || 200).json(result.body || { success: true });
  } catch (error) {
    next(error);
  }
}

async function sendOutboundMessage(req, res, next) {
  try {
    if (!runtimeService) {
      res
        .status(503)
        .json({ ok: false, error: "runtime service not configured" });
      return;
    }

    const {
      numero,
      mensaje,
      tipo = "text",
      datos_adicionales = {},
    } = req.body || {};
    const result = await runtimeService.sendWhatsAppMessage(
      numero,
      mensaje,
      tipo,
      datos_adicionales,
    );
    res.status(result.success ? 200 : 500).json(result);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  setRuntimeService,
  health,
  getMessages,
  sendMessage,
  webhook,
  sendOutboundMessage,
  getMotivosCierre,
  getEtiquetas,
  getFiltros,
  getTipificaciones,
};
