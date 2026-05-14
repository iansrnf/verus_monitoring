import { NextResponse } from "next/server";
import { getIncomeInvestmentColumn } from "@/lib/investments-schema";
import { postgresPool } from "@/lib/postgres";

type ImportMode = "native" | "legacy";

type ImportRequest = {
  mode?: unknown;
  data?: unknown;
};

type NormalizedIncome = {
  amount: number;
  description: string;
  createdAt: Date | null;
};

type NormalizedInvestment = {
  name: string;
  cost: number;
  description: string;
  createdAt: Date | null;
  incomes: NormalizedIncome[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
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

function parseDate(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsedDate = new Date(value as string | number | Date);

  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
}

function normalizeIncome(value: unknown, mode: ImportMode): NormalizedIncome | null {
  if (!isRecord(value)) {
    return null;
  }

  const amount = parseMoney(value.amount);

  if (amount === null || amount <= 0) {
    return null;
  }

  return {
    amount,
    description: parseText(value.description),
    createdAt: parseDate(mode === "legacy" ? value.createdAt : value.created_at),
  };
}

function normalizeInvestment(value: unknown, mode: ImportMode): NormalizedInvestment | null {
  if (!isRecord(value)) {
    return null;
  }

  const name = parseText(mode === "legacy" ? value.title : value.name);
  const cost = parseMoney(mode === "legacy" ? value.price : value.cost);
  const incomes = Array.isArray(value.incomes)
    ? value.incomes
        .map((income) => normalizeIncome(income, mode))
        .filter((income): income is NormalizedIncome => Boolean(income))
    : [];

  if (!name || cost === null || cost < 0) {
    return null;
  }

  return {
    name,
    cost,
    description: parseText(value.description),
    createdAt: parseDate(mode === "legacy" ? value.createdAt : value.created_at),
    incomes,
  };
}

function normalizeImport(data: unknown, mode: ImportMode) {
  if (!isRecord(data) || !Array.isArray(data.investments)) {
    return [];
  }

  return data.investments
    .map((investment) => normalizeInvestment(investment, mode))
    .filter((investment): investment is NormalizedInvestment => Boolean(investment));
}

export async function POST(request: Request) {
  if (!postgresPool) {
    return NextResponse.json({ error: "Missing DATABASE_URL on the server." }, { status: 500 });
  }

  const body = (await request.json()) as ImportRequest;
  const mode: ImportMode = body.mode === "legacy" ? "legacy" : "native";
  const investments = normalizeImport(body.data, mode);

  if (investments.length === 0) {
    return NextResponse.json({ error: "No valid investments found in the import file." }, { status: 400 });
  }

  const client = await postgresPool.connect();

  try {
    await client.query("begin");

    const incomeInvestmentColumn = await getIncomeInvestmentColumn(postgresPool);
    let incomeCount = 0;

    for (const investment of investments) {
      const { rows } = await client.query<{ id: number }>(
        `
          insert into investments (name, cost, description, created_at)
          values ($1, $2, $3, coalesce($4::timestamptz, now()))
          returning id
        `,
        [investment.name, investment.cost, investment.description, investment.createdAt],
      );
      const investmentId = rows[0].id;

      for (const income of investment.incomes) {
        await client.query(
          `
            insert into income (${incomeInvestmentColumn}, amount, description, created_at)
            values ($1, $2, $3, coalesce($4::timestamptz, now()))
          `,
          [investmentId, income.amount, income.description, income.createdAt],
        );
        incomeCount += 1;
      }
    }

    await client.query("commit");

    return NextResponse.json({
      imported: {
        investments: investments.length,
        incomes: incomeCount,
      },
    });
  } catch (error) {
    await client.query("rollback");

    const message = error instanceof Error ? error.message : "Failed to import investments.";

    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    client.release();
  }
}
