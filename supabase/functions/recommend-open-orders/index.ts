import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type LeadPayload = {
  submission_id?: string | null;
  lead_id?: string | null;

  // Optional overrides while agent is typing
  state?: string | null;
  insured?: boolean | null;
  prior_attorney_involved?: boolean | null;
  currently_represented?: boolean | null;
  is_injured?: boolean | null;
  received_medical_treatment?: boolean | null;
  accident_last_12_months?: boolean | null;
};

type Recommendation = {
  order_id: string;
  lawyer_id: string;
  expires_at: string;
  quota_total: number;
  quota_filled: number;
  remaining: number;
  score: number;
  reasons: string[];
};

type AttorneyProfileRow = {
  id: string;
  user_id: string;
  account_type: string | null;
  licensed_states: string[] | null;
};

const US_STATES = [
  { code: "AL", name: "Alabama" },
  { code: "AK", name: "Alaska" },
  { code: "AZ", name: "Arizona" },
  { code: "AR", name: "Arkansas" },
  { code: "CA", name: "California" },
  { code: "CO", name: "Colorado" },
  { code: "CT", name: "Connecticut" },
  { code: "DE", name: "Delaware" },
  { code: "FL", name: "Florida" },
  { code: "GA", name: "Georgia" },
  { code: "HI", name: "Hawaii" },
  { code: "ID", name: "Idaho" },
  { code: "IL", name: "Illinois" },
  { code: "IN", name: "Indiana" },
  { code: "IA", name: "Iowa" },
  { code: "KS", name: "Kansas" },
  { code: "KY", name: "Kentucky" },
  { code: "LA", name: "Louisiana" },
  { code: "ME", name: "Maine" },
  { code: "MD", name: "Maryland" },
  { code: "MA", name: "Massachusetts" },
  { code: "MI", name: "Michigan" },
  { code: "MN", name: "Minnesota" },
  { code: "MS", name: "Mississippi" },
  { code: "MO", name: "Missouri" },
  { code: "MT", name: "Montana" },
  { code: "NE", name: "Nebraska" },
  { code: "NV", name: "Nevada" },
  { code: "NH", name: "New Hampshire" },
  { code: "NJ", name: "New Jersey" },
  { code: "NM", name: "New Mexico" },
  { code: "NY", name: "New York" },
  { code: "NC", name: "North Carolina" },
  { code: "ND", name: "North Dakota" },
  { code: "OH", name: "Ohio" },
  { code: "OK", name: "Oklahoma" },
  { code: "OR", name: "Oregon" },
  { code: "PA", name: "Pennsylvania" },
  { code: "RI", name: "Rhode Island" },
  { code: "SC", name: "South Carolina" },
  { code: "SD", name: "South Dakota" },
  { code: "TN", name: "Tennessee" },
  { code: "TX", name: "Texas" },
  { code: "UT", name: "Utah" },
  { code: "VT", name: "Vermont" },
  { code: "VA", name: "Virginia" },
  { code: "WA", name: "Washington" },
  { code: "WV", name: "West Virginia" },
  { code: "WI", name: "Wisconsin" },
  { code: "WY", name: "Wyoming" },
] as const;

const STATE_BY_CODE = new Map(US_STATES.map((state) => [state.code, state.code]));
const STATE_BY_NAME = new Map(US_STATES.map((state) => [state.name.toLowerCase(), state.code]));

