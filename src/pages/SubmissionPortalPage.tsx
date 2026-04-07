import { useEffect, useMemo, useState } from "react";
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MultiSelect } from "@/components/ui/multi-select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { ClipboardList, Eye, FileText, Loader2, Pencil, RefreshCw, Scale, SlidersHorizontal, StickyNote, UserPlus, Wallet, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAttorneys } from "@/hooks/useAttorneys";
import { usePipelineStages } from "@/hooks/usePipelineStages";
import {
  parseStageLabel,
  deriveParentStages,
  buildStatusLabel,
} from "@/lib/stageUtils";
import { PresetDateRangeFilter } from "@/components/PresetDateRangeFilter";
import { isDateInRange, type DateRangePreset } from "@/lib/dateRangeFilter";
import { ClaimDroppedCallModal } from "@/components/ClaimDroppedCallModal";
import { ColumnInfoPopover } from "@/components/ColumnInfoPopover";
import { logCallUpdate, getLeadInfo } from "@/lib/callLogging";
import { getStateFilterOptions, matchesStateFilter } from "@/lib/stateFilter";
import { useSalesMapCoverageStates } from "@/hooks/useSalesMapCoverageStates";
import { ALL_LEAD_TAGS_VALUE, getLeadTagToneClass, LEAD_TAG_OPTIONS } from "@/lib/leadTags";

export interface SubmissionPortalRow {
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
  tag?: string | null;
  assigned_attorney_id?: string | null;
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
  application_submitted?: boolean;
  sent_to_underwriting?: boolean;
  submission_date?: string;
  dq_reason?: string;
  call_source?: string;
  submission_source?: string;
  verification_logs?: string;
  has_submission_data?: boolean;
  source_type?: string;
  state?: string;
}

interface CallLog {
  agent_type: string;
  agent_name: string;
  event_type: string;
  created_at: string;
}

interface ColumnInfoDetail {
  label: string;
  value: string;
}
interface ColumnInfo {
  description: string;
  details?: ColumnInfoDetail[];
}

const SHARED_PIPELINE_FILTER_STORAGE_KEY = "shared-pipeline-filters";

