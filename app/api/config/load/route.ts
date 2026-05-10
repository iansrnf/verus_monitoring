import { NextResponse } from "next/server";
import { miningConfigs } from "@/lib/configs";
import { supabaseAdmin } from "@/lib/supabase-admin";

type LoadConfigRequest = {
  configIndex?: unknown;
};

export async function POST(request: Request) {
  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: "Missing SUPABASE_SERVICE_ROLE_KEY on the server." },
      { status: 500 },
    );
  }

  const body = (await request.json()) as LoadConfigRequest;
  const configIndex = Number(body.configIndex);
  const selectedConfig = miningConfigs[configIndex];

  if (!Number.isInteger(configIndex) || !selectedConfig) {
    return NextResponse.json({ error: "Invalid config selection." }, { status: 400 });
  }

  const { data: existingConfig, error: findError } = await supabaseAdmin
    .from("my_config")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (findError) {
    return NextResponse.json({ error: findError.message }, { status: 500 });
  }

  const payload = {
    url: selectedConfig.url,
    port: selectedConfig.port,
    wallet: selectedConfig.wallet,
    password: selectedConfig.password,
  };

  const saveResult = existingConfig?.id
    ? await supabaseAdmin.from("my_config").update(payload).eq("id", existingConfig.id)
    : await supabaseAdmin.from("my_config").insert(payload);

  if (saveResult.error) {
    return NextResponse.json({ error: saveResult.error.message }, { status: 500 });
  }

  return NextResponse.json({ config: selectedConfig.label });
}
