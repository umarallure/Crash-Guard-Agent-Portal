import { useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw, Info, InfoIcon } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
}) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const { attorneys } = useAttorneys();

  const [resolvedLeadId, setResolvedLeadId] = useState<string | null>(props.leadId ?? null);
  const [loadingLead, setLoadingLead] = useState(false);

  const [loading, setLoading] = useState(false);
  const [assigningOrderId, setAssigningOrderId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Recommendation[]>([]);

  // Daily deal flow eligibility check
  const [dealFlowStatus, setDealFlowStatus] = useState<'loading' | 'not_found' | 'already_assigned' | 'eligible'>('loading');
  const [assignedAttorneyName, setAssignedAttorneyName] = useState<string | null>(null);

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

  // Check daily_deal_flow for this submission on mount
  useEffect(() => {
    const checkDealFlow = async () => {
      if (!props.submissionId) {
        setDealFlowStatus('not_found');
        return;
      }

      try {
        const { data: dealRow, error: dealError } = await supabase
          .from('daily_deal_flow')
          .select('*')
          .eq('submission_id', props.submissionId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (dealError || !dealRow) {
          setDealFlowStatus('not_found');
          return;
        }

        const row = dealRow as unknown as Record<string, unknown>;
        const assignedId = row?.assigned_attorney_id as string | null;
        if (assignedId && String(assignedId).trim()) {
          setDealFlowStatus('already_assigned');
          // Resolve attorney name
          const label = attorneyById.get(assignedId);
          setAssignedAttorneyName(label || assignedId);
        } else {
          setDealFlowStatus('eligible');
        }
      } catch {
        setDealFlowStatus('not_found');
      }
    };

    checkDealFlow();
  }, [props.submissionId, attorneyById]);

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
    // Only fetch recommendations if the lead is eligible (exists in daily deal flow with no attorney assigned)
    if (dealFlowStatus !== 'eligible') return;
    // Debounced auto-refresh when input changes
    const t = window.setTimeout(() => {
      void run();
    }, 600);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload, dealFlowStatus]);

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

      props.onAssigned?.({ orderId: rec.order_id, lawyerId: rec.lawyer_id });

      // Refresh recommendations after assignment
      void run();
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
    return "Matching open orders";
  }, [props.leadOverrides?.state]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div className="min-w-0">
          <CardTitle className="truncate">Recommendations</CardTitle>
          <div className="text-xs text-muted-foreground truncate">{subtitle}</div>
        </div>

        <div className="flex items-center gap-2">
          {loadingLead ? <Badge variant="outline">Resolving lead…</Badge> : null}
          <Button variant="outline" size="sm" onClick={() => void run()} disabled={loading || dealFlowStatus !== 'eligible'}>
            <RefreshCw className={loading ? "mr-2 h-4 w-4 animate-spin" : "mr-2 h-4 w-4"} />
            Refresh
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {dealFlowStatus === 'loading' ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Checking Daily Deal Flow status…
          </div>
        ) : dealFlowStatus === 'not_found' ? (
          <div className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-3 text-sm text-muted-foreground">
            <Info className="h-4 w-4 shrink-0" />
            This lead does not exist in Daily Deal Flow yet. Recommendations cannot be shown until a Daily Deal Flow entry is created.
          </div>
        ) : dealFlowStatus === 'already_assigned' ? (
          <div className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-3 text-sm text-muted-foreground">
            <Info className="h-4 w-4 shrink-0" />
            This lead is already assigned to <strong className="text-foreground">{assignedAttorneyName}</strong>. Recommendations are not available for already-assigned leads.
          </div>
        ) : (
          <div className="space-y-3">
            {error ? (
              <div className="rounded-md border bg-background px-3 py-2 text-sm text-muted-foreground">
                Failed to load recommendations: {error}
              </div>
            ) : null}

            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading recommendations…
              </div>
            ) : null}

            {!loading && data.length === 0 ? (
              <div className="text-sm text-muted-foreground">No matching open orders found.</div>
            ) : null}

            {data.map((rec) => {
              const attorneyLabel = attorneyById.get(rec.lawyer_id) || rec.lawyer_id;
              const attorneyMeta = attorneyMetaById.get(rec.lawyer_id);
              const contactNumber = attorneyMeta?.contactNumber ?? null;
              const licensedStates = attorneyMeta?.licensedStates ?? [];
              const criteria = attorneyMeta?.criteria ?? null;
              const remaining = Number(rec.remaining) || Math.max(0, Number(rec.quota_total) - Number(rec.quota_filled));
              const isAssigned = props.currentAssignedAttorneyId && props.currentAssignedAttorneyId === rec.lawyer_id;
              const showAttorneyMeta = Boolean(contactNumber) || licensedStates.length > 0;
            return (
              <div key={rec.order_id} className="rounded-lg border bg-background p-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto] sm:items-start">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <div className="truncate text-sm font-semibold">{attorneyLabel}</div>
                      {isAssigned ? <Badge>Currently Assigned</Badge> : null}
                    </div>

                    {showAttorneyMeta ? (
                      <div className="rounded-md bg-muted/30 px-2 py-1 text-xs">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground">
                          <span className="text-[11px] font-medium uppercase tracking-wide">Attorney</span>
                          {contactNumber ? (
                            <span className="inline-flex items-center gap-1">
                              <span className="font-medium text-foreground">DID:</span>
                              <span className="font-mono text-foreground">{contactNumber}</span>
                            </span>
                          ) : null}
                          {licensedStates.length ? (
                            <span className="inline-flex min-w-0 items-center gap-1">
                              <span className="font-medium text-foreground">Licensed States:</span>
                              <span className="truncate text-foreground">
                                {licensedStates.slice(0, 10).join(", ")}
                                {licensedStates.length > 10 ? "…" : ""}
                              </span>
                            </span>
                          ) : null}
                          {criteria ? (
                            <span className="inline-flex items-center gap-1">
                              <span className="font-medium text-foreground">Criteria:</span>
                              <span className="truncate text-foreground max-w-[200px]">
                                {criteria.slice(0, 50)}{criteria.length > 50 ? "..." : ""}
                              </span>
                              <Popover>
                                <PopoverTrigger asChild>
                                  <button className="inline-flex items-center justify-center rounded-sm hover:bg-muted/50 p-0.5 transition-colors">
                                    <InfoIcon className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent className="w-80 text-xs">
                                  <div className="space-y-2">
                                    <div className="font-semibold text-foreground">Attorney Criteria</div>
                                    <div className="text-muted-foreground whitespace-pre-wrap">{criteria}</div>
                                  </div>
                                </PopoverContent>
                              </Popover>
                            </span>
                          ) : null}
                        </div>
                      </div>
                    ) : null}

                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                          Recommendation
                        </span>
                        <Badge variant="secondary">Score {Math.round(rec.score)}</Badge>
                        <Badge variant="outline">{formatExpiry(rec.expires_at)}</Badge>
                        <Badge variant="outline">
                          {Number(rec.quota_filled)}/{Number(rec.quota_total)} filled
                        </Badge>
                        <Badge variant="outline">{remaining} remaining</Badge>
                      </div>

                      {Array.isArray(rec.reasons) && rec.reasons.length ? (
                        <div className="space-y-1 text-xs text-muted-foreground">
                          {rec.reasons.slice(0, 3).map((r, idx) => (
                            <div key={`${rec.order_id}-reason-${idx}`} className="truncate">
                              {r}
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>

                    <div className="flex shrink-0 items-start justify-end gap-2 sm:flex-col sm:items-end">
                      <Button
                        size="sm"
                        onClick={() => void assign(rec)}
                        disabled={assigningOrderId === rec.order_id}
                        className="w-full sm:w-auto"
                      >
                        {assigningOrderId === rec.order_id ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Assigning…
                          </>
                        ) : (
                          "Assign"
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
