import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

declare const Deno: {
  env: {
    get: (key: string) => string | undefined;
  };
};

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type OrderRow = {
  id: string;
  lawyer_id: string;
  target_states: unknown;
  criteria: unknown;
  quota_total: number;
  quota_filled: number;
  status: string;
  expires_at: string;
  created_at: string;
};

type DealRow = {
  id: string;
  submission_id: string | null;
  insured_name: string | null;
  client_phone_number: string | null;
  state: string | null;
  status: string | null;
  assigned_attorney_id: string | null;
  created_at: string;

  insured?: boolean | null;
  prior_attorney_involved?: boolean | null;
  currently_represented?: boolean | null;
  is_injured?: boolean | null;
  received_medical_treatment?: boolean | null;
  accident_last_12_months?: boolean | null;
};

type LeadIdRow = {
  id: string;
  submission_id: string;
};

type DealRecommendation = DealRow & {
  lead_id: string | null;
  score: number;
  reasons: string[];
};

function isQualifiedStage(status: unknown) {
  const normalized = String(status ?? "").trim().toLowerCase();
  if (!normalized) return false;
  return normalized.startsWith("qualified_");
}

function normState(v: unknown) {
  return String(v ?? "").trim().toUpperCase();
}

function boolOrNull(v: unknown): boolean | null {
  if (v === true) return true;
  if (v === false) return false;
  return null;
}

function matchesCriteria(
  criteria: unknown,
  deal: Record<string, unknown>
): { ok: boolean; reasons: string[]; scoreBoost: number } {
  const reasons: string[] = [];
  let scoreBoost = 0;

  const pick = (key: string) =>
    criteria && typeof criteria === "object" ? (criteria as Record<string, unknown>)[key] : undefined;

  const tri = (key: string, dealVal: boolean | null) => {
    const rule = String(pick(key) ?? "either").toLowerCase();
    if (rule === "either") return true;
    if (rule === "yes") return dealVal === true;
    if (rule === "no") return dealVal === false;
    return true;
  };

  if (!tri("prior_attorney_involved", boolOrNull(deal.prior_attorney_involved))) {
    return { ok: false, reasons: ["Excluded: prior_attorney_involved mismatch"], scoreBoost: 0 };
  }
  if (!tri("currently_represented", boolOrNull(deal.currently_represented))) {
    return { ok: false, reasons: ["Excluded: currently_represented mismatch"], scoreBoost: 0 };
  }
  if (!tri("is_injured", boolOrNull(deal.is_injured))) {
    return { ok: false, reasons: ["Excluded: is_injured mismatch"], scoreBoost: 0 };
  }
  if (!tri("received_medical_treatment", boolOrNull(deal.received_medical_treatment))) {
    return { ok: false, reasons: ["Excluded: received_medical_treatment mismatch"], scoreBoost: 0 };
  }
  if (!tri("accident_last_12_months", boolOrNull(deal.accident_last_12_months))) {
    return { ok: false, reasons: ["Excluded: accident_last_12_months mismatch"], scoreBoost: 0 };
  }

  const insuredRule = String(pick("insured") ?? "").toLowerCase();
  if (insuredRule) {
    const dealInsured = boolOrNull(deal.insured);
    if (insuredRule === "insured_only") {
      if (dealInsured === true) {
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

function recencyScore(createdAtIso: string) {
  const createdAt = new Date(createdAtIso).getTime();
  const now = Date.now();
  const days = Math.max(0, (now - createdAt) / (1000 * 60 * 60 * 24));
  const score = Math.round(20 / (1 + days / 2));
  return { score, days: Math.round(days) };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const body = (await req.json().catch(() => null)) as
    | { order_id?: string; limit?: number }
    | null;

  const orderId = String(body?.order_id ?? "").trim();
  if (!orderId) {
    return new Response(JSON.stringify({ error: "Missing order_id" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const limit = Math.min(Math.max(Number(body?.limit ?? 50), 1), 100);

  const { data: orderRow, error: orderError } = await supabase
    .from("orders")
    .select("id,lawyer_id,target_states,criteria,quota_total,quota_filled,status,expires_at,created_at")
    .eq("id", orderId)
    .maybeSingle();

  if (orderError || !orderRow) {
    return new Response(JSON.stringify({ error: orderError?.message ?? "Order not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const order = orderRow as unknown as OrderRow;

  const targets = Array.isArray(order.target_states) ? order.target_states : [];
  const targetSet = new Set(targets.map((s) => normState(s)).filter(Boolean));

  const { data: deals, error: dealsError } = await supabase
    .from("daily_deal_flow")
    .select(
      "id,submission_id,insured_name,client_phone_number,state,status,assigned_attorney_id,created_at,insured,prior_attorney_involved,currently_represented,is_injured,received_medical_treatment,accident_last_12_months"
    )
    .is("assigned_attorney_id", null)
    .order("created_at", { ascending: false })
    .limit(500);

  if (dealsError) {
    return new Response(JSON.stringify({ error: dealsError.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const rows = (deals ?? []) as unknown as DealRow[];

  const submissionIds = rows
    .map((r) => (r.submission_id ? String(r.submission_id) : null))
    .filter((v): v is string => Boolean(v));

  const leadIdBySubmissionId: Record<string, string> = {};
  if (submissionIds.length) {
    const { data: leadIdsData } = await supabase
      .from("leads")
      .select("id,submission_id")
      .in("submission_id", submissionIds);

    for (const r of (leadIdsData ?? []) as unknown as LeadIdRow[]) {
      if (!r.submission_id || !r.id) continue;
      leadIdBySubmissionId[String(r.submission_id)] = String(r.id);
    }
  }

  const scored: DealRecommendation[] = [];

  for (const d of rows) {
    if (d.assigned_attorney_id) continue;
    if (!isQualifiedStage(d.status)) continue;

    const reasons: string[] = [];
    let score = 0;

    reasons.push("Qualified stage");

    const state = normState(d.state);
    if (targetSet.size && state) {
      if (targetSet.has(state)) {
        score += 60;
        reasons.push(`State match: ${state}`);
      } else {
        continue;
      }
    }

    const crit = matchesCriteria(order.criteria, d as unknown as Record<string, unknown>);
    if (!crit.ok) continue;
    score += crit.scoreBoost;
    reasons.push(...crit.reasons);

    score += 10;
    reasons.push("Unassigned deal");

    const rec = recencyScore(d.created_at);
    score += rec.score;
    reasons.push(`Recency: ${rec.days} day(s) ago`);

    const submissionId = d.submission_id ? String(d.submission_id) : "";
    const leadId = submissionId ? (leadIdBySubmissionId[submissionId] ?? null) : null;

    scored.push({
      ...d,
      lead_id: leadId,
      score,
      reasons,
    });
  }

  scored.sort((a, b) => b.score - a.score);

  return new Response(
    JSON.stringify({ order_id: orderId, recommendations: scored.slice(0, limit) }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
});
