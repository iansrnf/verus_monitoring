import { NextResponse } from "next/server";
import { isAuthorizedConfigRequest } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET(request: Request) {
  if (!isAuthorizedConfigRequest(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: "Missing SUPABASE_SERVICE_ROLE_KEY on the server." },
      { status: 500 },
    );
  }

  const { data, error } = await supabaseAdmin
    .from("my_config")
    .select("url, port, wallet, password")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "No config found." }, { status: 404 });
  }

  return NextResponse.json(data);
}
