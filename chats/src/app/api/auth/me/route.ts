import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { AUTH_COOKIE_NAME } from "@/lib/auth";
import { verifyAuthToken } from "@/lib/authSession";

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
  const user = token ? await verifyAuthToken(token) : null;

  if (!user) {
    return NextResponse.json({ ok: false, error: "Sin sesión" }, { status: 401 });
  }

  return NextResponse.json({ ok: true, user });
}
