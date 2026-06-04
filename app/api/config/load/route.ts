import { NextResponse } from "next/server";
import { miningConfigs } from "@/lib/configs";
import { postgresPool } from "@/lib/postgres";

type LoadConfigRequest = {
  configIndex?: unknown;
};

export async function POST(request: Request) {
  if (!postgresPool) {
    return NextResponse.json(
      { error: "Missing DATABASE_URL on the server." },
      { status: 500 },
    );
  }

  const body = (await request.json()) as LoadConfigRequest;
  const configIndex = Number(body.configIndex);
  const selectedConfig = miningConfigs[configIndex];

  if (!Number.isInteger(configIndex) || !selectedConfig) {
    return NextResponse.json({ error: "Invalid config selection." }, { status: 400 });
  }

  try {
    await postgresPool.query("alter table my_config add column if not exists threads integer not null default 6");

    const existingConfig = await postgresPool.query<{ id: number }>(
      `
        select id
        from my_config
        order by created_at asc nulls last, id asc
        limit 1
      `,
    );

    const updatedAt = new Date().toISOString();

    if (existingConfig.rows[0]?.id) {
      await postgresPool.query(
        `
          update my_config
          set url = $1, port = $2, wallet = $3, password = $4, threads = $5, created_at = $6
          where id = $7
        `,
        [
          selectedConfig.url,
          selectedConfig.port,
          selectedConfig.wallet,
          selectedConfig.password,
          selectedConfig.threads,
          updatedAt,
          existingConfig.rows[0].id,
        ],
      );
    } else {
      await postgresPool.query(
        `
          insert into my_config (url, port, wallet, password, threads, created_at)
          values ($1, $2, $3, $4, $5, $6)
        `,
        [selectedConfig.url, selectedConfig.port, selectedConfig.wallet, selectedConfig.password, selectedConfig.threads, updatedAt],
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save config.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ config: selectedConfig.label });
}
