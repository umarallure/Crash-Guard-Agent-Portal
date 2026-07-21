import { createClient } from "npm:@supabase/supabase-js@2.50.5";
import { parseAlowareRecordingPayload } from "../_shared/aloware.ts";
import { isValidTimeZone, readJsonBody } from "../_shared/http.ts";
import { readNamedApiKey } from "../_shared/supabaseKeys.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ADMIN_KEY = readNamedApiKey(
  Deno.env.get("SUPABASE_SECRET_KEYS"),
  ["aloware-recordings", "default"],
) ?? Deno.env.get("SUPABASE_SECRET_KEY") ??
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ALOWARE_WEBHOOK_SECRET = Deno.env.get("ALOWARE_WEBHOOK_SECRET") ?? "";
const ALOWARE_ACCOUNT_TIMEZONE = Deno.env.get("ALOWARE_ACCOUNT_TIMEZONE") ?? "";
const MAX_WEBHOOK_BODY_BYTES = 1_048_576;

const jsonResponse = (
  body: unknown,
  status: number,
  requestId: string,
  extraHeaders?: Record<string, string>,
) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "X-Request-Id": requestId,
      ...extraHeaders,
    },
  });

const timingSafeEqual = (left: string, right: string): boolean => {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  const length = Math.max(leftBytes.length, rightBytes.length);
  let mismatch = leftBytes.length ^ rightBytes.length;

  for (let index = 0; index < length; index += 1) {
    mismatch |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }

  return mismatch === 0;
};

Deno.serve(async (req) => {
  const requestId = crypto.randomUUID();

  if (req.method !== "POST") {
    return jsonResponse(
      { error: "Method not allowed", code: "method_not_allowed" },
      405,
      requestId,
      { Allow: "POST" },
    );
  }

  if (
    !SUPABASE_URL ||
    !SUPABASE_ADMIN_KEY ||
    ALOWARE_WEBHOOK_SECRET.length < 32 ||
    /\s/.test(ALOWARE_WEBHOOK_SECRET) ||
    !isValidTimeZone(ALOWARE_ACCOUNT_TIMEZONE)
  ) {
    console.error("Aloware webhook is missing or has invalid server configuration", { requestId });
    return jsonResponse(
      { error: "Integration is not configured", code: "configuration_error" },
      503,
      requestId,
    );
  }

  const actualAuthorization = req.headers.get("authorization") ?? "";
  const bearerMatch = actualAuthorization.match(/^Bearer\s+(\S+)$/i);
  if (!bearerMatch || !timingSafeEqual(bearerMatch[1], ALOWARE_WEBHOOK_SECRET)) {
    return jsonResponse({ error: "Unauthorized", code: "unauthorized" }, 401, requestId);
  }

  const body = await readJsonBody(req, MAX_WEBHOOK_BODY_BYTES);
  if (!body.ok) {
    return jsonResponse({ error: body.message, code: body.code }, body.status, requestId);
  }

  const parsed = parseAlowareRecordingPayload(body.value, ALOWARE_ACCOUNT_TIMEZONE);
  if (!parsed.ok) {
    console.warn("Rejected Aloware recording event", { requestId, code: parsed.code });
    return jsonResponse({ error: parsed.message, code: parsed.code }, 422, requestId);
  }

  const recording = parsed.recording;
  const now = new Date().toISOString();
  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_ADMIN_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { error } = await supabaseAdmin
    .from("aloware_call_recordings")
    .upsert({
      source_key: recording.sourceKey,
      aloware_communication_id: recording.alowareCommunicationId,
      aloware_contact_id: recording.alowareContactId,
      aloware_company_id: recording.alowareCompanyId,
      phone_e164: recording.phoneE164,
      recording_url: recording.recordingUrl,
      direction: recording.direction,
      status: recording.status,
      duration_seconds: recording.durationSeconds,
      started_at: recording.startedAt,
      source_started_at: recording.sourceStartedAt,
      source_timezone: recording.sourceTimezone,
      agent_id: recording.agentId,
      agent_name: recording.agentName,
      received_at: now,
      updated_at: now,
    }, { onConflict: "source_key" });

  if (error) {
    console.error("Failed to persist Aloware recording", {
      requestId,
      code: error.code,
    });
    return jsonResponse(
      { error: "Failed to store recording metadata", code: "storage_error" },
      500,
      requestId,
    );
  }

  return jsonResponse({ success: true }, 200, requestId);
});
