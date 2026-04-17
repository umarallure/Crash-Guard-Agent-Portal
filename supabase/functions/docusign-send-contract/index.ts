import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

type ContractDeliveryMethod = "email" | "sms_only";

type SendTemplateRequest = {
  submissionId?: string;
  recipientEmail?: string;
  recipientPhone?: string;
  recipientPhoneCountryCode?: string;
  recipientName?: string;
  accidentDate?: string;
  accidentAddress?: string;
  templateId?: string;
  deliveryMethod?: ContractDeliveryMethod;
  debug?: boolean;
};

type TemplateRole = {
  roleName: string;
  name: string;
  email?: string;
  deliveryMethod?: "SMS";
  phoneNumber?: {
    countryCode: string;
    number: string;
  };
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DOCUSIGN_AUTH_BASE_URL = "https://account.docusign.com";
const DEFAULT_PHONE_COUNTRY_CODE = "1";
const TEMPLATE_ROLE_NAME = "Client";
const DEFAULT_ENVELOPE_SUBJECT = "Retainer agreement ready for signature";
const DEFAULT_ENVELOPE_BLURB =
  "Please review and sign your retainer agreement using the secure DocuSign link.";

type DocusignConfig = {
  integrationKey: string;
  userId: string;
  accountId: string;
  privateKeyPem: string;
  apiBaseUrl: string;
  authBaseUrl: string;
};

type PrivateKeyFormat = "pkcs1" | "pkcs8";

function logInfo(msg: string, data?: unknown) {
  console.log(`[INFO] ${msg}`, data ?? "");
}

function logError(msg: string, data?: unknown) {
  console.error(`[ERROR] ${msg}`, data ?? "");
}

function base64UrlEncode(input: string | Uint8Array) {
  return btoa(typeof input === "string" ? input : String.fromCharCode(...input))
    .replace(/=+$/, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
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

function asTrimmedString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function resolveDeliveryMethod(
  rawDeliveryMethod: unknown,
  recipientEmail: string,
  recipientPhone: string,
): ContractDeliveryMethod {
  if (rawDeliveryMethod === "sms_only") return "sms_only";
  if (!recipientEmail && recipientPhone) return "sms_only";
  return "email";
}

function normalizeCountryCode(value: unknown) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits || DEFAULT_PHONE_COUNTRY_CODE;
}

function normalizePhoneNumber(value: unknown, countryCode: string) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return "";

  if (countryCode === "1" && digits.length === 11 && digits.startsWith("1")) {
    return digits.slice(1);
  }

  return digits;
}

function maskEmail(value: string) {
  const [localPart = "", domainPart = ""] = value.split("@");
  const visibleLocal = localPart.slice(0, 2);
  return `${visibleLocal}${localPart.length > 2 ? "***" : ""}@${domainPart || "***"}`;
}

function maskPhone(value: string) {
  if (value.length <= 4) return value;
  return `${"*".repeat(Math.max(0, value.length - 4))}${value.slice(-4)}`;
}

function normalizeTabLookupKey(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
}

function buildTemplateRole(args: {
  deliveryMethod: ContractDeliveryMethod;
  recipientEmail: string;
  recipientName: string;
  recipientPhone: string;
  recipientPhoneCountryCode: string;
}): TemplateRole {
  const {
    deliveryMethod,
    recipientEmail,
    recipientName,
    recipientPhone,
    recipientPhoneCountryCode,
  } = args;

  if (deliveryMethod === "sms_only") {
    return {
      roleName: TEMPLATE_ROLE_NAME,
      name: recipientName,
      deliveryMethod: "SMS",
      phoneNumber: {
        countryCode: recipientPhoneCountryCode,
        number: recipientPhone,
      },
    };
  }

  return {
    roleName: TEMPLATE_ROLE_NAME,
    name: recipientName,
    email: recipientEmail,
  };
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
  let key: CryptoKey;

  try {
    key = await crypto.subtle.importKey(
      "pkcs8",
      keyBytes,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"],
    );
  } catch (error) {
    logError("Failed to import DocuSign private key", error);
    throw new Error(
      "DOCUSIGN_PRIVATE_KEY_PEM could not be parsed. Use an unencrypted BEGIN PRIVATE KEY or BEGIN RSA PRIVATE KEY value.",
    );
  }

  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(data));
  return `${data}.${base64UrlEncode(new Uint8Array(signature))}`;
}

