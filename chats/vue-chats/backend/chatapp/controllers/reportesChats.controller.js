const reportesService = require("../services/reportesChats.service");

function setRuntimeService(service) {
  reportesService.setRuntimeService(service);
}

function setChatModel(model) {
  reportesService.setChatModel(model);
}

async function getResumen(req, res) {
  try {
    const { entidad, cola, desde, hasta } = req.query;
    const data = await reportesService.getResumen({ entidad, cola, desde, hasta });
    res.json({ ok: true, data });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
}

async function getConversaciones(req, res) {
  try {
    const { entidad, cola, desde, hasta, limite } = req.query;
    const data = await reportesService.getConversaciones({
      entidad,
      cola,
      desde,
      hasta,
      limite,
    });
    res.json({ ok: true, data });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
}

async function getActividadAgentes(req, res) {
  try {
    const { entidad, cola, desde, hasta, estado, limite } = req.query;
    const data = await reportesService.getActividadAgentes({
      entidad,
      cola,
      desde,
      hasta,
      estado,
      limite,
    });
    res.json({ ok: true, data });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
}

async function getActivas(req, res) {
  try {
    const data = await reportesService.getConversacionesActivas();
    res.json({ ok: true, data });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
}

async function getConversacionDetalle(req, res) {
  try {
    const { conversacionId } = req.params;
    const data = await reportesService.getConversacionDetalle(conversacionId);
    if (!data) {
      res.status(404).json({ ok: false, error: "Conversación no encontrada" });
      return;
    }
    res.json({ ok: true, data });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
}

async function getMensajes(req, res) {
  try {
    const { conversacionId } = req.params;
    const data = await reportesService.getMensajesConversacion(conversacionId);
    res.json({ ok: true, data });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
}

async function transferir(req, res) {
  try {
    const { conversacionId, agenteDestino, agenteOrigen, motivo } = req.body || {};
    const result = await reportesService.transferirConversacion({
      conversacionId,
      agenteDestino,
      agenteOrigen,
      motivo,
    });
    if (!result.ok) {
      res.status(400).json(result);
      return;
    }
    res.json(result);
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
}

async function supervisorMensaje(req, res) {
  try {
    const { conversacionId, mensaje, supervisorId } = req.body || {};
    const result = await reportesService.enviarMensajeSupervisor({
      conversacionId,
      mensaje,
      supervisorId,
    });
    if (!result.ok) {
      res.status(400).json(result);
      return;
    }
    res.json(result);
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
}

async function getBotConfig(req, res) {
  try {
    const data = reportesService.getBotConfig();
    res.json({ ok: true, data });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
}

async function saveBotConfig(req, res) {
  try {
    const saved = reportesService.saveBotConfig(req.body || {});
    const reload = await reportesService.reloadBotConfig();
    res.json({ ok: true, data: saved, reload });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
}

async function getEntidades(req, res) {
  try {
    const data = await reportesService.getEntidades();
    res.json({ ok: true, data });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
}

async function getColas(req, res) {
  try {
    const data = await reportesService.getColas();
    res.json({ ok: true, data });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
}

async function getContactos(req, res) {
  try {
    const { search, limite, skip } = req.query;
    const data = await reportesService.getContactos({ search, limite, skip });
    res.json({ ok: true, data });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
}

async function deleteContacto(req, res) {
  try {
    const data = await reportesService.deleteContacto(req.params.id);
    if (!data.ok) {
      return res.status(404).json({ ok: false, error: data.error });
    }
    res.json({ ok: true, data });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
}

module.exports = {
  setRuntimeService,
  setChatModel,
  getResumen,
  getConversaciones,
  getConversacionDetalle,
  getActividadAgentes,
  getActivas,
  getMensajes,
  transferir,
  supervisorMensaje,
  getBotConfig,
  saveBotConfig,
  getEntidades,
  getColas,
  getContactos,
  deleteContacto,
};
