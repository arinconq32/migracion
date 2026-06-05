import { NextResponse } from "next/server";
import { AUTH_COOKIE_NAME } from "@/lib/auth";

const API_BASE =
  process.env.NEXT_PUBLIC_CHAT_API_URL?.trim() || "http://localhost:3001";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const usuario = body?.usuario || body?.username || body?.email;
  const password = body?.password || body?.clave;

  const upstream = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ usuario, password }),
  });

  const data = await upstream.json().catch(() => ({}));
  if (!upstream.ok || !data?.user || !data?.token) {
    return NextResponse.json(
      { ok: false, error: data?.error || "Credenciales inválidas" },
      { status: upstream.status || 401 },
    );
  }

  const response = NextResponse.json({
    ok: true,
    user: data.user,
  });

  response.cookies.set(AUTH_COOKIE_NAME, data.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });

  return response;
}
