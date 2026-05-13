import type { Pool } from "pg";

type IncomeInvestmentColumn = "inv_id" | "investment_id";

const incomeInvestmentColumns: IncomeInvestmentColumn[] = ["inv_id", "investment_id"];

export async function getIncomeInvestmentColumn(pool: Pool): Promise<IncomeInvestmentColumn> {
  const { rows } = await pool.query<{ column_name: IncomeInvestmentColumn }>(
    `
      select column_name
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'income'
        and column_name = any($1)
      order by case column_name
        when 'inv_id' then 0
        when 'investment_id' then 1
        else 2
      end
      limit 1
    `,
    [incomeInvestmentColumns],
  );

  const columnName = rows[0]?.column_name;

  if (!columnName) {
    throw new Error("Income table must include either inv_id or investment_id.");
  }

  return columnName;
}
