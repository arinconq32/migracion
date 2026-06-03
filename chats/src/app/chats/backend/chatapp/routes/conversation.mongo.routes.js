const express = require("express");
const router = express.Router();
const conversationController = require("../controllers/conversation.mongo.controller");

router.get("/", conversationController.getConversations);
router.get("/historial/cliente", conversationController.getHistorialCliente);
router.get("/resolve/:rawId", conversationController.resolveConversation);
router.post("/", conversationController.createConversation);
router.get("/labels", conversationController.getLabels);
router.post("/labels", conversationController.createLabel);
router.delete("/labels/:labelId", conversationController.deleteLabel);
router.get("/:conversacionId/labels", conversationController.getConversationLabels);
router.put("/:conversacionId/labels", conversationController.setConversationLabels);
router.get("/:conversacionId/multimedia", conversationController.getMultimedia);
router.get("/:conversacionId/messages", conversationController.getMessages);
router.post("/:conversacionId/messages", conversationController.addMessage);

module.exports = router;
