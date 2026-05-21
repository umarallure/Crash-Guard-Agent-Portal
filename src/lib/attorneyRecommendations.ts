import { supabase } from "@/integrations/supabase/client";
import { getStateMatchToken } from "@/lib/stateFilter";
import { US_STATES } from "@/lib/us-states";
import { evaluateSol, type SolEvaluation } from "@/lib/solPeriods";

export type AttorneyAccountType = "broker_lawyer" | "internal_lawyer";
export type RecommendationCoverageSource = "lawyer_requirements" | "orders" | "licensed_states" | "none";

export type AttorneyRecommendationLead = {
  id: string | null;
  submission_id: string | null;
  customer_full_name: string | null;
  state: string | null;
  accident_date: string | null;
};

type AttorneyProfileRow = {
  id: string;
  user_id: string;
  full_name: string | null;
  primary_email: string | null;
  direct_phone: string | null;
  licensed_states: string[] | null;
  account_type: AttorneyAccountType | null;
  availability_status?: string | null;
  case_rate_per_deal?: number | null;
  criteria?: string | null;
};

type LawyerRequirementRow = {
  id: string;
  attorney_id: string | null;
  attorney_name: string;
  lawyer_type: AttorneyAccountType | null;
  doc_requirement: boolean | null;
  sol: string | null;
  states: unknown;
  police_report: string | null;
  insurance_report: string | null;
  medical_report: string | null;
  driver_id: string | null;
  did_number: string | null;
  submission_link: string | null;
};

type OrderRow = {
  id: string;
  lawyer_id: string;
  target_states: string[] | null;
  case_type: string | null;
  case_subtype: string | null;
  criteria: unknown;
  quota_total: number | null;
  quota_filled: number | null;
  status: string | null;
  expires_at: string;
  created_at: string;
};

export type AttorneyRecommendationOrder = {
  id: string;
  target_states: string[];
  case_type: string | null;
  case_subtype: string | null;
  quota_total: number;
  quota_filled: number;
  remaining: number;
  expires_at: string;
};

export type AttorneyRecommendation = {
  id: string;
  accountType: AttorneyAccountType;
  attorneyUserId: string | null;
  attorneyProfileId: string | null;
  requirementId: string | null;
  submissionLink: string | null;
  attorneyName: string;
  primaryEmail: string | null;
  didNumber: string | null;
  stateMatch: boolean;
  accountTypeMatch: boolean;
  solMatch: boolean;
  documentMatch: boolean;
  isMatch: boolean;
  score: number;
  coverageSource: RecommendationCoverageSource;
  matchedState: string | null;
  coverageStates: string[];
  openOrders: AttorneyRecommendationOrder[];
  sol: SolEvaluation;
  requirement: {
    docRequirement: boolean;
    policeReport: string | null;
    insuranceReport: string | null;
    medicalReport: string | null;
    driverId: string | null;
  } | null;
  reasons: string[];
  warnings: string[];
};

export type AttorneyRecommendationResult = {
  lead: AttorneyRecommendationLead;
  leadState: string;
  accidentDate: string | null;
  broker: AttorneyRecommendation[];
  internal: AttorneyRecommendation[];
};

export type RecommendationInput = {
  leadId?: string | null;
  submissionId?: string | null;
  state?: string | null;
  accidentDate?: string | null;
  policeReport?: boolean | string | null;
  insuranceDocuments?: boolean | string | null;
  medicalTreatmentProof?: boolean | string | null;
  driverLicense?: boolean | string | null;
};

type SupabaseErrorLike = { message?: string };
type SupabaseResponse<T> = { data: T | null; error: SupabaseErrorLike | null };
type SupabaseQueryChain<T = unknown[]> = PromiseLike<SupabaseResponse<T>> & {
  eq: (column: string, value: unknown) => SupabaseQueryChain<T>;
  gt: (column: string, value: unknown) => SupabaseQueryChain<T>;
  in: (column: string, values: unknown[]) => SupabaseQueryChain<T>;
  limit: (count: number) => SupabaseQueryChain<T>;
  order: (column: string, options?: { ascending?: boolean; nullsFirst?: boolean }) => SupabaseQueryChain<T>;
  maybeSingle: () => Promise<SupabaseResponse<unknown>>;
};
type SupabaseUntyped = {
  from: (table: string) => {
    select: (columns: string) => SupabaseQueryChain;
  };
};

const supabaseUntyped = supabase as unknown as SupabaseUntyped;
const KNOWN_STATE_CODES = new Set(US_STATES.map((state) => state.code));

const normalizeBool = (value: boolean | string | null | undefined): boolean => {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return false;

  const normalized = value.trim().toLowerCase();
  return normalized === "true" || normalized === "yes" || normalized === "y" || normalized === "1";
};

