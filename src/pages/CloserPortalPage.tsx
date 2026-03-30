import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, RefreshCw, StickyNote } from "lucide-react";
import { usePipelineStages } from "@/hooks/usePipelineStages";

interface CloserPortalRow {
  id: string;
  submission_id: string;
  date?: string;
  insured_name?: string;
  lead_vendor?: string;
  client_phone_number?: string;
  buffer_agent?: string;
  agent?: string;
  licensed_agent_account?: string;
  assigned_attorney_id?: string | null;
  status?: string;
  call_result?: string;
  carrier?: string;
  product_type?: string;
  notes?: string;
  created_at?: string;
  updated_at?: string;
  from_callback?: boolean;
  is_callback?: boolean;
  source_type?: string;
}

const ONE_HOUR_MS = 60 * 60 * 1000;

const CLOSER_STAGE_KEYS = {
  newTransfer: "new_transfer",
  pendingDisposition: "pending_disposition",
  dispositioned: "dispositioned",
  returnedToCenter: "returned_to_center",
} as const;

const CloserPortalPage = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const { stages: closerStages, loading: closerStagesLoading } = usePipelineStages("closer_portal");
  const { stages: transferStages } = usePipelineStages("transfer_portal");
  const { stages: submissionStages } = usePipelineStages("submission_portal");

  const [data, setData] = useState<CloserPortalRow[]>([]);
  const [filteredData, setFilteredData] = useState<CloserPortalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [leadVendorFilter, setLeadVendorFilter] = useState("__ALL__");
  const [statusFilter, setStatusFilter] = useState("__ALL__");
  const [showDuplicates, setShowDuplicates] = useState(true);
  const [columnPage, setColumnPage] = useState<Record<string, number>>({});
  const [noteCounts, setNoteCounts] = useState<Record<string, number>>({});
  const [timeTick, setTimeTick] = useState(() => Date.now());

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setTimeTick(Date.now());
    }, 60_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  const stageLabelByKey = useMemo(() => {
    const map: Record<string, string> = {};
    [...closerStages, ...transferStages, ...submissionStages].forEach((stage) => {
      const key = (stage?.key ?? "").trim();
      const label = (stage?.label ?? "").trim();
      if (key && label) map[key] = label;
    });
    return map;
  }, [closerStages, transferStages, submissionStages]);

  const stageKeyByLabel = useMemo(() => {
    const map = new Map<string, string>();
    [...closerStages, ...transferStages, ...submissionStages].forEach((stage) => {
      const key = (stage?.key ?? "").trim();
      const label = (stage?.label ?? "").trim();
      if (key && label) map.set(label, key);
    });
    return map;
  }, [closerStages, transferStages, submissionStages]);

  const kanbanStages = useMemo(() => {
    return closerStages
      .map((stage) => ({
        key: (stage?.key ?? "").trim(),
        label: (stage?.label ?? "").trim(),
        columnClass: stage?.column_class || "",
        headerClass: stage?.header_class || "",
      }))
      .filter((stage) => stage.key && stage.label);
  }, [closerStages]);

  const stageTheme = useMemo(() => {
    const theme: Record<string, { column: string; header: string }> = {};
    kanbanStages.forEach((stage) => {
      theme[stage.key] = {
        column: stage.columnClass,
        header: stage.headerClass,
      };
    });
    return theme;
  }, [kanbanStages]);

  const closerStageKeys = useMemo(() => {
    return new Set(kanbanStages.map((stage) => stage.key));
  }, [kanbanStages]);

  const transferStageKeys = useMemo(() => {
    return new Set(
      transferStages
        .map((stage) => (stage?.key ?? "").trim())
        .filter(Boolean)
    );
  }, [transferStages]);

  const normalizeStatusKey = (value: string | null | undefined): string => {
    const trimmed = (value || "").trim();
    if (!trimmed) return "";
    if (stageLabelByKey[trimmed]) return trimmed;
    return stageKeyByLabel.get(trimmed) ?? trimmed;
  };

  const toDispositionLabel = (value: string | null | undefined) => {
    const normalized = normalizeStatusKey(value);
    if (!normalized) return null;
    const rawValue = (value || "").trim();
    return stageLabelByKey[normalized] ?? rawValue ?? null;
  };

  const getStatusTimestamp = (row: CloserPortalRow) => {
    const raw = row.updated_at || row.created_at || null;
    if (!raw) return null;
    const timestamp = new Date(raw).getTime();
    return Number.isNaN(timestamp) ? null : timestamp;
  };

  const isReturnedToCenterStatus = (normalizedStatus: string, rawLabel: string) => {
    const key = normalizedStatus.toLowerCase();
    const label = rawLabel.toLowerCase();

    if (key === CLOSER_STAGE_KEYS.returnedToCenter) return true;
    if (key.includes("returned_to_center")) return true;
    if (label.includes("returned to center")) return true;
    if (label.includes("dq")) return true;
    if (label.includes("can't be sold")) return true;
    if (label.includes("cannot be sold")) return true;

    return false;
  };

  const deriveCloserStageKey = (row: CloserPortalRow) => {
    const normalizedStatus = normalizeStatusKey(row.status);
    const statusLabel = (toDispositionLabel(row.status) ?? row.status ?? "").trim();

    if (closerStageKeys.has(normalizedStatus)) {
      if (normalizedStatus === CLOSER_STAGE_KEYS.newTransfer) {
        const statusTimestamp = getStatusTimestamp(row);
        if (statusTimestamp && timeTick - statusTimestamp >= ONE_HOUR_MS) {
          return CLOSER_STAGE_KEYS.pendingDisposition;
        }
      }
      return normalizedStatus;
    }

    if (isReturnedToCenterStatus(normalizedStatus, statusLabel)) {
      return CLOSER_STAGE_KEYS.returnedToCenter;
    }

    const isTransferApiStatus =
      !normalizedStatus ||
      normalizedStatus === "transfer_api" ||
      (transferStageKeys.has(normalizedStatus) && normalizedStatus === "transfer_api");

    if (isTransferApiStatus) {
      return CLOSER_STAGE_KEYS.newTransfer;
    }

    return CLOSER_STAGE_KEYS.dispositioned;
  };

  const removeDuplicates = (records: CloserPortalRow[]) => {
    const seen = new Map<string, CloserPortalRow>();

    records.forEach((record) => {
      const key = `${record.insured_name || ""}|${record.client_phone_number || ""}|${record.lead_vendor || ""}`;
      if (!seen.has(key)) {
        seen.set(key, record);
      }
    });

    return Array.from(seen.values());
  };

  const applyFilters = (records: CloserPortalRow[]) => {
    let filtered = records;

    if (dateFilter) {
      filtered = filtered.filter((record) => record.date === dateFilter);
    }

    if (leadVendorFilter !== "__ALL__") {
      filtered = filtered.filter((record) => (record.lead_vendor || "") === leadVendorFilter);
    }

    if (statusFilter !== "__ALL__") {
      filtered = filtered.filter((record) => deriveCloserStageKey(record) === statusFilter);
    }

    if (searchTerm) {
      const query = searchTerm.toLowerCase();
      filtered = filtered.filter((record) =>
        (record.insured_name?.toLowerCase().includes(query)) ||
        (record.client_phone_number?.toLowerCase().includes(query)) ||
        (record.lead_vendor?.toLowerCase().includes(query)) ||
        (record.agent?.toLowerCase().includes(query)) ||
        (record.buffer_agent?.toLowerCase().includes(query)) ||
        (record.licensed_agent_account?.toLowerCase().includes(query)) ||
        (record.carrier?.toLowerCase().includes(query)) ||
        (record.product_type?.toLowerCase().includes(query))
      );
    }

    if (!showDuplicates) {
      filtered = removeDuplicates(filtered);
    }

    return filtered;
  };

  const leadVendorOptions = useMemo(() => {
    const set = new Set<string>();
    data.forEach((row) => {
      const vendor = (row.lead_vendor || "").trim();
      if (vendor) set.add(vendor);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [data]);

  const fetchNoteCounts = async (rows: CloserPortalRow[]) => {
    const leadIds = rows.map((row) => row.id).filter(Boolean);
    if (leadIds.length === 0) {
      setNoteCounts({});
      return;
    }

    const submissionMap = new Map<string, string>();
    rows.forEach((row) => {
      if (row.submission_id) submissionMap.set(row.submission_id, row.id);
    });

    const counts: Record<string, number> = {};
    leadIds.forEach((id) => {
      counts[id] = 0;
    });

    const submissionIds = Array.from(submissionMap.keys());

    try {
      let query = (supabase as any)
        .from("lead_notes")
        .select("id, lead_id, submission_id");

      if (leadIds.length > 0) {
        query = query.in("lead_id", leadIds);
      }
      if (submissionIds.length > 0) {
        query = query.in("submission_id", submissionIds);
      }

      const { data: noteRows, error: noteError } = await query;

      if (!noteError && Array.isArray(noteRows)) {
        const seen = new Set<string>();
        noteRows.forEach((row: { id: string; lead_id?: string | null; submission_id?: string | null }) => {
          if (!row?.id || seen.has(row.id)) return;
          seen.add(row.id);

          const directLeadId = (row.lead_id || "").toString();
          if (directLeadId && counts[directLeadId] !== undefined) {
            counts[directLeadId] = (counts[directLeadId] || 0) + 1;
            return;
          }

          const submissionId = (row.submission_id || "").toString();
          if (submissionId) {
            const leadId = submissionMap.get(submissionId);
            if (leadId) {
              counts[leadId] = (counts[leadId] || 0) + 1;
            }
          }
        });
      }
    } catch (error) {
      console.warn("Failed to fetch closer portal note counts", error);
    }

    rows.forEach((row) => {
      if ((row.notes || "").trim()) {
        counts[row.id] = (counts[row.id] || 0) + 1;
      }
    });

    if (submissionIds.length > 0) {
      try {
        const { data: leadRows, error: leadError } = await supabase
          .from("leads")
          .select("submission_id, additional_notes")
          .in("submission_id", submissionIds);

        if (!leadError && Array.isArray(leadRows)) {
          leadRows.forEach((row) => {
            const noteText = (row.additional_notes as string | null)?.trim();
            if (!noteText) return;

            const leadId = submissionMap.get(row.submission_id as string);
            if (leadId) {
              counts[leadId] = (counts[leadId] || 0) + 1;
            }
          });
        }
      } catch (error) {
        console.warn("Failed to fetch legacy closer portal note counts", error);
      }
    }

    setNoteCounts(counts);
  };

  const fetchData = async (showRefreshToast = false) => {
    try {
      setRefreshing(true);

      let query = supabase
        .from("daily_deal_flow")
        .select("*")
        .order("date", { ascending: false })
        .order("created_at", { ascending: false });

      if (dateFilter) {
        query = query.eq("date", dateFilter);
      }

      const { data: rows, error } = await query;

      if (error) {
        console.error("Error fetching closer portal data:", error);
        toast({
          title: "Error",
          description: "Failed to fetch closer portal data",
          variant: "destructive",
        });
        return;
      }

      const normalizedRows = ((rows ?? []) as unknown as CloserPortalRow[]).map((row) => {
        const isCallback = Boolean((row as any).from_callback) || Boolean((row as any).is_callback);
        return {
          ...row,
          source_type: isCallback ? "callback" : "zapier",
        };
      });

      setData(normalizedRows);
      void fetchNoteCounts(normalizedRows);

      if (showRefreshToast) {
        toast({
          title: "Success",
          description: "Closer portal refreshed successfully",
        });
      }
    } catch (error) {
      console.error("Error fetching closer portal:", error);
      toast({
        title: "Error",
        description: "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    setFilteredData(applyFilters(data));
  }, [data, dateFilter, leadVendorFilter, statusFilter, searchTerm, showDuplicates, timeTick]);

  useEffect(() => {
    if (closerStagesLoading) return;
    void fetchData();
  }, [dateFilter, closerStagesLoading]);

  const leadsByStage = useMemo(() => {
    const grouped = new Map<string, CloserPortalRow[]>();
    kanbanStages.forEach((stage) => grouped.set(stage.key, []));

    filteredData.forEach((row) => {
      const stageKey = deriveCloserStageKey(row);
      grouped.get(stageKey)?.push(row);
    });

    return grouped;
  }, [filteredData, kanbanStages, timeTick]);

  useEffect(() => {
    setColumnPage((prev) => {
      const next: Record<string, number> = { ...prev };
      kanbanStages.forEach((stage) => {
        const rows = leadsByStage.get(stage.key) || [];
        const totalPages = Math.max(1, Math.ceil(rows.length / 25));
        const current = Number(next[stage.key] ?? 1);
        next[stage.key] = Math.min(Math.max(1, current), totalPages);
      });
      return next;
    });
  }, [kanbanStages, leadsByStage]);

  const handleRefresh = () => {
    void fetchData(true);
  };

  const handleView = (row: CloserPortalRow) => {
    if (!row?.id) return;
    navigate(`/daily-deal-flow/lead/${encodeURIComponent(row.id)}`, {
      state: { activeNav: "/closer-portal" },
    });
  };

  const getCurrentStageLabel = (row: CloserPortalRow) => {
    const stageKey = deriveCloserStageKey(row);
    return kanbanStages.find((stage) => stage.key === stageKey)?.label || stageLabelByKey[stageKey] || stageKey;
  };

  const getElapsedLabel = (row: CloserPortalRow) => {
    const statusTimestamp = getStatusTimestamp(row);
    if (!statusTimestamp) return null;

    const elapsedMinutes = Math.max(0, Math.floor((timeTick - statusTimestamp) / 60_000));
    if (elapsedMinutes < 60) return `${elapsedMinutes}m`;

    const hours = Math.floor(elapsedMinutes / 60);
    const minutes = elapsedMinutes % 60;
    if (minutes === 0) return `${hours}h`;
    return `${hours}h ${minutes}m`;
  };

  if (loading || closerStagesLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Loading closer portal data...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="flex h-full flex-col">
        <div className="border-b bg-card">
          <div className="mx-auto flex w-full max-w-[1800px] flex-col gap-4 px-4 py-4 lg:px-6">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-1 flex-col gap-3 md:flex-row">
                <Input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search by name, phone, vendor..."
                  className="md:max-w-xl"
                />
                <Select value={leadVendorFilter} onValueChange={setLeadVendorFilter}>
                  <SelectTrigger className="md:w-72">
                    <SelectValue placeholder="All Vendors" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="__ALL__">All Vendors</SelectItem>
                      {leadVendorOptions.map((vendor) => (
                        <SelectItem key={vendor} value={vendor}>
                          {vendor}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="md:w-72">
                    <SelectValue placeholder="All Stages" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="__ALL__">All Stages</SelectItem>
                      {kanbanStages.map((stage) => (
                        <SelectItem key={stage.key} value={stage.key}>
                          {stage.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-3 self-end lg:self-auto">
                <Badge variant="secondary" className="px-3 py-1">
                  {filteredData.length} records
                </Badge>
                <Button onClick={handleRefresh} disabled={refreshing}>
                  <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
              </div>
            </div>

            <div className="flex flex-col gap-3 md:flex-row">
              <Select
                value={showDuplicates ? "true" : "false"}
                onValueChange={(value) => setShowDuplicates(value === "true")}
              >
                <SelectTrigger className="md:w-72">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="true">Show All Records</SelectItem>
                    <SelectItem value="false">Remove Duplicates</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>

              <Input
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="md:w-72"
              />
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          <div className="mx-auto w-full max-w-[1800px] p-4 lg:p-6">
            {kanbanStages.length === 0 ? (
              <Card>
                <CardContent className="py-10 text-center text-muted-foreground">
                  No closer portal stages are configured yet. Add the `closer_portal` pipeline stages in `portal_stages` to populate this board.
                </CardContent>
              </Card>
            ) : (
              <div className="flex min-h-0 gap-3 pr-2" style={{ minWidth: `${kanbanStages.length * 18}rem` }}>
                {kanbanStages.map((stage) => {
                  const rows = leadsByStage.get(stage.key) || [];
                  const pageSize = 25;
                  const current = Number(columnPage[stage.key] ?? 1);
                  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
                  const startIndex = (current - 1) * pageSize;
                  const pageRows = rows.slice(startIndex, startIndex + pageSize);

                  return (
                    <Card
                      key={stage.key}
                      className={`flex min-h-[560px] w-[26rem] flex-col bg-muted/20 ${stageTheme[stage.key]?.column ?? ""}`}
                    >
                      <CardHeader className={`flex flex-row items-center justify-between border-b px-3 py-2 ${stageTheme[stage.key]?.header ?? ""}`}>
                        <CardTitle className="text-sm font-semibold">{stage.label}</CardTitle>
                        <Badge variant="secondary">{rows.length}</Badge>
                      </CardHeader>
                      <CardContent className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
                        {pageRows.length === 0 ? (
                          <div className="flex h-full items-center justify-center rounded-md border border-dashed border-muted-foreground/30 px-3 py-6 text-center text-xs text-muted-foreground">
                            No leads
                          </div>
                        ) : (
                          pageRows.map((row) => {
                            const closer = row.licensed_agent_account || row.agent || row.buffer_agent || "-";
                            const elapsed = getElapsedLabel(row);
                            const statusText = toDispositionLabel(row.status) || row.status || "No status";

                            return (
                              <Card
                                key={row.id}
                                className="w-full cursor-pointer transition hover:shadow-md"
                                onClick={() => handleView(row)}
                              >
                                <CardContent className="p-2">
                                  <div className="min-w-0">
                                    <div className="truncate text-sm font-semibold">{row.insured_name || "—"}</div>
                                    <div className="mt-0.5 text-xs text-muted-foreground">
                                      <div className="flex items-center gap-2">
                                        <span>{row.client_phone_number || "—"}</span>
                                        <div className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px]">
                                          <StickyNote className="h-3.5 w-3.5" />
                                          <span>{noteCounts[row.id] ?? 0}</span>
                                        </div>
                                      </div>
                                    </div>
                                  </div>

                                  <div className="mt-2 flex items-center justify-between gap-2">
                                    <Badge variant="secondary" className="text-xs">{row.lead_vendor || "—"}</Badge>
                                    <div className="text-xs text-muted-foreground">{row.date || ""}</div>
                                  </div>

                                  <div className="mt-2 flex flex-wrap items-center gap-2">
                                    <Badge variant="outline" className="text-[11px] font-normal">
                                      {statusText}
                                    </Badge>
                                    <Badge variant="outline" className="text-[11px] font-normal">
                                      {getCurrentStageLabel(row)}
                                    </Badge>
                                    {elapsed ? (
                                      <Badge variant="outline" className="text-[11px] font-normal">
                                        {elapsed}
                                      </Badge>
                                    ) : null}
                                  </div>

                                  <div className="mt-2 grid grid-cols-1 gap-1 text-xs text-muted-foreground">
                                    <div>
                                      <span className="font-medium">Closer:</span> {closer}
                                    </div>
                                  </div>
                                </CardContent>
                              </Card>
                            );
                          })
                        )}
                      </CardContent>
                      <div className="flex items-center justify-between border-t px-3 py-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setColumnPage((prev) => ({
                              ...prev,
                              [stage.key]: Math.max(1, Number(prev[stage.key] ?? 1) - 1),
                            }))
                          }
                          disabled={current <= 1}
                        >
                          Previous
                        </Button>
                        <div className="text-xs text-muted-foreground">
                          Page {current} of {totalPages}
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setColumnPage((prev) => ({
                              ...prev,
                              [stage.key]: Math.min(totalPages, Number(prev[stage.key] ?? 1) + 1),
                            }))
                          }
                          disabled={current >= totalPages}
                        >
                          Next
                        </Button>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CloserPortalPage;
