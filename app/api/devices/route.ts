import { NextResponse } from "next/server";
import { postgresPool } from "@/lib/postgres";

const STALE_DEVICE_MS = 60_000;

function getScreenshotDataUrl(value: unknown) {
  if (typeof value !== "string" || !value) {
    return null;
  }

  const buffer = Buffer.from(value, "base64");
  const isPng = buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const mimeType = isPng ? "image/png" : isJpeg ? "image/jpeg" : "image/webp";

  return `data:${mimeType};base64,${value}`;
}

export async function GET() {
  if (!postgresPool) {
    return NextResponse.json(
      { error: "Missing DATABASE_URL on the server." },
      { status: 500 },
    );
  }

  const staleBefore = new Date(Date.now() - STALE_DEVICE_MS).toISOString();

  try {
    await postgresPool.query(
      `
        update device
        set status = false
        where status = true
          and created_at is not null
          and created_at < $1
      `,
      [staleBefore],
    );

    const { rows } = await postgresPool.query(`
      select
        id,
        created_at,
        name,
        hash,
        config,
        shares,
        cpu_core,
        temp,
        status,
        encode(screen_shot, 'base64') as screen_shot
      from device
      order by created_at desc nulls last
    `);

    return NextResponse.json({
      devices: rows.map((row) => ({
        ...row,
        screen_shot: getScreenshotDataUrl(row.screen_shot),
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load devices.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
