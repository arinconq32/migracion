const mongoose = require("mongoose");

const TipificacionSchema = new mongoose.Schema(
  {
    id: Number,
    id_conversacion: String,
    id_tipificacion: Number,
    tipificacion: String,
    id_observacion: Number,
    observacion: String,
  },
  {
    collection: "tipificaciones",
  },
);

module.exports = mongoose.model("Tipificacion", TipificacionSchema);
