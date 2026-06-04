import { NextResponse } from "next/server";
import { isAuthorizedConfigRequest } from "@/lib/api-auth";
import { postgresPool } from "@/lib/postgres";

export async function GET(request: Request) {
  if (!isAuthorizedConfigRequest(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (!postgresPool) {
    return NextResponse.json(
      { error: "Missing DATABASE_URL on the server." },
      { status: 500 },
    );
  }

  try {
    await postgresPool.query("alter table my_config add column if not exists threads integer not null default 6");

    const { rows } = await postgresPool.query(
      `
        select url, port, wallet, password, threads
        from my_config
        order by created_at asc nulls last, id asc
        limit 1
      `,
    );

    if (!rows[0]) {
      return NextResponse.json({ error: "No config found." }, { status: 404 });
    }

    return NextResponse.json(rows[0]);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load config.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
