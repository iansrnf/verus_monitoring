import { NextResponse } from "next/server";

const AUTH_COOKIE = "verus_admin_auth";

function isSecureRequest(request: Request) {
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();

  if (forwardedProto) {
    return forwardedProto === "https";
  }

  return new URL(request.url).protocol === "https:";
}

export async function POST(request: Request) {
  const response = NextResponse.json({ ok: true });

  response.cookies.set({
    name: AUTH_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureRequest(request),
    path: "/",
    maxAge: 0,
  });

  return response;
}
