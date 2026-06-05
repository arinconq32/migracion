const authService = require("../services/auth.service");

async function login(req, res) {
  try {
    const usuario = req.body?.usuario || req.body?.username || req.body?.email;
    const password = req.body?.password || req.body?.clave;

    const result = await authService.login(usuario, password);
    if (!result.ok) {
      return res.status(401).json(result);
    }

    return res.json({
      ok: true,
      success: true,
      user: result.user,
      token: result.token,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message || "Error al iniciar sesión",
    });
  }
}

async function me(req, res) {
  try {
    const header = String(req.headers.authorization || "");
    const token = header.startsWith("Bearer ")
      ? header.slice(7)
      : req.body?.token || req.query?.token;

    const session = authService.getSessionFromToken(token);
    if (!session) {
      return res.status(401).json({ ok: false, error: "Sesión inválida" });
    }

    return res.json({ ok: true, user: session });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message || "Error al validar sesión",
    });
  }
}

module.exports = { login, me };
