import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Loader2, RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useAttorneys } from "@/hooks/useAttorneys";

type OrderStatus = "OPEN" | "FULFILLED" | "EXPIRED";

type OrderRow = {
  id: string;
  lawyer_id: string;
  target_states: string[];
  case_type: string;
  case_subtype: string | null;
  quota_total: number;
  quota_filled: number;
  status: OrderStatus;
  expires_at: string;
  created_at: string;
};

type DailyDealFlowRow = {
  id: string;
  submission_id: string | null;
  insured_name: string | null;
  client_phone_number: string | null;
  state: string | null;
  status: string | null;
  assigned_attorney_id: string | null;
  created_at: string;
};

type LeadIdRow = {
  id: string;
  submission_id: string;
};

type RecommendResponse = {
  order_id?: string;
  recommendations?: Array<
    DailyDealFlowRow & {
      lead_id: string | null;
      score: number;
      reasons: string[];
    }
  >;
  error?: string;
};

type SupabaseRpcUntyped = {
  rpc: (
    fn: string,
    args: Record<string, unknown>
  ) => Promise<{ data: unknown; error: { message?: string } | null }>;
};

type SupabaseFromUntyped = {
  from: (
    table: string
  ) => {
    select: (
      cols: string
    ) => {
      order: (
        column: string,
        opts: { ascending: boolean }
      ) => Promise<{ data: unknown[] | null; error: unknown }>;
    };
  };
};

type SupabaseOrdersUntyped = {
  from: (
    table: string
  ) => {
    select: (
      cols: string
    ) => {
      eq: (
        column: string,
        value: string
      ) => {
        maybeSingle: () => Promise<{ data: unknown | null; error: unknown }>;
      };
    };
  };
};

type RecommendedDeal = DailyDealFlowRow & {
  recommendationScore: number;
  recommendationReasons: string[];
  lead_id?: string | null;
};

const clampPercent = (n: number) => Math.max(0, Math.min(100, n));

const getOrderPercent = (order: OrderRow) => {
  const total = Number(order.quota_total) || 0;
  const filled = Number(order.quota_filled) || 0;
  if (total <= 0) return 0;
  return clampPercent((filled / total) * 100);
};

const formatDate = (iso: string) => {
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "2-digit",
      year: "numeric",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
};

