import { createClient } from "npm:@supabase/supabase-js@2.50.5";
import { isRecord, readJsonBody } from "../_shared/http.ts";
import { readNamedApiKey } from "../_shared/supabaseKeys.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_PUBLIC_KEY = readNamedApiKey(
  Deno.env.get("SUPABASE_PUBLISHABLE_KEYS"),
  ["default"],
) ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ??
  Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const MAX_REQUEST_BODY_BYTES = 16_384;

type Cursor = { startedAt: string; id: string };

type RecordingRpcRow = {
  recording_id: string;
  direction: "inbound" | "outbound" | "unknown";
  call_status: string | null;
  duration_seconds: number;
  started_at: string;
  agent_name: string | null;
  recording_url: string;
};

const configuredOrigins = (Deno.env.get("APP_ALLOWED_ORIGINS") ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

const originsAreValid = configuredOrigins.length > 0 && configuredOrigins.every((origin) => {
  try {
    const parsed = new URL(origin);
    const isLocalHttp = parsed.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
    return (parsed.protocol === "https:" || isLocalHttp) && parsed.origin === origin;
  } catch {
    return false;
  }
});

const requestOriginIsAllowed = (req: Request): boolean => {
  const origin = req.headers.get("origin");
  return !origin || configuredOrigins.includes(origin);
};

const corsHeaders = (req: Request): Record<string, string> => {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
  const origin = req.headers.get("origin");
  if (origin && configuredOrigins.includes(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
};

const jsonResponse = (
  req: Request,
  body: unknown,
  status: number,
  requestId: string,
  extraHeaders?: Record<string, string>,
) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(req),
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "X-Request-Id": requestId,
      ...extraHeaders,
    },
  });

const encodeCursor = (cursor: Cursor): string => {
  const bytes = new TextEncoder().encode(JSON.stringify(cursor));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
};

const decodeCursor = (value: unknown): Cursor | null => {
  if (typeof value !== "string" || !value || value.length > 512) return null;

  try {
    const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (
      !isRecord(parsed) ||
      typeof parsed.startedAt !== "string" ||
      Number.isNaN(new Date(parsed.startedAt).getTime()) ||
      typeof parsed.id !== "string" ||
      !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(parsed.id)
    ) return null;

    return { startedAt: new Date(parsed.startedAt).toISOString(), id: parsed.id };
  } catch {
    return null;
  }
};

Deno.serve(async (req) => {
  const requestId = crypto.randomUUID();

  if (!SUPABASE_URL || !SUPABASE_PUBLIC_KEY || !originsAreValid) {
    console.error("Recordings API is missing or has invalid server configuration", { requestId });
    return jsonResponse(
      req,
      { error: "Integration is not configured", code: "configuration_error" },
      503,
      requestId,
    );
  }

  if (!requestOriginIsAllowed(req)) {
    return jsonResponse(req, { error: "Origin not allowed", code: "origin_not_allowed" }, 403, requestId);
  }

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: { ...corsHeaders(req), "X-Request-Id": requestId } });
  }
  if (req.method !== "POST") {
    return jsonResponse(
      req,
      { error: "Method not allowed", code: "method_not_allowed" },
      405,
      requestId,
      { Allow: "POST, OPTIONS" },
    );
  }

  const authorization = req.headers.get("authorization") ?? "";
  if (!/^Bearer\s+\S+$/i.test(authorization)) {
    return jsonResponse(
      req,
      { error: "Authentication required", code: "authentication_required" },
      401,
      requestId,
    );
  }

  const userClient = createClient(SUPABASE_URL, SUPABASE_PUBLIC_KEY, {
    global: { headers: { Authorization: authorization } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) {
    return jsonResponse(
      req,
      { error: "Invalid or expired session", code: "invalid_session" },
      401,
      requestId,
    );
  }

  const parsedBody = await readJsonBody(req, MAX_REQUEST_BODY_BYTES);
  if (!parsedBody.ok) {
    return jsonResponse(
      req,
      { error: parsedBody.message, code: parsedBody.code },
      parsedBody.status,
      requestId,
    );
  }
  if (!isRecord(parsedBody.value)) {
    return jsonResponse(req, { error: "Expected a JSON object", code: "invalid_payload" }, 400, requestId);
  }

  const submissionId = typeof parsedBody.value.submissionId === "string"
    ? parsedBody.value.submissionId.trim()
    : "";
  if (!submissionId || submissionId.length > 200) {
    return jsonResponse(
      req,
      { error: "A valid submissionId is required", code: "invalid_submission_id" },
      400,
      requestId,
    );
  }

  const requestedPageSize = typeof parsedBody.value.pageSize === "number" &&
      Number.isFinite(parsedBody.value.pageSize)
    ? Math.floor(parsedBody.value.pageSize)
    : 25;
  const pageSize = Math.min(100, Math.max(1, requestedPageSize));
  const cursor = parsedBody.value.cursor == null ? null : decodeCursor(parsedBody.value.cursor);
  if (parsedBody.value.cursor != null && !cursor) {
    return jsonResponse(
      req,
      { error: "Invalid pagination cursor", code: "invalid_cursor" },
      400,
      requestId,
    );
  }

  const { data, error } = await userClient.rpc("get_lead_call_recordings_page", {
    p_submission_id: submissionId,
    p_cursor_started_at: cursor?.startedAt ?? null,
    p_cursor_id: cursor?.id ?? null,
    p_limit: pageSize + 1,
  });

  if (error) {
    const mapped = error.code === "42501"
      ? { status: 403, code: "forbidden", message: "Administrator access required" }
      : error.code === "P0002"
      ? { status: 404, code: "lead_not_found", message: "Lead not found" }
      : error.code === "22023"
      ? { status: 422, code: "invalid_lead_phone", message: "Lead has no valid US phone number" }
      : { status: 500, code: "query_error", message: "Unable to load call recordings" };

    if (mapped.status === 500) {
      console.error("Failed to list lead recordings", { requestId, code: error.code });
    }
    return jsonResponse(req, { error: mapped.message, code: mapped.code }, mapped.status, requestId);
  }

  const rows = (data ?? []) as RecordingRpcRow[];
  const hasMore = rows.length > pageSize;
  const pageRows = rows.slice(0, pageSize);
  const lastRow = pageRows.at(-1);

  return jsonResponse(req, {
    recordings: pageRows.map((row) => ({
      id: row.recording_id,
      direction: row.direction,
      status: row.call_status,
      durationSeconds: row.duration_seconds,
      startedAt: row.started_at,
      agentName: row.agent_name,
      playbackUrl: row.recording_url,
    })),
    nextCursor: hasMore && lastRow
      ? encodeCursor({ startedAt: lastRow.started_at, id: lastRow.recording_id })
      : null,
  }, 200, requestId);
});
