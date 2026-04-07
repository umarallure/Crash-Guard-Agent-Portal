import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MultiSelect } from "@/components/ui/multi-select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { AlertTriangle, ArrowLeftRight, Eye, Loader2, Pencil, RefreshCw, Users, StickyNote, UserPlus, SlidersHorizontal, X } from "lucide-react";
import { usePipelineStages, type PipelineStage } from "@/hooks/usePipelineStages";
import { PresetDateRangeFilter } from "@/components/PresetDateRangeFilter";
import { isDateInRange, type DateRangePreset } from "@/lib/dateRangeFilter";
import { ClaimDroppedCallModal } from "@/components/ClaimDroppedCallModal";
import { logCallUpdate, getLeadInfo } from "@/lib/callLogging";
import { ColumnInfoPopover } from "@/components/ColumnInfoPopover";
import { getStateFilterOptions, matchesStateFilter } from "@/lib/stateFilter";
import { useSalesMapCoverageStates } from "@/hooks/useSalesMapCoverageStates";

export interface TransferPortalRow {
  id: string;
  daily_deal_flow_id?: string;
  submission_id: string;
  date?: string;
  insured_name?: string;
  lead_vendor?: string;
  client_phone_number?: string;
  buffer_agent?: string;
  agent?: string;
  licensed_agent_account?: string;
  status?: string;
  call_result?: string;
  carrier?: string;
  product_type?: string;
  draft_date?: string;
  monthly_premium?: number;
  face_amount?: number;
  from_callback?: boolean;
  notes?: string;
  policy_number?: string;
  carrier_audit?: string;
  product_type_carrier?: string;
  level_or_gi?: string;
  created_at?: string;
  updated_at?: string;
  source_type?: string;
  state?: string;
}

const TRANSFER_HANDOFF_STAGE_KEY = "retainer_signed";

interface ColumnInfoDetail { label: string; value: string; }
interface ColumnInfo { description: string; details?: ColumnInfoDetail[]; }

const SHARED_PIPELINE_FILTER_STORAGE_KEY = "shared-pipeline-filters";
const TRANSFER_FILTER_STORAGE_KEY = "transfer-portal-filters";

type SharedPipelineFilterStorage = {
  datePreset: DateRangePreset;
  customStartDate: string;
  customEndDate: string;
  leadVendorFilter: string;
  selectedStates: string[];
  searchTerm: string;
};

type TransferFilterStorage = {
  sourceTypeFilter: string;
};

const readSharedPipelineFilters = (): SharedPipelineFilterStorage | null => {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(SHARED_PIPELINE_FILTER_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<SharedPipelineFilterStorage>;
    return {
      datePreset: typeof parsed.datePreset === "string" ? parsed.datePreset as DateRangePreset : "all",
      customStartDate: typeof parsed.customStartDate === "string" ? parsed.customStartDate : "",
      customEndDate: typeof parsed.customEndDate === "string" ? parsed.customEndDate : "",
      leadVendorFilter: typeof parsed.leadVendorFilter === "string" ? parsed.leadVendorFilter : "__ALL__",
      selectedStates: Array.isArray(parsed.selectedStates) ? parsed.selectedStates.filter((state): state is string => typeof state === "string") : [],
      searchTerm: typeof parsed.searchTerm === "string" ? parsed.searchTerm : "",
    };
  } catch {
    return null;
  }
};

const readTransferFilters = (): TransferFilterStorage | null => {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(TRANSFER_FILTER_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<TransferFilterStorage>;
    return {
      sourceTypeFilter: typeof parsed.sourceTypeFilter === "string" ? parsed.sourceTypeFilter : "__ALL__",
    };
  } catch {
    return null;
  }
};

const TRANSFER_STATS_STAGE_KEYS = {
  newTransfers: ["transfer_api"],
  needsFollowUp: ["incomplete_transfer", "needs_bpo_callback", "pending_information"],
  returnedOrDq: ["returned_to_center_dq"],
} as const;

const getColumnInfo = (label: string): ColumnInfo => {
  const l = label.toLowerCase();

  if (l.includes("transfer api") || l === "transfer_api")
    return { description: "Leads that arrived via the Transfer API (Zapier). These are fresh inbound transfers waiting to be worked by a closer." };

  if (l.includes("incomplete transfer") || l === "incomplete_transfer")
    return { description: "Transfers that were initiated but not completed. A closer was connected but the call did not result in a full transfer. Needs re-engagement." };

  if (l.includes("retainer signed") || l === "retainer_signed")
    return { description: "Leads that have signed the retainer agreement. Ready to be reviewed, tiered, and submitted to the submission pipeline." };

  if ((l.includes("returned") || l.includes("return")) && (l.includes("center") || l.includes("dq")))
    return { description: "Leads returned to the call center due to disqualification or failure to meet transfer criteria. No further transfer action needed." };

  if (l.includes("previously sold") || (l.includes("bpo") && l.includes("sold")))
    return { description: "Leads that were previously sold through BPO channels. Not eligible for resubmission." };

  if (l.includes("needs bpo") || l.includes("bpo call"))
    return { description: "Leads that require a BPO (Business Process Outsourcing) verification call before they can proceed to transfer." };

  if (l.includes("tier 1") || l.includes("tier1"))
    return { description: "Qualified Tier 1 cases ready for transfer.", details: [{ label: "Price", value: "$2,500 / case" }, { label: "Accident", value: "12+ Months Ago" }, { label: "Injury", value: "Minor to Moderate" }] };

  if (l.includes("tier 2") || l.includes("tier2") || l.includes("bronze"))
    return { description: "Qualified Tier 2 (Bronze) cases ready for transfer.", details: [{ label: "Price", value: "$3,500 / case" }, { label: "Accident", value: "6–12 Months Ago" }, { label: "Injury", value: "Moderate to Severe" }] };

  if (l.includes("tier 3") || l.includes("tier3") || l.includes("silver"))
    return { description: "Qualified Tier 3 (Silver) cases ready for transfer.", details: [{ label: "Price", value: "$4,500 / case" }, { label: "Accident", value: "3–6 Months Ago" }, { label: "Injury", value: "Moderate to Severe" }] };

  if (l.includes("tier 4") || l.includes("tier4") || l.includes("gold"))
    return { description: "Qualified Tier 4 (Gold) cases ready for transfer.", details: [{ label: "Price", value: "$6,000 / case" }, { label: "Accident", value: "0–3 Months Ago" }, { label: "Injury", value: "Moderate to Catastrophic" }] };

  return { description: `Leads currently in the "${label}" stage of the transfer pipeline.` };
};

