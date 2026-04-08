import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const jsonHeaders = {
  ...corsHeaders,
  "Content-Type": "application/json",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const REALVALIDITO_API_KEY = Deno.env.get("REALVALIDITO_API_KEY") ?? "";
const REALVALIDITO_API_SECRET = Deno.env.get("REALVALIDITO_API_SECRET") ?? "";
const BLACKLIST_ALLIANCE_API_KEY = Deno.env.get("BLACKLIST_ALLIANCE_API_KEY") ?? "";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RealValiditoData = {
  cleaned_number?: string[];
  tcpa_litigator?: string[];
  federal_dnc?: string[];
  state_dnc?: string[];
  national_dnc?: string[];
  dnc?: string[];
  dnc_number?: string[];
  invalid?: string[];
};

type RealValiditoResponse = {
  status?: string;
  data?: RealValiditoData;
  error?: {
    error_code?: number;
    message?: string;
  };
};

type BlacklistAllianceResponse = {
  sid?: string;
  status?: string;
  message?: string; // "Blacklisted" | "Good" | "Suppressed" | "FederalDNC" | "StateDNC"
  code?: string; // comma-separated: "screamer,plaintiff-primary,prelitigation2"
  phone?: string;
  results?: number;
  scrubs?: boolean;
  wireless?: number;
  time?: number;
  carrier?: Record<string, unknown>;
};

type ProviderResult = {
  provider: string;
  isTcpa: boolean;
  isDnc: boolean;
  isInvalid: boolean;
  isClean: boolean;
  matchedLists: string[];
  raw: unknown;
  error?: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: jsonHeaders,
  });

const normalizePhone = (value: unknown) => {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return digits.length === 10 ? digits : "";
};

const maskPhone = (phone: string) => {
  if (!phone) return "unknown";
  return `***-***-${phone.slice(-4)}`;
};

const normalizePhoneList = (value: unknown) => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => normalizePhone(item))
    .filter((item): item is string => Boolean(item));
};

const hasPhoneMatch = (value: unknown, phone: string) => {
  if (!phone) return false;
  return normalizePhoneList(value).includes(phone);
};

// TCPA-related codes from Blacklist Alliance
const TCPA_CODES = new Set([
  "plaintiff-primary",
  "plaintiff-secondary",
  "attorney-primary",
  "attorney-secondary",
  "prelitigation1",
  "prelitigation2",
  "screamer",
  "anti-telemarketing",
]);

// DNC-related codes from Blacklist Alliance
const DNC_CODES = new Set([
  "federal-dnc",
  "colorado-dnc",
  "florida-dnc",
  "indiana-dnc",
  "pennsylvania-dnc",
  "texas-dnc",
  "wyoming-dnc",
]);

// ---------------------------------------------------------------------------
// Provider: RealValidito
// ---------------------------------------------------------------------------

const lookupRealValidito = async (phone: string): Promise<ProviderResult> => {
  const provider = "realvalidito";

  if (!REALVALIDITO_API_KEY || !REALVALIDITO_API_SECRET) {
    return { provider, isTcpa: false, isDnc: false, isInvalid: false, isClean: false, matchedLists: [], raw: null, error: "Missing API credentials" };
  }

  try {
    const response = await fetch("https://app.realvalidito.com/dnclookup/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: REALVALIDITO_API_KEY,
        api_secret: REALVALIDITO_API_SECRET,
        numbers: [phone],
      }),
    });

    const text = await response.text();
    let result: RealValiditoResponse;

    try {
      result = JSON.parse(text) as RealValiditoResponse;
    } catch {
      return { provider, isTcpa: false, isDnc: false, isInvalid: false, isClean: false, matchedLists: [], raw: text, error: `Non-JSON response (HTTP ${response.status})` };
    }

    if (!response.ok || result.status !== "success" || !result.data) {
      return { provider, isTcpa: false, isDnc: false, isInvalid: false, isClean: false, matchedLists: [], raw: result, error: result.error?.message || "Request failed" };
    }

    const { data } = result;
    const isTcpa = hasPhoneMatch(data.tcpa_litigator, phone);
    const isFederalDnc = hasPhoneMatch(data.federal_dnc, phone);
    const isStateDnc = hasPhoneMatch(data.state_dnc, phone);
    const isNationalDnc = hasPhoneMatch(data.national_dnc, phone);
    const isLegacyDnc = hasPhoneMatch(data.dnc, phone) || hasPhoneMatch(data.dnc_number, phone);
    const isDnc = isFederalDnc || isStateDnc || isNationalDnc || isLegacyDnc;
    const isInvalid = hasPhoneMatch(data.invalid, phone);
    const isClean = hasPhoneMatch(data.cleaned_number, phone);

    const matchedLists = [
      ...(isTcpa ? ["tcpa_litigator"] : []),
      ...(isFederalDnc ? ["federal_dnc"] : []),
      ...(isStateDnc ? ["state_dnc"] : []),
      ...(isNationalDnc ? ["national_dnc"] : []),
      ...(isLegacyDnc ? ["legacy_dnc"] : []),
      ...(isInvalid ? ["invalid"] : []),
      ...(isClean ? ["cleaned_number"] : []),
    ];

    return { provider, isTcpa, isDnc, isInvalid, isClean, matchedLists, raw: result };
  } catch (err) {
    return { provider, isTcpa: false, isDnc: false, isInvalid: false, isClean: false, matchedLists: [], raw: null, error: String(err) };
  }
};

