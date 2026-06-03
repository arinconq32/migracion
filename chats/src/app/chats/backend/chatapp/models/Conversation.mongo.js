const { Schema, model } = require("mongoose");

const ConversationSchema = new Schema({
  id: Schema.Types.Mixed,
  legacyId: Schema.Types.Mixed,
  sala_interna_key: String,
  agente_origen_exten: String,
  agente_destino_exten: String,
  agenteId: Schema.Types.Mixed, // acepta string o número
  agente_id: Schema.Types.Mixed, // acepta string o número
  estado: String,
  inicio: Date,
  fin: Date,
  ultima_actividad: Date,
});

const Conversation = model(
  "Conversation",
  ConversationSchema,
  "conversaciones",
);

module.exports = Conversation;
