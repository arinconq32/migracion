const express = require("express");
const uploadController = require("../controllers/upload.controller");

const router = express.Router();

router.post(
  "/upload_file",
  uploadController.uploadMiddleware,
  uploadController.uploadFile,
);
router.post(
  "/upload_chat_audio",
  uploadController.uploadMiddleware,
  uploadController.uploadFile,
);

module.exports = router;
