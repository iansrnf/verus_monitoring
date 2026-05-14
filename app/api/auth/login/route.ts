import { NextResponse } from "next/server";
import { getAdminPassword, getAdminUsername } from "@/lib/admin-config";
import { adminSessionMaxAge, createAdminSessionToken } from "@/lib/admin-session";

const AUTH_COOKIE = "verus_admin_auth";

type LoginRequest = {
  username?: unknown;
  password?: unknown;
};

export async function POST(request: Request) {
  const body = (await request.json()) as LoginRequest;
  const expectedUsername = getAdminUsername();
  const expectedPassword = getAdminPassword();
  const username = typeof body.username === "string" ? body.username.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const isPasswordLogin = Boolean(expectedUsername && expectedPassword && username === expectedUsername && password === expectedPassword);

  if (!isPasswordLogin) {
    return NextResponse.json({ error: "Invalid administrator credentials." }, { status: 401 });
  }

  const sessionToken = await createAdminSessionToken(username);
  const response = NextResponse.json({ ok: true });

  response.cookies.set({
    name: AUTH_COOKIE,
    value: sessionToken,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: adminSessionMaxAge,
  });

  return response;
}
