import { NextResponse } from "next/server";
import { isAuthorizedConfigRequest } from "@/lib/api-auth";
import { postgresPool } from "@/lib/postgres";

type DeviceStatusRequest = {
  name?: unknown;
  status?: unknown;
  hash?: unknown;
  config?: unknown;
  shares?: unknown;
  cpu?: unknown;
  cpu_core?: unknown;
  temp?: unknown;
  screen_shot?: unknown;
  screenShot?: unknown;
};

function stringifyMetric(value: unknown) {
  if (typeof value === "string") {
    return value.trim();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return "";
}

function parseIntegerMetric(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value);
  }

  if (typeof value === "string") {
    const numericValue = Number(value);

    if (Number.isFinite(numericValue)) {
      return Math.round(numericValue);
    }
  }

  return 0;
}

function parseScreenshot(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return null;
  }

  const base64Value = trimmedValue.includes(",") ? trimmedValue.split(",").pop() : trimmedValue;

  if (!base64Value) {
    return null;
  }

  return Buffer.from(base64Value, "base64");
}

export async function POST(request: Request) {
  if (!isAuthorizedConfigRequest(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (!postgresPool) {
    return NextResponse.json(
      { error: "Missing DATABASE_URL on the server." },
      { status: 500 },
    );
  }

  const body = (await request.json()) as DeviceStatusRequest;
  const name = typeof body.name === "string" ? body.name.trim() : "";

  if (!name) {
    return NextResponse.json({ error: "Device name is required." }, { status: 400 });
  }

  const screenshot = parseScreenshot(body.screen_shot ?? body.screenShot);
  const payload = [
    name,
    Boolean(body.status),
    stringifyMetric(body.hash),
    typeof body.config === "string" ? body.config : "",
    stringifyMetric(body.shares),
    parseIntegerMetric(body.cpu_core ?? body.cpu),
    stringifyMetric(body.temp),
    screenshot,
    new Date().toISOString(),
  ];

  try {
    const existingDevice = await postgresPool.query<{ id: number }>(
      `
        select id
        from device
        where name = $1
        order by created_at desc nulls last
        limit 1
      `,
      [name],
    );

    if (existingDevice.rows[0]?.id) {
      await postgresPool.query(
        `
          update device
          set
            name = $1,
            status = $2,
            hash = $3,
            config = $4,
            shares = $5,
            cpu_core = $6,
            temp = $7,
            screen_shot = coalesce($8, screen_shot),
            created_at = $9
          where id = $10
        `,
        [...payload, existingDevice.rows[0].id],
      );
    } else {
      await postgresPool.query(
        `
          insert into device (name, status, hash, config, shares, cpu_core, temp, screen_shot, created_at)
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `,
        payload,
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save device status.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
