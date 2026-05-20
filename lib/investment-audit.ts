import type { Pool, PoolClient } from "pg";
import { ensureInvestmentSchema } from "@/lib/investments-schema";

type Queryable = Pool | PoolClient;

type AuditAction = "created" | "updated" | "deleted" | "imported";
type AuditEntityType = "investment" | "income" | "import";

type AuditLogInput = {
  action: AuditAction;
  entityType: AuditEntityType;
  entityId?: number | null;
  summary: string;
  before?: unknown;
  after?: unknown;
};

export async function recordInvestmentAuditLog(queryable: Queryable, input: AuditLogInput) {
  await queryable.query(
    `
      insert into investment_audit_logs (action, entity_type, entity_id, summary, before_data, after_data)
      values ($1, $2, $3, $4, $5::jsonb, $6::jsonb)
    `,
    [
      input.action,
      input.entityType,
      input.entityId ?? null,
      input.summary,
      input.before === undefined ? null : JSON.stringify(input.before),
      input.after === undefined ? null : JSON.stringify(input.after),
    ],
  );
}

export async function ensureInvestmentAuditSchema(pool: Pool) {
  await ensureInvestmentSchema(pool);
}
