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
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, RefreshCw, Pencil, StickyNote } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAttorneys } from "@/hooks/useAttorneys";

const kanbanStages = [
  { key: "stage_9", label: "Pending Signature" },
  { key: "stage_10", label: "Pending Police Report" },
  { key: "stage_11", label: "Signed & Police Report Pending" },
  { key: "stage_1", label: "Information Verification" },
  { key: "stage_2", label: "Attorney Submission" },
  { key: "stage_3", label: "Insurance Verification" },
  { key: "stage_4", label: "Retainer Process (Email)" },
  { key: "stage_5", label: "Retainer Process (Postal Mail)" },
  { key: "stage_6", label: "Retainer Signed Pending" },
  { key: "stage_7", label: "Retainer Signed" },
  { key: "stage_8", label: "Attorney Decision" },
] as const;

type StageKey = (typeof kanbanStages)[number]["key"];

const stageSlugMap: Record<string, StageKey> = {
  stage_1_information_verification: "stage_1",
  stage_2_attorney_submission: "stage_2",
  stage_3_insurance_verification: "stage_3",
  stage_4_retainer_process_email: "stage_4",
  stage_5_retainer_process_postal_mail: "stage_5",
  stage_6_retainer_signed_pending: "stage_6",
  stage_7_retainer_signed: "stage_7",
  stage_8_attorney_decision: "stage_8",
  stage_9_pending_signature: "stage_9",
  stage_10_pending_police_report: "stage_10",
  stage_11_signed_police_report_pending: "stage_11",
  information_verification: "stage_1",
  attorney_submission: "stage_2",
  insurance_verification: "stage_3",
  retainer_process_email: "stage_4",
  retainer_process_postal_mail: "stage_5",
  retainer_signed_pending: "stage_6",
  retainer_signed: "stage_7",
  attorney_decision: "stage_8",
  pending_signature: "stage_9",
  pending_police_report: "stage_10",
  signed_police_report_pending: "stage_11",
};

const deriveStageKey = (row: SubmissionPortalRow): StageKey => {
  const status = (row.status || "").trim();
  if (!status || status === "Pending Approval") return "stage_1";

  const slug = status
    .toLowerCase()
    .replace(/\(email\)/g, "email")
    .replace(/\(postal mail\)/g, "postal mail")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/_{2,}/g, "_")
    .replace(/^_|_$/g, "");

  return stageSlugMap[slug] ?? "stage_1";
};

const getStatusForStage = (stageKey: StageKey) => {
  if (stageKey === "stage_1") return "Pending Approval";
  return kanbanStages.find((s) => s.key === stageKey)?.label ?? "Pending Approval";
};

const stageTheme: Record<StageKey, { column: string; header: string }> = {
  stage_1: {
    column: "border-t-4 border-sky-500/50 bg-sky-50/50 dark:bg-sky-950/15",
    header: "bg-sky-50/60 dark:bg-sky-950/10",
  },
  stage_2: {
    column: "border-t-4 border-violet-500/50 bg-violet-50/50 dark:bg-violet-950/15",
    header: "bg-violet-50/60 dark:bg-violet-950/10",
  },
  stage_3: {
    column: "border-t-4 border-amber-500/50 bg-amber-50/50 dark:bg-amber-950/15",
    header: "bg-amber-50/60 dark:bg-amber-950/10",
  },
  stage_4: {
    column: "border-t-4 border-cyan-500/50 bg-cyan-50/50 dark:bg-cyan-950/15",
    header: "bg-cyan-50/60 dark:bg-cyan-950/10",
  },
  stage_5: {
    column: "border-t-4 border-orange-500/50 bg-orange-50/50 dark:bg-orange-950/15",
    header: "bg-orange-50/60 dark:bg-orange-950/10",
  },
  stage_6: {
    column: "border-t-4 border-yellow-500/50 bg-yellow-50/50 dark:bg-yellow-950/15",
    header: "bg-yellow-50/60 dark:bg-yellow-950/10",
  },
  stage_7: {
    column: "border-t-4 border-emerald-500/50 bg-emerald-50/50 dark:bg-emerald-950/15",
    header: "bg-emerald-50/60 dark:bg-emerald-950/10",
  },
  stage_8: {
    column: "border-t-4 border-rose-500/50 bg-rose-50/50 dark:bg-rose-950/15",
    header: "bg-rose-50/60 dark:bg-rose-950/10",
  },
  stage_9: {
    column: "border-t-4 border-slate-500/50 bg-slate-50/50 dark:bg-slate-950/15",
    header: "bg-slate-50/60 dark:bg-slate-950/10",
  },
  stage_10: {
    column: "border-t-4 border-lime-500/50 bg-lime-50/50 dark:bg-lime-950/15",
    header: "bg-lime-50/60 dark:bg-lime-950/10",
  },
  stage_11: {
    column: "border-t-4 border-indigo-500/50 bg-indigo-50/50 dark:bg-indigo-950/15",
    header: "bg-indigo-50/60 dark:bg-indigo-950/10",
  },
};

