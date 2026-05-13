import { NextResponse } from "next/server";
import { getIncomeInvestmentColumn } from "@/lib/investments-schema";
import { postgresPool } from "@/lib/postgres";

type InvestmentRequest = {
  name?: unknown;
  cost?: unknown;
  description?: unknown;
};

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

export async function GET() {
  if (!postgresPool) {
    return NextResponse.json({ error: "Missing DATABASE_URL on the server." }, { status: 500 });
  }

  try {
    const incomeInvestmentColumn = await getIncomeInvestmentColumn(postgresPool);
    const { rows: investmentRows } = await postgresPool.query(`
      select
        i.id,
        i.name,
        i.cost,
        i.description,
        i.created_at::text as created_at,
        coalesce(sum(inc.amount), 0)::double precision as total_income,
        count(inc.id)::integer as income_count
      from investments i
      left join income inc on inc.${incomeInvestmentColumn} = i.id
      group by i.id, i.name, i.cost, i.description, i.created_at
      order by i.created_at desc nulls last, i.id desc
    `);

    const { rows: incomeRows } = await postgresPool.query(`
      select
        id,
        ${incomeInvestmentColumn} as inv_id,
        amount,
        description,
        created_at::text as created_at
      from income
      order by id desc
    `);

    return NextResponse.json({
      investments: investmentRows.map((investment) => ({
        ...investment,
        cost: Number(investment.cost ?? 0),
        total_income: Number(investment.total_income ?? 0),
        income_count: Number(investment.income_count ?? 0),
        incomes: incomeRows
          .filter((income) => Number(income.inv_id) === Number(investment.id))
          .map((income) => ({
            ...income,
            amount: Number(income.amount ?? 0),
          })),
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load investments.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!postgresPool) {
    return NextResponse.json({ error: "Missing DATABASE_URL on the server." }, { status: 500 });
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
    const { rows } = await postgresPool.query(
      `
        insert into investments (name, cost, description, created_at)
        values ($1, $2, $3, now())
        returning id, name, cost, description, created_at::text as created_at
      `,
      [name, cost, description],
    );

    return NextResponse.json({ investment: rows[0] }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create investment.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