const TransferPortalPage = () => {
  const navigate = useNavigate();

  // --- Dynamic pipeline stages from DB ---
  const { stages: dbTransferStages, loading: transferStagesLoading } = usePipelineStages("transfer_portal");
  const { stages: dbSubmissionStages, loading: submissionStagesLoading } = usePipelineStages("submission_portal");
  const { stages: dbCloserStages } = usePipelineStages("closer_portal");

  const stageLabelByKey = useMemo(() => {
    const map: Record<string, string> = {};
    (dbTransferStages ?? []).forEach((s) => {
      const k = (s?.key ?? "").trim();
      const lbl = (s?.label ?? "").trim();
      if (k && lbl) map[k] = lbl;
    });
    (dbSubmissionStages ?? []).forEach((s) => {
      const k = (s?.key ?? "").trim();
      const lbl = (s?.label ?? "").trim();
      if (k && lbl) map[k] = lbl;
    });
    return map;
  }, [dbTransferStages, dbSubmissionStages]);

  const toDispositionLabel = useMemo(() => {
    return (value: string | null | undefined) => {
      const v = (value ?? "").trim();
      if (!v) return null;
      return stageLabelByKey[v] ?? v;
    };
  }, [stageLabelByKey]);

  const kanbanStages = useMemo(() => {
    return dbTransferStages.map((s) => ({ key: s.key, label: s.label }));
  }, [dbTransferStages]);

  const stageTheme = useMemo(() => {
    const theme: Record<string, { column: string }> = {};
    dbTransferStages.forEach((s) => {
      theme[s.key] = { column: s.column_class || "" };
    });
    return theme;
  }, [dbTransferStages]);

  const submissionPortalStageLabels = useMemo(() => {
    return dbSubmissionStages.map((s) => s.label);
  }, [dbSubmissionStages]);

  const transferStageKeyByLabel = useMemo(() => {
    const map = new Map<string, string>();
    dbTransferStages.forEach((stage) => {
      const key = (stage.key || '').trim();
      const label = (stage.label || '').trim();
      if (key && label) map.set(label, key);
    });
    return map;
  }, [dbTransferStages]);

  const submissionStageKeyByLabel = useMemo(() => {
    const map = new Map<string, string>();
    dbSubmissionStages.forEach((stage) => {
      const key = (stage.key || '').trim();
      const label = (stage.label || '').trim();
      if (key && label) map.set(label, key);
    });
    return map;
  }, [dbSubmissionStages]);

  const allStageOptions = useMemo(() => {
    return Array.from(
      new Set(
        [...kanbanStages.map((s) => s.label), ...submissionPortalStageLabels]
          .map((label) => label.trim())
          .filter(Boolean)
      )
    );
  }, [kanbanStages, submissionPortalStageLabels]);

  // ── Pipeline-agnostic helpers for the Edit dialog ──────────────────────────

  const EDIT_PIPELINE_OPTIONS = [
    { value: "transfer_portal",   label: "Transfer Pipeline"    },
    { value: "submission_portal", label: "Submission Pipeline"  },
    { value: "closer_portal",     label: "Closer Pipeline"      },
  ] as const;

  const editPipelineStagesMap: Record<string, PipelineStage[]> = {
    transfer_portal:   dbTransferStages,
    submission_portal: dbSubmissionStages,
    closer_portal:     dbCloserStages,
  };

  const transferApiStage = useMemo(() => {
    return dbTransferStages.find((stage) => (stage.key || '').trim() === 'transfer_api') ?? dbTransferStages[0] ?? null;
  }, [dbTransferStages]);

  const transferStageKeys = useMemo(() => {
    const keys = new Set<string>();
    dbTransferStages.forEach((stage) => {
      const key = (stage.key || '').trim();
      if (key) keys.add(key);
    });
    return keys;
  }, [dbTransferStages]);

  const isTransferHandoffStage = (value: string | null | undefined): boolean => {
    const trimmed = (value || "").trim();
    if (!trimmed) return false;

    if (trimmed === "document_signed_api") return true;
    if (trimmed.toLowerCase().includes("document_signed")) return true;
    if (trimmed.toLowerCase().includes("document signed")) return true;

    const matchingStage = dbTransferStages.find((stage) => {
      const key = (stage.key || "").trim().toLowerCase();
      const label = (stage.label || "").trim().toLowerCase();
      const needle = trimmed.toLowerCase();
      return key === needle || label === needle;
    });

    if (!matchingStage) return false;

    const key = (matchingStage.key || "").trim().toLowerCase();
    const label = (matchingStage.label || "").trim().toLowerCase();
    return key.includes("document_signed") || label.includes("document signed");
  };

  const resolveStatusKey = (value: string | null | undefined): string => {
    const trimmed = (value || '').trim();
    if (!trimmed) return '';

    if (transferStageKeys.has(trimmed)) return trimmed;

    const transferStageKey = transferStageKeyByLabel.get(trimmed);
    if (transferStageKey) return transferStageKey;

    const submissionStage = dbSubmissionStages.find((stage) => (stage.key || '').trim() === trimmed);
    if (submissionStage?.key) return submissionStage.key.trim();

    const submissionStageKey = submissionStageKeyByLabel.get(trimmed);
    if (submissionStageKey) return submissionStageKey;

    return trimmed;
  };

  const resolveStoredStatusKey = (value: string | null | undefined): string => {
    const resolvedKey = resolveStatusKey(value);
    if (isTransferHandoffStage(resolvedKey) || isTransferHandoffStage(value)) {
      return TRANSFER_HANDOFF_STAGE_KEY;
    }
    return resolvedKey;
  };

  const deriveStageKey = (row: TransferPortalRow): string => {
    const resolvedStatus = resolveStatusKey(row.status);
    if (!resolvedStatus) return transferApiStage?.key ?? 'transfer_api';
    if (transferStageKeys.has(resolvedStatus)) return resolvedStatus;
    return '';
  };

  const handleKanbanDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (!draggingId) return;

    const container = e.currentTarget;
    const rect = container.getBoundingClientRect();
    const edgeThreshold = 96;
    const maxStep = 24;
    const pointerX = e.clientX - rect.left;

    if (pointerX < edgeThreshold) {
      const intensity = (edgeThreshold - pointerX) / edgeThreshold;
      container.scrollLeft -= Math.ceil(maxStep * intensity);
      return;
    }

    if (pointerX > rect.width - edgeThreshold) {
      const intensity = (pointerX - (rect.width - edgeThreshold)) / edgeThreshold;
      container.scrollLeft += Math.ceil(maxStep * intensity);
    }
  };

  const [data, setData] = useState<TransferPortalRow[]>([]);
  const [filteredData, setFilteredData] = useState<TransferPortalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [allTimeTransfers, setAllTimeTransfers] = useState(0);
  const savedSharedFilters = useMemo(() => readSharedPipelineFilters(), []);
  const savedTransferFilters = useMemo(() => readTransferFilters(), []);
  const [datePreset, setDatePreset] = useState<DateRangePreset>(savedSharedFilters?.datePreset ?? "all");
  const [customStartDate, setCustomStartDate] = useState(savedSharedFilters?.customStartDate ?? "");
  const [customEndDate, setCustomEndDate] = useState(savedSharedFilters?.customEndDate ?? "");
  const [sourceTypeFilter, setSourceTypeFilter] = useState(savedTransferFilters?.sourceTypeFilter ?? "__ALL__");
  const [leadVendorFilter, setLeadVendorFilter] = useState(savedSharedFilters?.leadVendorFilter ?? "__ALL__");
  const [selectedStates, setSelectedStates] = useState<string[]>(savedSharedFilters?.selectedStates ?? []);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;
  const [viewMode, setViewMode] = useState<"kanban" | "list">("kanban");
  const [selectedStage, setSelectedStage] = useState<"all" | string>("all");

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);

  const kanbanPageSize = 25;
  const [columnPage, setColumnPage] = useState<Record<string, number>>({});
  const [noteCounts, setNoteCounts] = useState<Record<string, number>>({});

  const [showFilters, setShowFilters] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editRow, setEditRow] = useState<TransferPortalRow | null>(null);
  const [editPipeline, setEditPipeline] = useState("transfer_portal");
  const [editStage, setEditStage] = useState<string>("");
  const [editNotes, setEditNotes] = useState<string>("");
  const { unblockedStateCodes } = useSalesMapCoverageStates();

  // Claim call modal state
  const [claimModalOpen, setClaimModalOpen] = useState(false);
  const [claimSessionId, setClaimSessionId] = useState<string | null>(null);
  const [claimSubmissionId, setClaimSubmissionId] = useState<string | null>(null);
  const [claimLicensedAgent, setClaimLicensedAgent] = useState<string>("");
  const [claimLoading, setClaimLoading] = useState(false);
  const [claimLead, setClaimLead] = useState<any>(null);
  const [licensedAgents, setLicensedAgents] = useState<any[]>([]);
  const [fetchingAgents, setFetchingAgents] = useState(false);

  // Apply filters
  const applyFilters = (records: TransferPortalRow[]): TransferPortalRow[] => {
    let filtered = records;

    // Apply date filter
    filtered = filtered.filter((record) =>
      isDateInRange(record.date || record.created_at || null, datePreset, customStartDate, customEndDate)
    );

    // Apply source type filter
    if (sourceTypeFilter !== "__ALL__") {
      filtered = filtered.filter(record => record.source_type === sourceTypeFilter);
    }

    // Apply lead vendor filter
    if (leadVendorFilter !== "__ALL__") {
      filtered = filtered.filter((record) => (record.lead_vendor || '') === leadVendorFilter);
    }

    if (selectedStates.length > 0) {
      filtered = filtered.filter((record) => matchesStateFilter(record.state, selectedStates));
    }

    // Apply search filter
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter(record =>
        (record.insured_name?.toLowerCase().includes(searchLower)) ||
        (record.client_phone_number?.toLowerCase().includes(searchLower)) ||
        (record.lead_vendor?.toLowerCase().includes(searchLower)) ||
        (record.agent?.toLowerCase().includes(searchLower)) ||
        (record.buffer_agent?.toLowerCase().includes(searchLower)) ||
        (record.licensed_agent_account?.toLowerCase().includes(searchLower)) ||
        (record.carrier?.toLowerCase().includes(searchLower)) ||
        (record.product_type?.toLowerCase().includes(searchLower))
      );
    }

    return filtered;
  };

  const leadVendorOptions = useMemo(() => {
    const set = new Set<string>();
    (data || []).forEach((r) => {
      const v = (r.lead_vendor || '').trim();
      if (v) set.add(v);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [data]);

  const stateOptions = useMemo(() => {
    return getStateFilterOptions(data).map((option) => ({
      ...option,
      itemClassName: unblockedStateCodes.has(option.value)
        ? "bg-emerald-50 text-emerald-950 hover:bg-emerald-100 hover:text-emerald-950"
        : undefined,
    }));
  }, [data, unblockedStateCodes]);

  const { toast } = useToast();

  // Fetch data from Supabase
  const fetchData = async (showRefreshToast = false) => {
    try {
      setRefreshing(true);

      let leadsQuery = (supabase as any)
        .from('leads')
        .select('*')
        .order('submission_date', { ascending: false })
        .order('created_at', { ascending: false });

      const leadsRes = await leadsQuery;

      if (leadsRes.error) {
        console.error("Error fetching transfer portal data:", leadsRes.error);
        toast({
          title: "Error",
          description: "Failed to fetch transfer portal data",
          variant: "destructive",
        });
        return;
      }

      const transferRows = ((leadsRes.data ?? []) as any[]).map((lead) => {
        const submissionId = (lead?.submission_id || '').trim();
        const isCallback = Boolean(lead?.is_callback);

        return {
          id: lead.id,
          submission_id: submissionId,
          insured_name: lead.customer_full_name || '',
          client_phone_number: lead.phone_number || '',
          lead_vendor: lead.lead_vendor || '',
          buffer_agent: lead.buffer_agent || '',
          agent: lead.agent || '',
          licensed_agent_account: (lead as any).licensed_agent_account || '',
          carrier: lead.carrier || '',
          product_type: lead.product_type || '',
          draft_date: lead.draft_date || '',
          monthly_premium: lead.monthly_premium || null,
          face_amount: (lead as any).coverage_amount || null,
          status: (lead.status || '').trim(),
          notes: '',
          date: lead.submission_date ? String(lead.submission_date).split(' ')[0] : '',
          created_at: lead.created_at || '',
          updated_at: lead.updated_at || '',
          from_callback: isCallback,
          is_callback: isCallback,
          source_type: isCallback ? 'callback' : 'zapier',
          state: lead.state || '',
        };
      });

      const transferPortalOnlyRows = transferRows.filter((row) => {
        const status = (row.status || '').trim();
        if (!status) return true;
        if (transferStageKeys.has(status)) return true;
        return status === ((transferApiStage?.label || '').trim());
      });

      setAllTimeTransfers(transferPortalOnlyRows.length);

      const rowsForCounts = sourceTypeFilter === "__ALL__"
        ? transferPortalOnlyRows
        : transferPortalOnlyRows.filter((row) => row.source_type === sourceTypeFilter);

      setData(rowsForCounts);

      // Fetch note counts from daily_deal_flow only
      fetchNoteCounts(rowsForCounts);

      if (showRefreshToast) {
        toast({
          title: "Success",
          description: "Data refreshed successfully",
        });
      }
    } catch (error) {
      console.error("Error:", error);
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

  // Update filtered data whenever data or filters change
  useEffect(() => {
    setFilteredData(applyFilters(data));
    setCurrentPage(1); // Reset to first page when filters change
  }, [data, datePreset, customStartDate, customEndDate, sourceTypeFilter, leadVendorFilter, selectedStates, searchTerm]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const sharedFiltersToPersist: SharedPipelineFilterStorage = {
      datePreset,
      customStartDate,
      customEndDate,
      leadVendorFilter,
      selectedStates,
      searchTerm: "",
    };

    window.localStorage.setItem(SHARED_PIPELINE_FILTER_STORAGE_KEY, JSON.stringify(sharedFiltersToPersist));
  }, [datePreset, customStartDate, customEndDate, leadVendorFilter, selectedStates]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const transferFiltersToPersist: TransferFilterStorage = {
      sourceTypeFilter,
    };

    window.localStorage.setItem(TRANSFER_FILTER_STORAGE_KEY, JSON.stringify(transferFiltersToPersist));
  }, [sourceTypeFilter]);

  // Pagination calculations
  const stageFilteredData = useMemo(() => {
    if (selectedStage === "all") return filteredData;
    return filteredData.filter((row) => deriveStageKey(row) === selectedStage);
  }, [filteredData, selectedStage]);

  const totalPages = Math.max(1, Math.ceil(stageFilteredData.length / itemsPerPage));
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentPageData = stageFilteredData.slice(startIndex, endIndex);

  const transferStats = useMemo(() => {
    const rows = filteredData;
    const hasStageKey = (row: TransferPortalRow, allowedKeys: readonly string[]) => {
      const stageKey = deriveStageKey(row);
      return allowedKeys.some((allowedKey) =>
        allowedKey === "returned_to_center_dq"
          ? stageKey.startsWith("returned_to_center")
          : stageKey === allowedKey
      );
    };

    return {
      totalTransfers: rows.length,
      newTransfers: rows.filter((row) => hasStageKey(row, TRANSFER_STATS_STAGE_KEYS.newTransfers)).length,
      needsFollowUp: rows.filter((row) => hasStageKey(row, TRANSFER_STATS_STAGE_KEYS.needsFollowUp)).length,
      returnedOrDq: rows.filter((row) => hasStageKey(row, TRANSFER_STATS_STAGE_KEYS.returnedOrDq)).length,
    };
  }, [filteredData]);

  const stageLabelForKey = useMemo(() => {
    const map = new Map<string, string>();
    dbTransferStages.forEach((stage) => {
      const key = (stage.key || "").trim();
      const label = (stage.label || "").trim();
      if (key && label) {
        map.set(key, label);
      }
    });
    return map;
  }, [dbTransferStages]);

  const transferStatInfo = useMemo(
    () => ({
      totalTransfers: {
        description: "All leads that currently belong to the transfer pipeline after the active page filters are applied.",
        details: [
          { label: "Scope", value: "All transfer stages" },
        ],
      },
      newTransfers: {
        description: "Fresh inbound transfers that just landed in the first transfer stage and still need first action.",
        details: [
          { label: "Stage", value: stageLabelForKey.get("transfer_api") ?? "Transfer API" },
        ],
      },
      needsFollowUp: {
        description: "Leads still in the active transfer work queue. These are the cases that need follow-up or another action before they can move forward.",
        details: [
          { label: "Stage 1", value: stageLabelForKey.get("incomplete_transfer") ?? "Incomplete Transfer" },
          { label: "Stage 2", value: stageLabelForKey.get("needs_bpo_callback") ?? "Needs BPO Callback" },
          { label: "Stage 3", value: stageLabelForKey.get("pending_information") ?? "Internal Callback" },
        ],
      },
      returnedOrDq: {
        description: "Leads sent back or disqualified from the transfer process. These no longer belong in the active transfer working queue.",
        details: [
          { label: "Stage", value: stageLabelForKey.get("returned_to_center_dq") ?? "Returned To Center - DQ" },
        ],
      },
    }),
    [stageLabelForKey]
  );

  const handleOpenEdit = (row: TransferPortalRow) => {
    setEditRow(row);

    // Detect which pipeline owns the current status key
    const rawStatus = (row.status ?? '').trim();
    const detectedPipeline = (() => {
      if (dbSubmissionStages.some((s) => s.key === rawStatus || s.label === rawStatus)) {
        return "submission_portal";
      }
      if (dbCloserStages.some((s) => s.key === rawStatus || s.label === rawStatus)) {
        return "closer_portal";
      }
      return "transfer_portal";
    })();
    setEditPipeline(detectedPipeline);

    setEditStage(
      toDispositionLabel(row.status ?? null) ||
      transferApiStage?.label ||
      kanbanStages[0]?.label ||
      ""
    );
    setEditNotes('');
    setEditOpen(true);
  };

  const handleView = (row: TransferPortalRow) => {
    if (!row?.id) return;
    navigate(`/leads/${encodeURIComponent(row.id)}`, {
      state: { activeNav: '/transfer-portal' },
    });
  };

  const handleOpenLeadAction = async (row: TransferPortalRow) => {
    if (!row?.submission_id) return;

    const { data: existingSession } = await supabase
      .from("verification_sessions")
      .select("id")
      .eq("submission_id", row.submission_id)
      .order("created_at", { ascending: false })
      .limit(1);

    if ((existingSession || []).length > 0) {
      navigate(`/call-result-update?submissionId=${encodeURIComponent(row.submission_id)}`);
      return;
    }

    navigate(`/leads/${encodeURIComponent(row.id)}`, {
      state: { activeNav: '/transfer-portal' },
    });
  };

  type AgentStatusRow = { user_id: string };
  type AppUserRow = { user_id: string; display_name: string | null; email: string | null };
  type AppUsersQueryClient = {
    from: (table: "app_users") => {
      select: (columns: string) => {
        in: (column: "user_id", values: string[]) => Promise<{ data: AppUserRow[] | null }>;
      };
    };
  };

  const fetchClaimAgents = async () => {
    setFetchingAgents(true);
    try {
      const { data: agentStatus } = await supabase.from("agent_status").select("user_id").eq("agent_type", "licensed");
      const ids = (agentStatus as AgentStatusRow[] | null)?.map((a) => a.user_id) || [];
      let profiles: Array<{ user_id: string; display_name: string }> = [];
      if (ids.length > 0) {
        const { data: fetchedProfiles } = await (supabase as unknown as AppUsersQueryClient)
          .from("app_users").select("user_id, display_name, email").in("user_id", ids);
        profiles = ((fetchedProfiles || []) as AppUserRow[]).map((u) => ({
          user_id: u.user_id,
          display_name: u.display_name || (u.email ? String(u.email).split("@")[0] : ""),
        }));
      }
      setLicensedAgents(profiles);
    } catch (e) { console.log(e); } finally { setFetchingAgents(false); }
  };

  const openClaimModal = async (submissionId: string) => {
    const { data: existingSession } = await supabase
      .from("verification_sessions").select("id, total_fields")
      .eq("submission_id", submissionId).gt("total_fields", 0)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();

    let sessionId = existingSession?.id;
    if (!sessionId) {
      const { data: leadData, error: leadError } = await supabase.from("leads").select("*").eq("submission_id", submissionId).single();
      if (leadError || !leadData) { toast({ title: "Error", description: "Failed to fetch lead data", variant: "destructive" }); return; }
      const { data: newSession, error } = await supabase
        .from("verification_sessions")
        .insert({ submission_id: submissionId, status: "pending", progress_percentage: 0, total_fields: 0, verified_fields: 0 })
        .select("id").single();
      if (error) { toast({ title: "Error", description: "Failed to create verification session", variant: "destructive" }); return; }
      sessionId = newSession.id;
      const leadFields = [
        "accident_date","accident_location","accident_scenario","injuries","medical_attention","police_attended","insured","vehicle_registration","insurance_company","third_party_vehicle_registration","other_party_admit_fault","passengers_count","prior_attorney_involved","prior_attorney_details","contact_name","contact_number","contact_address","lead_vendor","customer_full_name","street_address","beneficiary_information","billing_and_mailing_address_is_the_same","date_of_birth","age","phone_number","social_security","driver_license","exp","existing_coverage","applied_to_life_insurance_last_two_years","height","weight","doctors_name","tobacco_use","health_conditions","medications","insurance_application_details","carrier","monthly_premium","coverage_amount","draft_date","first_draft","institution_name","beneficiary_routing","beneficiary_account","account_type","city","state","zip_code","birth_state","call_phone_landline","additional_notes",
      ];
      const items = leadFields.map((f) => { const v = leadData[f as keyof typeof leadData]; return v != null ? { session_id: sessionId, field_name: f, original_value: String(v), verified_value: String(v), is_verified: false, is_modified: false } : null; }).filter(Boolean);
      if (items.length > 0) {
        await supabase.from("verification_items").insert(items);
        await supabase.from("verification_sessions").update({ total_fields: items.length }).eq("id", sessionId);
      }
    }
    const { data: lead } = await supabase.from("leads").select("lead_vendor, customer_full_name, is_retention_call").eq("submission_id", submissionId).single();
    setClaimSessionId(sessionId);
    setClaimSubmissionId(submissionId);
    setClaimLead(lead);
    setClaimLicensedAgent("");
    setClaimModalOpen(true);
    fetchClaimAgents();
  };

  const handleClaimCall = async () => {
    setClaimLoading(true);
    try {
      if (!claimLicensedAgent) { toast({ title: "Error", description: "Please select a closer", variant: "destructive" }); return; }
      const claimedAt = new Date().toISOString();
      await supabase
        .from("verification_sessions")
        .update({
          status: "in_progress",
          licensed_agent_id: claimLicensedAgent,
          claimed_at: claimedAt,
          completed_at: null,
        })
        .eq("id", claimSessionId);
      const agentName = licensedAgents.find((a) => a.user_id === claimLicensedAgent)?.display_name || "Licensed Agent";
      const { customerName, leadVendor } = await getLeadInfo(claimSubmissionId!);
      await logCallUpdate({ submissionId: claimSubmissionId!, agentId: claimLicensedAgent, agentType: "licensed", agentName, eventType: "call_claimed", eventDetails: { verification_session_id: claimSessionId, claimed_at: claimedAt, claimed_from_dashboard: true, claim_type: "manual_claim" }, verificationSessionId: claimSessionId!, customerName, leadVendor, isRetentionCall: false });
      await supabase.functions.invoke("center-transfer-notification", { body: { type: "reconnected", submissionId: claimSubmissionId, agentType: "licensed", agentName, leadData: claimLead } });
      const submissionIdForRedirect = claimSubmissionId;
      setClaimModalOpen(false); setClaimSessionId(null); setClaimSubmissionId(null); setClaimLead(null); setClaimLicensedAgent("");
      toast({ title: "Success", description: `Call claimed by ${agentName}` });
      navigate(`/call-result-update?submissionId=${submissionIdForRedirect}`);
    } catch (e) { console.error(e); toast({ title: "Error", description: "Failed to claim call", variant: "destructive" }); }
    finally { setClaimLoading(false); }
  };

  // Stages for whichever pipeline is selected in the edit dialog
  const editActivePipelineStages = useMemo(
    () => editPipelineStagesMap[editPipeline] ?? dbTransferStages,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editPipeline, dbTransferStages, dbSubmissionStages, dbCloserStages]
  );

  const editActivePipelineLabels = useMemo(
    () => Array.from(new Set(editActivePipelineStages.map((s) => (s.label || '').trim()).filter(Boolean))),
    [editActivePipelineStages]
  );

  // label → key map for the active pipeline
  const editActivePipelineKeyByLabel = useMemo(() => {
    const map = new Map<string, string>();
    editActivePipelineStages.forEach((s) => {
      const key   = (s?.key   ?? '').trim();
      const label = (s?.label ?? '').trim();
      if (key && label) map.set(label, key);
    });
    return map;
  }, [editActivePipelineStages]);

  const syncLatestDailyDealFlowRow = async (submissionId: string | undefined, updates: Record<string, unknown>) => {
    const normalizedSubmissionId = (submissionId || '').trim();
    if (!normalizedSubmissionId) return;

    const { data: latestRow, error: latestRowError } = await supabase
      .from('daily_deal_flow')
      .select('id')
      .eq('submission_id', normalizedSubmissionId)
      .order('updated_at', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestRowError) throw latestRowError;

    const dailyDealFlowId = (latestRow as { id?: string } | null)?.id;
    if (!dailyDealFlowId) return;

    const { error: updateError } = await supabase
      .from('daily_deal_flow')
      .update(updates)
      .eq('id', dailyDealFlowId);

    if (updateError) throw updateError;
  };

  const handleSaveEdit = async () => {
    if (!editRow) return;

    // For transfer pipeline use the existing handoff-aware resolver;
    // for other pipelines do a straight label→key lookup.
    const nextStage = editPipeline === 'transfer_portal'
      ? resolveStoredStatusKey(editStage)
      : (editActivePipelineKeyByLabel.get((editStage || '').trim()) ?? (editStage || '').trim());

    if (!nextStage) return;

    const previousStage = (editRow.status || '').trim();
    const stageChanged = previousStage !== nextStage;

    try {
      setEditSaving(true);

      const { error: leadsError } = await (supabase as any)
        .from('leads')
        .update({ status: nextStage })
        .eq('id', editRow.id);

      if (leadsError) {
        toast({
          title: 'Error',
          description: 'Failed to update lead status',
          variant: 'destructive',
        });
        return;
      }

      await syncLatestDailyDealFlowRow(editRow.submission_id, { status: nextStage, notes: editNotes });

      const trimmedNote = (editNotes || '').trim();
      const notesText = trimmedNote || 'No notes provided.';

      if (stageChanged || trimmedNote.length > 0) {
        try {
          const previousDispositionLabel = toDispositionLabel(editRow.status ?? null);
          const newDispositionLabel = toDispositionLabel(nextStage);
          const { error: slackError } = await supabase.functions.invoke('disposition-change-slack-alert', {
            body: {
              leadId: editRow.id,
              submissionId: (editRow as any).submission_id ?? null,
              leadVendor: editRow.lead_vendor ?? '',
              insuredName: editRow.insured_name ?? null,
              clientPhoneNumber: editRow.client_phone_number ?? null,
              previousDisposition: previousDispositionLabel,
              newDisposition: newDispositionLabel,
              notes: notesText,
              noteOnly: !stageChanged,
            },
          });
          if (slackError) {
            console.warn('Slack alert invoke failed:', slackError);
          }
        } catch (e) {
          console.warn('Slack alert invoke threw:', e);
        }
      }

      setData((prev) =>
        prev.map((row) =>
          row.id === editRow.id
            ? {
                ...row,
                status: nextStage,
                notes: editNotes,
              }
            : row
        )
      );

      setEditOpen(false);
      setEditRow(null);

      toast({
        title: 'Saved',
        description:
          isTransferHandoffStage(selectedStage)
            ? 'Lead moved to Retainer Signed and handed off to Submission Portal.'
            : 'Transfer updated successfully',
      });
    } finally {
      setEditSaving(false);
    }
  };

  const leadsByStage = useMemo(() => {
    const grouped = new Map<string, TransferPortalRow[]>();
    kanbanStages.forEach((stage) => grouped.set(stage.key, []));
    stageFilteredData.forEach((row) => {
      const stageKey = deriveStageKey(row);
      grouped.get(stageKey)?.push(row);
    });

    // Sort transfer_api column: most recent at top
    const transferApiKey = transferApiStage?.key ?? 'transfer_api';
    const transferApiRows = grouped.get(transferApiKey);
    if (transferApiRows) {
      transferApiRows.sort((a, b) => {
        const dateA = new Date(a.created_at || a.date || 0).getTime();
        const dateB = new Date(b.created_at || b.date || 0).getTime();
        return dateB - dateA;
      });
    }

    return grouped;
  }, [stageFilteredData, kanbanStages, transferApiStage]);

  useEffect(() => {
    setColumnPage((prev) => {
      const next: Record<string, number> = { ...prev };
      kanbanStages.forEach((stage) => {
        const rows = leadsByStage.get(stage.key) || [];
        const totalPages = Math.max(1, Math.ceil(rows.length / kanbanPageSize));
        const current = Number(next[stage.key] ?? 1);
        next[stage.key] = Math.min(Math.max(1, current), totalPages);
      });
      return next;
    });
  }, [leadsByStage]);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const handlePrevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  useEffect(() => {
    if (transferStagesLoading || submissionStagesLoading) return;
    fetchData();
  }, [transferStagesLoading, submissionStagesLoading]);

  const handleRefresh = () => {
    fetchData(true);
  };

  const fetchNoteCounts = async (rows: TransferPortalRow[]) => {
    const ids = rows.map((r) => r.id).filter(Boolean);
    if (ids.length === 0) {
      setNoteCounts({});
      return;
    }

    const submissionMap = new Map<string, string>();
    rows.forEach((r) => {
      const submissionId = (r as any).submission_id as string | undefined;
      if (submissionId) submissionMap.set(submissionId, r.id);
    });

    const counts: Record<string, number> = {};
    ids.forEach((id) => {
      counts[id] = 0;
    });

    const submissionIds = Array.from(submissionMap.keys());
    if (submissionIds.length > 0) {
      try {
        const { data: dealFlowRows, error: dealFlowErr } = await supabase
          .from('daily_deal_flow')
          .select('submission_id, notes')
          .in('submission_id', submissionIds);

        if (!dealFlowErr && Array.isArray(dealFlowRows)) {
          dealFlowRows.forEach((row) => {
            const noteText = (row.notes as string | null)?.trim();
            if (noteText) {
              const leadId = submissionMap.get(row.submission_id as string);
              if (leadId) {
                counts[leadId] = (counts[leadId] || 0) + 1;
              }
            }
          });
        }
      } catch (e) {
        console.warn('Failed to fetch daily deal flow note counts', e);
      }
    }

    setNoteCounts(counts);
  };

  const getStatusForStage = (stageKey: string): string => {
    const stage = kanbanStages.find((s) => s.key === stageKey);
    return (stage?.key || '').trim() || stageKey;
  };

  const handleDropToStage = async (rowId: string, stageKey: string) => {
    const selectedStage = getStatusForStage(stageKey);
    const nextStatus = isTransferHandoffStage(selectedStage)
      ? TRANSFER_HANDOFF_STAGE_KEY
      : selectedStage;

    const prev = data;
    const next = prev.map((r) => (r.id === rowId ? { ...r, status: nextStatus } : r));
    setData(next);

    try {
      const droppedRow = prev.find((row) => row.id === rowId);

      const { error: leadsError } = await (supabase as any)
        .from('leads')
        .update({ status: nextStatus })
        .eq('id', rowId);

      if (leadsError) throw leadsError;

      await syncLatestDailyDealFlowRow(droppedRow?.submission_id, { status: nextStatus });

      toast({
        title: 'Status Updated',
        description:
          isTransferHandoffStage(selectedStage)
            ? 'Lead moved to "Retainer Signed" and handed off to Submission Portal.'
            : `Transfer updated to "${toDispositionLabel(nextStatus) ?? nextStatus}"`,
      });
    } catch (e) {
      console.error('Error updating transfer status:', e);
      setData(prev);
      toast({
        title: 'Error',
        description: 'Failed to update transfer status',
        variant: 'destructive',
      });
    }
  };

  const handleExport = () => {
    if (stageFilteredData.length === 0) {
      toast({
        title: "No Data",
        description: "No data to export",
        variant: "destructive",
      });
      return;
    }

    const headers = [
      'Submission ID',
      'Date',
      'Customer Name',
      'Lead Vendor',
      'Phone Number',
      'Buffer Agent',
      'Agent',
      'Licensed Agent',
      'Status',
      'Call Result',
      'Carrier',
      'Product Type',
      'Draft Date',
      'Monthly Premium',
      'Face Amount',
      'From Callback',
      'Source Type',
      'Created At'
    ];

    const csvContent = [
      headers.join(','),
      ...stageFilteredData.map(row => [
        row.submission_id,
        row.date || '',
        row.insured_name || '',
        row.lead_vendor || '',
        row.client_phone_number || '',
        row.buffer_agent || '',
        row.agent || '',
        row.licensed_agent_account || '',
        row.status || '',
        row.call_result || '',
        row.carrier || '',
        row.product_type || '',
        row.draft_date || '',
        row.monthly_premium || '',
        row.face_amount || '',
        row.from_callback ? 'Yes' : 'No',
        row.source_type || '',
        row.created_at || ''
      ].map(field => `"${field}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transfer-portal-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);

    toast({
      title: "Export Complete",
      description: "Data exported to CSV successfully",
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Loading transfer portal data...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                  Total Transfers
                  <ColumnInfoPopover info={transferStatInfo.totalTransfers} />
                </CardTitle>
              </CardHeader>
              <CardContent className="flex items-center justify-between">
                <div className="text-3xl font-semibold">{transferStats.totalTransfers}</div>
                <ArrowLeftRight className="h-10 w-10 text-primary" />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                  New Transfers
                  <ColumnInfoPopover info={transferStatInfo.newTransfers} />
                </CardTitle>
              </CardHeader>
              <CardContent className="flex items-center justify-between">
                <div className="text-3xl font-semibold">{transferStats.newTransfers}</div>
                <Users className="h-10 w-10 text-primary" />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                  Needs Follow-Up
                  <ColumnInfoPopover info={transferStatInfo.needsFollowUp} />
                </CardTitle>
              </CardHeader>
              <CardContent className="flex items-center justify-between">
                <div className="text-3xl font-semibold">{transferStats.needsFollowUp}</div>
                <UserPlus className="h-10 w-10 text-primary" />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                  Returned / DQ
                  <ColumnInfoPopover info={transferStatInfo.returnedOrDq} />
                </CardTitle>
              </CardHeader>
              <CardContent className="flex items-center justify-between">
                <div className="text-3xl font-semibold">{transferStats.returnedOrDq}</div>
                <AlertTriangle className="h-10 w-10 text-primary" />
              </CardContent>
            </Card>
          </div>

          {/* ── Toolbar ── */}
          <div className="flex items-center gap-2">
            {/* Search + Filter button */}
            <div className="relative flex-1 max-w-sm">
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by name, phone, vendor…"
                className="pr-4"
              />
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowFilters((v) => !v)}
              className={showFilters ? "border-primary text-primary bg-primary/5" : ""}
            >
              <SlidersHorizontal className="mr-2 h-4 w-4" />
              Filters
              {/* active-filter dot */}
              {(datePreset !== "all" || sourceTypeFilter !== "__ALL__" || selectedStates.length > 0 || leadVendorFilter !== "__ALL__" || selectedStage !== "all") && (
                <span className="ml-2 flex h-2 w-2 rounded-full bg-primary" />
              )}
            </Button>

            {/* Spacer */}
            <div className="flex-1" />

            {/* View toggle */}
            <div className="inline-flex rounded-lg border border-muted bg-background p-0.5 shrink-0">
              {["kanban", "list"].map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                    viewMode === mode
                      ? "bg-primary text-white shadow"
                      : "text-muted-foreground hover:bg-muted"
                  }`}
                  onClick={() => setViewMode(mode as "kanban" | "list")}
                >
                  {mode === "kanban" ? "Kanban View" : "List View"}
                </button>
              ))}
            </div>

            <Badge variant="secondary" className="px-2.5 py-1 shrink-0 tabular-nums">
              {allTimeTransfers} transfers
            </Badge>

            <Button variant="outline" size="sm" onClick={handleExport}>
              Export CSV
            </Button>

            <Button size="sm" onClick={handleRefresh} disabled={refreshing}>
              <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>

          {/* ── Collapsible Filter Panel ── */}
          {showFilters && (
            <Card className="border-primary/20 bg-muted/30 shadow-none">
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-semibold text-foreground">Filters</span>
                    {(datePreset !== "all" || sourceTypeFilter !== "__ALL__" || selectedStates.length > 0 || leadVendorFilter !== "__ALL__" || selectedStage !== "all") && (
                      <button
                        type="button"
                        onClick={() => {
                          setDatePreset("all");
                          setCustomStartDate("");
                          setCustomEndDate("");
                          setSourceTypeFilter("__ALL__");
                          setSelectedStates([]);
                          setLeadVendorFilter("__ALL__");
                          setSelectedStage("all");
                          setCurrentPage(1);
                        }}
                        className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary hover:bg-primary/20 transition"
                      >
                        <X className="h-3 w-3" />
                        Clear all
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowFilters(false)}
                    className="rounded-md p-1 text-muted-foreground hover:bg-muted transition"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
                  {/* Date range */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Date Range
                    </label>
                    <PresetDateRangeFilter
                      preset={datePreset}
                      onPresetChange={setDatePreset}
                      customStartDate={customStartDate}
                      customEndDate={customEndDate}
                      onCustomStartDateChange={setCustomStartDate}
                      onCustomEndDateChange={setCustomEndDate}
                    />
                  </div>

                  {/* Lead Vendor */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Lead Vendor
                    </label>
                    <Select value={leadVendorFilter} onValueChange={setLeadVendorFilter}>
                      <SelectTrigger>
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
                  </div>

                  {/* Stage */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Stage
                    </label>
                    <Select value={selectedStage} onValueChange={(value) => { setSelectedStage(value); setCurrentPage(1); }}>
                      <SelectTrigger>
                        <SelectValue placeholder="All Stages" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="all">All Stages</SelectItem>
                          {kanbanStages.map((stage) => (
                            <SelectItem key={stage.key} value={stage.key}>
                              {stage.label}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Source Type */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Source Type
                    </label>
                    <Select value={sourceTypeFilter} onValueChange={setSourceTypeFilter}>
                      <SelectTrigger>
                        <SelectValue placeholder="All Sources" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="__ALL__">All Sources</SelectItem>
                          <SelectItem value="zapier">Zapier</SelectItem>
                          <SelectItem value="callback">Callback</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* State */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      State
                    </label>
                    <MultiSelect
                      options={stateOptions}
                      selected={selectedStates}
                      onChange={setSelectedStates}
                      placeholder="All States"
                      className="w-full"
                      maxVisibleBadges={null}
                      selectedDisplayMode="scroll"
                      highlightSelectedOptions={false}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {viewMode === "kanban" ? (
            <div className="mt-4 min-h-0 flex-1 overflow-auto" onDragOver={handleKanbanDragOver}>
              <div
                className="grid min-h-0 min-w-full grid-flow-col gap-3 pr-2"
                style={{ gridAutoColumns: "minmax(18.5rem, calc((100% - 2.25rem) / 4))" }}
              >
                {kanbanStages.map((stage) => {
                  const rows = leadsByStage.get(stage.key) || [];
                  const current = Number(columnPage[stage.key] ?? 1);
                  const totalPages = Math.max(1, Math.ceil(rows.length / kanbanPageSize));
                  const startIndex = (current - 1) * kanbanPageSize;
                  const endIndex = startIndex + kanbanPageSize;
                  const pageRows = rows.slice(startIndex, endIndex);
                  return (
                    <Card
                      key={stage.key}
                      className={
                        `flex min-h-[560px] flex-col bg-muted/20 ${stageTheme[stage.key].column}` +
                        (dragOverStage === stage.key ? ' ring-2 ring-primary/30' : '')
                      }
                      onDragOver={(e) => e.preventDefault()}
                      onDragEnter={() => setDragOverStage(stage.key)}
                      onDragLeave={() => setDragOverStage((prev) => (prev === stage.key ? null : prev))}
                      onDrop={(e) => {
                        e.preventDefault();
                        const droppedId = e.dataTransfer.getData('text/plain');
                        if (!droppedId) return;
                        handleDropToStage(droppedId, stage.key);
                        setDraggingId(null);
                        setDragOverStage(null);
                      }}
                    >
                      <CardHeader className="flex flex-row items-center justify-between border-b px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          <CardTitle className="text-sm font-semibold">{stage.label}</CardTitle>
                          <ColumnInfoPopover info={getColumnInfo(stage.label)} />
                        </div>
                        <Badge variant="secondary">{rows.length}</Badge>
                      </CardHeader>
                      <CardContent className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
                        {pageRows.length === 0 ? (
                          <div className="rounded-md border border-dashed border-muted-foreground/30 px-3 py-6 text-center text-xs text-muted-foreground">
                            No leads
                          </div>
                        ) : (
                          pageRows.map((row) => {
                            const statusText =
                              toDispositionLabel(row.status ?? null) ||
                              kanbanStages.find((item) => item.key === stage.key)?.label ||
                              row.status ||
                              "No status";

                            return (
                              <Card
                                key={row.id}
                                draggable
                                className="w-full cursor-pointer transition hover:shadow-md"
                                onClick={() => handleView(row)}
                                onDragStart={(e) => {
                                  e.dataTransfer.effectAllowed = 'move';
                                  e.dataTransfer.setData('text/plain', row.id);
                                  setDraggingId(row.id);
                                }}
                                onDragEnd={() => {
                                  setDraggingId(null);
                                  setDragOverStage(null);
                                }}
                                style={draggingId === row.id ? { opacity: 0.7 } : undefined}
                              >
                                <CardContent className="space-y-2 p-2.5">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0 flex-1 space-y-1.5">
                                      <div className="truncate text-[1.05rem] font-semibold leading-tight tracking-[-0.01em]">
                                        {row.insured_name || "—"}
                                      </div>
                                      <div className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
                                        <span className="truncate whitespace-nowrap tabular-nums">{row.client_phone_number || "—"}</span>
                                        <div className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border/70 bg-muted/60 px-2 py-0.5 text-[10px] font-medium text-foreground/80">
                                          <StickyNote className="h-3.5 w-3.5" />
                                          <span>{noteCounts[row.id] ?? 0}</span>
                                        </div>
                                      </div>
                                    </div>
                                    <div className="flex shrink-0 flex-col items-stretch gap-1">
                                      <div className="flex items-center justify-end gap-1">
                                        <Button
                                          type="button"
                                          variant="outline"
                                          size="icon"
                                          className="h-7 w-7"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            void handleOpenLeadAction(row);
                                          }}
                                        >
                                          <Eye className="h-3.5 w-3.5" />
                                        </Button>
                                        <Button
                                          type="button"
                                          variant="outline"
                                          size="icon"
                                          className="h-7 w-7"
                                          onClick={(e) => { e.stopPropagation(); handleOpenEdit(row); }}
                                        >
                                          <Pencil className="h-3.5 w-3.5" />
                                        </Button>
                                      </div>
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="h-7 gap-1 self-end border-primary/40 px-2 text-[11px] font-medium text-primary hover:bg-primary hover:text-primary-foreground"
                                        onClick={(e) => { e.stopPropagation(); openClaimModal(row.submission_id); }}
                                      >
                                        <UserPlus className="h-3 w-3" />
                                        Claim
                                      </Button>
                                    </div>
                                  </div>

                                  <div className="flex flex-col gap-1.5 pt-0.5">
                                    <Badge variant="secondary" className="max-w-full w-fit truncate rounded-full px-2.5 py-1 text-[11px] font-semibold">
                                      {row.lead_vendor || "—"}
                                    </Badge>
                                  </div>
                                </CardContent>
                              </Card>
                            );
                          })
                        )}
                      </CardContent>

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
                    </Card>
                  );
                })}
              </div>
            </div>
          ) : (
            <Card>
              <CardHeader className="border-b">
                <CardTitle className="text-base font-semibold">
                  Transfers ({stageFilteredData.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {stageFilteredData.length === 0 ? (
                  <div className="py-10 text-center text-muted-foreground">
                    No transfer records found for the selected filters.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                          <th className="px-4 py-3">Client</th>
                          <th className="px-4 py-3">Phone</th>
                          <th className="px-4 py-3">Stage</th>
                          <th className="px-4 py-3">Publisher</th>
                          <th className="px-4 py-3">Date</th>
                          <th className="px-4 py-3 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {currentPageData.map((row) => {
                          const stageKey = deriveStageKey(row);
                          const stageLabel =
                            toDispositionLabel(row.status ?? null) ||
                            kanbanStages.find((stage) => stage.key === stageKey)?.label ||
                            row.status ||
                            "";
                          return (
                            <tr key={row.id} className="border-b last:border-0">
                              <td className="px-4 py-3">{row.insured_name || "Unnamed"}</td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <span>{row.client_phone_number || "N/A"}</span>
                                  <div className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px]">
                                    <StickyNote className="h-3.5 w-3.5" />
                                    <span>{noteCounts[row.id] ?? 0}</span>
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <Badge variant="outline">{stageLabel}</Badge>
                              </td>
                              <td className="px-4 py-3">{row.lead_vendor || "Unknown"}</td>
                              <td className="px-4 py-3">{row.date || ""}</td>
                              <td className="px-4 py-3 text-right">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => handleOpenEdit(row)}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {stageFilteredData.length > itemsPerPage && (
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-sm">
                    <span>
                      Page {currentPage} of {totalPages} • Showing {startIndex + 1}-{Math.min(endIndex, stageFilteredData.length)}
                    </span>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={handlePrevPage} disabled={currentPage === 1}>
                        Previous
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleNextPage}
                        disabled={currentPage === totalPages}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <Dialog
            open={editOpen}
            onOpenChange={(open) => {
              setEditOpen(open);
              if (!open) {
                setEditRow(null);
              }
            }}
          >
            <DialogContent className="sm:max-w-[520px]">
              <DialogHeader>
                <DialogTitle>Edit Transfer</DialogTitle>
              </DialogHeader>

              <div className="space-y-4">
                {/* Pipeline selector */}
                <div className="space-y-2">
                  <Label>Pipeline</Label>
                  <Select
                    value={editPipeline}
                    onValueChange={(value) => {
                      setEditPipeline(value);
                      setEditStage('');
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select pipeline..." />
                    </SelectTrigger>
                    <SelectContent>
                      {EDIT_PIPELINE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Stage</Label>
                  <Select value={editStage} onValueChange={setEditStage}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select stage..." />
                    </SelectTrigger>
                    <SelectContent>
                      {editActivePipelineLabels.map((label) => (
                        <SelectItem key={label} value={label}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} rows={5} />
                </div>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditOpen(false)} disabled={editSaving}>
                  Cancel
                </Button>
                <Button type="button" onClick={handleSaveEdit} disabled={editSaving || !editStage}>
                  {editSaving ? 'Saving...' : 'Save'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <ClaimDroppedCallModal
        open={claimModalOpen}
        loading={claimLoading}
        licensedAgents={licensedAgents}
        fetchingAgents={fetchingAgents}
        claimLicensedAgent={claimLicensedAgent}
        onLicensedAgentChange={setClaimLicensedAgent}
        onCancel={() => setClaimModalOpen(false)}
        onClaim={handleClaimCall}
      />
    </div>
  );
};

export default TransferPortalPage;
