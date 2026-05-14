import { NextResponse, type NextRequest } from "next/server";
import { isValidAdminSessionToken } from "@/lib/admin-session";

const APP_BASE_PATH = "/verus-monitoring";
const AUTH_COOKIE = "verus_admin_auth";

function getAppPath(pathname: string) {
  if (pathname === APP_BASE_PATH) {
    return "/";
  }

  if (pathname.startsWith(`${APP_BASE_PATH}/`)) {
    return pathname.slice(APP_BASE_PATH.length);
  }

  return pathname;
}

function isPublicPath(pathname: string) {
  const appPath = getAppPath(pathname);

  return (
    appPath === "/login" ||
    appPath.startsWith("/api/") ||
    appPath === "/icon.svg" ||
    appPath === "/favicon.ico" ||
    appPath.startsWith("/_next/") ||
    /\.[a-z0-9]+$/i.test(appPath)
  );
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const expectedUsername = process.env.ADMIN_USERNAME?.trim();
  const expectedPassword = process.env.ADMIN_PASSWORD?.trim();

  if (!expectedUsername || !expectedPassword) {
    return NextResponse.next();
  }

  const cookieToken = request.cookies.get(AUTH_COOKIE)?.value;

  if (await isValidAdminSessionToken(cookieToken)) {
    return NextResponse.next();
  }

  const loginUrl = new URL(`${APP_BASE_PATH}/login`, request.url);
  loginUrl.searchParams.set("next", pathname);

  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
