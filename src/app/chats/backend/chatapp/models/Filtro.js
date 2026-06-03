const mongoose = require("mongoose");

const FiltroSchema = new mongoose.Schema(
  {
    nombre: { type: String, required: true, unique: true },
    tipo: { type: String, enum: ["etiqueta", "marca"], required: true },
    activo: { type: Boolean, default: true },
  },
  {
    collection: "filtros",
  },
);

module.exports = mongoose.model("Filtro", FiltroSchema);
