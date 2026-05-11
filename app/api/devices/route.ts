import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

const STALE_DEVICE_MS = 60_000;

export async function GET() {
  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: "Missing SUPABASE_SERVICE_ROLE_KEY on the server." },
      { status: 500 },
    );
  }

  const staleBefore = new Date(Date.now() - STALE_DEVICE_MS).toISOString();
  const { error: staleStatusError } = await supabaseAdmin
    .from("device")
    .update({ status: false })
    .eq("status", true)
    .lt("created_at", staleBefore);

  if (staleStatusError) {
    return NextResponse.json({ error: staleStatusError.message }, { status: 500 });
  }

  const { data, error } = await supabaseAdmin
    .from("device")
    .select("id, created_at, name, hash, config, shares, cpu, temp, status")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ devices: data ?? [] });
}
