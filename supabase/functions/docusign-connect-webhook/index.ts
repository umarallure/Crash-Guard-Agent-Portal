import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type RetainerStatus = "sent" | "viewed" | "signed" | "declined" | "voided" | "unknown";

type ParsedConnectPayload = {
  envelopeId: string;
  submissionId: string | null;
  leadId: string | null;
  eventType: string;
  eventAt: string | null;
  status: RetainerStatus;
  sentAt: string | null;
  viewedAt: string | null;
  signedAt: string | null;
  declinedAt: string | null;
  voidedAt: string | null;
  payload: Record<string, unknown>;
};

type ExistingAgreement = {
  id: string;
  status: RetainerStatus;
  submission_id: string | null;
  lead_id: string | null;
  template_id: string | null;
  sent_at: string | null;
  viewed_at: string | null;
  signed_at: string | null;
  declined_at: string | null;
  voided_at: string | null;
  document_bucket: string | null;
  document_storage_path: string | null;
  document_file_name: string | null;
  document_content_type: string | null;
  document_size: number | null;
  document_sha256: string | null;
  document_stored_at: string | null;
};

type DocusignConfig = {
  integrationKey: string;
  userId: string;
  accountId: string;
  privateKeyPem: string;
  apiBaseUrl: string;
  authBaseUrl: string;
};

type PrivateKeyFormat = "pkcs1" | "pkcs8";

type ArchivedDocument = {
  bucket: string;
  storagePath: string;
  fileName: string;
  contentType: string;
  size: number;
  sha256: string;
  storedAt: string;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-docusign-signature-1, x-authorization-digest",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const statusRank: Record<RetainerStatus, number> = {
  unknown: 0,
  sent: 1,
  viewed: 2,
  signed: 3,
  declined: 4,
  voided: 4,
};

const DOCUSIGN_AUTH_BASE_URL = "https://account.docusign.com";
const RETAINER_DOCUMENT_BUCKET = "retainer-agreements";
const SIGNED_RETAINER_FILE_NAME = "Signed-Retainer.pdf";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getRequiredEnv(name: string) {
  const value = Deno.env.get(name)?.trim() || "";
  if (!value) {
    throw new Error(`${name} is missing`);
  }

  return value;
}

function normalizeApiBaseUrl(rawValue: string) {
  let parsed: URL;
  try {
    parsed = new URL(rawValue);
  } catch {
    throw new Error("DOCUSIGN_API_BASE_URL must be a valid https URL");
  }

  if (parsed.protocol !== "https:") {
    throw new Error("DOCUSIGN_API_BASE_URL must use https");
  }

  if (parsed.pathname && parsed.pathname !== "/") {
    throw new Error("DOCUSIGN_API_BASE_URL must not include a path such as /restapi");
  }

  if (parsed.search || parsed.hash) {
    throw new Error("DOCUSIGN_API_BASE_URL must not include query params or fragments");
  }

  const hostname = parsed.hostname.toLowerCase();
  if (hostname === "account.docusign.com" || hostname === "account-d.docusign.com") {
    throw new Error("DOCUSIGN_API_BASE_URL must point to your eSignature base URI, not the DocuSign OAuth host");
  }

  return parsed.origin;
}

function getDocusignConfig(): DocusignConfig {
  return {
    integrationKey: getRequiredEnv("DOCUSIGN_INTEGRATION_KEY"),
    userId: getRequiredEnv("DOCUSIGN_USER_ID"),
    accountId: getRequiredEnv("DOCUSIGN_ACCOUNT_ID"),
    privateKeyPem: getRequiredEnv("DOCUSIGN_PRIVATE_KEY_PEM"),
    apiBaseUrl: normalizeApiBaseUrl(getRequiredEnv("DOCUSIGN_API_BASE_URL")),
    authBaseUrl: DOCUSIGN_AUTH_BASE_URL,
  };
}

