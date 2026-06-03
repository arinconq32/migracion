const usuarioService = require("../services/usuario.service");

async function getUsuarios(req, res) {
  try {
    const usuarios = await usuarioService.getUsuarios();
    // Normaliza los campos a camelCase
    const normalized = usuarios.map((u) => ({
      id: u.id || u._id,
      nombre: u.nombre || u.name,
      estado: u.estado || u.status,
      fechaActualizacion: u.fechaActualizacion || u.fecha_actualizacion,
      usuario: u.usuario,
      exten: u.exten,
      // Agrega otros campos relevantes aquí
    }));
    res.json(normalized);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

module.exports = { getUsuarios };
