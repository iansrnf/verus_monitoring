import { NextResponse } from "next/server";
import { recordInvestmentAuditLog } from "@/lib/investment-audit";
import { getIncomeInvestmentColumn } from "@/lib/investments-schema";
import { postgresPool } from "@/lib/postgres";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type InvestmentRequest = {
  name?: unknown;
  cost?: unknown;
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
    return NextResponse.json({ error: "Invalid investment id." }, { status: 400 });
  }

  const body = (await request.json()) as InvestmentRequest;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const cost = parseMoney(body.cost);

  if (!name) {
    return NextResponse.json({ error: "Investment name is required." }, { status: 400 });
  }

  if (cost === null || cost < 0) {
    return NextResponse.json({ error: "Investment cost must be a valid positive amount." }, { status: 400 });
  }

  try {
    const { rows: beforeRows } = await postgresPool.query(
      "select id, name, cost, description, created_at::text as created_at from investments where id = $1",
      [id],
    );
    const { rows, rowCount } = await postgresPool.query(
      `
        update investments
        set name = $1, cost = $2, description = $3
        where id = $4
        returning id, name, cost, description, created_at::text as created_at
      `,
      [name, cost, description, id],
    );

    if (rowCount === 0) {
      return NextResponse.json({ error: "Investment not found." }, { status: 404 });
    }

    const investment = rows[0];

    await recordInvestmentAuditLog(postgresPool, {
      action: "updated",
      entityType: "investment",
      entityId: investment.id,
      summary: `Updated investment "${investment.name}".`,
      before: beforeRows[0] ?? null,
      after: investment,
    });

    return NextResponse.json({ investment });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update investment.";

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
    return NextResponse.json({ error: "Invalid investment id." }, { status: 400 });
  }

  try {
    const incomeInvestmentColumn = await getIncomeInvestmentColumn(postgresPool);
    const { rows: investmentRows } = await postgresPool.query(
      "select id, name, cost, description, created_at::text as created_at from investments where id = $1",
      [id],
    );
    const { rows: incomeRows } = await postgresPool.query(
      `
        select id, ${incomeInvestmentColumn} as inv_id, amount, description, created_at::text as created_at
        from income
        where ${incomeInvestmentColumn} = $1
      `,
      [id],
    );

    await postgresPool.query(`delete from income where ${incomeInvestmentColumn} = $1`, [id]);
    const result = await postgresPool.query("delete from investments where id = $1", [id]);

    if (result.rowCount === 0) {
      return NextResponse.json({ error: "Investment not found." }, { status: 404 });
    }

    const investment = investmentRows[0];

    await recordInvestmentAuditLog(postgresPool, {
      action: "deleted",
      entityType: "investment",
      entityId: id,
      summary: `Deleted investment "${investment?.name ?? `#${id}`}" and ${incomeRows.length} income record${incomeRows.length === 1 ? "" : "s"}.`,
      before: {
        investment: investment ?? null,
        incomes: incomeRows,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete investment.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
