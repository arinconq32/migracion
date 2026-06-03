const MEDIA_EXT_PATTERN =
  /\.(png|jpe?g|gif|webp|bmp|svg|mp3|ogg|wav|aac|m4a|opus|webm|mp4|mov|avi|mkv|pdf|docx?|xlsx?|pptx?|txt|csv)$/i;

const UPLOAD_PREFIX_PATTERN = /^(audio|file|image|video)_[\w.-]+$/i;

function isMediaFilename(value) {
  const name = String(value || "").trim();
  if (!name || name.includes("://") || name.includes("\n")) return false;
  if (MEDIA_EXT_PATTERN.test(name)) return true;
  if (UPLOAD_PREFIX_PATTERN.test(name)) return true;
  return false;
}

function buildMediaStoragePath(filename, tipo = "") {
  const name = String(filename || "").trim();
  if (!name) return "";
  if (/^https?:\/\//i.test(name)) return name;
  if (name.startsWith("/storage/") || name.startsWith("storage/")) return name;

  const normalized = name.replace(/^\/+/, "");
  if (/^(audio|file|image|video|storage)\//i.test(normalized)) {
    return normalized;
  }

  const tipoNorm = String(tipo || "").toLowerCase();
  if (/^audio_/i.test(normalized)) return `audio/${normalized}`;
  if (
    (tipoNorm.includes("audio") || tipoNorm.includes("voice")) &&
    isMediaFilename(normalized)
  ) {
    return `audio/${normalized}`;
  }
  if (/^file_/i.test(normalized)) return normalized;
  if (isMediaFilename(normalized)) return normalized;
  return "";
}

function extractMessageMediaUrl(message = {}) {
  const candidates = [
    message.archivoUrl,
    message.archivo_url,
    message.url,
    message.mediaUrl,
    message.media_url,
    message.fileUrl,
    message.file_url,
  ];

  for (const candidate of candidates) {
    const value = String(candidate || "").trim();
    if (!value) continue;
    if (value.includes("/") || /^https?:\/\//i.test(value)) {
      return value;
    }
  }

  const filename = String(message.filename || "").trim();
  if (filename && (filename.includes("/") || /^https?:\/\//i.test(filename))) {
    return filename;
  }

  const tipo = String(message.tipo || "").trim();
  const text = String(
    message.text || message.mensaje || message.texto || "",
  ).trim();

  for (const candidate of [filename, text]) {
    const built = buildMediaStoragePath(candidate, tipo);
    if (built) return built;
  }

  if (/^https?:\/\//i.test(text)) return text;
  if (text.startsWith("/storage/") || text.startsWith("storage/")) return text;
  if (/^(audio|file|video|image)\//i.test(text)) return text;

  return "";
}

module.exports = {
  extractMessageMediaUrl,
  buildMediaStoragePath,
  isMediaFilename,
};
