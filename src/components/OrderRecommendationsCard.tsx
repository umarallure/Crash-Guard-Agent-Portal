import { useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

  const attorneyById = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of attorneys) {
      const label = (a.full_name || "").trim() || (a.primary_email || "").trim() || a.user_id;
      map.set(a.user_id, label);
    }
    return map;
  }, [attorneys]);

  useEffect(() => {
    setResolvedLeadId(props.leadId ?? null);
  }, [props.leadId]);

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

      const next = (leadRow as any)?.id ? String((leadRow as any).id) : null;
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
    // Debounced auto-refresh when input changes
    const t = window.setTimeout(() => {
      void run();
    }, 600);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload]);

  const assign = async (rec: Recommendation) => {
    if (!user?.id) {
      toast({
        title: "Not signed in",
        description: "You must be signed in to assign orders.",
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

    setAssigningOrderId(rec.order_id);
    try {
      const { data: rpcData, error: rpcError } = await supabase.rpc("assign_lead_to_order", {
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
        description: `Lead assigned to order ${rec.order_id}`,
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
          <Button variant="outline" size="sm" onClick={() => void run()} disabled={loading}>
            <RefreshCw className={loading ? "mr-2 h-4 w-4 animate-spin" : "mr-2 h-4 w-4"} />
            Refresh
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
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

        <div className="space-y-3">
          {data.map((rec) => {
            const attorneyLabel = attorneyById.get(rec.lawyer_id) || rec.lawyer_id;
            const remaining = Number(rec.remaining) || Math.max(0, Number(rec.quota_total) - Number(rec.quota_filled));
            const isAssigned = props.currentAssignedAttorneyId && props.currentAssignedAttorneyId === rec.lawyer_id;
            return (
              <div key={rec.order_id} className="rounded-lg border p-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="truncate font-medium">{attorneyLabel}</div>
                      {isAssigned ? <Badge>Currently Assigned</Badge> : null}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="secondary">Score {Math.round(rec.score)}</Badge>
                      <Badge variant="outline">{formatExpiry(rec.expires_at)}</Badge>
                      <Badge variant="outline">
                        {Number(rec.quota_filled)}/{Number(rec.quota_total)} filled
                      </Badge>
                      <Badge variant="outline">{remaining} remaining</Badge>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant="outline" className="font-mono">
                      {rec.order_id.slice(0, 8)}
                    </Badge>
                    <Button
                      size="sm"
                      onClick={() => void assign(rec)}
                      disabled={assigningOrderId === rec.order_id}
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

                {Array.isArray(rec.reasons) && rec.reasons.length ? (
                  <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                    {rec.reasons.slice(0, 6).map((r, idx) => (
                      <div key={`${rec.order_id}-reason-${idx}`} className="truncate">
                        {r}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};