function concatBytes(...arrays: Uint8Array[]) {
  const totalLength = arrays.reduce((sum, array) => sum + array.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;

  for (const array of arrays) {
    result.set(array, offset);
    offset += array.length;
  }

  return result;
}

function encodeDerLength(length: number): Uint8Array {
  if (!Number.isInteger(length) || length < 0) {
    throw new Error("Invalid DER length");
  }

  if (length < 0x80) {
    return Uint8Array.of(length);
  }

  const bytes: number[] = [];
  let remaining = length;

  while (remaining > 0) {
    bytes.unshift(remaining & 0xff);
    remaining >>= 8;
  }

  return Uint8Array.of(0x80 | bytes.length, ...bytes);
}

function readDerElement(bytes: Uint8Array, offset: number) {
  const tag = bytes[offset];
  if (tag === undefined) {
    throw new Error("Invalid DER: missing tag");
  }

  const firstLengthByte = bytes[offset + 1];
  if (firstLengthByte === undefined) {
    throw new Error("Invalid DER: missing length");
  }

  let length = 0;
  let lengthBytesRead = 1;

  if ((firstLengthByte & 0x80) === 0) {
    length = firstLengthByte;
  } else {
    const lengthByteCount = firstLengthByte & 0x7f;
    if (lengthByteCount === 0 || lengthByteCount > 4) {
      throw new Error("Invalid DER: unsupported length encoding");
    }

    if (offset + 1 + lengthByteCount >= bytes.length) {
      throw new Error("Invalid DER: truncated length");
    }

    lengthBytesRead += lengthByteCount;
    for (let i = 0; i < lengthByteCount; i += 1) {
      length = (length << 8) | bytes[offset + 2 + i];
    }
  }

  const valueOffset = offset + 1 + lengthBytesRead;
  const nextOffset = valueOffset + length;

  if (nextOffset > bytes.length) {
    throw new Error("Invalid DER: element overruns buffer");
  }

  return {
    tag,
    length,
    valueOffset,
    nextOffset,
  };
}

function detectPrivateKeyFormat(derBytes: Uint8Array): PrivateKeyFormat {
  const outerSequence = readDerElement(derBytes, 0);
  if (outerSequence.tag !== 0x30) {
    throw new Error("Invalid private key DER: expected SEQUENCE");
  }

  const version = readDerElement(derBytes, outerSequence.valueOffset);
  if (version.tag !== 0x02) {
    throw new Error("Invalid private key DER: expected version INTEGER");
  }

  const nextElement = readDerElement(derBytes, version.nextOffset);
  if (nextElement.tag === 0x30) {
    return "pkcs8";
  }

  if (nextElement.tag === 0x02) {
    return "pkcs1";
  }

  throw new Error("Unsupported private key DER structure");
}

function wrapPkcs1PrivateKey(pkcs1Bytes: Uint8Array): Uint8Array {
  const version = Uint8Array.of(0x02, 0x01, 0x00);
  const rsaEncryptionAlgorithmIdentifier = Uint8Array.of(
    0x30,
    0x0d,
    0x06,
    0x09,
    0x2a,
    0x86,
    0x48,
    0x86,
    0xf7,
    0x0d,
    0x01,
    0x01,
    0x01,
    0x05,
    0x00,
  );
  const privateKeyOctetString = concatBytes(
    Uint8Array.of(0x04),
    encodeDerLength(pkcs1Bytes.length),
    pkcs1Bytes,
  );
  const pkcs8Body = concatBytes(version, rsaEncryptionAlgorithmIdentifier, privateKeyOctetString);

  return concatBytes(Uint8Array.of(0x30), encodeDerLength(pkcs8Body.length), pkcs8Body);
}

function getPrivateKeyBytes(privateKeyPem: string): Uint8Array {
  const raw = privateKeyPem.trim();
  if (!raw) throw new Error("DOCUSIGN_PRIVATE_KEY_PEM is missing");

  const normalized = raw.includes("\\n") ? raw.replace(/\\n/g, "\n") : raw;
  if (normalized.includes("-----BEGIN ENCRYPTED PRIVATE KEY-----")) {
    throw new Error("DOCUSIGN_PRIVATE_KEY_PEM must be an unencrypted private key");
  }

  const declaredFormat: PrivateKeyFormat | null = normalized.includes("-----BEGIN RSA PRIVATE KEY-----")
    ? "pkcs1"
    : normalized.includes("-----BEGIN PRIVATE KEY-----")
      ? "pkcs8"
      : null;
  const base64Key = normalized
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/-----BEGIN RSA PRIVATE KEY-----/g, "")
    .replace(/-----END RSA PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");

  if (!base64Key) {
    throw new Error("DOCUSIGN_PRIVATE_KEY_PEM had no base64 content after stripping headers");
  }

  const derBytes = Uint8Array.from(atob(base64Key), (char) => char.charCodeAt(0));
  const detectedFormat = declaredFormat ?? detectPrivateKeyFormat(derBytes);

  return detectedFormat === "pkcs1" ? wrapPkcs1PrivateKey(derBytes) : derBytes;
}

function base64UrlEncode(input: string | Uint8Array) {
  return btoa(typeof input === "string" ? input : String.fromCharCode(...input))
    .replace(/=+$/, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function normalizeStatus(value: unknown): RetainerStatus {
  const raw = String(value ?? "").trim().toLowerCase();

  if (raw.includes("void")) return "voided";
  if (raw.includes("declin")) return "declined";
  if (raw.includes("complete") || raw.includes("sign")) return "signed";
  if (raw.includes("deliver") || raw.includes("view") || raw.includes("open")) return "viewed";
  if (raw.includes("sent")) return "sent";

  return "unknown";
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    const normalized = getString(value);
    if (normalized) return normalized;
  }

  return null;
}

function getNestedRecord(root: Record<string, unknown>, key: string) {
  const value = root[key];
  return isRecord(value) ? value : {};
}

function collectRecipients(root: Record<string, unknown>) {
  const recipientsRoot = getNestedRecord(root, "recipients");
  const collections = ["signers", "inPersonSigners", "intermediaries"];
  const recipients: Record<string, unknown>[] = [];

  for (const collectionName of collections) {
    const collection = recipientsRoot[collectionName];
    if (!Array.isArray(collection)) continue;

    for (const recipient of collection) {
      if (isRecord(recipient)) recipients.push(recipient);
    }
  }

  return recipients;
}

function collectTextCustomFields(...roots: Record<string, unknown>[]) {
  const fields = new Map<string, string>();

  for (const root of roots) {
    const customFields = getNestedRecord(root, "customFields");
    const textCustomFields = customFields.textCustomFields;
    if (!Array.isArray(textCustomFields)) continue;

    for (const field of textCustomFields) {
      if (!isRecord(field)) continue;
      const name = firstString(field.name, field.Name);
      const value = firstString(field.value, field.Value);
      if (!name || !value) continue;

      fields.set(name.trim().toLowerCase(), value);
    }
  }

  return fields;
}

function earliestDate(values: Array<string | null | undefined>) {
  const dates = values
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => new Date(left).getTime() - new Date(right).getTime());

  return dates[0] ?? null;
}

function latestDate(values: Array<string | null | undefined>) {
  const dates = values
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => new Date(right).getTime() - new Date(left).getTime());

  return dates[0] ?? null;
}

