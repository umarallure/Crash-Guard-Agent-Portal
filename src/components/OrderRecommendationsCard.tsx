import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, InfoIcon, Loader2, MapPin, RefreshCw, Undo2, XCircle } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useAttorneys } from "@/hooks/useAttorneys";
import { getAttorneyRecommendations, type AttorneyRecommendation } from "@/lib/attorneyRecommendations";
import { getTodayDateEST } from "@/lib/dateUtils";
import { formatStateFilterLabel, getStateMatchToken } from "@/lib/stateFilter";

type LeadOverrides = {
  state?: string | null;
  accident_date?: string | null;
  insured?: boolean | null;
  prior_attorney_involved?: boolean | null;
  currently_represented?: boolean | null;
  is_injured?: boolean | null;
  received_medical_treatment?: boolean | null;
  accident_last_12_months?: boolean | null;
};

type Recommendation = {
  order_id: string | null;
  lawyer_id: string;
  attorney_name: string | null;
  did_number: string | null;
  coverage_source: "orders" | "licensed_states";
  coverage_states: string[];
  expires_at: string;
  quota_total: number;
  quota_filled: number;
  remaining: number;
  score: number;
  reasons: string[];
};

type SupabaseRpcUntyped = {
  rpc: (
    fn: string,
    args: Record<string, unknown>
  ) => Promise<{ data: unknown; error: { message?: string } | null }>;
};

type SupabaseQueryBuilderUntyped = {
  select: (columns?: string, options?: Record<string, unknown>) => SupabaseQueryBuilderUntyped;
  eq: (column: string, value: unknown) => SupabaseQueryBuilderUntyped;
  order: (column: string, options?: { ascending?: boolean }) => SupabaseQueryBuilderUntyped;
  limit: (count: number) => SupabaseQueryBuilderUntyped;
  maybeSingle: () => Promise<{ data: unknown; error: { message?: string } | null }>;
  delete: () => SupabaseQueryBuilderUntyped;
  insert: (values: Record<string, unknown>) => SupabaseQueryBuilderUntyped;
  update: (values: Record<string, unknown>) => SupabaseQueryBuilderUntyped;
};

type SupabaseFromUntyped = {
  from: (table: string) => SupabaseQueryBuilderUntyped;
};

const MAX_VISIBLE_STATE_BADGES = 7;

const renderStateBadges = (states: string[]) => {
  if (!states.length) {
    return <span className="text-xs text-muted-foreground">Not listed</span>;
  }

  const visibleStates = states.slice(0, MAX_VISIBLE_STATE_BADGES);
  const remainingCount = Math.max(0, states.length - visibleStates.length);

  return (
    <div className="flex flex-wrap items-center gap-1">
      {visibleStates.map((state) => (
        <span
          key={state}
          className="rounded-full border border-border/60 bg-background/80 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-foreground"
        >
          {state}
        </span>
      ))}
      {remainingCount > 0 ? (
        <span className="rounded-full border border-border/60 bg-muted px-1.5 py-0.5 text-[10px] font-semibold leading-none text-muted-foreground">
          +{remainingCount}
        </span>
      ) : null}
    </div>
  );
};

const formatExpiry = (iso: string) => {
  if (!iso) return "No order";

  try {
    const expiresAt = new Date(iso).getTime();
    const now = Date.now();
    const days = Math.ceil((expiresAt - now) / (1000 * 60 * 60 * 24));
    if (!Number.isFinite(days)) return iso;
    if (days < 0) return "Expired";
    if (days === 0) return "Expires today";
    if (days === 1) return "Expires in 1 day";
    return `Expires in ${days} days`;
  } catch {
    return iso;
  }
};

const toInternalRecommendationRows = (recommendations: AttorneyRecommendation[]): Recommendation[] => {
  const rows = recommendations
    .filter((recommendation) => recommendation.isMatch)
    .flatMap((recommendation) => {
      const lawyerId = recommendation.attorneyUserId ?? "";
      if (!lawyerId) return [];

      if (recommendation.openOrders.length > 0) {
        return recommendation.openOrders.map((order) => ({
          order_id: order.id,
          lawyer_id: lawyerId,
          attorney_name: recommendation.attorneyName,
          did_number: recommendation.didNumber,
          coverage_source: "orders" as const,
          coverage_states: order.target_states,
          expires_at: order.expires_at,
          quota_total: order.quota_total,
          quota_filled: order.quota_filled,
          remaining: order.remaining,
          score: recommendation.score + Math.min(10, order.remaining),
          reasons: [
            ...recommendation.reasons,
            `Remaining quota: ${order.remaining}`,
          ],
        }));
      }

      if (recommendation.coverageSource !== "licensed_states") return [];

      return [
        {
          order_id: null,
          lawyer_id: lawyerId,
          attorney_name: recommendation.attorneyName,
          did_number: recommendation.didNumber,
          coverage_source: "licensed_states" as const,
          coverage_states: recommendation.coverageStates,
          expires_at: "",
          quota_total: 0,
          quota_filled: 0,
          remaining: 0,
          score: recommendation.score,
          reasons: recommendation.reasons,
        },
      ];
    });

  rows.sort(
    (a, b) =>
      b.score - a.score ||
      Number(Boolean(b.order_id)) - Number(Boolean(a.order_id)) ||
      String(a.attorney_name || a.lawyer_id).localeCompare(String(b.attorney_name || b.lawyer_id))
  );

  return rows;
};

