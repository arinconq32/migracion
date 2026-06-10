const express = require("express");
const router = express.Router();
const reportesController = require("../controllers/reportesChats.controller");

router.get("/resumen", reportesController.getResumen);
router.get("/conversaciones", reportesController.getConversaciones);
router.get("/conversaciones/:conversacionId", reportesController.getConversacionDetalle);
router.get("/agentes", reportesController.getActividadAgentes);
router.get("/activas", reportesController.getActivas);
router.get("/entidades", reportesController.getEntidades);
router.get("/colas", reportesController.getColas);
router.get("/contactos", reportesController.getContactos);
router.delete("/contactos/:id", reportesController.deleteContacto);
router.get("/mensajes/:conversacionId", reportesController.getMensajes);
router.post("/transferir", reportesController.transferir);
router.post("/supervisor-mensaje", reportesController.supervisorMensaje);
router.get("/bot-config", reportesController.getBotConfig);
router.put("/bot-config", reportesController.saveBotConfig);

module.exports = router;
