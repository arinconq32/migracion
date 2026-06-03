const UsuarioModel = require("../models/UsuarioModel.mysql");

async function getUsuarios() {
  return await UsuarioModel.getAllUsuarios();
}

module.exports = { getUsuarios };
