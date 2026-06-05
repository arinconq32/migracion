const usuarioService = require("./usuario.service");
const {
  hashPasswordMd5,
  resolveRoleFromUser,
  signSession,
  verifySession,
} = require("../utils/authSession");

async function login(usuario, password) {
  const loginUser = String(usuario || "").trim();
  const plainPassword = String(password || "");

  if (!loginUser || !plainPassword) {
    return { ok: false, error: "Usuario y contraseña son requeridos" };
  }

  const row = await usuarioService.findByUsuario(loginUser);
  if (!row) {
    return { ok: false, error: "Credenciales inválidas" };
  }

  const storedHash = String(row.password || "").trim().toLowerCase();
  const inputHash = hashPasswordMd5(plainPassword);

  if (!storedHash || storedHash !== inputHash) {
    return { ok: false, error: "Credenciales inválidas" };
  }

  const role = resolveRoleFromUser(row);
  const agentId = String(row.id || row._id || "").trim();
  const user = {
    id: agentId,
    agentId,
    usuario: row.usuario,
    nombre: row.nombre || row.usuario,
    correo: row.correo || null,
    exten: row.exten || null,
    perfil: row.perfil || null,
    role,
  };

  const token = signSession({
    id: user.id,
    agentId: user.agentId,
    usuario: user.usuario,
    nombre: user.nombre,
    role: user.role,
    exten: user.exten,
    perfil: user.perfil,
  });

  await usuarioService.touchUltimoLogin(user.id, token);

  return { ok: true, user, token };
}

function getSessionFromToken(token) {
  const session = verifySession(token);
  if (!session) return null;
  return {
    id: String(session.id || session.agentId || ""),
    agentId: String(session.agentId || session.id || ""),
    usuario: session.usuario,
    nombre: session.nombre,
    role: session.role,
    exten: session.exten || null,
    perfil: session.perfil || null,
  };
}

module.exports = {
  login,
  getSessionFromToken,
};
