import { NextResponse } from "next/server";
import { isAuthorizedConfigRequest } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

type DeviceStatusRequest = {
  name?: unknown;
  status?: unknown;
  hash?: unknown;
  config?: unknown;
  shares?: unknown;
  cpu?: unknown;
  temp?: unknown;
};

function stringifyMetric(value: unknown) {
  if (typeof value === "string") {
    return value.trim();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return "";
}

export async function POST(request: Request) {
  if (!isAuthorizedConfigRequest(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: "Missing SUPABASE_SERVICE_ROLE_KEY on the server." },
      { status: 500 },
    );
  }

  const body = (await request.json()) as DeviceStatusRequest;
  const name = typeof body.name === "string" ? body.name.trim() : "";

  if (!name) {
    return NextResponse.json({ error: "Device name is required." }, { status: 400 });
  }

  const payload = {
    name,
    status: Boolean(body.status),
    hash: stringifyMetric(body.hash),
    config: typeof body.config === "string" ? body.config : "",
    shares: stringifyMetric(body.shares),
    cpu: typeof body.cpu === "number" && Number.isFinite(body.cpu) ? Math.round(body.cpu) : 0,
    temp: stringifyMetric(body.temp),
    created_at: new Date().toISOString(),
  };

  const { data: existingDevice, error: findError } = await supabaseAdmin
    .from("device")
    .select("id")
    .eq("name", name)
    .limit(1)
    .maybeSingle();

  if (findError) {
    return NextResponse.json({ error: findError.message }, { status: 500 });
  }

  const saveResult = existingDevice?.id
    ? await supabaseAdmin.from("device").update(payload).eq("id", existingDevice.id)
    : await supabaseAdmin.from("device").insert(payload);

  if (saveResult.error) {
    return NextResponse.json({ error: saveResult.error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