// ---------------------------------------------------------------------------
// Provider: Blacklist Alliance
// ---------------------------------------------------------------------------

const lookupBlacklistAlliance = async (phone: string): Promise<ProviderResult> => {
  const provider = "blacklist_alliance";

  if (!BLACKLIST_ALLIANCE_API_KEY) {
    return { provider, isTcpa: false, isDnc: false, isInvalid: false, isClean: false, matchedLists: [], raw: null, error: "Missing API key" };
  }

  try {
    const url = `https://api.blacklistalliance.net/lookup?key=${encodeURIComponent(BLACKLIST_ALLIANCE_API_KEY)}&phone=${encodeURIComponent(phone)}&resp=json`;

    const response = await fetch(url, {
      method: "GET",
      headers: { accept: "application/json" },
    });

    const text = await response.text();
    let result: BlacklistAllianceResponse;

    try {
      result = JSON.parse(text) as BlacklistAllianceResponse;
    } catch {
      return { provider, isTcpa: false, isDnc: false, isInvalid: false, isClean: false, matchedLists: [], raw: text, error: `Non-JSON response (HTTP ${response.status})` };
    }

    if (!response.ok || result.status !== "success") {
      return { provider, isTcpa: false, isDnc: false, isInvalid: false, isClean: false, matchedLists: [], raw: result, error: `Lookup failed: ${result.message ?? "unknown"}` };
    }

    // Parse the comma-separated code field
    const codes = (result.code ?? "")
      .split(",")
      .map((c) => c.trim().toLowerCase())
      .filter(Boolean);

    const isTcpa = codes.some((c) => TCPA_CODES.has(c));
    const isDnc =
      result.message === "FederalDNC" ||
      result.message === "StateDNC" ||
      codes.some((c) => DNC_CODES.has(c));
    const isBlacklisted = result.message === "Blacklisted" || result.scrubs === true;

    const matchedLists = [
      ...(isTcpa ? ["tcpa_litigator"] : []),
      ...(isDnc ? ["dnc"] : []),
      ...(isBlacklisted && !isTcpa && !isDnc ? ["blacklisted"] : []),
    ];

    return {
      provider,
      isTcpa,
      isDnc,
      isInvalid: false, // Blacklist Alliance does not provide invalid phone detection
      isClean: result.message === "Good" && !isBlacklisted,
      matchedLists,
      raw: result,
    };
  } catch (err) {
    return { provider, isTcpa: false, isDnc: false, isInvalid: false, isClean: false, matchedLists: [], raw: null, error: String(err) };
  }
};

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  // At least one provider must be configured
  const hasRealValidito = REALVALIDITO_API_KEY && REALVALIDITO_API_SECRET;
  const hasBlacklistAlliance = !!BLACKLIST_ALLIANCE_API_KEY;

  if (!hasRealValidito && !hasBlacklistAlliance) {
    console.error("DNC lookup: no provider is configured");
    return jsonResponse(
      { callStatus: "ERROR", message: "DNC lookup provider is not configured." },
      500,
    );
  }

  try {
    let payload: unknown;

    try {
      payload = await req.json();
    } catch {
      return jsonResponse(
        { callStatus: "INVALID", message: "Invalid JSON payload provided." },
        400,
      );
    }

    const parsedPayload = payload as Record<string, unknown> | null;
    const mobileNumber = normalizePhone(parsedPayload?.mobileNumber);
    const leadId = typeof parsedPayload?.leadId === "string" ? parsedPayload.leadId : null;

    if (!mobileNumber) {
      return jsonResponse(
        { callStatus: "INVALID", message: "Invalid mobile number format provided." },
        400,
      );
    }

    // ---- Call both providers in parallel ----
    const [rvResult, baResult] = await Promise.all([
      hasRealValidito ? lookupRealValidito(mobileNumber) : null,
      hasBlacklistAlliance ? lookupBlacklistAlliance(mobileNumber) : null,
    ]);

    const providers: ProviderResult[] = [rvResult, baResult].filter(
      (r): r is ProviderResult => r !== null,
    );

    // ---- Cross-validation logic to eliminate false positives ----
    //
    // Blacklist Alliance is treated as the authoritative source.
    //
    // TCPA:
    //   - Blacklist Alliance flags it              -> TCPA (trusted)
    //   - Both providers flag it                   -> TCPA (consensus)
    //   - Only RealValidito flags it               -> NOT flagged (likely false positive)
    //   - Only one provider configured & flags it  -> TCPA (no cross-check available)
    //
    // DNC:
    //   - Same logic as TCPA above.

    const rvTcpa = rvResult?.isTcpa ?? false;
    const baTcpa = baResult?.isTcpa ?? false;
    const rvDnc = rvResult?.isDnc ?? false;
    const baDnc = baResult?.isDnc ?? false;

    // Did Blacklist Alliance actually succeed? An error result is not a "clean" result.
    const baSucceeded = baResult !== null && !baResult.error;

    let isTcpa: boolean;
    let isDnc: boolean;

    if (hasRealValidito && hasBlacklistAlliance && baSucceeded) {
      // Both configured and both responded: only flag if BA confirms
      isTcpa = baTcpa;
      isDnc = baDnc;
    } else {
      // Only one provider available, or BA failed — trust whatever succeeded
      isTcpa = rvTcpa || baTcpa;
      isDnc = rvDnc || baDnc;
    }

    // Invalid: only RealValidito checks this
    const isInvalid = rvResult?.isInvalid ?? false;

    // Clean: both must agree (or sole provider says clean)
    const isClean =
      (rvResult?.isClean ?? true) && (baResult?.isClean ?? true) && !isTcpa && !isDnc && !isInvalid;

    // ---- Determine call status ----
    let callStatus = "SAFE";
    let message = "Number does not appear on the DNC list.";

    if (isTcpa) {
      callStatus = "DANGER";
      message = "Do not call: this number is flagged as a TCPA litigator.";
    } else if (isDnc) {
      callStatus = "WARNING";
      message = "Do not call: this number is on a DNC list.";
    } else if (isInvalid) {
      callStatus = "INVALID";
      message = "This phone number appears to be invalid.";
    }

    // ---- Deactivate lead if TCPA litigator confirmed ----
    let leadDeactivated = false;

    if (isTcpa && leadId && SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
      try {
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
          auth: { autoRefreshToken: false, persistSession: false },
        });

        const { error: updateError } = await supabase
          .from("leads")
          .update({ is_active: false })
          .eq("id", leadId);

        if (updateError) {
          console.error("Failed to deactivate TCPA-flagged lead", {
            leadId,
            phone: maskPhone(mobileNumber),
            error: updateError.message,
          });
        } else {
          leadDeactivated = true;
          console.info("TCPA-flagged lead deactivated", {
            leadId,
            phone: maskPhone(mobileNumber),
          });
        }
      } catch (err) {
        console.error("Error deactivating TCPA-flagged lead", {
          leadId,
          phone: maskPhone(mobileNumber),
          error: String(err),
        });
      }
    }

    // Collect all matched lists across providers
    const matchedLists = [...new Set(providers.flatMap((p) => p.matchedLists))];

    // Log which providers flagged what (masked phone for privacy)
    console.info("DNC lookup completed", {
      phone: maskPhone(mobileNumber),
      callStatus,
      matchedLists,
      providers: providers.map((p) => ({
        provider: p.provider,
        isTcpa: p.isTcpa,
        isDnc: p.isDnc,
        isInvalid: p.isInvalid,
        error: p.error ?? null,
      })),
    });

    return jsonResponse({
      callStatus,
      message,
      flags: {
        isTcpa,
        isDnc,
        isInvalid,
        isClean,
      },
      matchedLists,
      leadDeactivated,
      providers: providers.map((p) => ({
        provider: p.provider,
        isTcpa: p.isTcpa,
        isDnc: p.isDnc,
        isInvalid: p.isInvalid,
        isClean: p.isClean,
        matchedLists: p.matchedLists,
        error: p.error ?? null,
      })),
    });
  } catch (error) {
    console.error("Error during DNC validation process", error);

    return jsonResponse(
      {
        callStatus: "ERROR",
        message: "Internal server error during validation.",
      },
      500,
    );
  }
});
