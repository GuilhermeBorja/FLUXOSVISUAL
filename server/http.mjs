import { randomUUID } from "node:crypto";

/** Expected API failure. `details` must contain public, actionable information. */
export class HttpError extends Error {
  constructor(status, code, message, details = undefined) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function assert(condition, status, code, message, details) {
  if (!condition) throw new HttpError(status, code, message, details);
}

export function requestId(request) {
  // Client-provided identifiers are deliberately not trusted as log fields.
  return (request.correlationId ||= randomUUID());
}

export function securityHeaders(response) {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "same-origin");
  response.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );
  response.setHeader("Cross-Origin-Resource-Policy", "same-origin");
}

export function sendJson(response, status, body, headers = {}) {
  if (response.destroyed || response.writableEnded) return;
  securityHeaders(response);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers,
  });
  response.end(JSON.stringify(body));
}

export const json = sendJson;

export function sendError(request, response, error, logger = console) {
  const correlationId = requestId(request);
  const expected = error instanceof HttpError;
  const status = expected ? error.status : 500;
  if (!expected)
    logger.error(
      JSON.stringify({
        level: "error",
        event: "request_failed",
        correlationId,
        method: request.method,
        path: (request.url || "").split("?")[0],
        error: error?.name || "Error",
        message: String(error?.message || error),
      }),
    );
  else if ([401, 403, 409, 422, 429].includes(status))
    logger.warn?.(
      JSON.stringify({
        level: "warn",
        event: "request_rejected",
        correlationId,
        method: request.method,
        path: (request.url || "").split("?")[0],
        status,
        code: error.code,
      }),
    );
  sendJson(
    response,
    status,
    {
      error: {
        code: expected ? error.code : "INTERNAL_ERROR",
        message: expected
          ? error.message
          : "Não foi possível concluir a operação. Consulte o identificador nos logs do servidor.",
        ...(expected && error.details !== undefined
          ? { details: error.details }
          : {}),
        correlationId,
      },
    },
    {
      "X-Request-Id": correlationId,
      ...(status === 429 && error.details?.retryAfterSeconds
        ? { "Retry-After": String(error.details.retryAfterSeconds) }
        : {}),
    },
  );
}

export async function readBody(request, maxBytes = 1024 * 1024) {
  const declared = Number(request.headers["content-length"]);
  if (Number.isFinite(declared) && declared > maxBytes) {
    request.resume();
    throw new HttpError(
      413,
      "PAYLOAD_TOO_LARGE",
      "O conteúdo ultrapassa o tamanho permitido.",
      { maxBytes },
    );
  }
  const chunks = [];
  let size = 0;
  const stream =
    typeof request.iterator === "function"
      ? request.iterator({ destroyOnReturn: false })
      : request;
  for await (const chunk of stream) {
    size += chunk.length;
    if (size > maxBytes) {
      request.resume();
      throw new HttpError(
        413,
        "PAYLOAD_TOO_LARGE",
        "O conteúdo ultrapassa o tamanho permitido.",
        { maxBytes },
      );
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export async function readJson(request, options = {}) {
  const maxBytes =
    typeof options === "number" ? options : (options.limitBytes ?? 1024 * 1024);
  const type = String(request.headers["content-type"] || "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  assert(
    type === "application/json",
    415,
    "JSON_REQUIRED",
    "Envie o conteúdo no formato application/json.",
  );
  const bytes = await readBody(request, maxBytes);
  assert(
    bytes.length > 0,
    400,
    "EMPTY_BODY",
    "Informe o conteúdo da solicitação.",
  );
  let body;
  try {
    body = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new HttpError(400, "INVALID_JSON", "O conteúdo JSON não é válido.");
  }
  assert(
    body !== null && typeof body === "object" && !Array.isArray(body),
    400,
    "INVALID_BODY",
    "Envie um objeto JSON.",
  );
  return body;
}

export function parseCookies(header = "") {
  const result = Object.create(null);
  for (const piece of String(header).split(";")) {
    const separator = piece.indexOf("=");
    if (separator < 1) continue;
    const key = piece.slice(0, separator).trim();
    if (Object.hasOwn(result, key)) {
      result[key] = "";
      continue;
    }
    try {
      result[key] = decodeURIComponent(piece.slice(separator + 1).trim());
    } catch {
      result[key] = "";
    }
  }
  return result;
}

/** No CORS is exposed: browser writes must originate from this deployment. */
export function requireSameOrigin(request, publicOrigin = "") {
  const fetchSite = request.headers["sec-fetch-site"];
  assert(
    !fetchSite || fetchSite === "same-origin" || fetchSite === "none",
    403,
    "CROSS_ORIGIN_REQUEST",
    "A solicitação deve partir deste sistema.",
  );
  const origin = request.headers.origin;
  if (!origin) return; // Authenticated CLI writes still need their CSRF token.
  let expected;
  try {
    expected = publicOrigin
      ? new URL(publicOrigin).origin
      : `${request.socket.encrypted ? "https" : "http"}://${request.headers.host}`;
    assert(
      new URL(origin).origin === expected,
      403,
      "CROSS_ORIGIN_REQUEST",
      "A solicitação deve partir deste sistema.",
    );
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(
      403,
      "INVALID_ORIGIN",
      "Origem da solicitação inválida.",
    );
  }
}
