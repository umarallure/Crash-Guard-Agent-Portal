import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

type ContractDeliveryMethod = "email" | "sms_only";

type SendTemplateRequest = {
  submissionId?: string;
  recipientEmail?: string;
  recipientPhone?: string;
  recipientPhoneCountryCode?: string;
  recipientName?: string;
  accidentDate?: string;
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

const {
  DOCUSIGN_INTEGRATION_KEY,
  DOCUSIGN_USER_ID,
  DOCUSIGN_ACCOUNT_ID,
  DOCUSIGN_PRIVATE_KEY_PEM,
  DOCUSIGN_API_BASE_URL,
  DOCUSIGN_AUTH_BASE_URL: DOCUSIGN_AUTH_BASE_URL_ENV,
} = Deno.env.toObject();

const docusignApiBaseUrl = (DOCUSIGN_API_BASE_URL || "").toLowerCase();
const isDocusignDemoEnvironment =
  docusignApiBaseUrl.includes("demo.") ||
  docusignApiBaseUrl.includes("-d.") ||
  docusignApiBaseUrl.includes("account-d.");

const DOCUSIGN_AUTH_BASE_URL =
  DOCUSIGN_AUTH_BASE_URL_ENV ||
  (isDocusignDemoEnvironment
    ? "https://account-d.docusign.com"
    : "https://account.docusign.com");
const DEFAULT_PHONE_COUNTRY_CODE = "1";
const TEMPLATE_ROLE_NAME = "Client";

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

function getPrivateKeyBytes(): Uint8Array {
  const raw = (DOCUSIGN_PRIVATE_KEY_PEM || "").trim();
  if (!raw) throw new Error("DOCUSIGN_PRIVATE_KEY_PEM is missing");

  const normalized = raw.includes("\\n") ? raw.replace(/\\n/g, "\n") : raw;
  const base64Key = normalized
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/-----BEGIN RSA PRIVATE KEY-----/g, "")
    .replace(/-----END RSA PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");

  if (!base64Key) {
    throw new Error("DOCUSIGN_PRIVATE_KEY_PEM had no base64 content after stripping headers");
  }

  return Uint8Array.from(atob(base64Key), (char) => char.charCodeAt(0));
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

async function createJwt(): Promise<string> {
  const header = { alg: "RS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: DOCUSIGN_INTEGRATION_KEY,
    sub: DOCUSIGN_USER_ID,
    aud: DOCUSIGN_AUTH_BASE_URL.replace(/^https?:\/\//, ""),
    scope: "signature impersonation",
    iat: now,
    exp: now + 3600,
  };

  const data = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(payload))}`;
  const keyBytes = getPrivateKeyBytes();
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

async function getAccessToken() {
  const assertion = await createJwt();
  const res = await fetch(`${DOCUSIGN_AUTH_BASE_URL}/oauth/token`, {
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
    const accessToken = await getAccessToken();
    const baseUrl = `${DOCUSIGN_API_BASE_URL}/restapi/v2.1/accounts/${DOCUSIGN_ACCOUNT_ID}`;
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
      const valuesToSet: Record<string, string> = {
        recipientName,
        accidentDate,
      };

      const updatedTabs = prefillTextTabs.map((tab: Record<string, unknown>) => {
        const label = tab.tabLabel as string;
        if (label in valuesToSet) {
          return { ...tab, value: valuesToSet[label] };
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
    return new Response("Internal error", { status: 500, headers: corsHeaders });
  }
});
