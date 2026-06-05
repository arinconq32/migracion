import type { AuthUser } from "./auth";

const AUTH_SECRET =
  process.env.AUTH_SESSION_SECRET ||
  process.env.JWT_SECRET ||
  "omnicanalidad-dev-secret";

type SessionPayload = AuthUser & { exp: number };

function base64UrlDecode(data: string): string {
  const padded = data.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4;
  const base64 = pad ? padded + "=".repeat(4 - pad) : padded;
  return atob(base64);
}

function timingSafeEqualStrings(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

async function computeHmacBase64Url(secret: string, data: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(data),
  );
  const bytes = new Uint8Array(signature);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export async function verifyAuthToken(token: string): Promise<AuthUser | null> {
  const raw = String(token || "").trim();
  if (!raw.includes(".")) return null;

  const [data, sig] = raw.split(".");
  if (!data || !sig) return null;

  try {
    const expected = await computeHmacBase64Url(AUTH_SECRET, data);
    if (!timingSafeEqualStrings(sig, expected)) return null;

    const payload = JSON.parse(base64UrlDecode(data)) as SessionPayload;
    if (!payload?.exp || Number(payload.exp) < Date.now()) return null;

    return {
      id: String(payload.id || payload.agentId || ""),
      agentId: String(payload.agentId || payload.id || ""),
      usuario: payload.usuario,
      nombre: payload.nombre,
      correo: payload.correo ?? null,
      exten: payload.exten ?? null,
      perfil: payload.perfil ?? null,
      role: payload.role,
    };
  } catch {
    return null;
  }
}
