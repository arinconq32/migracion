const mongoose = require("mongoose");

const EtiquetaSchema = new mongoose.Schema(
  {
    id: Number,
    nombre: String,
    color: String,
  },
  {
    collection: "etiquetas",
  },
);

module.exports = mongoose.model("Etiqueta", EtiquetaSchema);
