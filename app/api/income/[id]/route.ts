import { NextResponse } from "next/server";
import { recordInvestmentAuditLog } from "@/lib/investment-audit";
import { getIncomeInvestmentColumn } from "@/lib/investments-schema";
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
    const incomeInvestmentColumn = await getIncomeInvestmentColumn(postgresPool);
    const { rows: beforeRows } = await postgresPool.query(
      `
        select id, ${incomeInvestmentColumn} as inv_id, amount, description, created_at::text as created_at
        from income
        where id = $1
      `,
      [id],
    );
    const { rows, rowCount } = await postgresPool.query(
      `
        update income
        set amount = $1, description = $2
        where id = $3
        returning id, ${incomeInvestmentColumn} as inv_id, amount, description, created_at::text as created_at
      `,
      [amount, description, id],
    );

    if (rowCount === 0) {
      return NextResponse.json({ error: "Income not found." }, { status: 404 });
    }

    const income = rows[0];

    await recordInvestmentAuditLog(postgresPool, {
      action: "updated",
      entityType: "income",
      entityId: income.id,
      summary: `Updated income record #${income.id}.`,
      before: beforeRows[0] ?? null,
      after: income,
    });

    return NextResponse.json({ income });
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
    const incomeInvestmentColumn = await getIncomeInvestmentColumn(postgresPool);
    const { rows: beforeRows } = await postgresPool.query(
      `
        select id, ${incomeInvestmentColumn} as inv_id, amount, description, created_at::text as created_at
        from income
        where id = $1
      `,
      [id],
    );
    const result = await postgresPool.query("delete from income where id = $1", [id]);

    if (result.rowCount === 0) {
      return NextResponse.json({ error: "Income not found." }, { status: 404 });
    }

    await recordInvestmentAuditLog(postgresPool, {
      action: "deleted",
      entityType: "income",
      entityId: id,
      summary: `Deleted income record #${id}.`,
      before: beforeRows[0] ?? null,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete income.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
