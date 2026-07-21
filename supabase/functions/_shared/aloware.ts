import { normalizeUsPhoneE164 } from "./phone.ts";

type JsonRecord = Record<string, unknown>;

export interface ParsedAlowareRecording {
  sourceKey: string;
  alowareCommunicationId: string;
  alowareContactId: string | null;
  alowareCompanyId: string | null;
  phoneE164: string;
  recordingUrl: string;
  direction: "inbound" | "outbound" | "unknown";
  status: string | null;
  durationSeconds: number;
  startedAt: string;
  sourceStartedAt: string;
  sourceTimezone: string;
  agentId: string | null;
  agentName: string | null;
}

export type ParseAlowareResult =
  | { ok: true; recording: ParsedAlowareRecording }
  | { ok: false; code: string; message: string };

const asRecord = (value: unknown): JsonRecord | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : null;

const pickString = (...values: unknown[]): string | null => {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
};

const parseNonNegativeInteger = (value: unknown): number => {
  const raw = String(value ?? "0").trim();
  const hoursMatch = raw.match(/^(\d+):([0-5]\d):([0-5]\d)$/);
  const minutesMatch = raw.match(/^(\d+):([0-5]\d)$/);
  const parsed = hoursMatch
    ? Number(hoursMatch[1]) * 3600 + Number(hoursMatch[2]) * 60 + Number(hoursMatch[3])
    : minutesMatch
    ? Number(minutesMatch[1]) * 60 + Number(minutesMatch[2])
    : /^\d+(?:\.\d+)?$/.test(raw)
    ? Math.floor(Number(raw))
    : 0;
  return Number.isFinite(parsed) && parsed >= 0
    ? Math.min(parsed, 2_147_483_647)
    : 0;
};

const truncate = (value: string | null, maxLength: number): string | null =>
  value && value.length > maxLength ? value.slice(0, maxLength) : value;

const isSafeIdentifier = (value: string): boolean => /^[a-z0-9._-]+$/i.test(value);

const normalizeDirection = (value: unknown): ParsedAlowareRecording["direction"] => {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "1" || normalized === "inbound" || normalized === "incoming") return "inbound";
  if (normalized === "2" || normalized === "outbound" || normalized === "outgoing") return "outbound";
  return "unknown";
};

const partsInTimeZone = (date: Date, timeZone: string) => {
  const parts = new Intl.DateTimeFormat("en-US-u-ca-gregory", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const values = Object.fromEntries(
    parts.filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]),
  );

  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
    second: values.second,
  };
};

/** Parse offset-aware values directly and interpret naive Aloware values in the account timezone. */
export const parseAlowareTimestamp = (value: unknown, timeZone: string): string | null => {
  const raw = pickString(value);
  if (!raw) return null;

  if (/(?:z|[+-]\d{2}:?\d{2})$/i.test(raw)) {
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  const match = raw.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?)?$/,
  );
  if (!match) return null;

  const desired = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4] ?? 0),
    minute: Number(match[5] ?? 0),
    second: Number(match[6] ?? 0),
    millisecond: Number((match[7] ?? "").padEnd(3, "0").slice(0, 3)),
  };

  const desiredAsUtc = Date.UTC(
    desired.year,
    desired.month - 1,
    desired.day,
    desired.hour,
    desired.minute,
    desired.second,
  );
  let candidate = desiredAsUtc;

  try {
    // Two passes handle both standard offsets and daylight-saving transitions.
    for (let iteration = 0; iteration < 2; iteration += 1) {
      const observed = partsInTimeZone(new Date(candidate), timeZone);
      const observedAsUtc = Date.UTC(
        observed.year,
        observed.month - 1,
        observed.day,
        observed.hour,
        observed.minute,
        observed.second,
      );
      candidate += desiredAsUtc - observedAsUtc;
    }
  } catch {
    return null;
  }

  const parsed = new Date(candidate + desired.millisecond);
  if (Number.isNaN(parsed.getTime())) return null;

  try {
    const finalParts = partsInTimeZone(parsed, timeZone);
    if (
      finalParts.year !== desired.year ||
      finalParts.month !== desired.month ||
      finalParts.day !== desired.day ||
      finalParts.hour !== desired.hour ||
      finalParts.minute !== desired.minute ||
      finalParts.second !== desired.second
    ) return null;
  } catch {
    return null;
  }

  return parsed.toISOString();
};

