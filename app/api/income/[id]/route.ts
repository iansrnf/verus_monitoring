import { NextResponse } from "next/server";
import { postgresPool } from "@/lib/postgres";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type IncomeRequest = {
  amount?: unknown;
  description?: unknown;
};

function parseId(value: string) {
  const id = Number(value);

  return Number.isInteger(id) && id > 0 ? id : null;
}

function parseMoney(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== "string") {
    return null;
  }

  const numericValue = Number(value.replace(/[$,]/g, "").trim());

  return Number.isFinite(numericValue) ? numericValue : null;
}

export async function PATCH(request: Request, context: RouteContext) {
  if (!postgresPool) {
    return NextResponse.json({ error: "Missing DATABASE_URL on the server." }, { status: 500 });
  }

  const { id: rawId } = await context.params;
  const id = parseId(rawId);

  if (id === null) {
    return NextResponse.json({ error: "Invalid income id." }, { status: 400 });
  }

  const body = (await request.json()) as IncomeRequest;
  const amount = parseMoney(body.amount);
  const description = typeof body.description === "string" ? body.description.trim() : "";

  if (amount === null || amount <= 0) {
    return NextResponse.json({ error: "Income amount must be greater than zero." }, { status: 400 });
  }

  try {
    const { rows, rowCount } = await postgresPool.query(
      `
        update income
        set amount = $1, description = $2
        where id = $3
        returning id, amount, description, created_at::text as created_at
      `,
      [amount, description, id],
    );

    if (rowCount === 0) {
      return NextResponse.json({ error: "Income not found." }, { status: 404 });
    }

    return NextResponse.json({ income: rows[0] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update income.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
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
