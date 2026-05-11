import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { formatDateUS } from "@/lib/dateUtils";

type RetainerStageKey = "paid_retainer" | "non_paid_retainer" | "chargeback";

type RetainerStage = {
  key: RetainerStageKey;
  label: string;
  columnClass: string;
};

const kanbanStages: RetainerStage[] = [
  {
    key: "paid_retainer",
    label: "Paid Retainer",
    columnClass: "border-green-200 bg-green-50/40",
  },
  {
    key: "non_paid_retainer",
    label: "Non-Paid retainer",
    columnClass: "border-amber-200 bg-amber-50/40",
  },
  {
    key: "chargeback",
    label: "Chargeback",
    columnClass: "border-red-200 bg-red-50/40",
  },
];

const RetainersKanbanPage = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any[]>([]);
  const [columnPage, setColumnPage] = useState<Record<string, number>>({});
  const pageSize = 25;

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const { data: rows, error } = await supabase
          .from("daily_deal_flow")
          .select("*")
          .order("date", { ascending: false })
          .order("created_at", { ascending: false });

        if (error) {
          toast({
            title: "Error",
            description: "Failed to fetch retainers",
            variant: "destructive",
          });
          return;
        }

        setData(rows ?? []);
      } catch (error) {
        toast({
          title: "Error",
          description: "An unexpected error occurred",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };

    void fetchData();
  }, [toast]);

  const columns = useMemo(() => {
    const grouped = new Map<RetainerStageKey, any[]>();
    kanbanStages.forEach((s) => grouped.set(s.key, []));

    data.forEach((row) => {
      const status = (row?.status ?? "").toString().trim().toLowerCase();
      if (status === "paid retainer") grouped.get("paid_retainer")?.push(row);
      else if (status === "non paid retainer" || status === "non-paid retainer" || status === "nonpaid retainer") {
        grouped.get("non_paid_retainer")?.push(row);
      } else if (status === "chargeback") grouped.get("chargeback")?.push(row);
    });

    return grouped;
  }, [data]);

  useEffect(() => {
    setColumnPage((prev) => {
      const next: Record<string, number> = { ...prev };
      kanbanStages.forEach((stage) => {
        const rows = columns.get(stage.key) || [];
        const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
        const current = Number(next[stage.key] ?? 1);
        next[stage.key] = Math.min(Math.max(1, current), totalPages);
      });
      return next;
    });
  }, [columns]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Loading retainers...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-7xl mx-auto space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold">Filters</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label>Date</Label>
                  <Input type="date" />
                </div>

                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value="__ALL__" onValueChange={() => undefined}>
                    <SelectTrigger>
                      <SelectValue placeholder="All Statuses" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="__ALL__">All Statuses</SelectItem>
                        {kanbanStages.map((s) => (
                          <SelectItem key={s.key} value={s.label}>
                            {s.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Search</Label>
                  <Input placeholder="Search by name, phone, submission ID, or email" />
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex min-h-[650px] flex-1 flex-col">
            <div className="min-h-0 flex-1 overflow-auto p-4">
              <div className="flex min-h-0 min-w-[980px] gap-3 pr-2">
                {kanbanStages.map((stage) => {
                  const rows = columns.get(stage.key) || [];
                  const current = Number(columnPage[stage.key] ?? 1);
                  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
                  const startIndex = (current - 1) * pageSize;
                  const endIndex = startIndex + pageSize;
                  const pageRows = rows.slice(startIndex, endIndex);

                  return (
                    <Card
                      key={stage.key}
                      className={`flex min-h-[560px] h-full w-[26rem] flex-col bg-muted/20 ${stage.columnClass}`}
                    >
                      <CardHeader className="flex flex-row items-center justify-between gap-2 border-b">
                        <CardTitle className="text-sm font-semibold">{stage.label}</CardTitle>
                        <Badge variant="secondary">{rows.length}</Badge>
                      </CardHeader>
                      <CardContent className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
                        {pageRows.length === 0 ? (
                          <div className="rounded-md border border-dashed border-muted-foreground/30 px-3 py-6 text-center text-xs text-muted-foreground">
                            No leads
                          </div>
                        ) : (
                          pageRows.map((row) => (
                            <Card key={row.id} className="w-full">
                              <CardContent className="p-2">
                                <div className="truncate text-sm font-semibold">{row.insured_name || "Unnamed"}</div>
                                <div className="mt-0.5 text-xs text-muted-foreground">
                                  {row.client_phone_number || "N/A"}
                                </div>
                                <div className="mt-2 flex items-center justify-between gap-2">
                                  <Badge variant="secondary" className="text-xs">
                                    {row.lead_vendor || "Unknown"}
                                  </Badge>
                                  <div className="text-xs text-muted-foreground">{formatDateUS(row.date)}</div>
                                </div>
                              </CardContent>
                            </Card>
                          ))
                        )}
                      </CardContent>

                      {rows.length > pageSize && (
                        <div className="flex flex-wrap items-center justify-between gap-3 border-t px-3 py-2 text-xs">
                          <span className="text-muted-foreground">
                            Page {current} of {totalPages}
                          </span>
                          <div className="flex items-center gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                setColumnPage((prev) => ({
                                  ...prev,
                                  [stage.key]: Math.max(1, current - 1),
                                }))
                              }
                              disabled={current === 1}
                            >
                              Previous
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                setColumnPage((prev) => ({
                                  ...prev,
                                  [stage.key]: Math.min(totalPages, current + 1),
                                }))
                              }
                              disabled={current === totalPages}
                            >
                              Next
                            </Button>
                          </div>
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RetainersKanbanPage;
