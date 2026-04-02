import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, Info, InfoIcon, Loader2, MapPin, RefreshCw, Undo2, XCircle } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useAttorneys } from "@/hooks/useAttorneys";

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
}) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const { attorneys } = useAttorneys();

  const [resolvedLeadId, setResolvedLeadId] = useState<string | null>(props.leadId ?? null);
  const [loadingLead, setLoadingLead] = useState(false);

  const [loading, setLoading] = useState(false);
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
            .map((s: unknown) => String(s ?? "").trim().toUpperCase())
            .filter(Boolean)
        : [];

      const rawCriteria = (a as unknown as { criteria?: unknown })?.criteria;
      const criteria = typeof rawCriteria === "string" ? rawCriteria.trim() || null : null;

      map.set(a.user_id, { contactNumber, licensedStates, criteria });
    }

    return map;
  }, [attorneys]);

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

  const payload = useMemo(() => {
    return {
      lead: {
        submission_id: props.submissionId,
        lead_id: resolvedLeadId,
        ...(props.leadOverrides || {}),
      },
      limit: 8,
    };
  }, [props.submissionId, resolvedLeadId, props.leadOverrides]);

  const run = async () => {
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
    }
  };

  useEffect(() => {
    if (dealFlowStatus !== "eligible") return;

    const t = window.setTimeout(() => {
      void run();
    }, 600);

    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload, dealFlowStatus]);

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
    const state = String(props.leadOverrides?.state ?? "").trim();
    if (state) return `Matching open orders for ${state.toUpperCase()}`;
    return "";
  }, [props.leadOverrides?.state]);

  const isHorizontalLayout = props.layout === "horizontal";
  const topRecommendationOrderId = data[0]?.order_id ?? null;
  const minimumHorizontalCards = 4;
  const horizontalCardShellClass = "flex h-[19.5rem] w-[20rem] shrink-0 flex-col justify-between rounded-[22px] p-4 shadow-sm";

  const renderStatChip = (label: string, value: string) => (
    <div className="inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-background/80 px-2.5 py-1 text-[11px] shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]">
      <span className="font-semibold text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );

  const renderReasonRow = (reason: string, key: string) => {
    const isMismatchReason = /\bmismatch\b/i.test(reason);
    const Icon = isMismatchReason ? XCircle : CheckCircle2;

    return (
      <div key={key} className="flex gap-2">
        <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${isMismatchReason ? "text-rose-500" : "text-emerald-600"}`} />
        <span className="leading-5">{reason}</span>
      </div>
    );
  };

  const renderPlaceholderCard = (slotIndex: number) => (
    <div
      key={`upcoming-${slotIndex}`}
      className={`${horizontalCardShellClass} self-start overflow-hidden border border-dashed border-border/60 bg-[linear-gradient(180deg,rgba(255,250,246,0.88)_0%,rgba(255,255,255,0.98)_100%)]`}
    >
      <div className="min-w-0 space-y-2.5">
        <div className="flex items-start justify-between gap-3">
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-8 w-20 rounded-full" />
        </div>

        <div className="space-y-1.5 rounded-[18px] border border-border/40 bg-background/75 px-3.5 py-2">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-24" />
        </div>

        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-7 w-24 rounded-full" />
          <Skeleton className="h-7 w-24 rounded-full" />
          <Skeleton className="h-7 w-28 rounded-full" />
        </div>

        <div className="min-h-[5.25rem] rounded-[18px] border border-dashed border-border/60 bg-background/75 px-3 py-1.5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Incoming Match</div>
          <div className="mt-1 text-[11px] leading-4 text-muted-foreground">
            This slot fills automatically when another qualified attorney order becomes available.
          </div>
        </div>
      </div>

      <Skeleton className="h-9 w-full rounded-md" />
    </div>
  );

  const renderNoAttorneyCard = () => (
    <div
      key="no-attorney"
      className={`${horizontalCardShellClass} overflow-hidden border border-dashed border-orange-200/80 bg-[linear-gradient(180deg,rgba(255,248,242,0.96)_0%,rgba(255,255,255,0.98)_100%)] shadow-[0_18px_36px_-28px_rgba(234,117,38,0.28)]`}
    >
      <div className="space-y-2.5">
        <div className="flex items-start justify-between gap-3">
          <Badge variant="outline" className="rounded-full border-orange-200/80 bg-white/80 px-2 py-0 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#a85221]">
            No Match
          </Badge>
          <div className="rounded-2xl border border-orange-200/70 bg-white/80 px-3 py-2 text-right shadow-sm">
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Status</div>
            <div className="text-sm font-semibold text-foreground">Waiting</div>
          </div>
        </div>

        <div className="rounded-[18px] border border-orange-200/60 bg-white/85 px-3.5 py-3 shadow-sm">
          <div className="text-base font-semibold text-foreground">No attorney available right now</div>
          <div className="mt-2 text-sm leading-6 text-muted-foreground">
            There are no open attorney orders matching this lead at the moment. Refresh again as inventory updates.
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {renderStatChip("Lead State", String(props.leadOverrides?.state ?? "Unknown").trim().toUpperCase() || "Unknown")}
          {renderStatChip("Matches", "0 open")}
          {renderStatChip("Next Step", "Refresh")}
        </div>
      </div>

      <Button
        variant="outline"
        size="sm"
        onClick={() => void run()}
        disabled={loading}
        className="w-full gap-2 rounded-md border-orange-200/80 bg-white/80 text-[#8b451d] hover:bg-orange-50 hover:text-[#6f2f08]"
      >
        <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
        Refresh Recommendations
      </Button>
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
    const rank = data.findIndex((item) => item.order_id === rec.order_id) + 1;
    const rawReasons = Array.isArray(rec.reasons) ? rec.reasons : [];
    const didLabel = contactNumber || "Not available";
    const licensedStatesLabel = licensedStates.length ? licensedStates.join(", ") : "Not listed";
    const leadState = String(props.leadOverrides?.state ?? "").trim().toUpperCase();
    const stateReason = leadState
      ? `State ${licensedStates.includes(leadState) ? "match" : "mismatch"}: ${leadState}`
      : null;
    const previewReasons = (
      stateReason
        ? [
            stateReason,
            ...rawReasons.filter((reason) => !/\bstate\s+(match|mismatch)\b/i.test(reason)),
          ]
        : rawReasons
    ).slice(0, 2);
    const expiryLabel = (() => {
      const value = formatExpiry(rec.expires_at);
      if (value === "Expires today") return "Today";
      if (value.startsWith("Expires in ")) return value.replace("Expires in ", "");
      return value;
    })();
    const selectionToneClass = isAssigned
      ? "border-[#ea7526] bg-[linear-gradient(180deg,rgba(255,241,230,0.96)_0%,rgba(255,255,255,0.98)_100%)] ring-1 ring-[#ea7526]/80 shadow-[0_20px_40px_-28px_rgba(234,117,38,0.42)]"
      : isTopRecommendation
      ? "border-[#f0b184] bg-[linear-gradient(180deg,rgba(255,236,220,0.98)_0%,rgba(255,247,240,0.98)_46%,rgba(255,255,255,0.98)_100%)] shadow-[0_20px_40px_-30px_rgba(234,117,38,0.34)]"
      : "border-border/60 bg-[linear-gradient(180deg,rgba(255,250,246,0.92)_0%,rgba(255,255,255,0.98)_100%)]";
    const selectedBadgeClass = "rounded-full bg-[#ea7526] px-2 py-0 text-[10px] font-semibold text-white hover:bg-[#ea7526]";
    const topMatchBadgeClass = "rounded-full bg-[#ea7526] px-2 py-0 text-[10px] font-semibold text-white hover:bg-[#ea7526]";

    if (horizontal) {
      return (
        <div
          key={rec.order_id}
          className={`${horizontalCardShellClass} border transition-all ${selectionToneClass}`}
        >
          <div className="min-w-0 space-y-1.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="rounded-full px-2 py-0 text-[10px] font-semibold">
                    #{String(rank).padStart(2, "0")}
                  </Badge>
                  {isTopRecommendation ? (
                    <Badge className={topMatchBadgeClass}>
                      Top Match
                    </Badge>
                  ) : null}
                  {isAssigned ? (
                    <Badge className={selectedBadgeClass}>
                      Selected
                    </Badge>
                  ) : null}
                </div>

                <div className="space-y-1">
                  <div className="truncate text-base font-semibold leading-tight text-foreground">{attorneyLabel}</div>
                  <div className="flex items-center gap-1.5 text-sm">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">DID:</span>
                    <span className="font-mono text-sm text-foreground">{didLabel}</span>
                  </div>
                  <div className="pt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Licensed States
                  </div>
                  <div className="text-sm leading-5 text-foreground">{licensedStatesLabel}</div>
                </div>
              </div>

              <div className={`shrink-0 rounded-full border px-2 py-1 text-right shadow-sm ${isAssigned || isTopRecommendation ? "border-[#f0b184] bg-white/90" : "border-border/50 bg-background/85"}`}>
                <div className="flex items-center gap-1">
                  <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Score
                  </span>
                  <span className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-foreground">{Math.round(rec.score)}</span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {renderStatChip("Open", String(remaining))}
              {renderStatChip("Filled", `${Number(rec.quota_filled)}/${Number(rec.quota_total)}`)}
              {renderStatChip("Expiry", expiryLabel)}
            </div>

            {(previewReasons.length || criteria) ? (
              <div className="space-y-2 px-0.5 pt-1">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Match Notes
                  </div>
                  {criteria ? (
                    <Popover>
                      <PopoverTrigger asChild>
                        <button className="inline-flex items-center justify-center rounded-full border border-border/60 bg-background p-1 transition-colors hover:bg-muted/50">
                          <InfoIcon className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-80 text-xs">
                        <div className="space-y-2">
                          <div className="font-semibold text-foreground">Attorney Criteria</div>
                          <div className="whitespace-pre-wrap text-muted-foreground">{criteria}</div>
                        </div>
                      </PopoverContent>
                    </Popover>
                  ) : null}
                </div>

                {previewReasons.length ? (
                  <div className="space-y-1 text-sm text-muted-foreground">
                    {previewReasons.map((reason, idx) =>
                      renderReasonRow(reason, `${rec.order_id}-reason-${idx}`)
                    )}
                  </div>
                ) : (
                  <div className="text-xs leading-5 text-muted-foreground">
                    Review the attorney criteria details before assigning this lead.
                  </div>
                )}
              </div>
            ) : null}
          </div>

          <div className="mt-1">
            <Button
              size="sm"
              onClick={() => void assign(rec)}
              disabled={assigningOrderId === rec.order_id}
              className="w-full gap-2 rounded-md"
            >
              {assigningOrderId === rec.order_id ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Assigning...
                </>
              ) : isAssigned ? (
                <>
                  Selected Attorney
                  <CheckCircle2 className="h-4 w-4" />
                </>
              ) : (
                <>
                  Select Attorney
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </div>
      );
    }

    return (
      <div
        key={rec.order_id}
        className={`rounded-xl border p-4 ${
          isAssigned
            ? "border-orange-300 bg-orange-50/50"
            : isTopRecommendation
            ? "border-emerald-200 bg-emerald-50/40"
            : "bg-background"
        }`}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto] sm:items-start">
          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="rounded-full px-2 py-0 text-[10px] font-semibold">
                #{String(rank).padStart(2, "0")}
              </Badge>
              {isTopRecommendation ? (
                <Badge className={topMatchBadgeClass}>
                  Top Match
                </Badge>
              ) : null}
              {isAssigned ? <Badge className={selectedBadgeClass}>Selected</Badge> : null}
            </div>

            <div className="space-y-1">
              <div className="truncate text-base font-semibold text-foreground">{attorneyLabel}</div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {contactNumber ? (
                  <span className="inline-flex items-center gap-1">
                    <span className="font-semibold text-muted-foreground">DID:</span>
                    <span className="font-mono text-foreground">{contactNumber}</span>
                  </span>
                ) : null}
                {licensedStates.length ? (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    <span className="whitespace-normal break-words text-foreground">
                      {licensedStates.join(", ")}
                    </span>
                  </span>
                ) : null}
                <span>{formatExpiry(rec.expires_at)}</span>
                <span>{remaining} open</span>
              </div>
            </div>

            {previewReasons.length ? (
              <div className="space-y-1 text-sm text-muted-foreground">
                {previewReasons.map((reason, idx) =>
                  renderReasonRow(reason, `${rec.order_id}-reason-${idx}`)
                )}
              </div>
            ) : null}

            {criteria ? (
              <div className="rounded-md bg-muted/30 px-3 py-2 text-xs">
                <div className="flex items-center gap-1 text-muted-foreground">
                  <span className="font-medium text-foreground">Criteria:</span>
                  <span className="truncate max-w-[320px] text-foreground">
                    {criteria.slice(0, 70)}
                    {criteria.length > 70 ? "..." : ""}
                  </span>
                  <Popover>
                    <PopoverTrigger asChild>
                      <button className="inline-flex items-center justify-center rounded-sm p-0.5 transition-colors hover:bg-muted/50">
                        <InfoIcon className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80 text-xs">
                      <div className="space-y-2">
                        <div className="font-semibold text-foreground">Attorney Criteria</div>
                        <div className="whitespace-pre-wrap text-muted-foreground">{criteria}</div>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            ) : null}
          </div>

          <div className="flex shrink-0 items-start justify-end gap-2 sm:flex-col sm:items-end">
            <Button
              size="sm"
              onClick={() => void assign(rec)}
              disabled={assigningOrderId === rec.order_id}
              className="w-full gap-2 sm:w-auto"
            >
              {assigningOrderId === rec.order_id ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Assigning...
                </>
              ) : isAssigned ? (
                <>
                  Selected
                  <CheckCircle2 className="h-4 w-4" />
                </>
              ) : (
                <>
                  Select
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    );
  };

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
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void refreshDealFlowStatus().then((status) => {
            if (status === "eligible") {
              void run();
            }
          })}
          disabled={loading || clearingAssignment}
          className="h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
        >
          <RefreshCw className={`h-3 w-3 ${loading || clearingAssignment ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <CardContent className="space-y-3 pt-4">
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

            {loading ? (
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

            {!loading && data.length === 0 ? (
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

            {!loading && data.length > 0 ? (
              isHorizontalLayout ? (
                <div className="-mx-1 overflow-x-auto pb-2">
                  <div className="flex min-w-max items-start gap-4 px-1">
                    {data.map((rec) => renderRecommendationCard(rec, true))}
                    {Array.from({ length: Math.max(0, minimumHorizontalCards - data.length) }).map((_, idx) =>
                      renderPlaceholderCard(idx)
                    )}
                  </div>
                </div>
              ) : (
                data.map((rec) => renderRecommendationCard(rec, false))
              )
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