function toTitleCase(value: string) {
  return value
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizeStateToken(value: unknown): string {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return "";

  const upper = trimmed.toUpperCase();
  const byCode = STATE_BY_CODE.get(upper);
  if (byCode) return byCode;

  const byName = STATE_BY_NAME.get(toTitleCase(trimmed).toLowerCase());
  if (byName) return byName;

  return upper;
}

function boolOrNull(v: unknown): boolean | null {
  if (v === true) return true;
  if (v === false) return false;
  return null;
}

/**
 * Interprets order.criteria jsonb.
 * You can evolve these keys as you standardize your criteria.
 */
function matchesCriteria(
  criteria: unknown,
  lead: Record<string, unknown>
): { ok: boolean; reasons: string[]; scoreBoost: number } {
  const reasons: string[] = [];
  let scoreBoost = 0;

  const pick = (key: string) =>
    criteria && typeof criteria === "object" ? (criteria as Record<string, unknown>)[key] : undefined;

  const tri = (key: string, leadVal: boolean | null) => {
    const rule = String(pick(key) ?? "either").toLowerCase();
    if (rule === "either") return true;
    if (rule === "yes") return leadVal === true;
    if (rule === "no") return leadVal === false;
    return true;
  };

  // Exclusion checks
  if (!tri("prior_attorney_involved", boolOrNull(lead.prior_attorney_involved))) {
    return { ok: false, reasons: ["Excluded: prior_attorney_involved mismatch"], scoreBoost: 0 };
  }
  if (!tri("currently_represented", boolOrNull(lead.currently_represented))) {
    return { ok: false, reasons: ["Excluded: currently_represented mismatch"], scoreBoost: 0 };
  }
  if (!tri("is_injured", boolOrNull(lead.is_injured))) {
    return { ok: false, reasons: ["Excluded: is_injured mismatch"], scoreBoost: 0 };
  }
  if (!tri("received_medical_treatment", boolOrNull(lead.received_medical_treatment))) {
    return { ok: false, reasons: ["Excluded: received_medical_treatment mismatch"], scoreBoost: 0 };
  }
  if (!tri("accident_last_12_months", boolOrNull(lead.accident_last_12_months))) {
    return { ok: false, reasons: ["Excluded: accident_last_12_months mismatch"], scoreBoost: 0 };
  }

  // Example insured rule (optional)
  const insuredRule = String(pick("insured") ?? "").toLowerCase();
  if (insuredRule) {
    const leadInsured = boolOrNull(lead.insured);
    if (insuredRule === "insured_only") {
      if (leadInsured === true) {
        scoreBoost += 10;
        reasons.push("Match: insured_only");
      } else {
        return { ok: false, reasons: ["Excluded: insured_only required"], scoreBoost: 0 };
      }
    }
    if (insuredRule === "uninsured_ok") {
      scoreBoost += 2;
      reasons.push("Criteria: uninsured_ok");
    }
  }

  return { ok: true, reasons, scoreBoost };
}

function expiryPriorityScore(expiresAtIso: string) {
  const expiresAt = new Date(expiresAtIso).getTime();
  const now = Date.now();
  const days = Math.max(0, (expiresAt - now) / (1000 * 60 * 60 * 24));
  // sooner expiry => higher score
  const score = Math.round(30 / (1 + days / 3));
  return { score, days: Math.round(days) };
}

serve(async (req) => {
  console.log("[recommend-open-orders] Incoming request:", req.method);

  // CORS preflight
  if (req.method === "OPTIONS") {
    console.log("[recommend-open-orders] Preflight OK");
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    console.log("[recommend-open-orders] Reject: method not allowed");
    return new Response(JSON.stringify({ error: "POST only" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const body = (await req.json().catch(() => null)) as { lead?: LeadPayload; limit?: number } | null;
  console.log("[recommend-open-orders] Parsed body:", body);

  if (!body?.lead) {
    console.log("[recommend-open-orders] Reject: missing lead payload");
    return new Response(JSON.stringify({ error: "Missing lead payload" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const limit = Math.min(Math.max(Number(body.limit ?? 10), 1), 25);
  const inputLead = body.lead;

  console.log("[recommend-open-orders] limit:", limit);
  console.log("[recommend-open-orders] inputLead:", inputLead);

  // 1) Load lead record
  let leadRow: Record<string, unknown> | null = null;

  if (inputLead.lead_id) {
    console.log("[recommend-open-orders] Fetch lead by lead_id:", inputLead.lead_id);
    const { data, error } = await supabase
      .from("leads")
      .select("*")
      .eq("id", inputLead.lead_id)
      .maybeSingle();
    if (error) console.log("[recommend-open-orders] leads fetch error:", error);
    leadRow = (data as Record<string, unknown> | null) ?? null;
  } else if (inputLead.submission_id) {
    console.log("[recommend-open-orders] Fetch lead by submission_id:", inputLead.submission_id);
    const { data, error } = await supabase
      .from("leads")
      .select("*")
      .eq("submission_id", inputLead.submission_id)
      .maybeSingle();
    if (error) console.log("[recommend-open-orders] leads fetch error:", error);
    leadRow = (data as Record<string, unknown> | null) ?? null;
  }

  console.log(
    "[recommend-open-orders] leadRow:",
    leadRow ? { id: leadRow.id, submission_id: leadRow.submission_id, state: leadRow.state } : null
  );

  // 2) Merge latest daily_deal_flow for extra fields (optional)
  let flowRow: Record<string, unknown> | null = null;
  if (inputLead.submission_id) {
    console.log("[recommend-open-orders] Fetch daily_deal_flow by submission_id:", inputLead.submission_id);
    const { data, error } = await supabase
      .from("daily_deal_flow")
      .select(
        "submission_id,state,insured,prior_attorney_involved,currently_represented,is_injured,received_medical_treatment,accident_last_12_months"
      )
      .eq("submission_id", inputLead.submission_id)
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) console.log("[recommend-open-orders] daily_deal_flow fetch error:", error);
    flowRow = Array.isArray(data) && data.length ? (data[0] as Record<string, unknown>) : null;
  }

  console.log("[recommend-open-orders] flowRow:", flowRow);

  const mergedLead: Record<string, unknown> = {
    ...(leadRow ?? {}),
    ...(flowRow ?? {}),
    ...(inputLead as unknown as Record<string, unknown>), // live overrides win
  };

  const leadState = normalizeStateToken(mergedLead.state);
  const leadSummary = {
    state: leadState || null,
    submission_id: (mergedLead.submission_id as string | null) ?? inputLead.submission_id ?? null,
    lead_id: (mergedLead.id as string | null) ?? inputLead.lead_id ?? null,
  };
  console.log("[recommend-open-orders] mergedLead.state normalized:", leadState);

  if (!leadState) {
    console.log("[recommend-open-orders] Lead state not provided; falling back to expiry/quota scoring");
  }

  // 3) Fetch OPEN orders and resolve the linked attorney profiles before applying account-type filters.
  console.log("[recommend-open-orders] Fetch candidate orders...");
  const { data: orders, error: ordersError } = await supabase
    .from("orders")
    .select("id,lawyer_id,target_states,criteria,quota_total,quota_filled,status,expires_at,created_at")
    .eq("status", "OPEN")
    .gt("expires_at", new Date().toISOString());

  if (ordersError) {
    console.log("[recommend-open-orders] orders fetch error:", ordersError);
    return new Response(JSON.stringify({ error: ordersError.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  console.log("[recommend-open-orders] Orders fetched:", orders?.length ?? 0);

  const orderLawyerIds = Array.from(
    new Set(
      (orders ?? [])
        .map((order: any) => String(order?.lawyer_id ?? "").trim())
        .filter(Boolean)
    )
  );

  const attorneyProfilesByLawyerId = new Map<string, AttorneyProfileRow>();

  if (orderLawyerIds.length) {
    console.log("[recommend-open-orders] Resolve attorney profiles for order owners:", orderLawyerIds.length);

    const [byUserIdResult, byProfileIdResult] = await Promise.all([
      supabase
        .from("attorney_profiles")
        .select("id,user_id,account_type,licensed_states")
        .in("user_id", orderLawyerIds),
      supabase
        .from("attorney_profiles")
        .select("id,user_id,account_type,licensed_states")
        .in("id", orderLawyerIds),
    ]);

    if (byUserIdResult.error) {
      console.log("[recommend-open-orders] attorney_profiles by user_id fetch error:", byUserIdResult.error);
      return new Response(JSON.stringify({ error: byUserIdResult.error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (byProfileIdResult.error) {
      console.log("[recommend-open-orders] attorney_profiles by id fetch error:", byProfileIdResult.error);
      return new Response(JSON.stringify({ error: byProfileIdResult.error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    for (const profile of [
      ...((byUserIdResult.data ?? []) as AttorneyProfileRow[]),
      ...((byProfileIdResult.data ?? []) as AttorneyProfileRow[]),
    ]) {
      const profileId = String(profile.id ?? "").trim();
      const userId = String(profile.user_id ?? "").trim();

      if (profileId) {
        attorneyProfilesByLawyerId.set(profileId, profile);
      }
      if (userId) {
        attorneyProfilesByLawyerId.set(userId, profile);
      }
    }
  }

  // 4) Filter candidates by remaining quota
  const candidates = (orders ?? []).filter((o: any) => {
    const remaining = Number(o.quota_total) - Number(o.quota_filled);
    return Number.isFinite(remaining) && remaining > 0;
  });

  console.log("[recommend-open-orders] Candidates after quota filter:", candidates.length);

  // 5) Score candidates
  const recs: Recommendation[] = [];

  for (const o of candidates) {
    const reasons: string[] = [];
    let score = 0;

    const lawyerId = String(o.lawyer_id ?? "").trim();
    const attorneyProfile = lawyerId ? attorneyProfilesByLawyerId.get(lawyerId) ?? null : null;

    if (!attorneyProfile) {
      console.log("[recommend-open-orders] Skip order because no attorney profile was resolved:", {
        order_id: o.id,
        lawyer_id: lawyerId,
      });
      continue;
    }

    if (attorneyProfile.account_type !== "internal_lawyer") {
      console.log("[recommend-open-orders] Skip order because attorney is not internal:", {
        order_id: o.id,
        lawyer_id: lawyerId,
        account_type: attorneyProfile.account_type,
      });
      continue;
    }

    const licensedStateSet = new Set(
      (Array.isArray(attorneyProfile.licensed_states) ? attorneyProfile.licensed_states : [])
        .map((state: unknown) => normalizeStateToken(state))
        .filter(Boolean)
    );

    if (leadState) {
      if (!licensedStateSet.size) {
        console.log("[recommend-open-orders] Skip order because attorney has no licensed_states configured:", {
          order_id: o.id,
          lawyer_id: lawyerId,
          lead_state: leadState,
        });
        continue;
      }

      if (!licensedStateSet.has(leadState)) {
        console.log("[recommend-open-orders] Skip order due to state mismatch:", {
          order_id: o.id,
          lawyer_id: lawyerId,
          lead_state: leadState,
          licensed_states: Array.from(licensedStateSet),
        });
        continue;
      }

      reasons.push(`Licensed state match: ${leadState}`);
      score += 60;
    }

    const crit = matchesCriteria(o.criteria, mergedLead);
    console.log("[recommend-open-orders] Criteria result for order", o.id, "=>", crit);
    if (!crit.ok) continue;

    score += crit.scoreBoost;
    reasons.push(...crit.reasons);

    const exp = expiryPriorityScore(o.expires_at);
    score += exp.score;
    reasons.push(`Expires in ~${exp.days} day(s)`);

    const remaining = Number(o.quota_total) - Number(o.quota_filled);
    if (Number.isFinite(remaining)) {
      score += Math.min(10, Math.max(0, remaining));
      reasons.push(`Remaining quota: ${remaining}`);
    }

    recs.push({
      order_id: o.id,
      lawyer_id: o.lawyer_id,
      expires_at: o.expires_at,
      quota_total: o.quota_total,
      quota_filled: o.quota_filled,
      remaining,
      score,
      reasons,
    });

    console.log("[recommend-open-orders] Scored order:", {
      order_id: o.id,
      lawyer_id: o.lawyer_id,
      score,
      expires_at: o.expires_at,
      remaining,
      reasons,
    });
  }

  recs.sort(
    (a, b) => b.score - a.score || new Date(a.expires_at).getTime() - new Date(b.expires_at).getTime()
  );

  const MIN_SCORE = 50;
  const aboveThreshold = recs.filter((r) => r.score >= MIN_SCORE);
  const filtered = aboveThreshold.length ? aboveThreshold : recs;

  console.log("[recommend-open-orders] Final sorted recommendations (top):", filtered.slice(0, limit));

  return new Response(
    JSON.stringify({
      lead: leadSummary,
      recommendations: filtered.slice(0, limit),
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
