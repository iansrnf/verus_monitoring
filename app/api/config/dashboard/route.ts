import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET() {
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

  return NextResponse.json({ config: data ?? null });
}
