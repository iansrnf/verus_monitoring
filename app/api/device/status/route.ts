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
  restart_event?: unknown;
  restartEvent?: unknown;
  restart_count?: unknown;
  restartCount?: unknown;
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

function parseOptionalBoolean(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function parseOptionalIntegerMetric(value: unknown) {
  if (value === undefined || value === null) {
    return null;
  }

  return parseIntegerMetric(value);
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

function hasPngSignature(value: Buffer | null) {
  return Boolean(
    value &&
      value.length >= 8 &&
      value.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  );
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
  const screenshotReceived = Boolean(screenshot?.length);
  const status = parseOptionalBoolean(body.status);
  const restartEvent = Boolean(body.restart_event ?? body.restartEvent);
  const restartCount = parseOptionalIntegerMetric(body.restart_count ?? body.restartCount);
  const updatedAt = new Date().toISOString();
  const payload = [
    name,
    status,
    stringifyMetric(body.hash),
    typeof body.config === "string" ? body.config : "",
    stringifyMetric(body.shares),
    parseIntegerMetric(body.cpu_core ?? body.cpu),
    stringifyMetric(body.temp),
    screenshot,
    updatedAt,
    restartEvent,
    restartCount,
    restartEvent ? updatedAt : null,
    restartEvent ? `Device restarted${restartCount === null ? "" : ` ${restartCount} time${restartCount === 1 ? "" : "s"}`}.` : null,
  ];

  try {
    await postgresPool.query(`
      alter table device
        add column if not exists restart_count integer not null default 0,
        add column if not exists restart_alarm boolean not null default false,
        add column if not exists last_restart_at timestamp with time zone,
        add column if not exists restart_alarm_message text
    `);

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
            status = coalesce($2, status),
            hash = case when $3 = '' then hash else $3 end,
            config = case when $4 = '' then config else $4 end,
            shares = case when $5 = '' then shares else $5 end,
            cpu_core = case when $6 = 0 then cpu_core else $6 end,
            temp = case when $7 = '' then temp else $7 end,
            screen_shot = coalesce($8, screen_shot),
            created_at = $9,
            restart_count = case
              when $10 and $11 is null then restart_count + 1
              when $10 then greatest($11, restart_count)
              else restart_count
            end,
            restart_alarm = case when $10 then true else restart_alarm end,
            last_restart_at = coalesce($12::timestamptz, last_restart_at),
            restart_alarm_message = coalesce($13, restart_alarm_message)
          where id = $14
        `,
        [...payload, existingDevice.rows[0].id],
      );
    } else {
      await postgresPool.query(
        `
          insert into device (
            name,
            status,
            hash,
            config,
            shares,
            cpu_core,
            temp,
            screen_shot,
            created_at,
            restart_count,
            restart_alarm,
            last_restart_at,
            restart_alarm_message
          )
          values (
            $1,
            coalesce($2, false),
            $3,
            $4,
            $5,
            $6,
            $7,
            $8,
            $9,
            case when $10 then coalesce($11, 1) else 0 end,
            $10,
            $12::timestamptz,
            $13
          )
        `,
        payload,
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save device status.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    screenshot_received: screenshotReceived,
    screenshot_bytes: screenshot?.length ?? 0,
    screenshot_png: hasPngSignature(screenshot),
  });
}