const buildAllowedStatuses = () => {
  const pendingApprovalStatus = "Pending Approval";
  const withPrefix = kanbanStages.map((s) => s.label);
  const withoutPrefix = kanbanStages.map((s) => s.label.replace(/^Stage\s+\d+\s*:\s*/i, ""));
  return Array.from(new Set([pendingApprovalStatus, ...withPrefix, ...withoutPrefix]));
};

export interface SubmissionPortalRow {
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
}

interface CallLog {
  agent_type: string;
  agent_name: string;
  event_type: string;
  created_at: string;
}

const SubmissionPortalPage = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<SubmissionPortalRow[]>([]);
  const [filteredData, setFilteredData] = useState<SubmissionPortalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dateFilter, setDateFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState("__ALL__");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [showDuplicates, setShowDuplicates] = useState(true);
  const [dataCompletenessFilter, setDataCompletenessFilter] = useState("__ALL__");
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<StageKey | null>(null);
  const [columnPage, setColumnPage] = useState<Record<string, number>>({});
  const [noteCounts, setNoteCounts] = useState<Record<string, number>>({});

  const [editOpen, setEditOpen] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editRow, setEditRow] = useState<SubmissionPortalRow | null>(null);
  const [editStage, setEditStage] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editStageOpen, setEditStageOpen] = useState(false);

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

  // Remove duplicates based on insured_name, client_phone_number, and lead_vendor
  const removeDuplicates = (records: SubmissionPortalRow[]): SubmissionPortalRow[] => {
    const seen = new Map<string, SubmissionPortalRow>();
    
    records.forEach(record => {
      const key = `${record.insured_name || ''}|${record.client_phone_number || ''}|${record.lead_vendor || ''}`;
      
      // Keep the most recent record (first in our sorted array)
      if (!seen.has(key)) {
        seen.set(key, record);
      }
    });
    
    return Array.from(seen.values());
  };

  // Apply filters and duplicate removal
  const applyFilters = (records: SubmissionPortalRow[]): SubmissionPortalRow[] => {
    let filtered = records;

    // Apply date filter
    if (dateFilter) {
      filtered = filtered.filter(record => record.date === dateFilter);
    }

    // Apply status filter
    if (statusFilter !== "__ALL__") {
      filtered = filtered.filter(record => record.status === statusFilter);
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

    // Remove duplicates if enabled
    if (!showDuplicates) {
      filtered = removeDuplicates(filtered);
    }

    // Apply data completeness filter
    if (dataCompletenessFilter === "active_only") {
      filtered = filtered.filter(record => 
        record.has_submission_data && 
        record.status !== "Submitted"
      );
    } else if (dataCompletenessFilter === "missing_logs_only") {
      filtered = filtered.filter(record => 
        !record.has_submission_data
      );
    }

    return filtered;
  };

  // Function to generate verification log summary showing complete call workflow
  const generateVerificationLogSummary = (logs: CallLog[], submission?: any): string => {
    if (!logs || logs.length === 0) {
      // Fallback to data from submission/call_results table if available
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

      const allowedStatuses = buildAllowedStatuses();

      let transfersQuery = supabase
        .from('daily_deal_flow')
        .select('*')
        .in('status', allowedStatuses)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false });

      if (dateFilter) {
        transfersQuery = transfersQuery.eq('date', dateFilter);
      }

      const { data: transferData, error: transferError } = await transfersQuery;

      if (transferError) {
        console.error("Error fetching submission portal base transfers:", transferError);
        toast({
          title: "Error",
          description: "Failed to fetch transfer portal data",
          variant: "destructive",
        });
        return;
      }

      // Get submission portal data for entries that exist
      let submissionQuery = (supabase as any)
        .from('submission_portal')
        .select('*');

      submissionQuery = submissionQuery.in('status', allowedStatuses);

      // Apply date filter if set
      if (dateFilter) {
        submissionQuery = submissionQuery.eq('date', dateFilter);
      }

      // Note: We don't apply status filter here to ensure all submission data is available
      // for merging with transfer data, regardless of current filter selection

      const { data: submissionDataRaw, error: submissionError } = await submissionQuery;

      if (submissionError) {
        console.warn("Error fetching submission portal data:", submissionError);
        // Continue with just transfer data
      }

      // Create a map of submission data by submission_id for quick lookup
      const submissionMap = new Map();
      const submissionData = submissionDataRaw ?? [];
      setData(submissionData);

      if (submissionData) {
        submissionData.forEach((sub: any) => {
          submissionMap.set(sub.submission_id, sub);
        });
      }

      // Merge transfer data with submission data
      const mergedData = ((transferData ?? []) as unknown as SubmissionPortalRow[])?.map(transfer => {
        const submission = submissionMap.get(transfer.submission_id);
        
        if (submission) {
          // Merge submission data with transfer data
          return {
            ...transfer,
            ...submission,
            // Keep transfer data for fields that might be missing in submission
            insured_name: submission.insured_name || transfer.insured_name,
            client_phone_number: submission.client_phone_number || transfer.client_phone_number,
            lead_vendor: submission.lead_vendor || transfer.lead_vendor,
            buffer_agent: submission.buffer_agent || transfer.buffer_agent,
            agent: submission.agent || transfer.agent,
            licensed_agent_account: submission.licensed_agent_account || transfer.licensed_agent_account,
            carrier: submission.carrier || transfer.carrier,
            product_type: submission.product_type || transfer.product_type,
            monthly_premium: submission.monthly_premium || transfer.monthly_premium,
            face_amount: submission.face_amount || transfer.face_amount,
            // Mark as having submission data
            has_submission_data: true
          };
        } else {
          // No submission data - show transfer data with missing label
          const isCallback = Boolean((transfer as any).from_callback) || Boolean((transfer as any).is_callback);
          return {
            ...transfer,
            // Mark as missing submission data
            has_submission_data: false,
            verification_logs: "Update log missing - No submission data found",
            source_type: isCallback ? 'callback' : 'zapier',
          };
        }
      }) || [];

      const mergedWithSourceType = mergedData.map((row) => {
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
  }, [data, dateFilter, statusFilter, showDuplicates, searchTerm, dataCompletenessFilter]);

  useEffect(() => {
    fetchData();
  }, [dateFilter]);

  const handleRefresh = () => {
    fetchData(true);
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

    // lead_notes by lead_id
    try {
      const { data: leadNoteRows, error: leadNoteErr } = await (supabase as any)
        .from('lead_notes')
        .select('lead_id')
        .in('lead_id', leadIds);

      if (!leadNoteErr && Array.isArray(leadNoteRows)) {
        leadNoteRows.forEach((row: { lead_id: string }) => {
          if (row.lead_id) {
            counts[row.lead_id] = (counts[row.lead_id] || 0) + 1;
          }
        });
      }
    } catch (e) {
      console.warn('Failed to fetch lead note counts', e);
    }

    // lead_notes by submission_id
    const submissionIds = Array.from(submissionMap.keys());
    if (submissionIds.length > 0) {
      try {
        const { data: subNoteRows, error: subNoteErr } = await (supabase as any)
          .from('lead_notes')
          .select('submission_id')
          .in('submission_id', submissionIds);

        if (!subNoteErr && Array.isArray(subNoteRows)) {
          subNoteRows.forEach((row: { submission_id: string }) => {
            const leadId = submissionMap.get(row.submission_id);
            if (leadId) {
              counts[leadId] = (counts[leadId] || 0) + 1;
            }
          });
        }
      } catch (e) {
        console.warn('Failed to fetch submission note counts', e);
      }
    }

    // Legacy daily_deal_flow notes
    safeRows.forEach((r) => {
      if ((r.notes || '').trim()) {
        counts[r.id] = (counts[r.id] || 0) + 1;
      }
    });

    // Legacy leads.additional_notes via submission_id
    if (submissionIds.length > 0) {
      try {
        const { data: leadRows, error: leadsErr } = await supabase
          .from('leads')
          .select('submission_id, additional_notes')
          .in('submission_id', submissionIds);

        if (!leadsErr && Array.isArray(leadRows)) {
          leadRows.forEach((row) => {
            const noteText = (row.additional_notes as string | null)?.trim();
            if (noteText) {
              const leadId = submissionMap.get(row.submission_id as string);
              if (leadId) {
                counts[leadId] = (counts[leadId] || 0) + 1;
              }
            }
          });
        }
      } catch (e) {
        console.warn('Failed to fetch legacy leads notes', e);
      }
    }

    setNoteCounts(counts);
  };

  const handleDropToStage = async (rowId: string, stageKey: StageKey) => {
    const nextStatus = getStatusForStage(stageKey);

    const prev = data;
    const next = prev.map((r) => (r.id === rowId ? { ...r, status: nextStatus } : r));
    setData(next);

    try {
      const { error: transferError } = await supabase
        .from('daily_deal_flow')
        .update({ status: nextStatus })
        .eq('id', rowId);

      if (transferError) throw transferError;

      const { error: submissionError } = await (supabase as any)
        .from('submission_portal')
        .update({ status: nextStatus })
        .eq('id', rowId);

      if (submissionError) {
        console.warn('Failed updating submission_portal status:', submissionError);
      }

      toast({
        title: 'Status Updated',
        description: `Lead status updated to "${nextStatus}"`,
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
    const grouped = new Map<StageKey, SubmissionPortalRow[]>();
    kanbanStages.forEach((stage) => grouped.set(stage.key, []));
    filteredData.forEach((row) => {
      const stageKey = deriveStageKey(row);
      grouped.get(stageKey)?.push(row);
    });
    return grouped;
  }, [filteredData]);

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

  const allStageOptions = useMemo(() => buildAllowedStatuses(), []);

  const editStageMatches = useMemo(() => {
    const query = (editStage || '').trim().toLowerCase();
    if (!query) return allStageOptions;
    return allStageOptions.filter((label) => label.toLowerCase().includes(query));
  }, [allStageOptions, editStage]);

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
    navigate(`/daily-deal-flow/lead/${encodeURIComponent(row.id)}`, {
      state: { activeNav: '/submission-portal' },
    });
  };

  const handleOpenEdit = (row: SubmissionPortalRow) => {
    setEditRow(row);
    setEditStage((row.status || '').trim());
    setEditNotes((row.notes || '').trim());
    setEditStageOpen(false);
    setEditOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editRow) return;
    const nextStage = (editStage || '').trim();
    if (!nextStage) return;

    const previousStage = (editRow.status || '').trim();
    const stageChanged = previousStage !== nextStage;

    try {
      setEditSaving(true);

      const { error: flowError } = await supabase
        .from('daily_deal_flow')
        .update({ status: nextStage, notes: editNotes })
        .eq('id', editRow.id);

      if (flowError) throw flowError;

      const notesText = (editNotes || '').trim() || 'No notes provided.';
      if (stageChanged) {
        try {
          const { error: slackError } = await supabase.functions.invoke('disposition-change-slack-alert', {
            body: {
              leadId: editRow.id,
              submissionId: editRow.submission_id ?? null,
              leadVendor: editRow.lead_vendor ?? '',
              insuredName: editRow.insured_name ?? null,
              clientPhoneNumber: editRow.client_phone_number ?? null,
              previousDisposition: editRow.status ?? null,
              newDisposition: nextStage,
              notes: notesText,
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
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-1 flex-wrap items-center gap-3">
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by name, phone, vendor..."
                className="max-w-md"
              />

              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v)}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="__ALL__">All Statuses</SelectItem>
                    <SelectItem value="Pending Approval">Pending Approval</SelectItem>
                    {kanbanStages.map((s) => (
                      <SelectItem key={s.key} value={s.label}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>

              <Select value={dataCompletenessFilter} onValueChange={(v) => setDataCompletenessFilter(v)}>
                <SelectTrigger className="w-56">
                  <SelectValue placeholder="All Records" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="__ALL__">All Records</SelectItem>
                    <SelectItem value="active_only">Active Only (Hide Missing Logs & Completed)</SelectItem>
                    <SelectItem value="missing_logs_only">Missing Update Log Only</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>

              <Input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} className="w-56" />

              <Select value={showDuplicates ? "true" : "false"} onValueChange={(v) => setShowDuplicates(v === "true")}>
                <SelectTrigger className="w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="true">Show All Records</SelectItem>
                    <SelectItem value="false">Remove Duplicates</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-3">
              <Badge variant="secondary" className="px-3 py-1">
                {filteredData.length} records
              </Badge>
              <Button onClick={handleRefresh} disabled={refreshing}>
                <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </div>

          <div className="mt-4 min-h-0 flex-1 overflow-auto">
            <div className="p-4">
              <div
                className="flex min-h-0 gap-3 pr-2"
                style={{ minWidth: `${kanbanStages.length * 18}rem` }}
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
                        "flex min-h-[560px] w-[26rem] flex-col bg-muted/20 " +
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
                        <CardTitle className="text-sm font-semibold">{getStageDisplayLabel(stage.label)}</CardTitle>
                        <Badge variant="secondary">{rows.length}</Badge>
                      </CardHeader>
                      <CardContent className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
                        {pageRows.length === 0 ? (
                          <div className="flex flex-1 h-full items-center justify-center rounded-md border border-dashed border-muted-foreground/30 px-3 py-6 text-center text-xs text-muted-foreground">
                            No leads
                          </div>
                        ) : (
                          pageRows.map((row) => {
                            const closer = row.licensed_agent_account || row.agent || row.buffer_agent || "-";
                            const attorney = row.assigned_attorney_id ? (attorneyById[row.assigned_attorney_id] || "-") : "-";

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
                                className={
                                  "w-full transition cursor-pointer " +
                                  (draggingId === row.id ? "opacity-70" : "")
                                }
                              >
                                <CardContent className="p-2">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                      <div className="truncate text-sm font-semibold">{row.insured_name || '—'}</div>
                                      <div className="mt-0.5 text-xs text-muted-foreground">
                                        <div className="flex items-center gap-2">
                                          <span>{row.client_phone_number || '—'}</span>
                                          <div className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px]">
                                            <StickyNote className="h-3.5 w-3.5" />
                                            <span>{noteCounts[row.id] ?? 0}</span>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                    <div className="shrink-0">
                                      <Button
                                        variant="outline"
                                        size="icon"
                                        className="h-7 w-7"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleOpenEdit(row);
                                        }}
                                      >
                                        <Pencil className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  </div>

                                  <div className="mt-2 flex items-center justify-between gap-2">
                                    <Badge variant="secondary" className="text-xs">{row.lead_vendor || '—'}</Badge>
                                    <div className="text-xs text-muted-foreground">{row.date || ''}</div>
                                  </div>

                                  <div className="mt-2 grid grid-cols-1 gap-1 text-xs text-muted-foreground">
                                    <div>
                                      <span className="font-medium">Closer:</span> {closer}
                                    </div>
                                    <div>
                                      <span className="font-medium">Attorney:</span> {attorney}
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
            <div className="space-y-2">
              <Label>Stage</Label>
              <div className="relative">
                <Input
                  value={editStage}
                  placeholder="Type stage..."
                  onFocus={() => setEditStageOpen(true)}
                  onChange={(e) => {
                    setEditStage(e.target.value);
                    setEditStageOpen(true);
                  }}
                  onBlur={() => {
                    window.setTimeout(() => setEditStageOpen(false), 150);
                  }}
                />

                {editStageOpen && (
                  <div className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
                    {editStageMatches.length === 0 ? (
                      <div className="px-2 py-1.5 text-sm text-muted-foreground">No matching found.</div>
                    ) : (
                      editStageMatches.map((label) => (
                        <button
                          key={label}
                          type="button"
                          className="w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            setEditStage(label);
                            setEditStageOpen(false);
                          }}
                        >
                          {label}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
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
  );
};

export default SubmissionPortalPage;