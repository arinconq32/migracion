const UsuarioModel = require("../models/UsuarioModel.mysql");

async function getUsuarios() {
  return await UsuarioModel.getAllUsuarios();
}

async function findByUsuario(usuario) {
  return await UsuarioModel.findByUsuario(usuario);
}

async function touchUltimoLogin(userId, tokenSesion) {
  return await UsuarioModel.touchUltimoLogin(userId, tokenSesion);
}

module.exports = { getUsuarios, findByUsuario, touchUltimoLogin };
