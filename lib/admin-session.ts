const SESSION_DURATION_SECONDS = 60 * 60 * 24;

type SessionPayload = {
  exp: number;
  nonce: string;
  username: string;
};

function getSessionSecret() {
  return process.env.ADMIN_SESSION_SECRET?.trim() || process.env.ADMIN_PASSWORD?.trim() || "verus-monitoring-admin-session";
}

function bytesToHex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function sign(value: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(getSessionSecret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));

  return bytesToHex(signature);
}

export async function createAdminSessionToken(username: string) {
  const payload: SessionPayload = {
    exp: Math.floor(Date.now() / 1000) + SESSION_DURATION_SECONDS,
    nonce: crypto.randomUUID(),
    username,
  };
  const encodedPayload = encodeURIComponent(JSON.stringify(payload));
  const signature = await sign(encodedPayload);

  return `${encodedPayload}.${signature}`;
}

export async function isValidAdminSessionToken(token: string | undefined) {
  if (!token) {
    return false;
  }

  const separatorIndex = token.lastIndexOf(".");

  if (separatorIndex <= 0) {
    return false;
  }

  const encodedPayload = token.slice(0, separatorIndex);
  const signature = token.slice(separatorIndex + 1);
  const expectedSignature = await sign(encodedPayload);

  if (signature !== expectedSignature) {
    return false;
  }

  try {
    const payload = JSON.parse(decodeURIComponent(encodedPayload)) as Partial<SessionPayload>;

    return typeof payload.exp === "number" && payload.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

export const adminSessionMaxAge = SESSION_DURATION_SECONDS;
