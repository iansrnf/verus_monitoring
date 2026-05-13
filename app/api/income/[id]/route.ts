import { NextResponse } from "next/server";
import { postgresPool } from "@/lib/postgres";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function parseId(value: string) {
  const id = Number(value);

  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function DELETE(_request: Request, context: RouteContext) {
  if (!postgresPool) {
    return NextResponse.json({ error: "Missing DATABASE_URL on the server." }, { status: 500 });
  }

  const { id: rawId } = await context.params;
  const id = parseId(rawId);

  if (id === null) {
    return NextResponse.json({ error: "Invalid income id." }, { status: 400 });
  }

  try {
    const result = await postgresPool.query("delete from income where id = $1", [id]);

    if (result.rowCount === 0) {
      return NextResponse.json({ error: "Income not found." }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete income.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
