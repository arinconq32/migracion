const mongoose = require("mongoose");

const MotivoCierreSchema = new mongoose.Schema(
  {
    id: { type: Number, required: true, unique: true },
    descripcion: { type: String, required: true },
    activo: { type: Boolean, default: true },
  },
  {
    collection: "motivos_cierre",
  },
);

module.exports = mongoose.model("MotivoCierre", MotivoCierreSchema);
