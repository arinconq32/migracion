/**
 * Prueba rápida de subida a Supabase Storage.
 * node scripts/test-supabase-upload.js
 */
require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const { getSupabaseConfig } = require("../chatapp/config/supabase");
const { uploadChatMedia } = require("../chatapp/services/supabaseStorage.service");

async function main() {
  const cfg = getSupabaseConfig();
  console.log("Supabase URL:", cfg.url);
  console.log("Bucket:", cfg.bucket);
  console.log("Configurado:", cfg.configured);

  const fakeFile = {
    buffer: Buffer.from("test-upload-chat"),
    mimetype: "text/plain",
    fieldname: "file",
    originalname: "prueba.txt",
  };

  const result = await uploadChatMedia(fakeFile, { convId: "test-conv" });
  console.log("OK:", result);
}

main().catch((err) => {
  console.error("FALLÓ:", err.message);
  process.exit(1);
});
