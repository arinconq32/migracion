// ...existing code...
const express = require("express");

const chatController = require("../controllers/chat.controller");
const authMiddleware = require("../middlewares/auth.middleware");
const { validateSendMessage } = require("../validators/chat.validator");

const router = express.Router();

// Endpoint para motivos de cierre
router.get("/motivos-cierre", chatController.getMotivosCierre);
// Endpoint para etiquetas
router.get("/etiquetas", chatController.getEtiquetas);
// Endpoint para filtros
router.get("/filtros", chatController.getFiltros);
// Endpoint para tipificaciones
router.get("/tipificaciones", chatController.getTipificaciones);

router.get("/health", chatController.health);
router.post("/webhook", chatController.webhook);
router.post("/enviar-mensaje", chatController.sendOutboundMessage);
router.get("/messages", authMiddleware, chatController.getMessages);
router.post(
  "/messages",
  authMiddleware,
  validateSendMessage,
  chatController.sendMessage,
);

module.exports = router;
