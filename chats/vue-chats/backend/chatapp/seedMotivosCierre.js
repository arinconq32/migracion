// Seeder para poblar la colección motivos_cierre en MongoDB
const mongoose = require("mongoose");
const MotivoCierre = require("./models/MotivoCierre");

const motivos = [
  { id: 1, descripcion: "Cliente no responde", activo: true },
  { id: 2, descripcion: "Problema resuelto", activo: true },
  { id: 3, descripcion: "Solicitud fuera de alcance", activo: true },
  { id: 4, descripcion: "Error del sistema", activo: true },
  { id: 5, descripcion: "Otro", activo: true },
];

async function seed() {
  await mongoose.connect(
    process.env.MONGO_URI || "mongodb://localhost:27017/omnicanalidad",
  );
  await MotivoCierre.deleteMany({});
  await MotivoCierre.insertMany(motivos);
  console.log("Motivos de cierre insertados");
  await mongoose.disconnect();
}

seed().catch(console.error);