type SharedPipelineFilterStorage = {
  datePreset: DateRangePreset;
  customStartDate: string;
  customEndDate: string;
  leadVendorFilter: string;
  selectedStates: string[];
  searchTerm: string;
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

const SUBMISSION_STATS_STAGE_KEYS = {
  intakeQueue: ["retainer_signed", "qualified_missing_info"],
  qualifiedAndReview: [
    "qualified_tier_1",
    "qualified_tier_2",
    "qualified_tier_3",
    "qualified_tier_4",
    "attorney_review",
    "attorney_rejected",
    "attorney_approved",
  ],
  paymentQueue: ["qualified_payable", "paid_to_agency", "paid_to_bpo"],
} as const;

const getColumnInfo = (label: string): ColumnInfo => {
  const l = label.toLowerCase();

  if (l.includes("tier 1") || l.includes("tier1"))
    return {
      description: "Consumer cases qualified at Tier 1 value. Oldest accidents with minor injuries and minimal documentation.",
      details: [
        { label: "Price", value: "$2,500 / case" },
        { label: "Accident", value: "12+ Months Ago" },
        { label: "Injury", value: "Minor to Moderate" },
        { label: "Documentation", value: "Signed Retainer" },
        { label: "Liability", value: "100% Accepted" },
      ],
    };

  if (l.includes("tier 2") || l.includes("tier2") || l.includes("bronze"))
    return {
      description: "Consumer cases qualified at Tier 2 (Bronze). Mid-age accidents with moderate injuries and police report.",
      details: [
        { label: "Price", value: "$3,500 / case" },
        { label: "Accident", value: "6–12 Months Ago" },
        { label: "Injury", value: "Moderate to Severe" },
        { label: "Documentation", value: "Signed Retainer, Police Report" },
        { label: "Liability", value: "100% Accepted" },
      ],
    };

  if (l.includes("tier 3") || l.includes("tier3") || l.includes("silver"))
    return {
      description: "Consumer cases qualified at Tier 3 (Silver). Recent accidents with moderate-severe injuries and full documentation.",
      details: [
        { label: "Price", value: "$4,500 / case" },
        { label: "Accident", value: "3–6 Months Ago" },
        { label: "Injury", value: "Moderate to Severe" },
        { label: "Documentation", value: "Retainer, Medical Records, Police Report" },
        { label: "Liability", value: "100% Accepted" },
      ],
    };

  if (l.includes("tier 4") || l.includes("tier4") || l.includes("gold"))
    return {
      description: "Consumer cases qualified at Tier 4 (Gold). Very recent accidents with severe-catastrophic injuries and complete documentation package.",
      details: [
        { label: "Price", value: "$6,000 / case" },
        { label: "Accident", value: "0–3 Months Ago" },
        { label: "Injury", value: "Moderate to Catastrophic" },
        { label: "Documentation", value: "Insurance, Medical Records, Police Report" },
        { label: "Liability", value: "100% Accepted" },
      ],
    };

  if (l.includes("retainer signed") || l === "retainer_signed")
    return { description: "Leads that have completed and signed the retainer agreement. Ready to be reviewed and qualified into a tier." };

  if (l.includes("missing information") || l.includes("missing info"))
    return { description: "Retainer has been signed but required information is incomplete. These leads need follow-up before they can be submitted or tiered." };

  if (l.includes("previously sold") || l.includes("bpo") && l.includes("sold"))
    return { description: "Leads that have been previously sold through BPO (Business Process Outsourcing) channels. These are not eligible for resubmission." };

  if (l.includes("needs bpo") || l.includes("bpo call"))
    return { description: "Leads that require a BPO verification call before they can be submitted. Awaiting outbound call to confirm case details." };

  if (l.includes("submitted") || l.includes("submission"))
    return { description: "Cases that have been formally submitted to the attorney or legal team for intake and processing." };

  if (l.includes("qualified"))
    return { description: "Leads that have been reviewed and meet the criteria to be submitted as a qualified case." };

  if (l.includes("incomplete") || l.includes("incomplete transfer"))
    return { description: "Transfers that were initiated but not completed. These leads need to be re-engaged or reassigned." };

  if (l.includes("returned") || l.includes("center"))
    return { description: "Leads returned to the call center due to disqualification or failure to meet submission requirements." };

  if (l.includes("disqualified") || l.includes("dq"))
    return { description: "Leads that have been reviewed and do not meet the minimum qualifications for submission." };

  return { description: `Leads currently in the "${label}" stage of the submission pipeline.` };
};

const SubmissionPortalPage = () => {
  const navigate = useNavigate();

  // --- Dynamic pipeline stages from DB ---
  const { stages: dbSubmissionStages, loading: stagesLoading } = usePipelineStages("submission_portal");
  const { stages: dbTransferStages } = usePipelineStages("transfer_portal");
  const { stages: dbCloserStages } = usePipelineStages("closer_portal");

  const stageLabelByKey = useMemo(() => {
    const map: Record<string, string> = {};
    (dbSubmissionStages ?? []).forEach((s) => {
      const k = (s?.key ?? "").trim();
      const lbl = (s?.label ?? "").trim();
      if (k && lbl) map[k] = lbl;
    });
    return map;
  }, [dbSubmissionStages]);

  const toDispositionLabel = useMemo(() => {
    return (value: string | null | undefined) => {
      const v = (value ?? "").trim();
      if (!v) return null;
      return stageLabelByKey[v] ?? v;
    };
  }, [stageLabelByKey]);

  const submissionStageKeyByLabel = useMemo(() => {
    const map = new Map<string, string>();
    (dbSubmissionStages ?? []).forEach((stage) => {
      const key = (stage?.key ?? "").trim();
      const label = (stage?.label ?? "").trim();
      if (key && label) map.set(label, key);
    });
    return map;
  }, [dbSubmissionStages]);

  const normalizePortalHandoffStatus = (value: string | null | undefined): string => {
    const trimmed = (value || "").trim();
    if (!trimmed) return "";

    const lower = trimmed.toLowerCase();
    if (lower === "document_signed_api") return "retainer_signed";
    return trimmed;
  };

  const normalizeSubmissionStatusKey = (value: string | null | undefined): string => {
    const trimmed = normalizePortalHandoffStatus(value);
    if (!trimmed) return "";

    const exactKey = dbSubmissionStages.find((stage) => (stage?.key ?? "").trim() === trimmed);
    if (exactKey?.key) return exactKey.key.trim();

    const mappedKey = submissionStageKeyByLabel.get(trimmed);
    if (mappedKey) return mappedKey;

    return trimmed;
  };

  const parentStages = useMemo(() => deriveParentStages(dbSubmissionStages), [dbSubmissionStages]);

  const kanbanStages = useMemo(() => {
    return (dbSubmissionStages ?? [])
      .map((stage) => ({
        key: (stage?.key ?? "").trim(),
        label: (stage?.label ?? "").trim(),
        columnClass: stage?.column_class || "",
        headerClass: stage?.header_class || "",
      }))
      .filter((stage) => stage.key && stage.label);
  }, [dbSubmissionStages]);

  const stageTheme = useMemo(() => {
    const theme: Record<string, { column: string; header: string }> = {};
    kanbanStages.forEach((stage) => {
      theme[stage.key] = { column: stage.columnClass, header: stage.headerClass };
    });
    return theme;
  }, [kanbanStages]);

  // Map of parent label → reasons for edit form
  const reasonsByParent = useMemo(() => {
    const map: Record<string, string[]> = {};
    parentStages.forEach((s) => {
      if (s.reasons.length > 0) map[s.label] = s.reasons;
    });
    return map;
  }, [parentStages]);

  // ── Pipeline-agnostic helpers for the Edit dialog ──────────────────────────

  const EDIT_PIPELINE_OPTIONS = [
    { value: "submission_portal", label: "Submission Pipeline" },
    { value: "transfer_portal",  label: "Transfer Pipeline"   },
    { value: "closer_portal",    label: "Closer Pipeline"     },
  ] as const;

  const editPipelineStagesMap: Record<string, typeof dbSubmissionStages> = {
    submission_portal: dbSubmissionStages,
    transfer_portal:   dbTransferStages,
    closer_portal:     dbCloserStages,
  };

  const deriveStageKey = (row: SubmissionPortalRow): string => {
    const status = normalizeSubmissionStatusKey(row.status);
    if (!status) return '';
    return kanbanStages.some((stage) => stage.key === status) ? status : '';
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

  const getStatusForStage = (stageKey: string) => {
    return kanbanStages.find((stage) => stage.key === stageKey)?.label ?? '';
  };

  const getStatusKeyForStage = (columnStageKey: string) => {
    return kanbanStages.some((stage) => stage.key === columnStageKey) ? columnStageKey : '';
  };

  const buildAllowedStatuses = () => {
    const stageKeys = dbSubmissionStages.map((s) => s.key);
    const stageLabels = dbSubmissionStages.map((s) => s.label);
    return Array.from(new Set([...stageKeys, ...stageLabels]));
  };

  const transferStatusSet = useMemo(() => {
    const keys = (dbTransferStages ?? []).map((s) => (s?.key ?? "").trim()).filter(Boolean);
    const labels = (dbTransferStages ?? []).map((s) => (s?.label ?? "").trim()).filter(Boolean);
    return new Set<string>([...keys, ...labels]);
  }, [dbTransferStages]);

  const [data, setData] = useState<SubmissionPortalRow[]>([]);
  const [filteredData, setFilteredData] = useState<SubmissionPortalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const savedSharedFilters = useMemo(() => readSharedPipelineFilters(), []);
  const [datePreset, setDatePreset] = useState<DateRangePreset>(savedSharedFilters?.datePreset ?? "all");
  const [customStartDate, setCustomStartDate] = useState(savedSharedFilters?.customStartDate ?? "");
  const [customEndDate, setCustomEndDate] = useState(savedSharedFilters?.customEndDate ?? "");
  const [statusFilter, setStatusFilter] = useState("__ALL__");
  const [leadVendorFilter, setLeadVendorFilter] = useState(savedSharedFilters?.leadVendorFilter ?? "__ALL__");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [selectedStates, setSelectedStates] = useState<string[]>(savedSharedFilters?.selectedStates ?? []);
  const [tagFilter, setTagFilter] = useState<string>(ALL_LEAD_TAGS_VALUE);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);
  const [columnPage, setColumnPage] = useState<Record<string, number>>({});
  const [noteCounts, setNoteCounts] = useState<Record<string, number>>({});

  const [editOpen, setEditOpen] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editRow, setEditRow] = useState<SubmissionPortalRow | null>(null);
  const [editPipeline, setEditPipeline] = useState("submission_portal");
  const [editStage, setEditStage] = useState("");
  const [editReason, setEditReason] = useState("");
  const [editNotes, setEditNotes] = useState("");
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

  const boardVisibleRows = useMemo(() => {
    return filteredData.filter((row) => Boolean(deriveStageKey(row)));
  }, [filteredData, kanbanStages]);

  const submissionStats = useMemo(() => {
    const rows = boardVisibleRows;
    const hasStageKey = (row: SubmissionPortalRow, allowedKeys: readonly string[]) => {
      const stageKey = deriveStageKey(row);
      return allowedKeys.includes(stageKey);
    };

    return {
      totalCases: rows.length,
      intakeQueue: rows.filter((row) => hasStageKey(row, SUBMISSION_STATS_STAGE_KEYS.intakeQueue)).length,
      qualifiedAndReview: rows.filter((row) => hasStageKey(row, SUBMISSION_STATS_STAGE_KEYS.qualifiedAndReview)).length,
      paymentQueue: rows.filter((row) => hasStageKey(row, SUBMISSION_STATS_STAGE_KEYS.paymentQueue)).length,
    };
  }, [boardVisibleRows, kanbanStages, dbSubmissionStages]);

  const submissionStatInfo = useMemo(
    () => ({
      totalCases: {
        description: "All leads currently inside the submission pipeline after the active page filters are applied.",
        details: [{ label: "Scope", value: "All submission stages" }],
      },
      intakeQueue: {
        description: "Leads still in early submission handling. These need intake completion before they can be fully qualified or submitted forward.",
        details: [
          { label: "Stage 1", value: stageLabelByKey["retainer_signed"] ?? "Retainer Signed" },
          { label: "Stage 2", value: stageLabelByKey["qualified_missing_info"] ?? "Signed: Missing Information" },
        ],
      },
      qualifiedAndReview: {
        description: "Cases that have been tiered or are in attorney-side review and decision stages.",
        details: [
          { label: "Tiering", value: "Tier 1 to Tier 4" },
          { label: "Review", value: stageLabelByKey["attorney_review"] ?? "Attorney Review" },
          { label: "Decision", value: `${stageLabelByKey["attorney_approved"] ?? "Attorney Approved"} / ${stageLabelByKey["attorney_rejected"] ?? "Attorney Rejected"}` },
        ],
      },
      paymentQueue: {
        description: "Cases that are already payable or in final payment stages after attorney-side approval is complete.",
        details: [
          { label: "Stage 1", value: stageLabelByKey["qualified_payable"] ?? "Qualified/Payable" },
          { label: "Stage 2", value: stageLabelByKey["paid_to_agency"] ?? "Paid to Agency" },
          { label: "Stage 3", value: stageLabelByKey["paid_to_bpo"] ?? "Paid to BPO" },
        ],
      },
    }),
    [stageLabelByKey]
  );

  const { toast } = useToast();
  const { attorneys } = useAttorneys();

  const attorneyById = useMemo(() => {
    const map: Record<string, string> = {};
    (attorneys || []).forEach((a) => {
      if (!a.user_id) return;
      const label = (a.full_name || a.primary_email || "").trim();
      if (!label) return;
      map[a.user_id] = label;
    });
    return map;
  }, [attorneys]);

  // Apply filters
  const applyFilters = (records: SubmissionPortalRow[]): SubmissionPortalRow[] => {
    let filtered = records;

    // Apply date filter
    filtered = filtered.filter((record) =>
      isDateInRange(record.date || record.submission_date || record.created_at || null, datePreset, customStartDate, customEndDate)
    );

    // Apply status filter
    if (statusFilter !== "__ALL__") {
      filtered = filtered.filter((record) => deriveStageKey(record) === statusFilter);
    }

    // Apply lead vendor filter
    if (leadVendorFilter !== "__ALL__") {
      filtered = filtered.filter((record) => (record.lead_vendor || '') === leadVendorFilter);
    }

    if (tagFilter !== ALL_LEAD_TAGS_VALUE) {
      filtered = filtered.filter((record) => (record.tag || '') === tagFilter);
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

  const tagOptions = useMemo(() => {
    const set = new Set<string>();
    data.forEach((row) => {
      const tag = (row.tag || "").trim();
      if (tag) set.add(tag);
    });
    return LEAD_TAG_OPTIONS.filter((tag) => set.has(tag));
  }, [data]);

  const stateOptions = useMemo(() => {
    return getStateFilterOptions(data).map((option) => ({
      ...option,
      itemClassName: unblockedStateCodes.has(option.value)
        ? "bg-emerald-50 text-emerald-950 hover:bg-emerald-100 hover:text-emerald-950"
        : undefined,
    }));
  }, [data, unblockedStateCodes]);

  const generateVerificationLogSummary = (logs: CallLog[], submission?: any): string => {
    if (!logs || logs.length === 0) {
      if (submission && submission.has_submission_data) {
        const workflow = [];
        
        if (submission.buffer_agent) {
          workflow.push(`🟡 Buffer: ${submission.buffer_agent}`);
        }
        
        if (submission.agent && submission.agent !== submission.buffer_agent) {
          workflow.push(`📞 Handled by: ${submission.agent}`);
        }
        
        if (submission.licensed_agent_account) {
          if (submission.buffer_agent || submission.agent_who_took_call) {
            workflow.push(`➡️ Transfer to Licensed`);
          }
          workflow.push(`🔵 Licensed: ${submission.licensed_agent_account}`);
        }
        
        if (workflow.length > 0) {
          return workflow.join(' → ');
        }
      }
      
      return "No call activity recorded";
    }

    const sortedLogs = logs.sort((a, b) => 
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    const workflow: string[] = [];
    let initialAgent: string | null = null;
    let currentAgent: string | null = null;
    let bufferAgent: string | null = null;
    let licensedAgent: string | null = null;
    let hasTransfer = false;
    
    for (const log of sortedLogs) {
      const agentName = log.agent_name || `${log.agent_type} agent`;
      
      switch (log.event_type) {
        case 'verification_started':
          if (!initialAgent) {
            initialAgent = agentName;
            currentAgent = agentName;
            
            if (log.agent_type === 'buffer') {
              bufferAgent = agentName;
              workflow.push(`� Buffer "${agentName}" picked up initially`);
            } else if (log.agent_type === 'licensed') {
              licensedAgent = agentName;
              workflow.push(`🔵 Licensed "${agentName}" picked up initially`);
            }
          }
          break;
          
        case 'call_picked_up':
          if (agentName !== currentAgent) {
            if (log.agent_type === 'buffer') {
              bufferAgent = agentName;
              workflow.push(`� Buffer "${agentName}" picked up`);
            } else {
              licensedAgent = agentName;
              workflow.push(`🔵 Licensed "${agentName}" picked up`);
            }
            currentAgent = agentName;
          }
          break;
          
        case 'call_claimed':
          if (log.agent_type === 'buffer') {
            bufferAgent = agentName;
            workflow.push(`� Buffer "${agentName}" claimed dropped call`);
          } else {
            licensedAgent = agentName;
            workflow.push(`🔵 Licensed "${agentName}" claimed dropped call`);
          }
          currentAgent = agentName;
          break;
          
        case 'transferred_to_la':
          hasTransfer = true;
          workflow.push(`➡️ Transferred to Licensed Agent`);
          break;
          
        case 'call_dropped':
          workflow.push(`❌ "${agentName}" dropped call`);
          break;
          
        case 'application_submitted':
          workflow.push(`✅ Application submitted by "${agentName}"`);
          break;
          
        case 'application_not_submitted':
          workflow.push(`❌ Application not submitted`);
          break;
          
        case 'call_disconnected':
          workflow.push(`📞 Call disconnected from "${agentName}"`);
          break;
      }
    }

    // If no workflow events, show basic structure
    if (workflow.length === 0) {
      return "No detailed workflow events recorded";
    }

    // Add summary at the end showing final state
    const summary = [];
    if (bufferAgent) summary.push(`Buffer: ${bufferAgent}`);
    if (hasTransfer || licensedAgent) summary.push(`Licensed: ${licensedAgent || 'TBD'}`);
    
    if (summary.length > 0) {
      workflow.push(`📋 Summary: ${summary.join(' → ')}`);
    }

    return workflow.join(" → ");
  };

  // Fetch data from Supabase - get all transfers and merge with submission data
  const fetchData = async (showRefreshToast = false) => {
    try {
      setRefreshing(true);

      let leadsQuery = (supabase as any)
        .from('leads')
        .select('*')
        .order('submission_date', { ascending: false })
        .order('created_at', { ascending: false });

      // Get submission portal data for entries that exist
      let submissionQuery = (supabase as any)
        .from('submission_portal')
        .select('*');

      // Note: We don't apply client-side filters at query time so the same preset logic works everywhere

      const [leadsRes, submissionRes] = await Promise.all([
        leadsQuery,
        submissionQuery,
      ]);

      if (leadsRes.error) {
        console.error("Error fetching submission portal base leads:", leadsRes.error);
        toast({
          title: "Error",
          description: "Failed to fetch leads data",
          variant: "destructive",
        });
        return;
      }

      if (submissionRes.error) {
        console.warn("Error fetching submission portal data:", submissionRes.error);
        // Continue with just transfer data
      }

      const normalizedSubmissionData = Array.isArray(submissionRes.data) ? submissionRes.data : [];

      // Create a map of submission data by submission_id for quick lookup
      const submissionMap = new Map<string, any>();
      normalizedSubmissionData.forEach((row: any) => {
        if (row.submission_id) {
          submissionMap.set(row.submission_id, row);
        }
      });

      const mergedData = ((leadsRes.data ?? []) as any[]).map((lead) => {
        const submissionId = (lead?.submission_id || '').trim();
        const submission = submissionId ? submissionMap.get(submissionId) : null;

        const normalizedStatus = normalizePortalHandoffStatus((lead?.status || '') as string);
        if (normalizedStatus && transferStatusSet.has(normalizedStatus)) {
          return null;
        }

        const isCallback = Boolean(lead?.is_callback);

        return {
          ...submission,
          id: lead.id,
          submission_id: submissionId,
          insured_name: lead.customer_full_name || submission?.insured_name || '',
          client_phone_number: lead.phone_number || submission?.client_phone_number || '',
          lead_vendor: lead.lead_vendor || submission?.lead_vendor || '',
          buffer_agent: lead.buffer_agent || submission?.buffer_agent || '',
          agent: lead.agent || submission?.agent || '',
          licensed_agent_account: (lead as any).licensed_agent_account || submission?.licensed_agent_account || '',
          tag: lead.tag || '',
          assigned_attorney_id: (lead as any).assigned_attorney_id || submission?.assigned_attorney_id || null,
          status: normalizedStatus,
          call_result: '',
          carrier: lead.carrier || submission?.carrier || '',
          product_type: lead.product_type || submission?.product_type || '',
          draft_date: lead.draft_date || submission?.draft_date || '',
          monthly_premium: lead.monthly_premium || submission?.monthly_premium || null,
          face_amount: (lead as any).coverage_amount || submission?.face_amount || null,
          from_callback: isCallback,
          notes: '',
          policy_number: '',
          carrier_audit: '',
          product_type_carrier: '',
          level_or_gi: '',
          created_at: lead.created_at || '',
          updated_at: lead.updated_at || '',
          application_submitted: submission?.application_submitted,
          sent_to_underwriting: submission?.sent_to_underwriting,
          submission_date: lead.submission_date || submission?.submission_date || '',
          dq_reason: submission?.dq_reason || '',
          call_source: '',
          submission_source: submission?.submission_source || '',
          verification_logs: submission ? '' : "Update log missing - No submission data found",
          has_submission_data: Boolean(submission),
          source_type: isCallback ? 'callback' : 'zapier',
          state: lead.state || submission?.state || '',
        };
      });

      const mergedWithSourceType = mergedData.filter(Boolean).map((row: any) => {
        const isCallback = Boolean((row as any).from_callback) || Boolean((row as any).is_callback);
        return {
          ...row,
          source_type: row.source_type ?? (isCallback ? 'callback' : 'zapier'),
        };
      });

      // Fetch call logs for ALL entries (not just those with submission data)
      const allSubmissionIds = mergedWithSourceType.map(row => row.submission_id);
      
      let callLogsData: Record<string, CallLog[]> = {};
      
      if (allSubmissionIds.length > 0) {
        const { data: logsData, error: logsError } = await supabase
          .from('call_update_logs')
          .select('submission_id, agent_type, agent_name, event_type, created_at')
          .in('submission_id', allSubmissionIds)
          .order('created_at', { ascending: true });

        if (logsError) {
          console.warn("Error fetching call logs:", logsError);
        } else {
          // Group logs by submission_id
          callLogsData = (logsData || []).reduce((acc, log) => {
            if (!acc[log.submission_id]) {
              acc[log.submission_id] = [];
            }
            acc[log.submission_id].push(log);
            return acc;
          }, {} as Record<string, CallLog[]>);
        }
      }

      // Add verification logs to each row
      const dataWithLogs = mergedWithSourceType.map(row => {
        const logs = callLogsData[row.submission_id] || [];
        
        if (logs.length > 0) {
          // Generate verification logs for entries that have call logs
          return {
            ...row,
            verification_logs: generateVerificationLogSummary(logs, row)
          };
        } else if (row.has_submission_data) {
          // Fallback for entries with submission data but no call logs
          return {
            ...row,
            verification_logs: generateVerificationLogSummary([], row)
          };
        } else {
          // No call logs and no submission data
          return {
            ...row,
            verification_logs: "No call activity recorded"
          };
        }
      });

      setData(dataWithLogs);

      // Recompute note counts using the fully merged dataset so transfer-only rows are included
      fetchNoteCounts(dataWithLogs);

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
  }, [data, datePreset, customStartDate, customEndDate, statusFilter, leadVendorFilter, selectedStates, searchTerm, tagFilter]);

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

    if (stagesLoading) return;
    fetchData();
  }, [stagesLoading]);

  const handleRefresh = () => {
    fetchData(true);
  };

  const handleExport = () => {
    if (boardVisibleRows.length === 0) {
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
      ...boardVisibleRows.map((row) => [
        row.submission_id,
        row.date || row.submission_date || '',
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
      ].map((field) => `"${field}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `submission-portal-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);

    toast({
      title: "Export Complete",
      description: "Data exported to CSV successfully",
    });
  };

  const fetchNoteCounts = async (rows: SubmissionPortalRow[] | null | undefined) => {
    const safeRows = Array.isArray(rows) ? rows : [];
    const leadIds = safeRows.map((r) => r.id).filter(Boolean);
    if (leadIds.length === 0) {
      setNoteCounts({});
      return;
    }

    const submissionMap = new Map<string, string>();
    safeRows.forEach((r) => {
      if (r.submission_id) submissionMap.set(r.submission_id, r.id);
    });

    const counts: Record<string, number> = {};
    leadIds.forEach((id) => {
      counts[id] = 0;
    });

    const submissionIds = Array.from(submissionMap.keys());
    try {
      const { data: noteRows, error: notesErr } = await supabase
        .from('daily_deal_flow')
        .select('submission_id, notes')
        .in('submission_id', submissionIds);

      if (!notesErr && Array.isArray(noteRows)) {
        noteRows.forEach((row) => {
          const noteText = (row.notes as string | null)?.trim();
          if (!noteText) return;

          const subId = (row.submission_id || '').toString();
          const leadId = submissionMap.get(subId);
          if (leadId) {
            counts[leadId] = (counts[leadId] || 0) + 1;
          }
        });
      }
    } catch (e) {
      console.warn('Failed to fetch daily deal flow note counts', e);
    }

    setNoteCounts(counts);
  };

  const handleDropToStage = async (rowId: string, stageKey: string) => {
    const nextStatusKey = getStatusKeyForStage(stageKey);
    const nextStatusLabel = dbSubmissionStages.find((s) => s.key === nextStatusKey)?.label ?? getStatusForStage(stageKey);

    const prev = data;
    const next = prev.map((r) => (r.id === rowId ? { ...r, status: nextStatusKey } : r));
    setData(next);

    try {
      const { error: leadError } = await (supabase as any)
        .from('leads')
        .update({ status: nextStatusKey })
        .eq('id', rowId);

      if (leadError) throw leadError;

      const droppedRow = prev.find((r) => r.id === rowId);
      await syncLatestDailyDealFlowRow(droppedRow?.submission_id, { status: nextStatusKey });

      if (droppedRow?.submission_id) {
        try {
          await (supabase as any)
            .from('submission_portal')
            .update({ status: nextStatusKey })
            .eq('submission_id', droppedRow.submission_id);
        } catch {
          // submission_portal row may not exist — ignore
        }
      }

      toast({
        title: 'Status Updated',
        description: `Lead status updated to "${nextStatusLabel}"`,
      });
    } catch (e) {
      console.error('Error updating status:', e);
      setData(prev);
      toast({
        title: 'Error',
        description: 'Failed to update lead status',
        variant: 'destructive',
      });
    }
  };

  const leadsByStage = useMemo(() => {
    const grouped = new Map<string, SubmissionPortalRow[]>();
    kanbanStages.forEach((stage) => grouped.set(stage.key, []));
    filteredData.forEach((row) => {
      const stageKey = deriveStageKey(row);
      grouped.get(stageKey)?.push(row);
    });
    return grouped;
  }, [filteredData, kanbanStages]);

  useEffect(() => {
    setColumnPage((prev) => {
      const next: Record<string, number> = { ...prev };
      kanbanStages.forEach((stage) => {
        const rows = leadsByStage.get(stage.key) || [];
        const pageSize = 25;
        const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
        const current = Number(next[stage.key] ?? 1);
        next[stage.key] = Math.min(Math.max(1, current), totalPages);
      });
      return next;
    });
  }, [leadsByStage]);

  const getStageDisplayLabel = (label: string) => label.replace(/^Stage\s+\d+\s*:\s*/i, "");

  const allParentStageLabels = useMemo(
    () => parentStages.map((s) => s.label),
    [parentStages]
  );

  // Stages for whichever pipeline is selected in the edit dialog
  const editActivePipelineStages = useMemo(
    () => editPipelineStagesMap[editPipeline] ?? dbSubmissionStages,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editPipeline, dbSubmissionStages, dbTransferStages, dbCloserStages]
  );

  const editActivePipelineParents = useMemo(
    () => deriveParentStages(editActivePipelineStages),
    [editActivePipelineStages]
  );

  const editActivePipelineReasonsByParent = useMemo(() => {
    const map: Record<string, string[]> = {};
    editActivePipelineParents.forEach((s) => {
      if (s.reasons.length > 0) map[s.label] = s.reasons;
    });
    return map;
  }, [editActivePipelineParents]);

  // label → key map for the active pipeline
  const editActivePipelineKeyByLabel = useMemo(() => {
    const map = new Map<string, string>();
    editActivePipelineStages.forEach((s) => {
      const key   = (s?.key   ?? "").trim();
      const label = (s?.label ?? "").trim();
      if (key && label) map.set(label, key);
    });
    return map;
  }, [editActivePipelineStages]);

  // Available reasons for the currently selected parent in the edit form
  const editAvailableReasons = useMemo(() => {
    const parentLabel = (editStage || '').trim();
    return editActivePipelineReasonsByParent[parentLabel] || [];
  }, [editStage, editActivePipelineReasonsByParent]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Loading submission portal data...</span>
        </div>
      </div>
    );
  }

  const handleView = (row: SubmissionPortalRow) => {
    if (!row?.id) return;
    navigate(`/leads/${encodeURIComponent(row.id)}`, {
      state: { activeNav: '/submission-portal' },
    });
  };

  const handleOpenLeadAction = async (row: SubmissionPortalRow) => {
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
      state: { activeNav: '/submission-portal' },
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

  const handleOpenEdit = (row: SubmissionPortalRow) => {
    setEditRow(row);

    // Detect which pipeline owns the current status key
    const rawStatus = (row.status ?? '').trim();
    const detectedPipeline = (() => {
      if (dbTransferStages.some((s) => s.key === rawStatus || s.label === rawStatus)) {
        return "transfer_portal";
      }
      if (dbCloserStages.some((s) => s.key === rawStatus || s.label === rawStatus)) {
        return "closer_portal";
      }
      return "submission_portal";
    })();
    setEditPipeline(detectedPipeline);

    const normalizedStatus = normalizeSubmissionStatusKey(row.status);
    const statusLabel = toDispositionLabel(normalizedStatus) ?? normalizedStatus;
    const { parent, reason } = parseStageLabel(statusLabel);
    setEditStage(parent);
    setEditReason(reason || '');
    setEditNotes('');
    setEditOpen(true);
  };

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
    const parentLabel = (editStage || '').trim();
    if (!parentLabel) return;

    // Build the full status: "Parent - Reason" or just "Parent"
    const reasons = editActivePipelineReasonsByParent[parentLabel];
    const selectedReason = (editReason || '').trim();
    const nextStageLabel = reasons && reasons.length > 0 && selectedReason
      ? buildStatusLabel(parentLabel, selectedReason)
      : parentLabel;
    const nextStage = editActivePipelineKeyByLabel.get(nextStageLabel) ?? nextStageLabel;

    const previousStage = normalizeSubmissionStatusKey(editRow.status);
    const stageChanged = previousStage !== nextStage;

    try {
      setEditSaving(true);

      const { error: leadError } = await (supabase as any)
        .from('leads')
        .update({ status: nextStage })
        .eq('id', editRow.id);

      if (leadError) throw leadError;

      await syncLatestDailyDealFlowRow(editRow.submission_id, { status: nextStage, notes: editNotes });

      // Also update submission_portal if the record exists there
      if (editRow.submission_id) {
        try {
          await (supabase as any)
            .from('submission_portal')
            .update({ status: nextStage })
            .eq('submission_id', editRow.submission_id);
        } catch {
          // submission_portal row may not exist — ignore
        }
      }

      const trimmedNote = (editNotes || '').trim();
      const notesText = trimmedNote || 'No notes provided.';
      if (stageChanged || trimmedNote.length > 0) {
        try {
          const previousDispositionLabel = toDispositionLabel(editRow.status ?? null);
          const newDispositionLabel = toDispositionLabel(nextStage);
          const { error: slackError } = await supabase.functions.invoke('disposition-change-slack-alert', {
            body: {
              leadId: editRow.id,
              submissionId: editRow.submission_id ?? null,
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

      setData((prev) => prev.map((r) => (r.id === editRow.id ? { ...r, status: nextStage, notes: editNotes } : r)));
      setFilteredData((prev) => prev.map((r) => (r.id === editRow.id ? { ...r, status: nextStage, notes: editNotes } : r)));

      toast({
        title: 'Transfer Updated',
        description: 'Stage and notes updated successfully.',
      });

      setEditOpen(false);
    } catch (e) {
      console.error('Error updating stage/notes:', e);
      toast({
        title: 'Error',
        description: 'Failed to update stage/notes',
        variant: 'destructive',
      });
    } finally {
      setEditSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                  Total Cases
                  <ColumnInfoPopover info={submissionStatInfo.totalCases} />
                </CardTitle>
              </CardHeader>
              <CardContent className="flex items-center justify-between">
                <div className="text-3xl font-semibold">{submissionStats.totalCases}</div>
                <FileText className="h-10 w-10 text-primary" />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                  Intake Queue
                  <ColumnInfoPopover info={submissionStatInfo.intakeQueue} />
                </CardTitle>
              </CardHeader>
              <CardContent className="flex items-center justify-between">
                <div className="text-3xl font-semibold">{submissionStats.intakeQueue}</div>
                <ClipboardList className="h-10 w-10 text-primary" />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                  Qualified & Review
                  <ColumnInfoPopover info={submissionStatInfo.qualifiedAndReview} />
                </CardTitle>
              </CardHeader>
              <CardContent className="flex items-center justify-between">
                <div className="text-3xl font-semibold">{submissionStats.qualifiedAndReview}</div>
                <Scale className="h-10 w-10 text-primary" />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                  Payment Queue
                  <ColumnInfoPopover info={submissionStatInfo.paymentQueue} />
                </CardTitle>
              </CardHeader>
              <CardContent className="flex items-center justify-between">
                <div className="text-3xl font-semibold">{submissionStats.paymentQueue}</div>
                <Wallet className="h-10 w-10 text-primary" />
              </CardContent>
            </Card>
          </div>

          {/* ── Toolbar ── */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1 max-w-sm">
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by name, phone, vendor…"
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
              {(datePreset !== "all" || statusFilter !== "__ALL__" || selectedStates.length > 0 || leadVendorFilter !== "__ALL__") && (
                <span className="ml-2 flex h-2 w-2 rounded-full bg-primary" />
              )}
            </Button>

            <div className="flex-1" />

            <Badge variant="secondary" className="px-3 py-1 tabular-nums shrink-0">
              {boardVisibleRows.length} records
            </Badge>
            <Button variant="outline" onClick={handleExport}>
              Export CSV
            </Button>
            <Button onClick={handleRefresh} disabled={refreshing}>
              <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
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
                    {(datePreset !== "all" || statusFilter !== "__ALL__" || selectedStates.length > 0 || leadVendorFilter !== "__ALL__" || tagFilter !== ALL_LEAD_TAGS_VALUE) && (
                      <button
                        type="button"
                        onClick={() => {
                          setDatePreset("all");
                          setCustomStartDate("");
                          setCustomEndDate("");
                          setStatusFilter("__ALL__");
                          setSelectedStates([]);
                          setLeadVendorFilter("__ALL__");
                          setTagFilter(ALL_LEAD_TAGS_VALUE);
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
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Date Range</label>
                    <PresetDateRangeFilter
                      preset={datePreset}
                      onPresetChange={setDatePreset}
                      customStartDate={customStartDate}
                      customEndDate={customEndDate}
                      onCustomStartDateChange={setCustomStartDate}
                      onCustomEndDateChange={setCustomEndDate}
                      selectClassName="w-full"
                      containerClassName="relative"
                      customFieldsClassName="absolute left-0 top-full z-20 mt-2 grid w-56 grid-cols-1 gap-2 rounded-md border bg-background p-2 shadow-md"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Lead Vendor</label>
                    <Select value={leadVendorFilter} onValueChange={setLeadVendorFilter}>
                      <SelectTrigger>
                        <SelectValue placeholder="All Vendors" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="__ALL__">All Vendors</SelectItem>
                          {leadVendorOptions.map((vendor) => (
                            <SelectItem key={vendor} value={vendor}>{vendor}</SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tag</label>
                    <Select value={tagFilter} onValueChange={setTagFilter}>
                      <SelectTrigger>
                        <SelectValue placeholder="All Tags" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value={ALL_LEAD_TAGS_VALUE}>All Tags</SelectItem>
                          {tagOptions.map((tag) => (
                            <SelectItem key={tag} value={tag}>{tag}</SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</label>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger>
                        <SelectValue placeholder="All Statuses" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="__ALL__">All Statuses</SelectItem>
                          {dbSubmissionStages.map((s) => (
                            <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">State</label>
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

          <div className="mt-4 min-h-0 flex-1 overflow-auto" onDragOver={handleKanbanDragOver}>
            <div className="p-4">
              <div
                className="grid min-h-0 min-w-full grid-flow-col gap-3 pr-2"
                style={{ gridAutoColumns: "minmax(18.5rem, calc((100% - 2.25rem) / 4))" }}
              >
                {kanbanStages.map((stage) => {
                  const rows = leadsByStage.get(stage.key) || [];
                  const pageSize = 25;
                  const current = Number(columnPage[stage.key] ?? 1);
                  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
                  const startIndex = (current - 1) * pageSize;
                  const endIndex = startIndex + pageSize;
                  const pageRows = rows.slice(startIndex, endIndex);

                  return (
                    <Card
                      key={stage.key}
                      className={
                        "flex min-h-[560px] flex-col bg-muted/20 " +
                        stageTheme[stage.key].column +
                        (dragOverStage === stage.key ? " ring-2 ring-primary/30" : "")
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
                      <CardHeader
                        className={
                          "flex flex-row items-center justify-between border-b px-3 py-2 " +
                          stageTheme[stage.key].header
                        }
                      >
                        <div className="flex items-center gap-1.5">
                          <CardTitle className="text-sm font-semibold">{getStageDisplayLabel(stage.label)}</CardTitle>
                          <ColumnInfoPopover info={getColumnInfo(getStageDisplayLabel(stage.label))} />
                        </div>
                        <Badge variant="secondary">{rows.length}</Badge>
                      </CardHeader>
                      <CardContent className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
                        {pageRows.length === 0 ? (
                          <div className="flex flex-1 h-full items-center justify-center rounded-md border border-dashed border-muted-foreground/30 px-3 py-6 text-center text-xs text-muted-foreground">
                            No leads
                          </div>
                        ) : (
                          pageRows.map((row) => {
                            const statusText =
                              getStageDisplayLabel(toDispositionLabel(row.status) || row.status || "No status");

                            return (
                              <Card
                                key={row.id}
                                draggable
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
                                className={"w-full cursor-pointer transition hover:shadow-md " + (draggingId === row.id ? "opacity-70" : "")}
                              >
                                <CardContent className="space-y-2 p-2.5">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0 flex-1 space-y-1.5">
                                      <div className="text-[0.95rem] font-semibold leading-snug break-words">
                                        {row.insured_name || '—'}
                                      </div>
                                      <div className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
                                        <span className="truncate whitespace-nowrap tabular-nums">
                                          {row.client_phone_number || '—'}
                                        </span>
                                        <div className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border/70 bg-muted/60 px-2 py-0.5 text-[10px] font-medium text-foreground/80">
                                          <StickyNote className="h-3.5 w-3.5" />
                                          <span>{noteCounts[row.id] ?? 0}</span>
                                        </div>
                                      </div>
                                    </div>
                                    <div className="flex shrink-0 flex-col items-stretch gap-1">
                                      <div className="flex items-center justify-end gap-1">
                                        <Button
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
                                          variant="outline"
                                          size="icon"
                                          className="h-7 w-7"
                                          onClick={(e) => { e.stopPropagation(); handleOpenEdit(row); }}
                                        >
                                          <Pencil className="h-3.5 w-3.5" />
                                        </Button>
                                      </div>
                                      <Button
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
                                      {row.lead_vendor || '—'}
                                    </Badge>
                                    {row.tag ? (
                                      <Badge className={`max-w-full w-fit truncate rounded-full border px-2.5 py-1 text-[10.5px] font-medium ${getLeadTagToneClass(row.tag)}`}>
                                        {row.tag}
                                      </Badge>
                                    ) : null}
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
                              [stage.key]: Math.max(1, (Number(prev[stage.key] ?? 1) - 1)),
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
                              [stage.key]: Math.min(totalPages, (Number(prev[stage.key] ?? 1) + 1)),
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
            </div>
          </div>
        </div>
      </div>

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
                  setEditReason('');
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
              <Select
                value={editStage}
                onValueChange={(value) => {
                  setEditStage(value);
                  setEditReason('');
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select stage..." />
                </SelectTrigger>
                <SelectContent>
                  {editActivePipelineParents.map((stage) => (
                    <SelectItem key={stage.key} value={stage.label}>
                      {stage.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {editAvailableReasons.length > 0 && (
              <div className="space-y-2">
                <Label>Reason</Label>
                <Select value={editReason} onValueChange={(v) => setEditReason(v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select reason..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {editAvailableReasons.map((reason) => (
                        <SelectItem key={reason} value={reason}>
                          {reason}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            )}

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

export default SubmissionPortalPage;