function getPublicErrorMessage(error: unknown) {
  if (!(error instanceof Error)) {
    return "Internal error";
  }

  const message = error.message || "Internal error";
  if (
    message.startsWith("DOCUSIGN_") ||
    message.startsWith("Token exchange failed:") ||
    message.includes("private key") ||
    message.includes("eSignature base URI")
  ) {
    return message;
  }

  return "Internal error";
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
    logError("Token exchange failed", text);
    throw new Error(`Token exchange failed: ${text}`);
  }

  const json = await res.json();
  logInfo("Token obtained");
  return json.access_token as string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
  }

  let body: SendTemplateRequest;
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400, headers: corsHeaders });
  }

  const templateId = asTrimmedString(body.templateId);
  const recipientEmail = asTrimmedString(body.recipientEmail);
  const recipientName = asTrimmedString(body.recipientName) || "Signer";
  const accidentDate = asTrimmedString(body.accidentDate);
  const accidentAddress = asTrimmedString(body.accidentAddress);
  const recipientPhoneCountryCode = normalizeCountryCode(body.recipientPhoneCountryCode);
  const recipientPhone = normalizePhoneNumber(body.recipientPhone, recipientPhoneCountryCode);
  const deliveryMethod = resolveDeliveryMethod(body.deliveryMethod, recipientEmail, recipientPhone);
  const debug = body.debug === true;

  if (!templateId) {
    return new Response("templateId is required", { status: 400, headers: corsHeaders });
  }

  if (!debug) {
    if (deliveryMethod === "email" && !recipientEmail) {
      return new Response("recipientEmail is required for email delivery", {
        status: 400,
        headers: corsHeaders,
      });
    }

    if (deliveryMethod === "sms_only" && !recipientPhone) {
      return new Response("recipientPhone is required for text delivery", {
        status: 400,
        headers: corsHeaders,
      });
    }
  }

  try {
    const config = getDocusignConfig();
    const accessToken = await getAccessToken(config);
    const baseUrl = `${config.apiBaseUrl}/restapi/v2.1/accounts/${config.accountId}`;
    const authHeaders = {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    };

    if (debug) {
      logInfo("Debug mode: fetching template", { templateId });
      const templateRes = await fetch(`${baseUrl}/templates/${templateId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const templateData = await templateRes.text();
      return new Response(templateData, {
        status: templateRes.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    logInfo("Starting docusign-send-contract", {
      deliveryMethod,
      templateId,
      recipientName,
      recipientEmail: recipientEmail ? maskEmail(recipientEmail) : undefined,
      recipientPhone: recipientPhone ? maskPhone(recipientPhone) : undefined,
    });

    const createPayload = {
      templateId,
      emailSubject: DEFAULT_ENVELOPE_SUBJECT,
      emailBlurb: DEFAULT_ENVELOPE_BLURB,
      templateRoles: [
        buildTemplateRole({
          deliveryMethod,
          recipientEmail,
          recipientName,
          recipientPhone,
          recipientPhoneCountryCode,
        }),
      ],
      status: "created",
    };

    logInfo("Step 1 - Creating draft envelope", {
      templateId,
      deliveryMethod,
      templateRoleName: TEMPLATE_ROLE_NAME,
      emailSubject: DEFAULT_ENVELOPE_SUBJECT,
    });

    const createRes = await fetch(`${baseUrl}/envelopes`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify(createPayload),
    });
    const createText = await createRes.text();
    logInfo("Step 1 - Response", createText);

    if (!createRes.ok) {
      return new Response(createText, { status: createRes.status, headers: corsHeaders });
    }

    const { envelopeId } = JSON.parse(createText);
    logInfo("Draft envelope created", { envelopeId });

    logInfo("Step 2a - Reading document tabs");

    const getTabsRes = await fetch(`${baseUrl}/envelopes/${envelopeId}/documents/1/tabs`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const tabsData = await getTabsRes.json();
    logInfo("Step 2a - Current tabs", JSON.stringify(tabsData));

    const prefillTextTabs = tabsData?.prefillTabs?.textTabs || [];

    if (prefillTextTabs.length > 0) {
      const valuesToSet = new Map<string, string>([
        ["recipientname", recipientName],
        ["clientname", recipientName],
        ["fullname", recipientName],
        ["accidentdate", accidentDate],
        ["dateofaccident", accidentDate],
        ["accidentaddress", accidentAddress],
        ["accidentlocation", accidentAddress],
      ]);

      const updatedTabs = prefillTextTabs.map((tab: Record<string, unknown>) => {
        const lookupKeys = [
          normalizeTabLookupKey(tab.tabLabel),
          normalizeTabLookupKey(tab.dataLabel),
          normalizeTabLookupKey(tab.name),
        ].filter(Boolean);

        for (const key of lookupKeys) {
          const matchedValue = valuesToSet.get(key);
          if (matchedValue !== undefined) {
            return { ...tab, value: matchedValue };
          }
        }

        return tab;
      });

      const updateTabsPayload = {
        prefillTabs: {
          textTabs: updatedTabs,
        },
      };

      logInfo("Step 2b - Updating prefill tabs", JSON.stringify(updateTabsPayload));

      const updateTabsRes = await fetch(`${baseUrl}/envelopes/${envelopeId}/documents/1/tabs`, {
        method: "PUT",
        headers: authHeaders,
        body: JSON.stringify(updateTabsPayload),
      });
      const updateTabsText = await updateTabsRes.text();
      logInfo("Step 2b - Update response", updateTabsText);

      if (!updateTabsRes.ok) {
        logError("Failed to update prefill tabs", updateTabsText);
        return new Response(updateTabsText, { status: updateTabsRes.status, headers: corsHeaders });
      }
    } else {
      logInfo("Step 2 - No prefill tabs found, skipping update");
    }

    logInfo("Step 3 - Sending envelope", { envelopeId, deliveryMethod });

    const sendRes = await fetch(`${baseUrl}/envelopes/${envelopeId}`, {
      method: "PUT",
      headers: authHeaders,
      body: JSON.stringify({ status: "sent" }),
    });
    const sendText = await sendRes.text();
    logInfo("Step 3 - Send response", sendText);

    if (!sendRes.ok) {
      logError("Failed to send envelope", sendText);
      return new Response(sendText, { status: sendRes.status, headers: corsHeaders });
    }

    const result = JSON.stringify({ envelopeId, status: "sent", deliveryMethod });
    return new Response(result, {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    logError("Unexpected error", error);
    return new Response(getPublicErrorMessage(error), { status: 500, headers: corsHeaders });
  }
});
