const express = require("express");
const uploadController = require("../controllers/upload.controller");
const audioController = require("../controllers/audio.controller");

const router = express.Router();

router.post(
  "/upload_file",
  uploadController.uploadMiddleware,
  uploadController.uploadFile,
);
router.post(
  "/upload_chat_audio",
  audioController.audioUploadMiddleware,
  audioController.uploadChatAudio,
);

module.exports = router;