function getEventAt(args: {
  payload: Record<string, unknown>;
  data: Record<string, unknown>;
  envelopeSummary: Record<string, unknown>;
}) {
  return firstString(
    args.payload.generatedDateTime,
    args.payload.eventDateTime,
    args.payload.createdDateTime,
    args.data.generatedDateTime,
    args.data.eventDateTime,
    args.data.statusChangedDateTime,
    args.envelopeSummary.statusChangedDateTime,
    args.envelopeSummary.lastModifiedDateTime,
    args.envelopeSummary.createdDateTime,
  );
}

function parseConnectPayload(rawBody: string): ParsedConnectPayload {
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    throw new Error("Invalid JSON payload");
  }

  if (!isRecord(payload)) {
    throw new Error("Invalid Connect payload");
  }

  const data = getNestedRecord(payload, "data");
  const envelopeSummary = getNestedRecord(data, "envelopeSummary");
  const recipients = collectRecipients(envelopeSummary).concat(collectRecipients(data));
  const customFields = collectTextCustomFields(envelopeSummary, data, payload);
  const eventType = firstString(payload.event, payload.eventType, payload.name) ?? "unknown";
  const eventAt = getEventAt({ payload, data, envelopeSummary });
  const envelopeId = firstString(
    data.envelopeId,
    envelopeSummary.envelopeId,
    payload.envelopeId,
    payload.EnvelopeID,
  );

  if (!envelopeId) {
    throw new Error("Connect payload is missing envelopeId");
  }

  const envelopeStatus = normalizeStatus(
    firstString(envelopeSummary.status, data.status, payload.status) ?? eventType,
  );
  const recipientStatus = recipients.reduce<RetainerStatus>((current, recipient) => {
    const next = normalizeStatus(recipient.status);
    return statusRank[next] > statusRank[current] ? next : current;
  }, "unknown");
  const eventStatus = normalizeStatus(eventType);
  const status = [envelopeStatus, recipientStatus, eventStatus].reduce<RetainerStatus>(
    (current, next) => (statusRank[next] > statusRank[current] ? next : current),
    "unknown",
  );

  const sentAt = firstString(envelopeSummary.sentDateTime, data.sentDateTime) ??
    earliestDate(recipients.map((recipient) => firstString(recipient.sentDateTime)));
  const viewedAt = firstString(envelopeSummary.deliveredDateTime, data.deliveredDateTime) ??
    earliestDate(
      recipients.flatMap((recipient) => [
        firstString(recipient.deliveredDateTime),
        firstString(recipient.completedDateTime),
        firstString(recipient.signedDateTime),
      ]),
    ) ??
    (status === "viewed" ? eventAt : null);
  const signedAt = firstString(envelopeSummary.completedDateTime, data.completedDateTime) ??
    latestDate(
      recipients.flatMap((recipient) => [
        firstString(recipient.completedDateTime),
        firstString(recipient.signedDateTime),
      ]),
    ) ??
    (status === "signed" ? eventAt : null);
  const declinedAt =
    status === "declined"
      ? firstString(envelopeSummary.declinedDateTime, data.declinedDateTime) ?? eventAt
      : null;
  const voidedAt =
    status === "voided"
      ? firstString(envelopeSummary.voidedDateTime, data.voidedDateTime) ?? eventAt
      : null;

  return {
    envelopeId,
    submissionId: customFields.get("submission_id") ?? null,
    leadId: customFields.get("lead_id") ?? null,
    eventType,
    eventAt,
    status,
    sentAt,
    viewedAt,
    signedAt,
    declinedAt,
    voidedAt,
    payload,
  };
}