const normalizeKnownStateToken = (value: string | null | undefined): string => {
  const token = getStateMatchToken(value);
  return KNOWN_STATE_CODES.has(token) ? token : "";
};

const getRequirementSnapshot = (requirement: LawyerRequirementRow | null | undefined) =>
  requirement
    ? {
        docRequirement: requirement.doc_requirement === true,
        policeReport: requirement.police_report ?? null,
        insuranceReport: requirement.insurance_report ?? null,
        medicalReport: requirement.medical_report ?? null,
        driverId: requirement.driver_id ?? null,
      }
    : null;

const evaluateDocuments = (
  requirement: LawyerRequirementRow,
  input: RecommendationInput
): { ok: boolean; reasons: string[] } => {
  const leadPoliceReport = normalizeBool(input.policeReport);
  const leadInsuranceReport = normalizeBool(input.insuranceDocuments);
  const leadMedicalReport = normalizeBool(input.medicalTreatmentProof);
  const leadDriverId = normalizeBool(input.driverLicense);

  const reasons: string[] = [];
  const policeOk = requirement.police_report === "yes" ? leadPoliceReport : true;
  const insuranceOk = requirement.insurance_report === "yes" ? leadInsuranceReport : true;
  const medicalOk = requirement.medical_report === "yes" ? leadMedicalReport : true;
  const driverOk = requirement.driver_id === "yes" ? leadDriverId : true;
  const documentBundleOk = requirement.doc_requirement
    ? leadPoliceReport || leadInsuranceReport || leadMedicalReport || leadDriverId
    : true;

  if (requirement.police_report === "yes") {
    reasons.push(policeOk ? "Police report ready" : "Police report required");
  }
  if (requirement.insurance_report === "yes") {
    reasons.push(insuranceOk ? "Insurance documents ready" : "Insurance documents required");
  }
  if (requirement.medical_report === "yes") {
    reasons.push(medicalOk ? "Medical proof ready" : "Medical proof required");
  }
  if (requirement.driver_id === "yes") {
    reasons.push(driverOk ? "Driver ID ready" : "Driver ID required");
  }
  if (requirement.doc_requirement) {
    reasons.push(documentBundleOk ? "Document requirement met" : "At least one document required");
  }

  return {
    ok: policeOk && insuranceOk && medicalOk && driverOk && documentBundleOk,
    reasons,
  };
};

const normalizeStates = (value: unknown): string[] => {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value
      .map((state) => normalizeKnownStateToken(String(state ?? "")))
      .filter(Boolean);
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return normalizeStates(parsed);
    } catch {
      return value
        .split(",")
        .map((state) => normalizeKnownStateToken(state))
        .filter(Boolean);
    }
  }

  return [];
};

const toOrderSummary = (order: OrderRow): AttorneyRecommendationOrder => {
  const quotaTotal = Number(order.quota_total) || 0;
  const quotaFilled = Number(order.quota_filled) || 0;

  return {
    id: order.id,
    target_states: normalizeStates(order.target_states),
    case_type: order.case_type ?? null,
    case_subtype: order.case_subtype ?? null,
    quota_total: quotaTotal,
    quota_filled: quotaFilled,
    remaining: Math.max(0, quotaTotal - quotaFilled),
    expires_at: order.expires_at,
  };
};