export const parseAlowareRecordingPayload = (
  payload: unknown,
  timeZone: string,
): ParseAlowareResult => {
  const root = asRecord(payload);
  if (!root) return { ok: false, code: "invalid_payload", message: "Expected a JSON object." };

  const body = asRecord(root.body) ?? root;
  const contact = asRecord(body.contact);
  const user = asRecord(body.user);

  const communicationId = pickString(body.id, body.communication_id);
  if (!communicationId) {
    return { ok: false, code: "missing_communication_id", message: "Missing communication ID." };
  }
  if (communicationId.length > 128 || !isSafeIdentifier(communicationId)) {
    return { ok: false, code: "invalid_communication_id", message: "Communication ID is invalid." };
  }

  const communicationType = pickString(body.type, body.communication_type);
  if (
    communicationType &&
    !["1", "call", "phone", "phone_call", "phone call"].includes(communicationType.toLowerCase())
  ) {
    return { ok: false, code: "invalid_communication_type", message: "Expected a call recording." };
  }

  const phoneE164 = normalizeUsPhoneE164(
    pickString(contact?.phone_number, body.contact_phone_number, body.lead_number),
  );
  if (!phoneE164) {
    return { ok: false, code: "invalid_phone", message: "Missing or invalid US contact phone." };
  }

  const recordingUrl = pickString(
    body.direct_recording_url,
    body.recording_url,
    body.recording,
  );
  if (!recordingUrl) {
    return { ok: false, code: "missing_recording_url", message: "Missing recording URL." };
  }
  if (recordingUrl.length > 8192) {
    return { ok: false, code: "invalid_recording_url", message: "Recording URL is too long." };
  }

  try {
    const parsedUrl = new URL(recordingUrl);
    if (parsedUrl.protocol !== "https:" || parsedUrl.username || parsedUrl.password) {
      throw new Error("Recording URL must use HTTPS without embedded credentials.");
    }
  } catch {
    return { ok: false, code: "invalid_recording_url", message: "Recording URL must be a valid HTTPS URL." };
  }

  const sourceStartedAt = pickString(body.started_at, body.created_at);
  if (!sourceStartedAt || sourceStartedAt.length > 64) {
    return { ok: false, code: "invalid_started_at", message: "Missing or invalid call timestamp." };
  }

  const startedAt = parseAlowareTimestamp(sourceStartedAt, timeZone);
  if (!startedAt) {
    return { ok: false, code: "invalid_started_at", message: "Missing or invalid call timestamp." };
  }

  const companyId = pickString(body.company_id);
  const contactId = pickString(body.contact_id, contact?.id);
  const agentId = pickString(body.user_id, body.owner_id, user?.id);
  const agentName = pickString(body.user_name, body.owner_name, user?.name);

  if (
    [companyId, contactId, agentId].some((value) =>
      value && (value.length > 128 || !isSafeIdentifier(value))
    )
  ) {
    return { ok: false, code: "invalid_identifier", message: "An Aloware identifier is too long." };
  }

  return {
    ok: true,
    recording: {
      sourceKey: `aloware:${companyId ?? "default"}:${communicationId}`,
      alowareCommunicationId: communicationId,
      alowareContactId: contactId,
      alowareCompanyId: companyId,
      phoneE164,
      recordingUrl,
      direction: normalizeDirection(body.direction),
      status: truncate(pickString(body.disposition_status, body.current_status, body.status), 255),
      durationSeconds: parseNonNegativeInteger(body.duration),
      startedAt,
      sourceStartedAt,
      sourceTimezone: timeZone,
      agentId,
      agentName: truncate(agentName, 500),
    },
  };
};
