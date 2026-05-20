import { NextResponse } from "next/server";

type EarnAppDevice = {
  uuid?: unknown;
  title?: unknown;
  rate?: unknown;
  earned?: unknown;
  earned_total?: unknown;
  country?: unknown;
  ips?: unknown;
  billing?: unknown;
  uptime?: unknown;
  total_uptime?: unknown;
};

type EarnAppDevicesRequest = {
  cookie?: unknown;
};

const EARNAPP_DEVICES_URL = "https://earnapp.com/dashboard/api/devices";

function getEnvValue(name: string) {
  return process.env[name]?.trim() || "";
}

function getXsrfToken(cookie: string) {
  const match = cookie.match(/(?:^|;\s*)xsrf-token=([^;]+)/);

  return match?.[1] ? decodeURIComponent(match[1]) : "";
}

function toNumber(value: unknown) {
  const numberValue = Number(value);

  return Number.isFinite(numberValue) ? numberValue : 0;
}

function normalizeEarnAppDevice(device: EarnAppDevice) {
  return {
    uuid: typeof device.uuid === "string" ? device.uuid : "",
    title: typeof device.title === "string" ? device.title : "Unnamed device",
    rate: toNumber(device.rate),
    earned: toNumber(device.earned),
    earned_total: toNumber(device.earned_total),
    country: typeof device.country === "string" ? device.country : "",
    ips: Array.isArray(device.ips) ? device.ips.filter((ip): ip is string => typeof ip === "string") : [],
    billing: typeof device.billing === "string" ? device.billing : "",
    uptime: toNumber(device.uptime),
    total_uptime: toNumber(device.total_uptime),
  };
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as EarnAppDevicesRequest;
  const cookie = typeof body.cookie === "string" ? body.cookie.trim() : "";

  if (!cookie) {
    return NextResponse.json(
      { error: "Paste your EarnApp dashboard cookie before loading devices." },
      { status: 400 },
    );
  }

  const xsrfToken = getXsrfToken(cookie);
  const appId = getEnvValue("EARNAPP_APP_ID") || "earnapp";
  const version = getEnvValue("EARNAPP_VERSION") || "1.633.653";
  const url = new URL(EARNAPP_DEVICES_URL);

  url.searchParams.set("appid", appId);
  url.searchParams.set("version", version);

  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: {
        accept: "application/json, text/javascript, */*; q=0.01",
        cookie,
        referer: "https://earnapp.com/dashboard/me/passive-income",
        "user-agent": getEnvValue("EARNAPP_USER_AGENT") || "Mozilla/5.0",
        "x-requested-with": "XMLHttpRequest",
        ...(xsrfToken ? { "xsrf-token": xsrfToken } : {}),
      },
    });

    const text = await response.text();

    if (!response.ok) {
      return NextResponse.json(
        { error: `EarnApp returned ${response.status}: ${text.slice(0, 240) || response.statusText}` },
        { status: response.status },
      );
    }

    const data = JSON.parse(text) as unknown;

    if (!Array.isArray(data)) {
      return NextResponse.json({ error: "EarnApp returned an unexpected response." }, { status: 502 });
    }

    return NextResponse.json({
      checkedAt: new Date().toISOString(),
      devices: data.map((device) => normalizeEarnAppDevice(device as EarnAppDevice)),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load EarnApp devices.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