const OrderFulfillmentAssignPage = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const navigate = useNavigate();
  const params = useParams();
  const [searchParams] = useSearchParams();

  const orderId = params.orderId || "";
  const lawyerId = searchParams.get("lawyerId") || null;

  const { attorneys } = useAttorneys();
  const attorneyLabelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of attorneys) {
      const label = (a.full_name || "").trim() || (a.primary_email || "").trim() || a.user_id;
      map.set(a.user_id, label);
    }
    return map;
  }, [attorneys]);

  const [order, setOrder] = useState<OrderRow | null>(null);
  const [leads, setLeads] = useState<DailyDealFlowRow[]>([]);
  const [leadIdBySubmissionId, setLeadIdBySubmissionId] = useState<Record<string, string>>({});
  const [recommendedDeals, setRecommendedDeals] = useState<RecommendedDeal[]>([]);

  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const allowedDealStatusKeywords = [
    "returned back",
    "returned to center",
    "dropped retainers",
    "dropped retainer",
    "signed retainers",
    "signed retainer",
    "retainer signed",
  ];

  const ensureDealStatusIsAllowed = (status: string | null) => {
    const normalized = String(status ?? "").trim().toLowerCase();
    const ok = Boolean(normalized) && allowedDealStatusKeywords.some((kw) => normalized.includes(kw));
    if (ok) return true;

    toast({
      title: "Cannot assign deal",
      description:
        "This deal must be in a Returned / Dropped Retainers / Signed Retainers state before it can be assigned.",
      variant: "destructive",
    });
    return false;
  };

  const ensureDealExists = async (submissionId: string) => {
    const sid = String(submissionId || "").trim();
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

  const refresh = useCallback(async () => {
    if (!orderId) return;

    setLoading(true);
    setError(null);
    try {
      const supabaseUntyped = supabase as unknown as SupabaseOrdersUntyped;

      const { data: orderData, error: orderError } = await supabaseUntyped
        .from("orders")
        .select(
          "id,lawyer_id,target_states,case_type,case_subtype,quota_total,quota_filled,status,expires_at,created_at"
        )
        .eq("id", orderId)
        .maybeSingle();

      if (orderError) throw orderError;

      const nextOrder = (orderData ?? null) as OrderRow | null;
      setOrder(nextOrder);

      setRecommendedDeals([]);

      const { data: fnData, error: fnError } = await supabase.functions.invoke(
        "recommend-deals-for-order",
        {
          body: {
            order_id: orderId,
            limit: 75,
          },
        }
      );

      if (fnError) throw fnError;

      const parsed = (fnData ?? {}) as RecommendResponse;
      const recs = Array.isArray(parsed.recommendations) ? parsed.recommendations : [];

      const deals: RecommendedDeal[] = recs.map((r) => {
        const row = r as unknown as DailyDealFlowRow & {
          lead_id: string | null;
          score: number;
          reasons: string[];
        };

        return {
          ...row,
          recommendationScore: Number(row.score) || 0,
          recommendationReasons: Array.isArray(row.reasons) ? row.reasons : [],
          lead_id: row.lead_id ?? null,
        };
      });

      setLeads(deals);
      setRecommendedDeals(deals);

      const leadMap: Record<string, string> = {};
      for (const d of deals) {
        const sid = d.submission_id ? String(d.submission_id) : "";
        if (!sid) continue;
        if (d.lead_id) leadMap[sid] = String(d.lead_id);
      }
      setLeadIdBySubmissionId(leadMap);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setOrder(null);
      setLeads([]);
      setLeadIdBySubmissionId({});
      setRecommendedDeals([]);
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filteredLeads = useMemo(() => {
    const q = query.trim().toLowerCase();

    return recommendedDeals.filter((r) => {
      if (!q) return true;
      const haystack = [
        r.submission_id ?? "",
        r.insured_name ?? "",
        r.client_phone_number ?? "",
        r.state ?? "",
        r.status ?? "",
        String(r.recommendationScore ?? ""),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [recommendedDeals, query]);

  const assign = async (row: DailyDealFlowRow) => {
    if (!user?.id) {
      toast({
        title: "Not signed in",
        description: "You must be signed in to assign leads.",
        variant: "destructive",
      });
      return;
    }

    if (!order) return;

    const statusAllowed = ensureDealStatusIsAllowed(row.status);
    if (!statusAllowed) return;

    const submissionId = row.submission_id ? String(row.submission_id) : "";

    const hasDeal = await ensureDealExists(submissionId);
    if (!hasDeal) return;

    const leadId = submissionId ? leadIdBySubmissionId[submissionId] : undefined;

    if (!leadId) {
      toast({
        title: "Lead ID not found",
        description: "Unable to resolve lead id for this submission.",
        variant: "destructive",
      });
      return;
    }

    setAssigningId(row.id);
    try {
      const supabaseRpc = supabase as unknown as SupabaseRpcUntyped;
      const { error: rpcError } = await supabaseRpc.rpc("assign_lead_to_order", {
        p_order_id: order.id,
        p_lead_id: leadId,
        p_agent_id: user.id,
        p_submission_id: submissionId,
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
        description: `Lead assigned to ${assignedLawyerLabel || "lawyer"}`,
      });

      await refresh();
    } catch (e) {
      toast({
        title: "Assignment failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setAssigningId(null);
    }
  };

  const pct = order ? getOrderPercent(order) : 0;
  const pctRounded = Math.round(pct);
  const lawyerLabel = lawyerId ? attorneyLabelById.get(lawyerId) : null;
  const assignedLawyerLabel = lawyerLabel || (order?.lawyer_id ? attorneyLabelById.get(order.lawyer_id) || order.lawyer_id : null);

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold">Fulfill Order</h2>
          <div className="text-sm text-muted-foreground">
            Order: <span className="font-mono">{orderId}</span>
            {lawyerLabel ? <span> · Lawyer: {lawyerLabel}</span> : null}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => void refresh()} disabled={loading}>
            <RefreshCw className={loading ? "mr-2 h-4 w-4 animate-spin" : "mr-2 h-4 w-4"} />
            Refresh
          </Button>
          <Button variant="outline" onClick={() => navigate("/order-fulfillment")}>Back</Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-md border bg-background px-3 py-2 text-sm text-muted-foreground">
          Failed to load: {error}
        </div>
      ) : null}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground">Order Progress</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-3">
          <div className="space-y-0.5">
            <div className="text-2xl font-semibold">{pctRounded}%</div>
            <div className="text-sm text-muted-foreground">
              {order ? (
                <>
                  {Number(order.quota_filled) || 0}/{Number(order.quota_total) || 0} filled · Expires {formatDate(order.expires_at)}
                </>
              ) : (
                "—"
              )}
            </div>
          </div>
          {order?.status ? <Badge variant={order.status === "OPEN" ? "secondary" : order.status === "FULFILLED" ? "default" : "outline"}>{order.status}</Badge> : null}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex-1">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by submission id, name, phone, state..."
              />
            </div>
            <Badge variant="secondary">{filteredLeads.length} leads</Badge>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead>State</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Assigned</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLeads.map((r) => {
                const submissionId = r.submission_id ? String(r.submission_id) : "";
                const leadId = submissionId ? leadIdBySubmissionId[submissionId] : undefined;
                const assignedLabel = r.assigned_attorney_id
                  ? attorneyLabelById.get(r.assigned_attorney_id) || r.assigned_attorney_id
                  : "Unassigned";

                return (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div className="space-y-0.5">
                        <div className="font-medium">{r.insured_name || "—"}</div>
                        <div className="text-xs text-muted-foreground">{r.client_phone_number || "—"}</div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{r.state || "—"}</TableCell>
                    <TableCell className="text-sm">{r.status || "—"}</TableCell>
                    <TableCell className="text-sm">{assignedLabel}</TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void assign(r)}
                        disabled={loading || assigningId === r.id || !leadId || !order}
                      >
                        {assigningId === r.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Assign
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}

              {!loading && filteredLeads.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                    No leads found
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default OrderFulfillmentAssignPage;
