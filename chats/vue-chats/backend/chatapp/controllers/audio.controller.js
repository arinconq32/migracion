const chatUtils = require("../utils/chatUtils");
const { uploadAudioSingle } = require("../middleware/chatUpload.middleware");
const { uploadChatMedia } = require("../services/supabaseStorage.service");

let runtimeService = null;

function setAudioRuntimeService(service) {
  runtimeService = service;
}

const audioUploadMiddleware = uploadAudioSingle;

async function uploadChatAudio(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No se subió ningún archivo de audio.",
      });
    }

    const convId = String(req.body.convId || "").trim();
    const numero = String(req.body.numero || "").trim() || null;
    const tempId = String(req.body.tempId || "").trim() || null;
    const modoInterno =
      String(req.body.mode || "").toLowerCase() === "interno" || !convId;

    if (!modoInterno && !convId) {
      return res.status(400).json({
        success: false,
        message: "convId es requerido para envío de audio a cliente.",
      });
    }

    const chatModel = global.chatModel;
    const io = req.app?.locals?.io;
    if (!modoInterno && !chatModel) {
      return res.status(500).json({
        success: false,
        message: "Modelo de chat no disponible.",
      });
    }

    const { archivo_url: publicUrl } = await uploadChatMedia(req.file, { convId });
    const convIdNumerico = Number.parseInt(convId, 10);

    let messageId = null;
    if (!modoInterno) {
      if (typeof chatModel.bufferMessage === "function") {
        messageId = await chatModel.bufferMessage(
          convId,
          "agente",
          "Nota de voz",
          "audio",
          {
            archivo_url: publicUrl,
            origen: "web",
            timestamp: Date.now(),
            tempId,
          },
        );
      } else {
        messageId = await chatModel.insertMessage(
          convId,
          "agente",
          "Nota de voz",
          "audio",
          {
            archivo_url: publicUrl,
            origen: "web",
            timestamp: Date.now(),
          },
        );
      }
    }

    const msg = {
      id: messageId,
      conversacion_id: Number.isFinite(convIdNumerico) ? convIdNumerico : convId,
      emisor: "agente",
      mensaje: "Nota de voz",
      text: "Nota de voz",
      tipo: "audio",
      archivo_url: publicUrl,
      archivoUrl: publicUrl,
      timestamp: Date.now(),
      origen: "web",
    };

    if (!modoInterno && io) {
      const convRoom = String(convId);
      if (tempId) {
        io.to(convRoom).emit("message_confirmed", {
          convId: Number.isFinite(convIdNumerico) ? convIdNumerico : convId,
          msg,
          tempId,
        });
      } else {
        io.to(convRoom).emit("chat_message", {
          convId: Number.isFinite(convIdNumerico) ? convIdNumerico : convId,
          msg,
        });
      }
    }

    if (!modoInterno && numero && runtimeService) {
      await runtimeService.sendWhatsAppMessage(numero, "Nota de voz", "audio", {
        url: publicUrl,
        mediaUrl: publicUrl,
        archivo_url: publicUrl,
        isVoice: true,
      });
    }

    if (!modoInterno) {
      await chatUtils.broadcast();
    }

    return res.status(200).json({
      success: true,
      ok: true,
      message: "Archivo enviado correctamente.",
      archivo_url: publicUrl,
      filename: req.file.originalname || "audio.webm",
      tipo: "audio",
      provider: "supabase",
    });
  } catch (error) {
    console.error("Error al subir audio:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Error interno al subir audio.",
    });
  }
}

module.exports = {
  setAudioRuntimeService,
  uploadChatAudio,
  audioUploadMiddleware,
};
