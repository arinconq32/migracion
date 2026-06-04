const path = require("path");
const { getSupabaseClient, getSupabaseConfig } = require("../config/supabase");

let bucketReady = false;
let bucketInitPromise = null;

async function ensureStorageBucket() {
  if (bucketReady) return;
  if (bucketInitPromise) return bucketInitPromise;

  bucketInitPromise = (async () => {
    const supabase = getSupabaseClient();
    const { bucket } = getSupabaseConfig();
    if (!supabase) return;

    const { data: buckets, error: listError } = await supabase.storage.listBuckets();
    if (listError) {
      throw new Error(`No se pudo listar buckets: ${listError.message}`);
    }

    const exists = (buckets || []).some((b) => b.name === bucket);
    if (!exists) {
      const { error: createError } = await supabase.storage.createBucket(bucket, {
        public: true,
        fileSizeLimit: 25 * 1024 * 1024,
      });
      if (createError) {
        throw new Error(
          `Crea el bucket público "${bucket}" en Supabase Dashboard o revisa permisos: ${createError.message}`,
        );
      }
      console.log(`[Supabase] Bucket creado: ${bucket}`);
    }

    bucketReady = true;
  })();

  return bucketInitPromise;
}

function inferMediaFolder(mimetype = "", fieldname = "") {
  const mime = String(mimetype || "").toLowerCase();
  const field = String(fieldname || "").toLowerCase();

  if (field === "audio" || mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("image/")) return "images";
  if (mime.startsWith("video/")) return "videos";
  return "documents";
}

function sanitizeSegment(value, fallback = "unknown") {
  const cleaned = String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 80);
  return cleaned || fallback;
}

function buildObjectPath({ convId, mimetype, fieldname, originalName }) {
  const folder = inferMediaFolder(mimetype, fieldname);
  const ext = path.extname(originalName || "") || "";
  const prefix = folder === "audio" ? "audio" : "file";
  const safeConv = sanitizeSegment(convId, "general");
  const filename = `${prefix}_${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
  return `chats/${safeConv}/${folder}/${filename}`;
}

function getPublicObjectUrl(storagePath) {
  const { url, bucket } = getSupabaseConfig();
  const objectPath = String(storagePath || "")
    .replace(/^\/+/, "")
    .split("?")[0];
  return `${url}/storage/v1/object/public/${bucket}/${objectPath}`;
}

async function uploadChatMedia(file, options = {}) {
  const supabase = getSupabaseClient();
  const { bucket, configured } = getSupabaseConfig();

  if (!configured || !supabase) {
    throw new Error(
      "Supabase no configurado. Define SUPABASE_URL (o SUPABASE_PROJECT_REF) y SUPABASE_KEY en .env",
    );
  }

  if (!file?.buffer?.length) {
    throw new Error("No se recibió contenido del archivo");
  }

  await ensureStorageBucket();

  const objectPath = buildObjectPath({
    convId: options.convId,
    mimetype: file.mimetype,
    fieldname: file.fieldname,
    originalName: file.originalname,
  });

  const { error } = await supabase.storage.from(bucket).upload(objectPath, file.buffer, {
    contentType: file.mimetype || "application/octet-stream",
    upsert: false,
    cacheControl: "3600",
  });

  if (error) {
    throw new Error(`Error subiendo a Supabase Storage: ${error.message}`);
  }

  const publicUrl = getPublicObjectUrl(objectPath);

  return {
    archivo_url: publicUrl,
    storagePath: objectPath,
    bucket,
  };
}

module.exports = {
  uploadChatMedia,
  ensureStorageBucket,
  getPublicObjectUrl,
  buildObjectPath,
  inferMediaFolder,
};
