import { NextResponse, type NextRequest } from "next/server";
import { isValidAdminSessionToken } from "@/lib/admin-session";

const AUTH_COOKIE = "verus_admin_auth";

export async function GET(request: NextRequest) {
  return NextResponse.json({
    authenticated: await isValidAdminSessionToken(request.cookies.get(AUTH_COOKIE)?.value),
  });
}
