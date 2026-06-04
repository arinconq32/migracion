const multer = require("multer");

const memoryStorage = multer.memoryStorage();

const chatUpload = multer({
  storage: memoryStorage,
  limits: { fileSize: 25 * 1024 * 1024 },
});

const uploadFileFields = chatUpload.fields([
  { name: "file", maxCount: 1 },
  { name: "audio", maxCount: 1 },
]);

const uploadAudioSingle = chatUpload.single("audio");

module.exports = {
  uploadFileFields,
  uploadAudioSingle,
};
