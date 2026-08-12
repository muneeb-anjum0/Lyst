export function json(data, status = 200, origin = "") {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  };

  if (origin) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers.Vary = "Origin";
  }

  return new Response(JSON.stringify(data), { status, headers });
}

export function errorResponse(
  message,
  code = "internal",
  status = 500,
  origin = "",
) {
  return json({ error: message, code }, status, origin);
}

export function allowedOrigins(env) {
  return String(env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export function getAllowedOrigin(request, env) {
  const origin = request.headers.get("Origin") || "";

  if (!origin) return "";

  return allowedOrigins(env).includes(origin) ? origin : null;
}

export function handleOptions(request, env) {
  const origin = getAllowedOrigin(request, env);

  if (origin === null) {
    return new Response(null, { status: 403 });
  }

  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": origin || "*",
      "Access-Control-Allow-Methods": "POST,OPTIONS",
      "Access-Control-Allow-Headers": "Authorization,Content-Type",
      "Access-Control-Max-Age": "86400",
      Vary: "Origin",
    },
  });
}
