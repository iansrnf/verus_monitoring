import { NextResponse } from "next/server";
import { postgresPool } from "@/lib/postgres";

export async function GET() {
  if (!postgresPool) {
    return NextResponse.json(
      { error: "Missing DATABASE_URL on the server." },
      { status: 500 },
    );
  }

  try {
    const { rows } = await postgresPool.query(
      `
        select url, port, wallet, password
        from my_config
        order by created_at asc nulls last, id asc
        limit 1
      `,
    );

    return NextResponse.json({ config: rows[0] ?? null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load config.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
