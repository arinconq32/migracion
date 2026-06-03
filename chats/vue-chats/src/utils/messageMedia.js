const MEDIA_TIPO_PATTERN =
  /^(imagen|image|photo|audio|voice|video|documento|document|file|archivo|sticker)$/i;

const MEDIA_EXT_PATTERN =
  /\.(png|jpe?g|gif|webp|bmp|svg|mp3|ogg|wav|aac|m4a|opus|webm|mp4|mov|avi|mkv|pdf|docx?|xlsx?|pptx?|txt|csv)$/i;

const UPLOAD_PREFIX_PATTERN = /^(audio|file|image|video)_[\w.-]+$/i;

export function isMediaFilename(value) {
  const name = String(value || "").trim();
  if (!name || name.includes("://") || name.includes("\n")) return false;
  if (MEDIA_EXT_PATTERN.test(name)) return true;
  if (UPLOAD_PREFIX_PATTERN.test(name)) return true;
  return false;
}

export function buildMediaStoragePath(filename, tipo = "") {
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

export function extractMessageMediaUrl(message = {}) {
  const candidates = [
    message.archivoUrl,
    message.archivo_url,
    message.url,
    message.mediaUrl,
    message.media_url,
    message.fileUrl,
    message.file_url,
    message.msg?.archivo_url,
    message.msg?.archivoUrl,
    message.msg?.url,
    message.contenido?.media_url,
    message.contenido?.url,
    message.datos_adicionales?.url,
    message.payload?.url,
    message.media?.url,
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

export function isMediaMessageTipo(tipo) {
  const value = String(tipo || "").trim().toLowerCase();
  if (!value || value === "texto" || value === "text") return false;
  return (
    MEDIA_TIPO_PATTERN.test(value) ||
    value.includes("image") ||
    value.includes("imagen") ||
    value.includes("audio") ||
    value.includes("video") ||
    value.includes("document") ||
    value.includes("voice")
  );
}

export function inferMessageMediaType(message = {}, url = "") {
  const tipo = String(message?.tipo || "").trim().toLowerCase();
  const mediaUrl = url || extractMessageMediaUrl(message);

  if (tipo.includes("image") || tipo.includes("imagen") || tipo === "photo") {
    return "imagen";
  }
  if (tipo.includes("video")) return "video";
  if (tipo.includes("audio") || tipo.includes("voice")) return "audio";
  if (
    tipo.includes("doc") ||
    tipo.includes("file") ||
    tipo.includes("pdf") ||
    tipo.includes("archivo")
  ) {
    return "documento";
  }

  if (!mediaUrl) return null;

  const ext = mediaUrl.split("?")[0].split(".").pop()?.toLowerCase() || "";
  if (["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg"].includes(ext)) {
    return "imagen";
  }
  if (["mp4", "webm", "mov", "avi", "mkv"].includes(ext)) return "video";
  if (["mp3", "ogg", "wav", "aac", "m4a", "opus"].includes(ext)) {
    return "audio";
  }
  return "documento";
}

export function getMessageRenderableMedia(message = {}) {
  const url = extractMessageMediaUrl(message);
  const type = inferMessageMediaType(message, url);
  if (!url || !type) return { url: "", type: null };
  return { url, type };
}

export function shouldHideMediaCaption(message = {}, mediaType = null) {
  const text = String(
    message.text || message.mensaje || message.texto || "",
  ).trim();
  if (!text) return true;
  if (/^nota de voz$/i.test(text)) return true;
  if (/^archivo\s*:/i.test(text)) return true;

  if (mediaType && mediaType !== "documento") {
    if (
      /\.(png|jpe?g|gif|webp|bmp|svg|mp3|ogg|webm|wav|mp4|mov|pdf|docx?|xlsx?)$/i.test(
        text,
      )
    ) {
      return true;
    }
  }

  const filename = String(message.filename || "").trim();
  if (filename && text === filename) return true;

  return false;
}