export const OrderRecommendationsCard = (props: {
  submissionId: string;
  leadId?: string | null;
  leadOverrides?: LeadOverrides;
  currentAssignedAttorneyId?: string | null;
  onAssigned?: (input: { orderId: string; lawyerId: string }) => void;
  onUnassigned?: () => void;
  assignmentMode?: "persist" | "deferred";
  layout?: "list" | "horizontal";
  hideHeader?: boolean;
}) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const { attorneys } = useAttorneys({ accountType: "internal_lawyer" });
  const assignmentMode = props.assignmentMode ?? "persist";
  const isDeferredAssignment = assignmentMode === "deferred";

  const [resolvedLeadId, setResolvedLeadId] = useState<string | null>(props.leadId ?? null);
  const [loadingLead, setLoadingLead] = useState(false);

  const [loading, setLoading] = useState(false);
  const [hasResolvedRecommendations, setHasResolvedRecommendations] = useState(false);
  const [assigningOrderId, setAssigningOrderId] = useState<string | null>(null);
  const [clearingAssignment, setClearingAssignment] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Recommendation[]>([]);

  const [dealFlowStatus, setDealFlowStatus] = useState<"loading" | "already_assigned" | "eligible">("loading");
  const [assignedAttorneyName, setAssignedAttorneyName] = useState<string | null>(null);
  const [dealFlowRowId, setDealFlowRowId] = useState<string | null>(null);

  const attorneyById = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of attorneys) {
      const label = (a.full_name || "").trim() || (a.primary_email || "").trim() || a.user_id;
      map.set(a.user_id, label);
      if (a.id) {
        map.set(a.id, label);
      }
    }
    return map;
  }, [attorneys]);

  const attorneyMetaById = useMemo(() => {
    const map = new Map<
      string,
      {
        contactNumber: string | null;
        licensedStates: string[];
        criteria: string | null;
      }
    >();

    for (const a of attorneys) {
      const rawNumber = (a as unknown as { direct_phone?: unknown })?.direct_phone;
      const contactNumber = typeof rawNumber === "string" ? rawNumber.trim() || null : null;

      const rawStates = (a as unknown as { licensed_states?: unknown })?.licensed_states;
      const licensedStates = Array.isArray(rawStates)
        ? rawStates
            .map((state: unknown) => getStateMatchToken(String(state ?? "")))
            .filter(Boolean)
        : [];

      const rawCriteria = (a as unknown as { criteria?: unknown })?.criteria;
      const criteria = typeof rawCriteria === "string" ? rawCriteria.trim() || null : null;

      const meta = { contactNumber, licensedStates, criteria };
      map.set(a.user_id, meta);
      if (a.id) {
        map.set(a.id, meta);
      }
    }

    return map;
  }, [attorneys]);

  const stateFilteredData = data;
  const hiddenStateMismatchCount = 0;

  useEffect(() => {
    setResolvedLeadId(props.leadId ?? null);
  }, [props.leadId]);

  const refreshDealFlowStatus = useCallback(async () => {
    if (!props.submissionId) {
      setDealFlowRowId(null);
      setAssignedAttorneyName(null);
      setDealFlowStatus("eligible");
      return "eligible" as const;
    }

    if (isDeferredAssignment) {
      const assignedId = String(props.currentAssignedAttorneyId || "").trim();
      setDealFlowRowId(null);
      setAssignedAttorneyName(assignedId ? attorneyById.get(assignedId) || assignedId : null);
      setDealFlowStatus("eligible");
      return "eligible" as const;
    }

    try {
      const { data: dealRow, error: dealError } = await supabase
        .from("daily_deal_flow")
        .select("id, assigned_attorney_id")
        .eq("submission_id", props.submissionId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (dealError || !dealRow) {
        setDealFlowRowId(null);
        setAssignedAttorneyName(null);
        setDealFlowStatus("eligible");
        return "eligible" as const;
      }

      const row = dealRow as unknown as { id?: string | null; assigned_attorney_id?: string | null };
      const assignedId = row?.assigned_attorney_id ? String(row.assigned_attorney_id) : null;

      setDealFlowRowId(row?.id ? String(row.id) : null);

      if (assignedId && assignedId.trim()) {
        setDealFlowStatus("already_assigned");
        const label = attorneyById.get(assignedId);
        setAssignedAttorneyName(label || assignedId);
        return "already_assigned" as const;
      }

      setAssignedAttorneyName(null);
      setDealFlowStatus("eligible");
      return "eligible" as const;
    } catch {
      setDealFlowRowId(null);
      setAssignedAttorneyName(null);
      setDealFlowStatus("eligible");
      return "eligible" as const;
    }
  }, [props.currentAssignedAttorneyId, props.submissionId, attorneyById, isDeferredAssignment]);

  useEffect(() => {
    void refreshDealFlowStatus();
  }, [refreshDealFlowStatus]);

  const ensureDealFlowRowId = useCallback(async () => {
    const sid = String(props.submissionId || "").trim();
    if (!sid) return null;

    const supabaseUntyped = supabase as unknown as SupabaseFromUntyped;

    const { data: existingRow, error: existingError } = await supabase
      .from("daily_deal_flow")
      .select("id")
      .eq("submission_id", sid)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!existingError && existingRow) {
      const rowId = String((existingRow as { id?: string | null }).id ?? "");
      if (rowId) {
        setDealFlowRowId(rowId);
        return rowId;
      }
    }

    const { data: leadRow, error: leadError } = await supabaseUntyped
      .from("leads")
      .select(
        "customer_full_name,phone_number,lead_vendor,status,state,zip_code,email,accident_date,prior_attorney_involved,prior_attorney_details,medical_attention,police_attended,accident_location,accident_scenario,insured,injuries,vehicle_registration,insurance_company,third_party_vehicle_registration,other_party_admit_fault,passengers_count,contact_name,contact_number,contact_address,tag"
      )
      .eq("submission_id", sid)
      .maybeSingle();

    if (leadError) {
      throw leadError;
    }

    const lead = (leadRow ?? {}) as Record<string, unknown>;
    const text = (key: string) => {
      const value = lead[key];
      return typeof value === "string" && value.trim() ? value.trim() : null;
    };
    const overrideText = (value: string | null | undefined) => {
      const normalized = String(value ?? "").trim();
      return normalized || null;
    };
    const bool = (key: string) => (typeof lead[key] === "boolean" ? lead[key] : null);
    const number = (key: string) => {
      const value = Number(lead[key]);
      return Number.isFinite(value) ? value : null;
    };
    const overrideState = getStateMatchToken(props.leadOverrides?.state) || overrideText(props.leadOverrides?.state);

    const insertValues: Record<string, unknown> = {
      submission_id: sid,
      date: getTodayDateEST(),
      insured_name: text("customer_full_name"),
      client_phone_number: text("phone_number"),
      lead_vendor: text("lead_vendor"),
      status: text("status"),
      state: overrideState || text("state") || null,
      zip_code: text("zip_code"),
      email: text("email"),
      accident_date: overrideText(props.leadOverrides?.accident_date) || text("accident_date"),
      prior_attorney_involved: props.leadOverrides?.prior_attorney_involved ?? bool("prior_attorney_involved") ?? false,
      prior_attorney_details: text("prior_attorney_details"),
      medical_attention: text("medical_attention"),
      police_attended: bool("police_attended") ?? false,
      accident_location: text("accident_location"),
      accident_scenario: text("accident_scenario"),
      insured: props.leadOverrides?.insured ?? bool("insured") ?? false,
      injuries: text("injuries"),
      vehicle_registration: text("vehicle_registration"),
      insurance_company: text("insurance_company"),
      third_party_vehicle_registration: text("third_party_vehicle_registration"),
      other_party_admit_fault: bool("other_party_admit_fault") ?? false,
      passengers_count: number("passengers_count"),
      contact_name: text("contact_name"),
      contact_number: text("contact_number"),
      contact_address: text("contact_address"),
      tag: text("tag"),
    };

    const { data: insertedRow, error: insertError } = await supabaseUntyped
      .from("daily_deal_flow")
      .insert(insertValues)
      .select("id")
      .maybeSingle();

    if (insertError) {
      const { data: racedRow, error: racedError } = await supabase
        .from("daily_deal_flow")
        .select("id")
        .eq("submission_id", sid)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (racedError || !racedRow) {
        throw insertError;
      }

      const rowId = String((racedRow as { id?: string | null }).id ?? "");
      if (rowId) {
        setDealFlowRowId(rowId);
        return rowId;
      }
    }

    const rowId = String((insertedRow as { id?: string | null } | null)?.id ?? "");
    if (rowId) {
      setDealFlowRowId(rowId);
      setDealFlowStatus("eligible");
    }

    return rowId || null;
  }, [props.leadOverrides, props.submissionId]);

  const fetchLeadIdIfNeeded = useCallback(async () => {
    if (resolvedLeadId) return resolvedLeadId;
    if (!props.submissionId) return null;

    setLoadingLead(true);
    try {
      const { data: leadRow, error: leadError } = await supabase
        .from("leads")
        .select("id")
        .eq("submission_id", props.submissionId)
        .maybeSingle();

      if (leadError) {
        setResolvedLeadId(null);
        return null;
      }

      const typedLeadRow = leadRow as Record<string, unknown> | null;
      const next = typedLeadRow?.id ? String(typedLeadRow.id) : null;
      setResolvedLeadId(next);
      return next;
    } finally {
      setLoadingLead(false);
    }
  }, [props.submissionId, resolvedLeadId]);

  const leadOverrideState = props.leadOverrides?.state ?? null;
  const leadOverrideAccidentDate = props.leadOverrides?.accident_date ?? null;
  const leadOverrideInsured = props.leadOverrides?.insured ?? null;
  const leadOverridePriorAttorneyInvolved = props.leadOverrides?.prior_attorney_involved ?? null;
  const leadOverrideCurrentlyRepresented = props.leadOverrides?.currently_represented ?? null;
  const leadOverrideIsInjured = props.leadOverrides?.is_injured ?? null;
  const leadOverrideReceivedMedicalTreatment = props.leadOverrides?.received_medical_treatment ?? null;
  const leadOverrideAccidentLastTwelveMonths = props.leadOverrides?.accident_last_12_months ?? null;

  const requestSignature = useMemo(
    () =>
      JSON.stringify({
        submissionId: props.submissionId,
        leadId: resolvedLeadId,
        state: leadOverrideState,
        accidentDate: leadOverrideAccidentDate,
        insured: leadOverrideInsured,
        priorAttorneyInvolved: leadOverridePriorAttorneyInvolved,
        currentlyRepresented: leadOverrideCurrentlyRepresented,
        isInjured: leadOverrideIsInjured,
        receivedMedicalTreatment: leadOverrideReceivedMedicalTreatment,
        accidentLastTwelveMonths: leadOverrideAccidentLastTwelveMonths,
      }),
    [
      props.submissionId,
      resolvedLeadId,
      leadOverrideState,
      leadOverrideAccidentDate,
      leadOverrideInsured,
      leadOverridePriorAttorneyInvolved,
      leadOverrideCurrentlyRepresented,
      leadOverrideIsInjured,
      leadOverrideReceivedMedicalTreatment,
      leadOverrideAccidentLastTwelveMonths,
    ],
  );

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const leadId = await fetchLeadIdIfNeeded();
      const recommendationsResult = await getAttorneyRecommendations({
        submissionId: props.submissionId,
        leadId,
        state: leadOverrideState,
        accidentDate: leadOverrideAccidentDate,
      });

      setData(toInternalRecommendationRows(recommendationsResult.internal).slice(0, 8));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setData([]);
    } finally {
      setLoading(false);
      setHasResolvedRecommendations(true);
    }
  }, [fetchLeadIdIfNeeded, leadOverrideAccidentDate, leadOverrideState, props.submissionId]);

  useEffect(() => {
    if (dealFlowStatus === "loading") {
      return;
    }

    if (dealFlowStatus === "already_assigned") {
      setHasResolvedRecommendations(false);
      setLoading(false);
      return;
    }

    setHasResolvedRecommendations(false);
    void run();
  }, [dealFlowStatus, requestSignature, run]);

  const clearAssignedAttorney = async () => {
    if (isDeferredAssignment) {
      setAssignedAttorneyName(null);
      props.onUnassigned?.();

      toast({
        title: "Attorney selection cleared",
        description: "Save the call result to persist the updated attorney assignment.",
      });
      return;
    }

    if (!props.submissionId) {
      toast({
        title: "Cannot clear assignment",
        description: "No submission ID was provided.",
        variant: "destructive",
      });
      return;
    }

    setClearingAssignment(true);
    try {
      const supabaseUntyped = supabase as unknown as SupabaseFromUntyped;
      let rowId = dealFlowRowId;

      if (!rowId) {
        await refreshDealFlowStatus();
        rowId = dealFlowRowId;

        if (!rowId) {
          const { data: dealRow, error: dealError } = await supabase
            .from("daily_deal_flow")
            .select("id")
            .eq("submission_id", props.submissionId)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (dealError || !dealRow) {
            throw new Error("Unable to resolve the Daily Deal Flow entry to clear.");
          }

          const typedRow = dealRow as unknown as { id?: string | null };
          rowId = typedRow?.id ? String(typedRow.id) : null;
        }
      }

      if (!rowId) {
        throw new Error("Unable to resolve the Daily Deal Flow entry to clear.");
      }

      const leadId = await fetchLeadIdIfNeeded();

      if (leadId) {
        const { data: fulfillmentRow, error: fulfillmentError } = await supabaseUntyped
          .from("order_fulfillments")
          .select("id, order_id")
          .eq("lead_id", leadId)
          .maybeSingle();

        if (fulfillmentError) {
          throw fulfillmentError;
        }

        const typedFulfillment = fulfillmentRow as { id?: string | null; order_id?: string | null } | null;
        const fulfillmentId = typedFulfillment?.id ? String(typedFulfillment.id) : null;
        const orderId = typedFulfillment?.order_id ? String(typedFulfillment.order_id) : null;

        if (fulfillmentId) {
          if (orderId) {
            const { data: orderRow, error: orderError } = await supabaseUntyped
              .from("orders")
              .select("quota_filled, quota_total, status, expires_at")
              .eq("id", orderId)
              .maybeSingle();

            if (orderError) {
              throw orderError;
            }

            const typedOrder = orderRow as {
              quota_filled?: number | null;
              quota_total?: number | null;
              status?: string | null;
              expires_at?: string | null;
            } | null;

            const currentFilled = Math.max(0, Number(typedOrder?.quota_filled) || 0);
            const quotaTotal = Math.max(0, Number(typedOrder?.quota_total) || 0);
            const nextFilled = Math.max(0, currentFilled - 1);
            const currentStatus = String(typedOrder?.status || "").trim().toUpperCase();
            const expiresAt = typedOrder?.expires_at ? new Date(typedOrder.expires_at) : null;
            const isExpired = Boolean(expiresAt && Number.isFinite(expiresAt.getTime()) && expiresAt.getTime() <= Date.now());

            const nextStatus =
              currentStatus === "FULFILLED" && nextFilled < quotaTotal && !isExpired
                ? "OPEN"
                : currentStatus || undefined;

            const { error: deleteFulfillmentError } = await supabaseUntyped
              .from("order_fulfillments")
              .delete()
              .eq("id", fulfillmentId);

            if (deleteFulfillmentError) {
              throw deleteFulfillmentError;
            }

            const orderUpdate: Record<string, unknown> = {
              quota_filled: nextFilled,
            };

            if (nextStatus) {
              orderUpdate.status = nextStatus;
            }

            const { error: updateOrderError } = await supabaseUntyped
              .from("orders")
              .update(orderUpdate)
              .eq("id", orderId);

            if (updateOrderError) {
              throw updateOrderError;
            }
          } else {
            const { error: deleteFulfillmentError } = await supabaseUntyped
              .from("order_fulfillments")
              .delete()
              .eq("id", fulfillmentId);

            if (deleteFulfillmentError) {
              throw deleteFulfillmentError;
            }
          }
        }
      }

      const { error: clearError } = await supabase
        .from("daily_deal_flow")
        .update({ assigned_attorney_id: null } as unknown as Record<string, unknown>)
        .eq("id", rowId);

      if (clearError) {
        throw clearError;
      }

      setAssignedAttorneyName(null);
      props.onUnassigned?.();

      const nextStatus = await refreshDealFlowStatus();
      if (nextStatus === "eligible") {
        void run();
      }

      toast({
        title: "Attorney unassigned",
        description: "The attorney assignment and fulfillment record were cleared. You can now choose a different recommendation.",
      });
    } catch (e) {
      toast({
        title: "Unable to clear assignment",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setClearingAssignment(false);
    }
  };

  const assign = async (rec: Recommendation) => {
    const attorneyLabel = rec.attorney_name || attorneyById.get(rec.lawyer_id) || rec.lawyer_id;

    if (isDeferredAssignment) {
      setAssignedAttorneyName(attorneyLabel);
      props.onAssigned?.({ orderId: rec.order_id ?? "", lawyerId: rec.lawyer_id });

      toast({
        title: "Attorney selected",
        description: `${attorneyLabel} will be saved when the call result is saved.`,
      });
      return;
    }

    if (!user?.id) {
      toast({
        title: "Not signed in",
        description: "You must be signed in to assign orders.",
        variant: "destructive",
      });
      return;
    }

    let ensuredDealFlowRowId: string | null = null;
    try {
      ensuredDealFlowRowId = await ensureDealFlowRowId();
    } catch (e) {
      toast({
        title: "Cannot assign yet",
        description: e instanceof Error ? e.message : "Unable to create or resolve the Daily Deal Flow entry.",
        variant: "destructive",
      });
      return;
    }

    if (!ensuredDealFlowRowId) {
      toast({
        title: "Cannot assign yet",
        description: "Unable to create or resolve the Daily Deal Flow entry.",
        variant: "destructive",
      });
      return;
    }

    const leadId = await fetchLeadIdIfNeeded();
    if (!leadId) {
      toast({
        title: "Lead ID not found",
        description: "Unable to resolve lead id for this submission.",
        variant: "destructive",
      });
      return;
    }

    const assigningKey = rec.order_id ?? rec.lawyer_id;
    setAssigningOrderId(assigningKey);
    try {
      if (rec.order_id) {
        const supabaseRpc = supabase as unknown as SupabaseRpcUntyped;
        const { error: rpcError } = await supabaseRpc.rpc("assign_lead_to_order", {
          p_order_id: rec.order_id,
          p_lead_id: leadId,
          p_agent_id: user.id,
          p_submission_id: props.submissionId,
        });

        if (rpcError) {
          toast({
            title: "Assignment failed",
            description: rpcError.message,
            variant: "destructive",
          });
          return;
        }

        const { error: assignDealFlowError } = await supabase
          .from("daily_deal_flow")
          .update({ assigned_attorney_id: rec.lawyer_id } as unknown as Record<string, unknown>)
          .eq("id", ensuredDealFlowRowId);

        if (assignDealFlowError) {
          throw assignDealFlowError;
        }
      } else {
        let rowId = ensuredDealFlowRowId || dealFlowRowId;
        if (!rowId) {
          const { data: dealRow, error: dealError } = await supabase
            .from("daily_deal_flow")
            .select("id")
            .eq("submission_id", props.submissionId)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (dealError || !dealRow) {
            throw new Error("Unable to resolve the Daily Deal Flow entry to assign.");
          }

          rowId = String((dealRow as { id?: string | null }).id ?? "");
        }

        if (!rowId) {
          throw new Error("Unable to resolve the Daily Deal Flow entry to assign.");
        }

        const { error: assignError } = await supabase
          .from("daily_deal_flow")
          .update({ assigned_attorney_id: rec.lawyer_id } as unknown as Record<string, unknown>)
          .eq("id", rowId);

        if (assignError) {
          throw assignError;
        }
      }

      toast({
        title: "Assigned",
        description: `Lead assigned to ${attorneyLabel}`,
      });

      setAssignedAttorneyName(attorneyLabel);
      setDealFlowStatus("already_assigned");
      props.onAssigned?.({ orderId: rec.order_id ?? "", lawyerId: rec.lawyer_id });

      void refreshDealFlowStatus();
    } catch (e) {
      toast({
        title: "Assignment failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setAssigningOrderId(null);
    }
  };

  const subtitle = useMemo(() => {
    const state = getStateMatchToken(props.leadOverrides?.state) || formatStateFilterLabel(props.leadOverrides?.state);
    if (state) return `Matching open orders for ${state}`;
    return "";
  }, [props.leadOverrides?.state]);
  const hideHeader = props.hideHeader === true;

  const isHorizontalLayout = props.layout === "horizontal";
  const topRecommendationOrderId = stateFilteredData[0]
    ? stateFilteredData[0].order_id ?? stateFilteredData[0].lawyer_id
    : null;
  const minimumHorizontalCards = 4;
  const horizontalRailCardClass = "flex h-[17rem] w-[18rem] shrink-0 flex-col";
  const railAnimation = (index: number) =>
    ({
      className: "animate-fade-in-up motion-reduce:animate-none",
      style: { animationDelay: `${Math.min(index, 5) * 70}ms` },
    }) as const;

  const renderReasonRow = (reason: string, key: string) => {
    const isMismatchReason = /\bmismatch\b/i.test(reason);
    const Icon = isMismatchReason ? XCircle : CheckCircle2;

    return (
      <div key={key} className="flex items-center gap-1.5">
        <Icon className={`h-3 w-3 shrink-0 ${isMismatchReason ? "text-rose-500" : "text-emerald-600"}`} />
        <span className="text-xs leading-snug text-muted-foreground">{reason}</span>
      </div>
    );
  };

  const renderPlaceholderCard = (slotIndex: number) => (
    <div
      key={`upcoming-${slotIndex}`}
      className={`${horizontalRailCardClass} items-center justify-center rounded-xl border border-dashed border-border/50 bg-muted/20 px-5 py-10 dark:border-white/10 dark:bg-white/[0.03] ${railAnimation(slotIndex).className}`}
      style={railAnimation(slotIndex).style}
    >
      <div className="h-8 w-8 rounded-full border-2 border-dashed border-border/40 dark:border-white/15" />
      <span className="mt-3 text-xs text-muted-foreground/70">Awaiting match</span>
    </div>
  );

  const renderNoAttorneyCard = () => (
    <div
      key="no-attorney"
      className={`${horizontalRailCardClass} justify-between rounded-xl border border-dashed border-orange-200/80 bg-[linear-gradient(180deg,rgba(255,248,242,0.96)_0%,rgba(255,255,255,0.98)_100%)] p-4 dark:border-orange-300/25 dark:bg-[linear-gradient(180deg,rgba(234,117,38,0.12)_0%,rgba(24,24,27,0.96)_100%)] ${railAnimation(0).className}`}
      style={railAnimation(0).style}
    >
      <div className="space-y-3">
        <Badge variant="outline" className="rounded-full border-orange-200/80 bg-white/80 px-2 py-0.5 text-[10px] font-semibold text-[#a85221] dark:border-orange-300/30 dark:bg-orange-500/15 dark:text-orange-100">
          No Match
        </Badge>

        <div>
          <div className="text-sm font-semibold text-foreground">No attorney available</div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {hiddenStateMismatchCount > 0
              ? `${hiddenStateMismatchCount} ${hiddenStateMismatchCount === 1 ? "order was" : "orders were"} hidden due to state mismatch. Refresh as inventory updates.`
              : "No open orders match this lead right now. Refresh as inventory updates."}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="rounded-full border border-border/50 bg-background/80 px-2 py-0.5 font-medium text-muted-foreground">
            {getStateMatchToken(props.leadOverrides?.state) || formatStateFilterLabel(props.leadOverrides?.state) || "Unknown"}
          </span>
          {hiddenStateMismatchCount > 0 ? (
            <span className="rounded-full border border-orange-200/60 bg-orange-50/80 px-2 py-0.5 font-medium text-[#a85221] dark:border-orange-300/25 dark:bg-orange-500/15 dark:text-orange-200">
              {hiddenStateMismatchCount} hidden
            </span>
          ) : null}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-center gap-2 rounded-lg border border-dashed border-orange-200/60 py-2.5 dark:border-orange-300/20 dark:bg-white/[0.02]">
        <div className="h-2 w-2 rounded-full border border-orange-300/80 dark:border-orange-200/50" />
        <span className="text-xs text-muted-foreground">Awaiting match</span>
      </div>
    </div>
  );

  const renderRecommendationCard = (rec: Recommendation, horizontal: boolean) => {
    const recommendationKey = rec.order_id ?? rec.lawyer_id;
    const attorneyLabel = rec.attorney_name || attorneyById.get(rec.lawyer_id) || rec.lawyer_id;
    const attorneyMeta = attorneyMetaById.get(rec.lawyer_id);
    const contactNumber = rec.did_number || attorneyMeta?.contactNumber || null;
    const licensedStates = rec.coverage_states.length ? rec.coverage_states : attorneyMeta?.licensedStates ?? [];
    const criteria = attorneyMeta?.criteria ?? null;
    const remaining = Number(rec.remaining) || Math.max(0, Number(rec.quota_total) - Number(rec.quota_filled));
    const isAssigned = props.currentAssignedAttorneyId && props.currentAssignedAttorneyId === rec.lawyer_id;
    const isTopRecommendation = recommendationKey === topRecommendationOrderId;
    const rank = stateFilteredData.findIndex((item) => (item.order_id ?? item.lawyer_id) === recommendationKey) + 1;
    const rawReasons = Array.isArray(rec.reasons) ? rec.reasons : [];
    const previewReasons = rawReasons.slice(0, 2);
    const expiryLabel = (() => {
      const value = formatExpiry(rec.expires_at);
      if (value === "Expires today") return "Today";
      if (value.startsWith("Expires in ")) return value.replace("Expires in ", "");
      return value;
    })();

    const borderTone = isAssigned
      ? "border-[#ea7526] ring-1 ring-[#ea7526]/60 dark:border-orange-400/70 dark:ring-orange-400/30"
      : isTopRecommendation
        ? "border-[#f0b184] dark:border-orange-300/35"
        : "border-border/60 dark:border-white/10 dark:hover:border-white/20";
    const bgTone = isAssigned
      ? "bg-[linear-gradient(180deg,rgba(255,241,230,0.96)_0%,rgba(255,255,255,0.98)_100%)] dark:bg-[linear-gradient(180deg,rgba(234,117,38,0.18)_0%,rgba(24,24,27,0.96)_100%)]"
      : isTopRecommendation
        ? "bg-[linear-gradient(180deg,rgba(255,247,240,0.98)_0%,rgba(255,255,255,0.98)_100%)] dark:bg-[linear-gradient(180deg,rgba(234,117,38,0.11)_0%,rgba(24,24,27,0.96)_100%)]"
        : "bg-[linear-gradient(180deg,rgba(255,250,246,0.92)_0%,rgba(255,255,255,0.98)_100%)] dark:bg-[linear-gradient(180deg,rgba(63,63,70,0.35)_0%,rgba(24,24,27,0.96)_100%)]";

    if (horizontal) {
      return (
        <div
          key={recommendationKey}
          className={`${horizontalRailCardClass} justify-between rounded-xl border p-4 transition-all ${borderTone} ${bgTone} ${railAnimation(rank - 1).className}`}
          style={railAnimation(rank - 1).style}
        >
          <div className="min-w-0 space-y-3">
            {/* Badges */}
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-semibold text-muted-foreground">#{String(rank).padStart(2, "0")}</span>
              {isTopRecommendation ? (
                <Badge className="rounded-full bg-[#ea7526] px-2 py-0 text-[10px] font-semibold text-white hover:bg-[#ea7526]">
                  Top Match
                </Badge>
              ) : null}
              {isAssigned ? (
                <Badge className="rounded-full bg-[#ea7526] px-2 py-0 text-[10px] font-semibold text-white hover:bg-[#ea7526]">
                  Selected
                </Badge>
              ) : null}
            </div>

            {/* Attorney info */}
            <div>
              <div className="truncate text-sm font-semibold text-foreground">{attorneyLabel}</div>
              <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-mono">{contactNumber || "No DID"}</span>
                <span className="text-border">|</span>
                <span>Score {Math.round(rec.score)}</span>
              </div>
            </div>

            {/* States */}
            <div className="flex items-start gap-1.5">
              <MapPin className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground/60" />
              {renderStateBadges(licensedStates)}
            </div>

            {/* Meta row */}
            <div className="flex items-center gap-3 border-t border-border/40 pt-2.5 text-[11px] text-muted-foreground">
              {rec.order_id ? (
                <>
                  <span><strong className="text-foreground">{remaining}</strong> open</span>
                  <span><strong className="text-foreground">{Number(rec.quota_filled)}/{Number(rec.quota_total)}</strong> filled</span>
                  <span>{expiryLabel}</span>
                </>
              ) : (
                <>
                  <span><strong className="text-foreground">License</strong> fallback</span>
                  <span>No open order</span>
                </>
              )}
            </div>

            {/* Reasons & criteria */}
            {previewReasons.length ? (
              <div className="space-y-1">
                {previewReasons.map((reason, idx) =>
                  renderReasonRow(reason, `${recommendationKey}-reason-${idx}`)
                )}
              </div>
            ) : null}

            {criteria ? (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <span className="truncate max-w-[180px]">{criteria.slice(0, 50)}{criteria.length > 50 ? "..." : ""}</span>
                <Popover>
                  <PopoverTrigger asChild>
                    <button className="shrink-0 rounded-full p-0.5 transition-colors hover:bg-muted/50">
                      <InfoIcon className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-72 text-xs">
                    <div className="space-y-1.5">
                      <div className="font-semibold text-foreground">Attorney Criteria</div>
                      <div className="whitespace-pre-wrap text-muted-foreground">{criteria}</div>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            ) : null}
          </div>

          <Button
            size="sm"
            onClick={() => void assign(rec)}
            disabled={assigningOrderId === recommendationKey}
            className="mt-3 w-full gap-2 rounded-lg"
          >
            {assigningOrderId === recommendationKey ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Assigning...
              </>
            ) : isAssigned ? (
              <>
                Selected Attorney
                <CheckCircle2 className="h-3.5 w-3.5" />
              </>
            ) : (
              <>
                Select Attorney
                <ArrowRight className="h-3.5 w-3.5" />
              </>
            )}
          </Button>
        </div>
      );
    }

    return (
      <div
        key={recommendationKey}
        className={`rounded-xl border p-4 ${railAnimation(rank - 1).className} ${
          isAssigned
            ? "border-[#ea7526] bg-orange-50/50 ring-1 ring-[#ea7526]/40 dark:border-orange-400/70 dark:bg-orange-500/15 dark:ring-orange-400/30"
            : isTopRecommendation
              ? "border-[#f0b184] bg-orange-50/30 dark:border-orange-300/35 dark:bg-orange-500/10"
              : "border-border/60 bg-background dark:border-white/10 dark:bg-zinc-950/70"
        }`}
        style={railAnimation(rank - 1).style}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-semibold text-muted-foreground">#{String(rank).padStart(2, "0")}</span>
              {isTopRecommendation ? (
                <Badge className="rounded-full bg-[#ea7526] px-2 py-0 text-[10px] font-semibold text-white hover:bg-[#ea7526]">
                  Top Match
                </Badge>
              ) : null}
              {isAssigned ? (
                <Badge className="rounded-full bg-[#ea7526] px-2 py-0 text-[10px] font-semibold text-white hover:bg-[#ea7526]">
                  Selected
                </Badge>
              ) : null}
            </div>

            <div>
              <div className="truncate text-sm font-semibold text-foreground">{attorneyLabel}</div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                {contactNumber ? <span className="font-mono">{contactNumber}</span> : null}
                {licensedStates.length ? (
                  <span className="inline-flex min-w-0 items-start gap-1">
                    <MapPin className="h-3 w-3" />
                    {renderStateBadges(licensedStates)}
                  </span>
                ) : null}
                {rec.order_id ? (
                  <>
                    <span>{formatExpiry(rec.expires_at)}</span>
                    <span>{remaining} open</span>
                  </>
                ) : (
                  <span>License fallback</span>
                )}
              </div>
            </div>

            {previewReasons.length ? (
              <div className="space-y-0.5">
                {previewReasons.map((reason, idx) =>
                  renderReasonRow(reason, `${recommendationKey}-reason-${idx}`)
                )}
              </div>
            ) : null}

            {criteria ? (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <span className="truncate max-w-[320px]">{criteria.slice(0, 70)}{criteria.length > 70 ? "..." : ""}</span>
                <Popover>
                  <PopoverTrigger asChild>
                    <button className="shrink-0 rounded-full p-0.5 transition-colors hover:bg-muted/50">
                      <InfoIcon className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-72 text-xs">
                    <div className="space-y-1.5">
                      <div className="font-semibold text-foreground">Attorney Criteria</div>
                      <div className="whitespace-pre-wrap text-muted-foreground">{criteria}</div>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            ) : null}
          </div>

          <Button
            size="sm"
            onClick={() => void assign(rec)}
            disabled={assigningOrderId === recommendationKey}
            className="shrink-0 gap-2"
          >
            {assigningOrderId === recommendationKey ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Assigning...
              </>
            ) : isAssigned ? (
              <>
                Selected
                <CheckCircle2 className="h-3.5 w-3.5" />
              </>
            ) : (
              <>
                Select
                <ArrowRight className="h-3.5 w-3.5" />
              </>
            )}
          </Button>
        </div>
      </div>
    );
  };

  const refreshButton = (
    <Button
      variant="outline"
      size="sm"
      onClick={() =>
        void refreshDealFlowStatus().then((status) => {
          if (status === "eligible") {
            void run();
          }
        })
      }
      disabled={loading || clearingAssignment}
      className="h-8 gap-2 rounded-md border-[#e6b086] bg-[#fff4ea] px-3 text-xs font-medium text-[#7a3718] shadow-sm hover:bg-[#ffe9d8] hover:text-[#6a2d13] dark:border-orange-300/25 dark:bg-orange-500/10 dark:text-orange-200 dark:hover:bg-orange-500/20 dark:hover:text-orange-100"
    >
      <RefreshCw className={`h-3.5 w-3.5 ${loading || clearingAssignment ? "animate-spin" : ""}`} />
      Refresh
    </Button>
  );

  const recommendationContent = (
    <div className="space-y-3">
      {hideHeader ? (
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            {subtitle ? (
              <span className="text-xs text-muted-foreground">{subtitle}</span>
            ) : null}
            {loadingLead ? <Badge variant="outline" className="text-[10px]">Resolving...</Badge> : null}
          </div>
          {refreshButton}
        </div>
      ) : null}

        {dealFlowStatus === "loading" ? (
          <div className="flex items-center gap-2 rounded-lg border bg-muted/20 px-4 py-3.5 text-sm text-muted-foreground dark:border-white/10 dark:bg-white/[0.03]">
            <Loader2 className="h-4 w-4 animate-spin" />
            Checking Daily Deal Flow status...
          </div>
        ) : dealFlowStatus === "not_found" ? (
          <div className="flex items-center gap-2 rounded-lg border bg-muted/20 px-4 py-3.5 text-sm text-muted-foreground dark:border-white/10 dark:bg-white/[0.03]">
            <Info className="h-4 w-4 shrink-0" />
            This lead does not exist in Daily Deal Flow yet. Create a deal entry first.
          </div>
        ) : dealFlowStatus === "already_assigned" ? (
          <div className="space-y-3 rounded-lg border bg-muted/20 px-4 py-3.5 dark:border-white/10 dark:bg-white/[0.03]">
            <div className="flex items-center gap-2 text-sm">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-500/15">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-300" />
              </div>
              <span className="text-muted-foreground">
                Assigned to <strong className="text-foreground">{assignedAttorneyName}</strong>
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void clearAssignedAttorney()}
                disabled={clearingAssignment}
                className="gap-1.5 text-xs dark:border-white/15 dark:bg-white/5 dark:text-zinc-200 dark:hover:bg-white/10"
              >
                {clearingAssignment ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Undo2 className="h-3 w-3" />
                )}
                {clearingAssignment ? "Clearing..." : "Unassign"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {error ? (
              <div className="rounded-lg border bg-background px-3 py-2.5 text-sm text-muted-foreground dark:border-white/10 dark:bg-zinc-950/70">
                Failed to load recommendations: {error}
              </div>
            ) : null}

            {loading || !hasResolvedRecommendations ? (
              isHorizontalLayout ? (
                <div className="-mx-1 overflow-x-auto pb-2">
                  <div className="flex min-w-max items-start gap-4 px-1">
                    {Array.from({ length: minimumHorizontalCards }).map((_, idx) => renderPlaceholderCard(idx))}
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-lg border bg-muted/20 px-4 py-3.5 text-sm text-muted-foreground dark:border-white/10 dark:bg-white/[0.03]">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading recommendations...
                </div>
              )
            ) : null}

            {!loading && hasResolvedRecommendations && stateFilteredData.length === 0 ? (
              isHorizontalLayout ? (
                <div className="-mx-1 overflow-x-auto pb-2">
                  <div className="flex min-w-max items-start gap-4 px-1">
                    {renderNoAttorneyCard()}
                    {Array.from({ length: minimumHorizontalCards - 1 }).map((_, idx) => renderPlaceholderCard(idx))}
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border bg-muted/20 px-4 py-3.5 text-sm text-muted-foreground dark:border-white/10 dark:bg-white/[0.03]">
                  No matching open orders found.
                </div>
              )
            ) : null}

            {!loading && hasResolvedRecommendations && stateFilteredData.length > 0 ? (
              isHorizontalLayout ? (
                <div className="-mx-1 overflow-x-auto pb-2">
                  <div className="flex min-w-max items-start gap-4 px-1">
                    {stateFilteredData.map((rec) => renderRecommendationCard(rec, true))}
                    {Array.from({ length: Math.max(0, minimumHorizontalCards - stateFilteredData.length) }).map((_, idx) =>
                      renderPlaceholderCard(idx)
                    )}
                  </div>
                </div>
              ) : (
                stateFilteredData.map((rec) => renderRecommendationCard(rec, false))
              )
            ) : null}
          </div>
        )}
    </div>
  );

  if (hideHeader) {
    return recommendationContent;
  }

  return (
    <Card className="overflow-hidden border-[#f2d5c1] shadow-sm dark:border-orange-400/20 dark:bg-zinc-950 dark:shadow-black/30">
      <div className="flex items-center justify-between gap-3 border-b border-[#f2d5c1] bg-[linear-gradient(90deg,rgba(234,117,38,0.28)_0%,rgba(234,117,38,0.14)_12%,rgba(234,117,38,0.07)_24%,rgba(234,117,38,0.02)_34%,rgba(234,117,38,0)_46%)] px-5 py-3.5 dark:border-orange-400/20 dark:bg-[linear-gradient(90deg,rgba(234,117,38,0.18)_0%,rgba(234,117,38,0.08)_18%,rgba(0,0,0,0)_48%)]">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-sm font-bold tracking-tight">Attorney Recommendations</span>
          {subtitle ? (
            <span className="hidden text-xs text-muted-foreground sm:inline">{subtitle}</span>
          ) : null}
          {loadingLead ? <Badge variant="outline" className="text-[10px]">Resolving...</Badge> : null}
        </div>
        {refreshButton}
      </div>

      <CardContent className="space-y-3 pt-4">
        {recommendationContent}
      </CardContent>
    </Card>
  );
};
