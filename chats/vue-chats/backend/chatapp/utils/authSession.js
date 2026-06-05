const crypto = require("crypto");

const DEFAULT_TTL_MS = 12 * 60 * 60 * 1000;

function getSecret() {
  return (
    process.env.AUTH_SESSION_SECRET ||
    process.env.JWT_SECRET ||
    "omnicanalidad-dev-secret"
  );
}

function signSession(payload, ttlMs = DEFAULT_TTL_MS) {
  const body = {
    ...payload,
    exp: Date.now() + ttlMs,
  };
  const data = Buffer.from(JSON.stringify(body)).toString("base64url");
  const sig = crypto
    .createHmac("sha256", getSecret())
    .update(data)
    .digest("base64url");
  return `${data}.${sig}`;
}

function verifySession(token) {
  const raw = String(token || "").trim();
  if (!raw.includes(".")) return null;

  const [data, sig] = raw.split(".");
  if (!data || !sig) return null;

  const expected = crypto
    .createHmac("sha256", getSecret())
    .update(data)
    .digest("base64url");

  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expected);
  if (
    sigBuf.length !== expectedBuf.length ||
    !crypto.timingSafeEqual(sigBuf, expectedBuf)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(data, "base64url").toString("utf8"));
    if (!payload?.exp || Number(payload.exp) < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function hashPasswordMd5(plain) {
  return crypto.createHash("md5").update(String(plain || "")).digest("hex");
}

function resolveRoleFromUser(user = {}) {
  const perfil = String(user.perfil || "").trim().toLowerCase();
  const usuario = String(user.usuario || "").trim().toLowerCase();
  const nombre = String(user.nombre || "").trim().toLowerCase();

  if (
    usuario === "admin" ||
    perfil.includes("admin") ||
    perfil.includes("ingeniero") ||
    perfil.includes("supervisor") ||
    nombre.includes("administrador")
  ) {
    return "administrador";
  }

  return "asesor";
}

module.exports = {
  signSession,
  verifySession,
  hashPasswordMd5,
  resolveRoleFromUser,
};
