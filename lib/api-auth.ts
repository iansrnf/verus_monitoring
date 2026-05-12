export function isAuthorizedConfigRequest(request: Request) {
  const expectedToken = process.env.CONFIG_API_TOKEN?.trim();

  if (!expectedToken) {
    return true;
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : "";
  const headerToken = request.headers.get("x-config-token")?.trim() ?? "";

  return bearerToken === expectedToken || headerToken === expectedToken;
}
