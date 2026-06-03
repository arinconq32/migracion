const { Schema, model } = require("mongoose");

const MessageSchema = new Schema(
  {
    id: Schema.Types.Mixed,
    legacyId: Schema.Types.Mixed,
    conversacionId: Schema.Types.Mixed,
    conversacion_id: Schema.Types.Mixed,
    emisor: String,
    emisor_exten: String,
    receptor_exten: String,
    autor: String,
    mensaje: String,
    text: String,
    texto: String,
    tipo: String,
    ts: { type: Date, default: Date.now },
    fecha: Date,
    timestamp: Number,
    archivoUrl: String,
    archivo_url: String,
    origen: String,
    leido_en: Date,
  },
  { strict: false },
);

const Message = model("Message", MessageSchema, "mensajes");

module.exports = Message;