function base64Encode(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function timingSafeEqual(left: string, right: string) {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  const maxLength = Math.max(leftBytes.length, rightBytes.length);
  let diff = leftBytes.length ^ rightBytes.length;

  for (let index = 0; index < maxLength; index += 1) {
    diff |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }

  return diff === 0;
}

async function computeHmacBase64(secret: string, payload: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));

  return base64Encode(new Uint8Array(signature));
}

async function createJwt(config: DocusignConfig): Promise<string> {
  const header = { alg: "RS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: config.integrationKey,
    sub: config.userId,
    aud: config.authBaseUrl.replace(/^https?:\/\//, ""),
    scope: "signature impersonation",
    iat: now,
    exp: now + 3600,
  };

  const data = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(payload))}`;
  const keyBytes = getPrivateKeyBytes(config.privateKeyPem);
  const key = await crypto.subtle.importKey(
    "pkcs8",
    keyBytes,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(data));

  return `${data}.${base64UrlEncode(new Uint8Array(signature))}`;
}

async function getAccessToken(config: DocusignConfig) {
  const assertion = await createJwt(config);
  const res = await fetch(`${config.authBaseUrl}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed: ${text}`);
  }

  const json = await res.json();
  return json.access_token as string;
}

async function fetchSignedRetainerDocument(envelopeId: string) {
  const config = getDocusignConfig();
  const accessToken = await getAccessToken(config);
  const baseUrl = `${config.apiBaseUrl}/restapi/v2.1/accounts/${config.accountId}`;
  const documentRes = await fetch(`${baseUrl}/envelopes/${envelopeId}/documents/combined`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!documentRes.ok) {
    const body = await documentRes.text();
    throw new Error(`Failed to download signed DocuSign document: ${body}`);
  }

  const contentType = documentRes.headers.get("Content-Type") || "application/pdf";
  const buffer = await documentRes.arrayBuffer();

  return {
    buffer,
    contentType,
  };
}

function sanitizeStorageSegment(value: string | null | undefined) {
  const cleaned = String(value || "")
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return cleaned || "unlinked";
}

function sanitizePdfFileName(value: string | null | undefined) {
  const withoutExtension = String(value || "")
    .trim()
    .replace(/\.pdf$/i, "")
    .replace(/[\\/:*?"<>|\x00-\x1f]+/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^-+|-+$/g, "")
    .trim();

  return `${withoutExtension || "Signed-Retainer"}.pdf`;
}

function stripPdfExtension(value: string | null | undefined) {
  return String(value || "")
    .trim()
    .replace(/\.pdf$/i, "")
    .trim();
}

function buildSignedRetainerFileName(args: {
  templateName: string | null;
  leadName: string | null;
}) {
  const templateName = stripPdfExtension(args.templateName) || "Signed-Retainer";
  const leadName = stripPdfExtension(args.leadName);
  const nameParts = leadName ? [templateName, leadName] : [templateName];

  return sanitizePdfFileName(nameParts.join(" - "));
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    .test(value);
}

async function sha256Hex(buffer: ArrayBuffer) {
  const hash = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function resolveSignedRetainerTemplateName(args: {
  supabase: ReturnType<typeof createClient>;
  templateId: string | null | undefined;
}) {
  const templateId = String(args.templateId || "").trim();
  if (!templateId) return null;

  const { data, error } = await args.supabase
    .from("docusign_template_mappings")
    .select("template_name")
    .eq("template_id", templateId)
    .eq("is_active", true)
    .order("is_default", { ascending: false })
    .order("priority", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[docusign-connect-webhook] Template name lookup failed", error);
    return null;
  }

  return getString((data as { template_name?: string | null } | null)?.template_name);
}

async function resolveLeadFullName(args: {
  supabase: ReturnType<typeof createClient>;
  leadId: string | null | undefined;
  submissionId: string | null | undefined;
}) {
  const leadId = String(args.leadId || "").trim();
  const submissionId = String(args.submissionId || "").trim();

  if (leadId && isUuid(leadId)) {
    const { data, error } = await args.supabase
      .from("leads")
      .select("customer_full_name")
      .eq("id", leadId)
      .maybeSingle();

    if (error) {
      console.error("[docusign-connect-webhook] Lead name lookup by lead_id failed", error);
    } else {
      const leadName = getString((data as { customer_full_name?: string | null } | null)?.customer_full_name);
      if (leadName) return leadName;
    }
  }

  if (!submissionId) return null;

  const { data, error } = await args.supabase
    .from("leads")
    .select("customer_full_name")
    .eq("submission_id", submissionId)
    .maybeSingle();

  if (error) {
    console.error("[docusign-connect-webhook] Lead name lookup by submission_id failed", error);
    return null;
  }

  return getString((data as { customer_full_name?: string | null } | null)?.customer_full_name);
}

async function resolveSignedRetainerFileName(args: {
  supabase: ReturnType<typeof createClient>;
  templateId: string | null | undefined;
  leadId: string | null | undefined;
  submissionId: string | null | undefined;
}) {
  const [templateName, leadName] = await Promise.all([
    resolveSignedRetainerTemplateName({
      supabase: args.supabase,
      templateId: args.templateId,
    }),
    resolveLeadFullName({
      supabase: args.supabase,
      leadId: args.leadId,
      submissionId: args.submissionId,
    }),
  ]);

  return buildSignedRetainerFileName({ templateName, leadName });
}

async function archiveSignedRetainerDocument(args: {
  supabase: ReturnType<typeof createClient>;
  envelopeId: string;
  submissionId: string | null;
  fileName: string;
}): Promise<ArchivedDocument> {
  const document = await fetchSignedRetainerDocument(args.envelopeId);
  const fileName = sanitizePdfFileName(args.fileName);
  const storagePath = `${sanitizeStorageSegment(args.submissionId)}/${sanitizeStorageSegment(args.envelopeId)}/${fileName}`;
  const contentType = document.contentType || "application/pdf";
  const blob = new Blob([document.buffer], { type: contentType });
  const { error } = await args.supabase.storage
    .from(RETAINER_DOCUMENT_BUCKET)
    .upload(storagePath, blob, {
      contentType,
      upsert: true,
    });

  if (error) {
    throw new Error(error.message || "Failed to archive signed retainer");
  }

  return {
    bucket: RETAINER_DOCUMENT_BUCKET,
    storagePath,
    fileName,
    contentType,
    size: document.buffer.byteLength,
    sha256: await sha256Hex(document.buffer),
    storedAt: new Date().toISOString(),
  };
}

async function verifyRequest(req: Request, rawBody: string) {
  const hmacSecret = Deno.env.get("DOCUSIGN_CONNECT_HMAC_SECRET")?.trim() || "";
  const sharedSecret = Deno.env.get("DOCUSIGN_CONNECT_SHARED_SECRET")?.trim() || "";
  const requestUrl = new URL(req.url);

  if (hmacSecret) {
    const providedSignature = req.headers.get("x-docusign-signature-1")?.trim() || "";
    if (!providedSignature) return false;

    const expectedSignature = await computeHmacBase64(hmacSecret, rawBody);
    return timingSafeEqual(expectedSignature, providedSignature);
  }

  if (sharedSecret) {
    return requestUrl.searchParams.get("secret") === sharedSecret;
  }

  console.error("[docusign-connect-webhook] Missing DOCUSIGN_CONNECT_HMAC_SECRET or DOCUSIGN_CONNECT_SHARED_SECRET");
  return false;
}

function mergeStatus(existing: ExistingAgreement | null, incoming: ParsedConnectPayload) {
  if (!existing) return incoming.status;

  if (statusRank[incoming.status] >= statusRank[existing.status]) {
    return incoming.status;
  }

  return existing.status;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
  }

  const rawBody = await req.text();
  const isVerified = await verifyRequest(req, rawBody);
  if (!isVerified) {
    return new Response("Unauthorized", { status: 401, headers: corsHeaders });
  }

  let parsed: ParsedConnectPayload;
  try {
    parsed = parseConnectPayload(rawBody);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid Connect payload";
    console.error("[docusign-connect-webhook] Payload parse failed", message);
    return new Response(message, { status: 400, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: existing, error: existingError } = await supabase
    .from("retainer_agreements")
    .select("id,status,submission_id,lead_id,template_id,sent_at,viewed_at,signed_at,declined_at,voided_at,document_bucket,document_storage_path,document_file_name,document_content_type,document_size,document_sha256,document_stored_at")
    .eq("envelope_id", parsed.envelopeId)
    .maybeSingle();

  if (existingError) {
    console.error("[docusign-connect-webhook] Existing agreement lookup failed", existingError);
    return new Response("Database lookup failed", { status: 500, headers: corsHeaders });
  }

  const existingAgreement = (existing ?? null) as ExistingAgreement | null;
  const now = new Date().toISOString();
  const submissionId = existingAgreement?.submission_id ?? parsed.submissionId;
  const leadId = existingAgreement?.lead_id ?? parsed.leadId;
  let archivedDocument: ArchivedDocument | null = null;
  let archiveError: unknown = null;

  if (parsed.status === "signed" && !existingAgreement?.document_storage_path) {
    try {
      const fileName = await resolveSignedRetainerFileName({
        supabase,
        templateId: existingAgreement?.template_id,
        leadId,
        submissionId,
      });
      archivedDocument = await archiveSignedRetainerDocument({
        supabase,
        envelopeId: parsed.envelopeId,
        submissionId,
        fileName,
      });
    } catch (error) {
      archiveError = error;
      console.error("[docusign-connect-webhook] Signed document archive failed", error);
    }
  }

  const upsertPayload = {
    envelope_id: parsed.envelopeId,
    submission_id: submissionId,
    lead_id: leadId,
    status: mergeStatus(existingAgreement, parsed),
    sent_at: existingAgreement?.sent_at ?? parsed.sentAt,
    viewed_at: existingAgreement?.viewed_at ?? parsed.viewedAt,
    signed_at: existingAgreement?.signed_at ?? parsed.signedAt,
    declined_at: existingAgreement?.declined_at ?? parsed.declinedAt,
    voided_at: existingAgreement?.voided_at ?? parsed.voidedAt,
    last_event: parsed.eventType,
    last_event_at: parsed.eventAt,
    last_synced_at: now,
    document_bucket: existingAgreement?.document_bucket ?? archivedDocument?.bucket ?? null,
    document_storage_path: existingAgreement?.document_storage_path ?? archivedDocument?.storagePath ?? null,
    document_file_name: existingAgreement?.document_file_name ?? archivedDocument?.fileName ?? null,
    document_content_type: existingAgreement?.document_content_type ?? archivedDocument?.contentType ?? null,
    document_size: existingAgreement?.document_size ?? archivedDocument?.size ?? null,
    document_sha256: existingAgreement?.document_sha256 ?? archivedDocument?.sha256 ?? null,
    document_stored_at: existingAgreement?.document_stored_at ?? archivedDocument?.storedAt ?? null,
    raw_last_event: parsed.payload,
  };

  const { data: agreement, error: upsertError } = await supabase
    .from("retainer_agreements")
    .upsert(upsertPayload, { onConflict: "envelope_id" })
    .select("id")
    .single();

  if (upsertError) {
    console.error("[docusign-connect-webhook] Agreement upsert failed", upsertError);
    return new Response("Database update failed", { status: 500, headers: corsHeaders });
  }

  const { error: eventError } = await supabase.from("retainer_agreement_events").insert({
    retainer_agreement_id: agreement?.id ?? null,
    envelope_id: parsed.envelopeId,
    event_type: parsed.eventType,
    event_at: parsed.eventAt,
    payload: parsed.payload,
  });

  if (eventError) {
    console.error("[docusign-connect-webhook] Event insert failed", eventError);
  }

  if (archiveError) {
    return new Response("Signed document archive failed", { status: 500, headers: corsHeaders });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
