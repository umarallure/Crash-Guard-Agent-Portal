import assert from "node:assert/strict";
import test from "node:test";
import {
  parseAlowareRecordingPayload,
  parseAlowareTimestamp,
} from "../supabase/functions/_shared/aloware.ts";
import { isValidTimeZone, readJsonBody } from "../supabase/functions/_shared/http.ts";
import { normalizeUsPhoneE164 } from "../supabase/functions/_shared/phone.ts";
import { readNamedApiKey } from "../supabase/functions/_shared/supabaseKeys.ts";

test("normalizes supported US phone formats", () => {
  assert.equal(normalizeUsPhoneE164("(212) 555-1212"), "+12125551212");
  assert.equal(normalizeUsPhoneE164("+1 212 555 1212"), "+12125551212");
  assert.equal(normalizeUsPhoneE164("2125551212"), "+12125551212");
});

test("rejects ambiguous and non-US phone values", () => {
  assert.equal(normalizeUsPhoneE164("555-1212"), null);
  assert.equal(normalizeUsPhoneE164("442071838750"), null);
  assert.equal(normalizeUsPhoneE164("22125551212"), null);
});

test("interprets naive timestamps in the configured timezone", () => {
  assert.equal(
    parseAlowareTimestamp("2026-07-20 10:30:00", "America/New_York"),
    "2026-07-20T14:30:00.000Z",
  );
  assert.equal(
    parseAlowareTimestamp("2026-07-20 10:30:00.125", "America/New_York"),
    "2026-07-20T14:30:00.125Z",
  );
  assert.equal(parseAlowareTimestamp("2026-02-31 10:30:00", "America/New_York"), null);
});

test("parses a recording-saved communication payload", () => {
  const result = parseAlowareRecordingPayload({
    event: "RecordingSaved",
    body: {
      id: "123",
      company_id: "47",
      contact_id: "456",
      direction: "1",
      duration: "62",
      disposition_status: "completed",
      created_at: "2026-07-20 10:30:00",
      direct_recording_url: "https://recordings.example.com/call.mp3",
      contact: { phone_number: "+1 (212) 555-1212" },
    },
  }, "America/New_York");

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.recording.sourceKey, "aloware:47:123");
  assert.equal(result.recording.phoneE164, "+12125551212");
  assert.equal(result.recording.direction, "inbound");
  assert.equal(result.recording.durationSeconds, 62);
  assert.equal(result.recording.sourceStartedAt, "2026-07-20 10:30:00");
  assert.equal(result.recording.sourceTimezone, "America/New_York");
});

test("rejects recording payloads without an HTTPS URL", () => {
  const result = parseAlowareRecordingPayload({
    body: {
      id: "123",
      created_at: "2026-07-20 10:30:00",
      direct_recording_url: "javascript:alert(1)",
      contact: { phone_number: "2125551212" },
    },
  }, "America/New_York");

  assert.deepEqual(result, {
    ok: false,
    code: "invalid_recording_url",
    message: "Recording URL must be a valid HTTPS URL.",
  });
});

test("rejects non-call communication payloads", () => {
  const result = parseAlowareRecordingPayload({
    body: {
      id: "123",
      type: "2",
      created_at: "2026-07-20 10:30:00",
      direct_recording_url: "https://recordings.example.com/call.mp3",
      contact: { phone_number: "2125551212" },
    },
  }, "America/New_York");

  assert.deepEqual(result, {
    ok: false,
    code: "invalid_communication_type",
    message: "Expected a call recording.",
  });
});

test("parses formatted recording durations", () => {
  const result = parseAlowareRecordingPayload({
    body: {
      id: "csv-recording-123",
      type: "phone call",
      duration: "01:02:03",
      created_at: "2026-07-20 10:30:00",
      direct_recording_url: "https://recordings.example.com/call.mp3",
      contact: { phone_number: "2125551212" },
    },
  }, "America/New_York");

  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.recording.durationSeconds, 3723);
});

test("validates IANA timezone configuration", () => {
  assert.equal(isValidTimeZone("America/Los_Angeles"), true);
  assert.equal(isValidTimeZone("Not/A_Timezone"), false);
  assert.equal(isValidTimeZone(""), false);
});

test("reads a bounded JSON request body", async () => {
  const valid = await readJsonBody(new Request("https://example.test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ok: true }),
  }), 100);
  assert.deepEqual(valid, { ok: true, value: { ok: true } });

  const tooLarge = await readJsonBody(new Request("https://example.test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "too large" }),
  }), 5);
  assert.equal(tooLarge.ok, false);
  if (!tooLarge.ok) assert.equal(tooLarge.status, 413);

  const wrongType = await readJsonBody(new Request("https://example.test", {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: "{}",
  }), 100);
  assert.equal(wrongType.ok, false);
  if (!wrongType.ok) assert.equal(wrongType.status, 415);
});

test("selects a preferred hosted Supabase API key safely", () => {
  const serialized = JSON.stringify({ default: "sb_secret_default", "aloware-recordings": "sb_secret_named" });
  assert.equal(
    readNamedApiKey(serialized, ["aloware-recordings", "default"]),
    "sb_secret_named",
  );
  assert.equal(readNamedApiKey("not-json", ["default"]), null);
});
