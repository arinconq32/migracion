const express = require("express");
const router = express.Router();
const conversationController = require("../controllers/conversation.mongo.controller");

router.get("/", conversationController.getConversations);
router.post("/", conversationController.createConversation);
router.get("/:conversacionId/messages", conversationController.getMessages);
router.post("/:conversacionId/messages", conversationController.addMessage);

module.exports = router;
