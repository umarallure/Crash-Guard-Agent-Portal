import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { normalizeStateToken } from "../_shared/state.ts";

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
  console.log("[recommend-open-orders] mergedLead.state normalized:", leadState);

  if (!leadState) {
    console.log("[recommend-open-orders] Lead state not provided; falling back to expiry/quota scoring");
  }

  // 3) Fetch OPEN orders
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

  // 4) Filter candidates by remaining quota (state match is scored, not required)
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

    const targets = Array.isArray(o.target_states) ? o.target_states : [];
    const targetSet = new Set(targets.map((state: unknown) => normalizeStateToken(state)).filter(Boolean));

    if (leadState) {
      const stateMatch = targetSet.has(leadState);
      if (stateMatch) {
        reasons.push(`State match: ${leadState}`);
        score += 60;
      } else {
        reasons.push(`State mismatch: ${leadState}`);
      }
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
      lead: {
        state: leadState || null,
        submission_id: (mergedLead.submission_id as string | null) ?? inputLead.submission_id ?? null,
        lead_id: (mergedLead.id as string | null) ?? inputLead.lead_id ?? null,
      },
      recommendations: filtered.slice(0, limit),
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
