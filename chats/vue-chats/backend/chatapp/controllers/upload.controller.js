const { uploadFileFields } = require("../middleware/chatUpload.middleware");
const { uploadChatMedia } = require("../services/supabaseStorage.service");

exports.uploadMiddleware = uploadFileFields;

exports.uploadFile = async (req, res) => {
  try {
    const file = req.files?.file?.[0] || req.files?.audio?.[0];
    if (!file) {
      return res.status(400).json({ ok: false, error: "No se recibió archivo" });
    }

    const convId = String(req.body.convId || "").trim() || "general";
    const { archivo_url, storagePath } = await uploadChatMedia(file, { convId });

    return res.json({
      ok: true,
      archivo_url,
      url: archivo_url,
      storagePath,
      provider: "supabase",
    });
  } catch (error) {
    console.error("Error upload_file Supabase:", error.message);
    return res.status(500).json({
      ok: false,
      error: error.message || "No se pudo subir el archivo",
    });
  }
};
