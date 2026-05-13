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

export async function POST(request: Request, context: RouteContext) {
  if (!postgresPool) {
    return NextResponse.json({ error: "Missing DATABASE_URL on the server." }, { status: 500 });
  }

  const { id: rawId } = await context.params;
  const investmentId = parseId(rawId);

  if (investmentId === null) {
    return NextResponse.json({ error: "Invalid investment id." }, { status: 400 });
  }

  const body = (await request.json()) as IncomeRequest;
  const amount = parseMoney(body.amount);
  const description = typeof body.description === "string" ? body.description.trim() : "";

  if (amount === null || amount <= 0) {
    return NextResponse.json({ error: "Income amount must be greater than zero." }, { status: 400 });
  }

  try {
    const existingInvestment = await postgresPool.query("select id from investments where id = $1", [investmentId]);

    if (existingInvestment.rowCount === 0) {
      return NextResponse.json({ error: "Investment not found." }, { status: 404 });
    }

    const { rows } = await postgresPool.query(
      `
        insert into income (inv_id, amount, description, created_at)
        values ($1, $2, $3, now())
        returning id, inv_id, amount, description, created_at::text as created_at
      `,
      [investmentId, amount, description],
    );

    return NextResponse.json({ income: rows[0] }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create income.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