const evaluateOrderExpiration = (orders: AttorneyRecommendationOrder[]): SolEvaluation => {
  if (!orders.length) {
    return {
      ok: true,
      status: "not_configured",
      label: "No SOL for license fallback",
      sol: null,
      expiryDate: null,
      monthsRemaining: null,
    };
  }

  const expiryDates = orders
    .map((order) => new Date(order.expires_at))
    .filter((date) => Number.isFinite(date.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());

  if (!expiryDates.length) {
    return {
      ok: false,
      status: "unknown",
      label: "Order expiration unknown",
      sol: null,
      expiryDate: null,
      monthsRemaining: null,
    };
  }

  const now = new Date();
  const nextValidExpiry = expiryDates.find((date) => date.getTime() > now.getTime()) ?? null;
  const relevantExpiry = nextValidExpiry ?? expiryDates[expiryDates.length - 1];
  const valid = Boolean(nextValidExpiry);
  const daysRemaining = Math.max(
    0,
    Math.ceil((relevantExpiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  );

  return {
    ok: valid,
    status: valid ? "valid" : "expired",
    label: valid
      ? `Order SOL valid (${daysRemaining} day${daysRemaining === 1 ? "" : "s"} remaining)`
      : "Order SOL expired",
    sol: "order_expires_at",
    expiryDate: relevantExpiry.toISOString(),
    monthsRemaining: null,
  };
};

export const loadLeadForAttorneyRecommendations = async (
  input: Pick<RecommendationInput, "leadId" | "submissionId">
): Promise<AttorneyRecommendationLead | null> => {
  const leadId = String(input.leadId ?? "").trim();
  const submissionId = String(input.submissionId ?? "").trim();

  if (!leadId && !submissionId) return null;

  let query = supabaseUntyped
    .from("leads")
    .select("id,submission_id,customer_full_name,state,accident_date")
    .limit(1);

  query = leadId ? query.eq("id", leadId) : query.eq("submission_id", submissionId);

  const { data, error } = await query.maybeSingle();
  if (error) throw error;

  return (data ?? null) as AttorneyRecommendationLead | null;
};

const getAttorneyDisplayName = (
  profile: AttorneyProfileRow | null | undefined,
  fallback: string | null | undefined
) =>
  profile?.full_name?.trim() ||
  fallback?.trim() ||
  profile?.primary_email?.trim() ||
  profile?.user_id ||
  "Attorney";

export const getAttorneyRecommendations = async (
  input: RecommendationInput
): Promise<AttorneyRecommendationResult> => {
  const loadedLead = await loadLeadForAttorneyRecommendations(input);
  const leadState = normalizeKnownStateToken(input.state) || normalizeKnownStateToken(loadedLead?.state);
  const accidentDate = String(input.accidentDate ?? loadedLead?.accident_date ?? "").trim() || null;

  const lead: AttorneyRecommendationLead = {
    id: loadedLead?.id ?? input.leadId ?? null,
    submission_id: loadedLead?.submission_id ?? input.submissionId ?? null,
    customer_full_name: loadedLead?.customer_full_name ?? null,
    state: leadState || loadedLead?.state || null,
    accident_date: accidentDate,
  };

  if (!leadState) {
    return {
      lead,
      leadState: "",
      accidentDate,
      broker: [],
      internal: [],
    };
  }

  const [internalProfilesResult, brokerProfilesResult, requirementsResult, ordersResult] = await Promise.all([
    supabaseUntyped
      .from("attorney_profiles")
      .select("id,user_id,full_name,primary_email,direct_phone,licensed_states,account_type,availability_status,case_rate_per_deal,criteria")
      .eq("account_type", "internal_lawyer"),
    supabaseUntyped
      .from("attorney_profiles")
      .select("id,user_id,full_name,primary_email,direct_phone,licensed_states,account_type,availability_status,case_rate_per_deal,criteria")
      .eq("account_type", "broker_lawyer"),
    supabaseUntyped
      .from("lawyer_requirements")
      .select("id,attorney_id,attorney_name,lawyer_type,doc_requirement,sol,states,police_report,insurance_report,medical_report,driver_id,did_number,submission_link")
      .eq("lawyer_type", "broker_lawyer")
      .order("attorney_name", { ascending: true }),
    supabaseUntyped
      .from("orders")
      .select("id,lawyer_id,target_states,case_type,case_subtype,criteria,quota_total,quota_filled,status,expires_at,created_at")
      .eq("status", "OPEN")
      .order("created_at", { ascending: false }),
  ]);

  if (internalProfilesResult.error) throw internalProfilesResult.error;
  if (brokerProfilesResult.error) throw brokerProfilesResult.error;
  if (requirementsResult.error) throw requirementsResult.error;
  if (ordersResult.error) throw ordersResult.error;

  const internalProfiles = (internalProfilesResult.data ?? []) as AttorneyProfileRow[];
  const brokerProfiles = (brokerProfilesResult.data ?? []) as AttorneyProfileRow[];
  const requirements = (requirementsResult.data ?? []) as LawyerRequirementRow[];
  const orderRows = (ordersResult.data ?? []) as OrderRow[];

  const profileByUserId = new Map(
    [...internalProfiles, ...brokerProfiles].map((profile) => [profile.user_id, profile])
  );
  const ordersByLawyerId = new Map<string, AttorneyRecommendationOrder[]>();
  for (const row of orderRows) {
    const order = toOrderSummary(row);
    if (order.remaining <= 0) continue;

    const lawyerId = String(row.lawyer_id ?? "").trim();
    if (!lawyerId) continue;
    ordersByLawyerId.set(lawyerId, [...(ordersByLawyerId.get(lawyerId) ?? []), order]);
  }

  const broker = requirements
    .filter((requirement) => requirement.lawyer_type === "broker_lawyer")
    .map<AttorneyRecommendation>((requirement) => {
      const profile = requirement.attorney_id ? profileByUserId.get(requirement.attorney_id) : null;
      const coverageStates = normalizeStates(requirement.states);
      const stateMatch = coverageStates.includes(leadState);
      const sol = evaluateSol(requirement.sol, accidentDate);
      const docs = evaluateDocuments(requirement, input);
      const reasons: string[] = [];
      const warnings: string[] = [];

      if (stateMatch) reasons.push(`Requirement state match: ${leadState}`);
      else reasons.push(`Requirement state mismatch: ${leadState}`);

      reasons.push(sol.label);
      reasons.push(...docs.reasons);
      if (profile?.account_type && profile.account_type !== "broker_lawyer") {
        warnings.push(`Linked profile is ${profile.account_type}`);
      }

      const isMatch = stateMatch && sol.ok && docs.ok;

      return {
        id: requirement.id,
        accountType: "broker_lawyer",
        attorneyUserId: requirement.attorney_id,
        attorneyProfileId: profile?.id ?? null,
        requirementId: requirement.id,
        submissionLink: requirement.submission_link ?? null,
        attorneyName: getAttorneyDisplayName(profile, requirement.attorney_name),
        primaryEmail: profile?.primary_email ?? null,
        didNumber: requirement.did_number || profile?.direct_phone || null,
        stateMatch,
        accountTypeMatch: requirement.lawyer_type === "broker_lawyer",
        solMatch: sol.ok,
        documentMatch: docs.ok,
        isMatch,
        score: (stateMatch ? 70 : 0) + (sol.ok ? 20 : 0) + (docs.ok ? 10 : 0),
        coverageSource: "lawyer_requirements",
        matchedState: stateMatch ? leadState : null,
        coverageStates,
        openOrders: [],
        sol,
        requirement: getRequirementSnapshot(requirement),
        reasons,
        warnings,
      };
    });

  const internal = internalProfiles
    .map<AttorneyRecommendation>((profile) => {
      const attorneyOrders = ordersByLawyerId.get(profile.user_id) ?? [];
      const stateMatchingOrders = attorneyOrders.filter((order) => order.target_states.includes(leadState));
      const activeStateMatchingOrders = stateMatchingOrders.filter((order) => {
        const expiresAt = new Date(order.expires_at).getTime();
        return Number.isFinite(expiresAt) && expiresAt > Date.now();
      });
      const licensedStates = normalizeStates(profile.licensed_states);
      const hasOrderForState = stateMatchingOrders.length > 0;
      const hasActiveOrderStateMatch = activeStateMatchingOrders.length > 0;
      const hasLicensedStateMatch = licensedStates.includes(leadState);
      const stateMatch = hasOrderForState || hasLicensedStateMatch;
      const coverageSource: RecommendationCoverageSource = hasOrderForState
        ? "orders"
        : hasLicensedStateMatch
          ? "licensed_states"
          : "none";
      const sol = hasOrderForState ? evaluateOrderExpiration(stateMatchingOrders) : evaluateOrderExpiration([]);
      const reasons: string[] = [];
      const warnings: string[] = [];

      if (hasOrderForState) {
        reasons.push(`Order state match: ${leadState}`);
      } else if (hasLicensedStateMatch) {
        reasons.push(`Licensed state fallback match: ${leadState}`);
      } else {
        reasons.push(`No order or license state match: ${leadState}`);
      }

      reasons.push(sol.label);

      if (!hasOrderForState && hasLicensedStateMatch) {
        warnings.push("No matching open order; matched by attorney profile license fallback");
      }
      if (hasOrderForState && !hasActiveOrderStateMatch) {
        warnings.push("Matching order is expired; licensed-state fallback was not used");
      }

      const isMatch = stateMatch && sol.ok;
      const remaining = activeStateMatchingOrders.reduce((sum, order) => sum + order.remaining, 0);

      return {
        id: profile.user_id,
        accountType: "internal_lawyer",
        attorneyUserId: profile.user_id,
        attorneyProfileId: profile.id,
        requirementId: null,
        submissionLink: null,
        attorneyName: getAttorneyDisplayName(profile, null),
        primaryEmail: profile.primary_email ?? null,
        didNumber: profile.direct_phone ?? null,
        stateMatch,
        accountTypeMatch: profile.account_type === "internal_lawyer",
        solMatch: sol.ok,
        documentMatch: true,
        isMatch,
        score: (hasActiveOrderStateMatch ? 90 : hasLicensedStateMatch && !hasOrderForState ? 60 : 0) + (sol.ok ? 20 : 0) + Math.min(10, remaining),
        coverageSource,
        matchedState: stateMatch ? leadState : null,
        coverageStates: hasOrderForState
          ? Array.from(new Set(stateMatchingOrders.flatMap((order) => order.target_states)))
          : licensedStates,
        openOrders: activeStateMatchingOrders,
        sol,
        requirement: null,
        reasons,
        warnings,
      };
    });

  const sortRecommendations = (a: AttorneyRecommendation, b: AttorneyRecommendation) =>
    Number(b.isMatch) - Number(a.isMatch) ||
    b.score - a.score ||
    a.attorneyName.localeCompare(b.attorneyName);

  return {
    lead,
    leadState,
    accidentDate,
    broker: broker.sort(sortRecommendations),
    internal: internal.sort(sortRecommendations),
  };
};
