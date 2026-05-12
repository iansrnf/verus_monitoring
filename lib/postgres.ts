import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;

export const hasPostgresConfig = Boolean(connectionString);

declare global {
  var postgresPool: Pool | undefined;
}

export const postgresPool = hasPostgresConfig
  ? globalThis.postgresPool ??
    new Pool({
      connectionString,
      ssl: process.env.POSTGRES_SSL === "true" ? { rejectUnauthorized: false } : undefined,
    })
  : null;

if (postgresPool && process.env.NODE_ENV !== "production") {
  globalThis.postgresPool = postgresPool;
}
