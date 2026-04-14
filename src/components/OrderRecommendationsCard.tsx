import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, Info, InfoIcon, Loader2, MapPin, RefreshCw, Undo2, XCircle } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useAttorneys } from "@/hooks/useAttorneys";
import { formatStateFilterLabel, getStateMatchToken } from "@/lib/stateFilter";

type LeadOverrides = {
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

type RecommendResponse = {
  lead?: {
    state?: string | null;
    submission_id?: string | null;
    lead_id?: string | null;
  };
  recommendations?: Recommendation[];
  error?: string;
};

type SupabaseRpcUntyped = {
  rpc: (
    fn: string,
    args: Record<string, unknown>
  ) => Promise<{ data: unknown; error: { message?: string } | null }>;
};

type SupabaseFromUntyped = {
  from: (table: string) => any;
};

const formatExpiry = (iso: string) => {
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

export const OrderRecommendationsCard = (props: {
  submissionId: string;
  leadId?: string | null;
  leadOverrides?: LeadOverrides;
  currentAssignedAttorneyId?: string | null;
  onAssigned?: (input: { orderId: string; lawyerId: string }) => void;
  onUnassigned?: () => void;
  layout?: "list" | "horizontal";
  hideHeader?: boolean;
}) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const { attorneys } = useAttorneys({ accountType: "internal_lawyer" });

  const [resolvedLeadId, setResolvedLeadId] = useState<string | null>(props.leadId ?? null);
  const [loadingLead, setLoadingLead] = useState(false);

  const [loading, setLoading] = useState(false);
  const [hasResolvedRecommendations, setHasResolvedRecommendations] = useState(false);
  const [assigningOrderId, setAssigningOrderId] = useState<string | null>(null);
  const [clearingAssignment, setClearingAssignment] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Recommendation[]>([]);

  const [dealFlowStatus, setDealFlowStatus] = useState<"loading" | "not_found" | "already_assigned" | "eligible">("loading");
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
      setDealFlowStatus("not_found");
      return "not_found" as const;
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
        setDealFlowStatus("not_found");
        return "not_found" as const;
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
      setDealFlowStatus("not_found");
      return "not_found" as const;
    }
  }, [props.submissionId, attorneyById]);

  useEffect(() => {
    void refreshDealFlowStatus();
  }, [refreshDealFlowStatus]);

  const fetchLeadIdIfNeeded = async () => {
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
  };

  const leadOverrideState = props.leadOverrides?.state ?? null;
  const leadOverrideInsured = props.leadOverrides?.insured ?? null;
  const leadOverridePriorAttorneyInvolved = props.leadOverrides?.prior_attorney_involved ?? null;
  const leadOverrideCurrentlyRepresented = props.leadOverrides?.currently_represented ?? null;
  const leadOverrideIsInjured = props.leadOverrides?.is_injured ?? null;
  const leadOverrideReceivedMedicalTreatment = props.leadOverrides?.received_medical_treatment ?? null;
  const leadOverrideAccidentLastTwelveMonths = props.leadOverrides?.accident_last_12_months ?? null;

  const payload = useMemo(() => {
    return {
      lead: {
        submission_id: props.submissionId,
        lead_id: resolvedLeadId,
        state: leadOverrideState,
        insured: leadOverrideInsured,
        prior_attorney_involved: leadOverridePriorAttorneyInvolved,
        currently_represented: leadOverrideCurrentlyRepresented,
        is_injured: leadOverrideIsInjured,
        received_medical_treatment: leadOverrideReceivedMedicalTreatment,
        accident_last_12_months: leadOverrideAccidentLastTwelveMonths,
      },
      limit: 8,
    };
  }, [
    props.submissionId,
    resolvedLeadId,
    leadOverrideState,
    leadOverrideInsured,
    leadOverridePriorAttorneyInvolved,
    leadOverrideCurrentlyRepresented,
    leadOverrideIsInjured,
    leadOverrideReceivedMedicalTreatment,
    leadOverrideAccidentLastTwelveMonths,
  ]);

  const requestSignature = useMemo(
    () =>
      JSON.stringify({
        submissionId: props.submissionId,
        leadId: resolvedLeadId,
        state: leadOverrideState,
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
      await fetchLeadIdIfNeeded();

      const { data: fnData, error: fnError } = await supabase.functions.invoke("recommend-open-orders", {
        body: payload,
      });

      if (fnError) {
        setError(fnError.message);
        setData([]);
        return;
      }

      const parsed = (fnData ?? {}) as RecommendResponse;
      const recs = Array.isArray(parsed.recommendations) ? parsed.recommendations : [];
      setData(recs);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setData([]);
    } finally {
      setLoading(false);
      setHasResolvedRecommendations(true);
    }
  }, [payload]);

  useEffect(() => {
    if (dealFlowStatus !== "eligible") {
      setHasResolvedRecommendations(false);
      setLoading(false);
      return;
    }

    setHasResolvedRecommendations(false);
    void run();
  }, [dealFlowStatus, requestSignature, run]);

  const clearAssignedAttorney = async () => {
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
        const latestStatus = await refreshDealFlowStatus();
        if (latestStatus === "not_found") {
          throw new Error("Daily Deal Flow entry not found for this submission.");
        }

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

  const ensureDealExists = async () => {
    if (!props.submissionId) return false;

    const sid = String(props.submissionId || "").trim();
    if (!sid) return false;

    const { count, error: dealError } = await supabase
      .from("daily_deal_flow")
      .select("id", { count: "exact", head: true })
      .eq("submission_id", sid);

    if (dealError || !count) {
      toast({
        title: "Cannot assign yet",
        description:
          "This submission is not in Daily Deal Flow. Create a deal (Daily Deal Flow entry) first, then assign it to an order.",
        variant: "destructive",
      });
      return false;
    }

    return true;
  };

  const assign = async (rec: Recommendation) => {
    if (!user?.id) {
      toast({
        title: "Not signed in",
        description: "You must be signed in to assign orders.",
        variant: "destructive",
      });
      return;
    }

    const hasDeal = await ensureDealExists();
    if (!hasDeal) return;

    const leadId = await fetchLeadIdIfNeeded();
    if (!leadId) {
      toast({
        title: "Lead ID not found",
        description: "Unable to resolve lead id for this submission.",
        variant: "destructive",
      });
      return;
    }

    setAssigningOrderId(rec.order_id);
    try {
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

      toast({
        title: "Assigned",
        description: `Lead assigned to ${attorneyById.get(rec.lawyer_id) || rec.lawyer_id}`,
      });

      setAssignedAttorneyName(attorneyById.get(rec.lawyer_id) || rec.lawyer_id);
      setDealFlowStatus("already_assigned");
      props.onAssigned?.({ orderId: rec.order_id, lawyerId: rec.lawyer_id });

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
  const topRecommendationOrderId = stateFilteredData[0]?.order_id ?? null;
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
      className={`${horizontalRailCardClass} items-center justify-center rounded-xl border border-dashed border-border/50 bg-muted/20 px-5 py-10 ${railAnimation(slotIndex).className}`}
      style={railAnimation(slotIndex).style}
    >
      <div className="h-8 w-8 rounded-full border-2 border-dashed border-border/40" />
      <span className="mt-3 text-xs text-muted-foreground/70">Awaiting match</span>
    </div>
  );

  const renderNoAttorneyCard = () => (
    <div
      key="no-attorney"
      className={`${horizontalRailCardClass} justify-between rounded-xl border border-dashed border-orange-200/80 bg-[linear-gradient(180deg,rgba(255,248,242,0.96)_0%,rgba(255,255,255,0.98)_100%)] p-4 ${railAnimation(0).className}`}
      style={railAnimation(0).style}
    >
      <div className="space-y-3">
        <Badge variant="outline" className="rounded-full border-orange-200/80 bg-white/80 px-2 py-0.5 text-[10px] font-semibold text-[#a85221]">
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
            <span className="rounded-full border border-orange-200/60 bg-orange-50/80 px-2 py-0.5 font-medium text-[#a85221]">
              {hiddenStateMismatchCount} hidden
            </span>
          ) : null}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-center gap-2 rounded-lg border border-dashed border-orange-200/60 py-2.5">
        <div className="h-2 w-2 rounded-full border border-orange-300/80" />
        <span className="text-xs text-muted-foreground">Awaiting match</span>
      </div>
    </div>
  );

  const renderRecommendationCard = (rec: Recommendation, horizontal: boolean) => {
    const attorneyLabel = attorneyById.get(rec.lawyer_id) || rec.lawyer_id;
    const attorneyMeta = attorneyMetaById.get(rec.lawyer_id);
    const contactNumber = attorneyMeta?.contactNumber ?? null;
    const licensedStates = attorneyMeta?.licensedStates ?? [];
    const criteria = attorneyMeta?.criteria ?? null;
    const remaining = Number(rec.remaining) || Math.max(0, Number(rec.quota_total) - Number(rec.quota_filled));
    const isAssigned = props.currentAssignedAttorneyId && props.currentAssignedAttorneyId === rec.lawyer_id;
    const isTopRecommendation = rec.order_id === topRecommendationOrderId;
    const rank = stateFilteredData.findIndex((item) => item.order_id === rec.order_id) + 1;
    const rawReasons = Array.isArray(rec.reasons) ? rec.reasons : [];
    const licensedStatesLabel = licensedStates.length ? licensedStates.join(", ") : "Not listed";
    const previewReasons = rawReasons.slice(0, 2);
    const expiryLabel = (() => {
      const value = formatExpiry(rec.expires_at);
      if (value === "Expires today") return "Today";
      if (value.startsWith("Expires in ")) return value.replace("Expires in ", "");
      return value;
    })();

    const borderTone = isAssigned
      ? "border-[#ea7526] ring-1 ring-[#ea7526]/60"
      : isTopRecommendation
        ? "border-[#f0b184]"
        : "border-border/60";
    const bgTone = isAssigned
      ? "bg-[linear-gradient(180deg,rgba(255,241,230,0.96)_0%,rgba(255,255,255,0.98)_100%)]"
      : isTopRecommendation
        ? "bg-[linear-gradient(180deg,rgba(255,247,240,0.98)_0%,rgba(255,255,255,0.98)_100%)]"
        : "bg-[linear-gradient(180deg,rgba(255,250,246,0.92)_0%,rgba(255,255,255,0.98)_100%)]";

    if (horizontal) {
      return (
        <div
          key={rec.order_id}
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
              <span className="text-xs leading-snug text-foreground">{licensedStatesLabel}</span>
            </div>

            {/* Meta row */}
            <div className="flex items-center gap-3 border-t border-border/40 pt-2.5 text-[11px] text-muted-foreground">
              <span><strong className="text-foreground">{remaining}</strong> open</span>
              <span><strong className="text-foreground">{Number(rec.quota_filled)}/{Number(rec.quota_total)}</strong> filled</span>
              <span>{expiryLabel}</span>
            </div>

            {/* Reasons & criteria */}
            {previewReasons.length ? (
              <div className="space-y-1">
                {previewReasons.map((reason, idx) =>
                  renderReasonRow(reason, `${rec.order_id}-reason-${idx}`)
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
            disabled={assigningOrderId === rec.order_id}
            className="mt-3 w-full gap-2 rounded-lg"
          >
            {assigningOrderId === rec.order_id ? (
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
        key={rec.order_id}
        className={`rounded-xl border p-4 ${railAnimation(rank - 1).className} ${
          isAssigned
            ? "border-[#ea7526] bg-orange-50/50 ring-1 ring-[#ea7526]/40"
            : isTopRecommendation
              ? "border-[#f0b184] bg-orange-50/30"
              : "border-border/60 bg-background"
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
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {licensedStates.join(", ")}
                  </span>
                ) : null}
                <span>{formatExpiry(rec.expires_at)}</span>
                <span>{remaining} open</span>
              </div>
            </div>

            {previewReasons.length ? (
              <div className="space-y-0.5">
                {previewReasons.map((reason, idx) =>
                  renderReasonRow(reason, `${rec.order_id}-reason-${idx}`)
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
            disabled={assigningOrderId === rec.order_id}
            className="shrink-0 gap-2"
          >
            {assigningOrderId === rec.order_id ? (
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
      className="h-8 gap-2 rounded-md border-[#e6b086] bg-[#fff4ea] px-3 text-xs font-medium text-[#7a3718] shadow-sm hover:bg-[#ffe9d8] hover:text-[#6a2d13]"
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
          <div className="flex items-center gap-2 rounded-lg border bg-muted/20 px-4 py-3.5 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Checking Daily Deal Flow status...
          </div>
        ) : dealFlowStatus === "not_found" ? (
          <div className="flex items-center gap-2 rounded-lg border bg-muted/20 px-4 py-3.5 text-sm text-muted-foreground">
            <Info className="h-4 w-4 shrink-0" />
            This lead does not exist in Daily Deal Flow yet. Create a deal entry first.
          </div>
        ) : dealFlowStatus === "already_assigned" ? (
          <div className="space-y-3 rounded-lg border bg-muted/20 px-4 py-3.5">
            <div className="flex items-center gap-2 text-sm">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
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
                className="gap-1.5 text-xs"
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
              <div className="rounded-lg border bg-background px-3 py-2.5 text-sm text-muted-foreground">
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
                <div className="flex items-center gap-2 rounded-lg border bg-muted/20 px-4 py-3.5 text-sm text-muted-foreground">
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
                <div className="rounded-lg border bg-muted/20 px-4 py-3.5 text-sm text-muted-foreground">
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
    <Card className="overflow-hidden border-[#f2d5c1] shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-[#f2d5c1] bg-[linear-gradient(90deg,rgba(234,117,38,0.28)_0%,rgba(234,117,38,0.14)_12%,rgba(234,117,38,0.07)_24%,rgba(234,117,38,0.02)_34%,rgba(234,117,38,0)_46%)] px-5 py-3.5">
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
