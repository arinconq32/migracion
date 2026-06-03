const fs = require("fs");
const path = require("path");
const multer = require("multer");

const STORAGE_DIR = path.resolve(__dirname, "../../storage/chat-files");
const AUDIO_DIR = path.resolve(__dirname, "../../storage/chat-files/audio");

for (const dir of [STORAGE_DIR, AUDIO_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function buildPublicUrl(req, relativePath) {
  const host = req.get("host") || `localhost:${process.env.SOCKET_PORT || 3001}`;
  const protocol = req.protocol === "https" ? "https" : "http";
  return `${protocol}://${host}/storage/chat-files/${relativePath}`;
}

const storage = multer.diskStorage({
  destination: (_req, file, cb) => {
    const isAudio =
      file.fieldname === "audio" ||
      String(file.mimetype || "").startsWith("audio/");
    cb(null, isAudio ? AUDIO_DIR : STORAGE_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "") || "";
    const prefix = file.fieldname === "audio" ? "audio" : "file";
    cb(null, `${prefix}_${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 },
});

exports.uploadMiddleware = upload.fields([
  { name: "file", maxCount: 1 },
  { name: "audio", maxCount: 1 },
]);

exports.uploadFile = (req, res) => {
  const file = req.files?.file?.[0] || req.files?.audio?.[0];
  if (!file) {
    return res.status(400).json({ ok: false, error: "No se recibió archivo" });
  }

  const relativePath = file.path.includes(AUDIO_DIR)
    ? `audio/${path.basename(file.filename)}`
    : path.basename(file.filename);

  return res.json({
    ok: true,
    archivo_url: buildPublicUrl(req, relativePath),
  });
};
