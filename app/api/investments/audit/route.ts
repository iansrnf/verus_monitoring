import { NextResponse } from "next/server";
import { ensureInvestmentAuditSchema } from "@/lib/investment-audit";
import { postgresPool } from "@/lib/postgres";

export async function GET() {
  if (!postgresPool) {
    return NextResponse.json({ error: "Missing DATABASE_URL on the server." }, { status: 500 });
  }

  try {
    await ensureInvestmentAuditSchema(postgresPool);

    const { rows } = await postgresPool.query(`
      select
        id,
        action,
        entity_type,
        entity_id,
        summary,
        before_data,
        after_data,
        created_at::text as created_at
      from investment_audit_logs
      order by created_at desc, id desc
      limit 100
    `);

    return NextResponse.json({ auditLogs: rows });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load investment audit logs.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
