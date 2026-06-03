const { Schema, model } = require("mongoose");

const MessageSchema = new Schema({
  id: Number,
  conversacion_id: Number,
  emisor_exten: String,
  receptor_exten: String,
  mensaje: String,
  tipo: String,
  ts: { type: Date, default: Date.now },
  archivo_url: String,
  leido_en: Date,
});

const Message = model("Message", MessageSchema, "mensajes");

module.exports = Message;
