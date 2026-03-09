import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Loader2, RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { usePipelineStages } from "@/hooks/usePipelineStages";

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

type SupabaseFromWithEqUntyped = {
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
        order: (
          column: string,
          opts: { ascending: boolean }
        ) => Promise<{ data: unknown[] | null; error: unknown }>;
      };
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

type AssignedLeadRow = {
  fulfillment_id: string;
  lead_id: string;
  submission_id: string | null;
  insured_name: string | null;
  client_phone_number: string | null;
  state: string | null;
  status: string | null;
  assigned_attorney_id: string | null;
  assigned_at: string;
};

const clampPercent = (n: number) => Math.max(0, Math.min(100, n));

const getOrderPercent = (order: OrderRow) => {
  const total = Number(order.quota_total) || 0;
  const filled = Number(order.quota_filled) || 0;
  if (total <= 0) return 0;
  return clampPercent((filled / total) * 100);
};

const formatCurrency = (amount: number) => {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
  } catch {
    return String(amount);
  }
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
  const { stages: submissionStages } = usePipelineStages("submission_portal");
  const attorneyLabelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of attorneys) {
      const label = (a.full_name || "").trim() || (a.primary_email || "").trim() || a.user_id;
      map.set(a.user_id, label);
    }
    return map;
  }, [attorneys]);

  const submissionStageLabelByKey = useMemo(() => {
    const map = new Map<string, string>();
    (submissionStages ?? []).forEach((s) => {
      if (s?.key && s?.label) map.set(String(s.key), String(s.label));
    });
    return map;
  }, [submissionStages]);

  const [order, setOrder] = useState<OrderRow | null>(null);
  const [leads, setLeads] = useState<DailyDealFlowRow[]>([]);
  const [leadIdBySubmissionId, setLeadIdBySubmissionId] = useState<Record<string, string>>({});
  const [recommendedDeals, setRecommendedDeals] = useState<RecommendedDeal[]>([]);
  const [assignedLeads, setAssignedLeads] = useState<AssignedLeadRow[]>([]);

  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<"suggested" | "assigned">("suggested");

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmRow, setConfirmRow] = useState<DailyDealFlowRow | null>(null);
  const [confirmLeadId, setConfirmLeadId] = useState<string | null>(null);

  const [confirmRate, setConfirmRate] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    if (!orderId) return;

    setLoading(true);
    setError(null);
    try {
      const supabaseUntyped = supabase as unknown as SupabaseOrdersUntyped;

      const supabaseFromUntyped = supabase as unknown as SupabaseFromUntyped;
      const supabaseFromWithEqUntyped = supabase as unknown as SupabaseFromWithEqUntyped;

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
      setAssignedLeads([]);

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

      const { data: assignedRowsRaw, error: assignedErr } = await supabaseFromWithEqUntyped
        .from("order_fulfillments")
        .select(
          "id,lead_id,agent_id,created_at,leads(id,submission_id,customer_full_name,phone_number,state)"
        )
        .eq("order_id", orderId)
        .order("created_at", { ascending: false });

      if (!assignedErr && Array.isArray(assignedRowsRaw)) {
        const assignedRows = assignedRowsRaw as Array<Record<string, unknown>>;

        const submissionIdsToFetch: string[] = [];
        const baseAssigned: Omit<AssignedLeadRow, "status" | "assigned_attorney_id">[] = [];

        for (const r of assignedRows) {
          const fulfillmentId = String(r.id ?? "");
          const leadId = String(r.lead_id ?? "");
          const createdAt = String(r.created_at ?? "");
          const lead = (r.leads ?? null) as Record<string, unknown> | null;

          const submissionId = lead?.submission_id ? String(lead.submission_id) : null;
          if (submissionId) submissionIdsToFetch.push(submissionId);

          baseAssigned.push({
            fulfillment_id: fulfillmentId,
            lead_id: leadId,
            submission_id: submissionId,
            insured_name: lead?.customer_full_name ? String(lead.customer_full_name) : null,
            client_phone_number: lead?.phone_number ? String(lead.phone_number) : null,
            state: lead?.state ? String(lead.state) : null,
            assigned_at: createdAt,
          });
        }

        const statusBySubmissionId = new Map<string, { status: string | null; assigned_attorney_id: string | null }>();

        const uniqueSubmissionIds = Array.from(new Set(submissionIdsToFetch)).filter(Boolean);
        if (uniqueSubmissionIds.length) {
          const { data: dealRowsRaw, error: dealRowsErr } = await supabase
            .from("daily_deal_flow")
            .select("submission_id,status,assigned_attorney_id,created_at")
            .in("submission_id", uniqueSubmissionIds)
            .order("created_at", { ascending: false });

          if (!dealRowsErr && Array.isArray(dealRowsRaw)) {
            for (const d of dealRowsRaw as unknown as Array<Record<string, unknown>>) {
              const sid = d.submission_id ? String(d.submission_id) : "";
              if (!sid || statusBySubmissionId.has(sid)) continue;
              statusBySubmissionId.set(sid, {
                status: d.status ? String(d.status) : null,
                assigned_attorney_id: d.assigned_attorney_id ? String(d.assigned_attorney_id) : null,
              });
            }
          }
        }

        const nextAssigned: AssignedLeadRow[] = baseAssigned.map((a) => {
          const deal = a.submission_id ? statusBySubmissionId.get(a.submission_id) : undefined;
          return {
            ...a,
            status: deal?.status ?? null,
            assigned_attorney_id: deal?.assigned_attorney_id ?? null,
          };
        });

        setAssignedLeads(nextAssigned);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setOrder(null);
      setLeads([]);
      setLeadIdBySubmissionId({});
      setRecommendedDeals([]);
      setAssignedLeads([]);
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

  const filteredAssignedLeads = useMemo(() => {
    const q = query.trim().toLowerCase();

    return assignedLeads.filter((r) => {
      if (!q) return true;
      const haystack = [
        r.submission_id ?? "",
        r.insured_name ?? "",
        r.client_phone_number ?? "",
        r.state ?? "",
        r.status ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [assignedLeads, query]);

  const attorneyRateById = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of attorneys) {
      const n = a.case_rate_per_deal;
      if (typeof n === "number" && Number.isFinite(n)) {
        map.set(a.user_id, n);
      }
    }
    return map;
  }, [attorneys]);

  const performAssign = async (row: DailyDealFlowRow, leadId: string) => {
    if (!user?.id) {
      toast({
        title: "Not signed in",
        description: "You must be signed in to assign leads.",
        variant: "destructive",
      });
      return;
    }

    if (!order) return;

    const submissionId = row.submission_id ? String(row.submission_id) : "";

    const rateToPersist = confirmRate;

    setAssigningId(row.id);
    try {
      if (submissionId && typeof rateToPersist === "number" && Number.isFinite(rateToPersist)) {
        const { error: rateErr } = await supabase
          .from("daily_deal_flow")
          .update({ applied_case_rate_per_deal: rateToPersist } as unknown as Record<string, unknown>)
          .eq("submission_id", submissionId);

        // Best-effort: do not block assignment if column doesn't exist / RLS denies.
        if (rateErr) {
          console.warn("Failed to persist applied_case_rate_per_deal:", rateErr);
        }
      }

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

  const openAssignConfirm = async (row: DailyDealFlowRow) => {
    const submissionId = row.submission_id ? String(row.submission_id) : "";
    const leadId = submissionId ? leadIdBySubmissionId[submissionId] : undefined;

    if (!leadId) {
      toast({
        title: "Lead ID not found",
        description: "Unable to resolve lead id for this submission.",
        variant: "destructive",
      });
      return;
    }

    setConfirmRow(row);
    setConfirmLeadId(leadId);

    // Primary: attorney profile rate. Fallback: deal-level persisted rate.
    const primaryRate = order?.lawyer_id ? attorneyRateById.get(order.lawyer_id) ?? null : null;
    setConfirmRate(primaryRate);
    setConfirmOpen(true);

    if (primaryRate === null && submissionId) {
      const { data, error: e } = await supabase
        .from("daily_deal_flow")
        .select("applied_case_rate_per_deal")
        .eq("submission_id", submissionId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!e) {
        const raw = (data as unknown as { applied_case_rate_per_deal?: number | null } | null)
          ?.applied_case_rate_per_deal;
        const n = typeof raw === "number" ? raw : raw ? Number(raw) : NaN;
        if (Number.isFinite(n)) setConfirmRate(n);
      }
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
            {lawyerLabel ? <span> Lawyer: {lawyerLabel}</span> : null}
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
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between gap-3">
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
            {order?.status ? (
              <Badge variant={order.status === "OPEN" ? "secondary" : order.status === "FULFILLED" ? "default" : "outline"}>
                {order.status}
              </Badge>
            ) : null}
          </div>

          <Progress value={pct} />

          {order ? (
            <div className="text-sm text-muted-foreground">
              {(order.target_states ?? []).length ? <span>States: {(order.target_states ?? []).join(", ")}</span> : <span>States: —</span>}
              <span> · </span>
              <span>
                Type: {order.case_type}
                {order.case_subtype ? ` (${order.case_subtype})` : ""}
              </span>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm assignment</AlertDialogTitle>
            <AlertDialogDescription>
              {(() => {
                const n = confirmRate;
                const amountLabel = typeof n === "number" && Number.isFinite(n) ? formatCurrency(n) : "—";
                const attorneyLabel = assignedLawyerLabel || "this attorney";
                return (
                  <div className="space-y-1">
                    <div>
                      <span className="font-medium">Amount per case:</span> {amountLabel}
                    </div>
                    <div>
                      This will be the amount assigned for this case fulfillment for {attorneyLabel}.
                    </div>
                  </div>
                );
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={assigningId !== null}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={assigningId !== null || !confirmRow || !confirmLeadId}
              onClick={(e) => {
                e.preventDefault();
                if (!confirmRow || !confirmLeadId) return;
                void performAssign(confirmRow, confirmLeadId);
                setConfirmOpen(false);
              }}
            >
              Assign
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
            <Badge variant="secondary">
              {activeTab === "assigned" ? filteredAssignedLeads.length : filteredLeads.length} leads
            </Badge>
          </div>

          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "suggested" | "assigned")}>
            <TabsList>
              <TabsTrigger value="suggested">Suggested ({recommendedDeals.length})</TabsTrigger>
              <TabsTrigger value="assigned">Assigned ({assignedLeads.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="suggested">
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
                        <TableCell className="text-sm">
                          {(() => {
                            const raw = (r.status || "").toString().trim();
                            if (!raw) return "—";
                            return submissionStageLabelByKey.get(raw) ?? raw;
                          })()}
                        </TableCell>
                        <TableCell className="text-sm">{assignedLabel}</TableCell>
                        <TableCell>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void openAssignConfirm(r)}
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
            </TabsContent>

            <TabsContent value="assigned">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead>State</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Assigned</TableHead>
                    <TableHead>Assigned At</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAssignedLeads.map((r) => {
                    const assignedLabel = r.assigned_attorney_id
                      ? attorneyLabelById.get(r.assigned_attorney_id) || r.assigned_attorney_id
                      : assignedLawyerLabel || (order?.lawyer_id ? attorneyLabelById.get(order.lawyer_id) || order.lawyer_id : "Assigned");

                    return (
                      <TableRow key={r.fulfillment_id}>
                        <TableCell>
                          <div className="space-y-0.5">
                            <div className="font-medium">{r.insured_name || "—"}</div>
                            <div className="text-xs text-muted-foreground">{r.client_phone_number || "—"}</div>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">{r.state || "—"}</TableCell>
                        <TableCell className="text-sm">
                          {(() => {
                            const raw = (r.status || "").toString().trim();
                            if (!raw) return "—";
                            return submissionStageLabelByKey.get(raw) ?? raw;
                          })()}
                        </TableCell>
                        <TableCell className="text-sm">{assignedLabel}</TableCell>
                        <TableCell className="text-sm">
                          {r.assigned_at ? formatDate(r.assigned_at) : "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}

                  {!loading && filteredAssignedLeads.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                        No assigned leads
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default OrderFulfillmentAssignPage;
