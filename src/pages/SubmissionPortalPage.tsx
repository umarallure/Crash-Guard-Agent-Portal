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
import { usePipelineStages } from "@/hooks/usePipelineStages";
import {
  parseStageLabel,
  deriveParentStages,
  buildStatusLabel,
} from "@/lib/stageUtils";
import { PresetDateRangeFilter } from "@/components/PresetDateRangeFilter";
import { isDateInRange, type DateRangePreset } from "@/lib/dateRangeFilter";

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

  // --- Dynamic pipeline stages from DB ---
  const { stages: dbSubmissionStages, loading: stagesLoading } = usePipelineStages("submission_portal");
  const { stages: dbTransferStages } = usePipelineStages("transfer_portal");

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
  const [datePreset, setDatePreset] = useState<DateRangePreset>("all");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [statusFilter, setStatusFilter] = useState("__ALL__");
  const [leadVendorFilter, setLeadVendorFilter] = useState("__ALL__");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [showDuplicates, setShowDuplicates] = useState(true);
  const [dataCompletenessFilter, setDataCompletenessFilter] = useState("__ALL__");
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);
  const [columnPage, setColumnPage] = useState<Record<string, number>>({});
  const [noteCounts, setNoteCounts] = useState<Record<string, number>>({});

  const [editOpen, setEditOpen] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editRow, setEditRow] = useState<SubmissionPortalRow | null>(null);
  const [editStage, setEditStage] = useState("");
  const [editReason, setEditReason] = useState("");
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

  const leadVendorOptions = useMemo(() => {
    const set = new Set<string>();
    (data || []).forEach((r) => {
      const v = (r.lead_vendor || '').trim();
      if (v) set.add(v);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [data]);

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
  }, [data, datePreset, customStartDate, customEndDate, statusFilter, leadVendorFilter, showDuplicates, searchTerm, dataCompletenessFilter]);

  useEffect(() => {
    if (stagesLoading) return;
    fetchData();
  }, [stagesLoading]);

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

  const editStageMatches = useMemo(() => {
    const query = (editStage || '').trim().toLowerCase();
    if (!query) return allParentStageLabels;
    return allParentStageLabels.filter((label) => label.toLowerCase().includes(query));
  }, [allParentStageLabels, editStage]);

  // Available reasons for the currently selected parent in the edit form
  const editAvailableReasons = useMemo(() => {
    const parentLabel = (editStage || '').trim();
    return reasonsByParent[parentLabel] || [];
  }, [editStage, reasonsByParent]);

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
    if (!row?.submission_id) return;
    navigate(`/leads/${encodeURIComponent(row.submission_id)}`, {
      state: { activeNav: '/submission-portal' },
    });
  };

  const handleOpenEdit = (row: SubmissionPortalRow) => {
    setEditRow(row);
    const normalizedStatus = normalizeSubmissionStatusKey(row.status);
    const statusLabel = toDispositionLabel(normalizedStatus) ?? normalizedStatus;
    const { parent, reason } = parseStageLabel(statusLabel);
    setEditStage(parent);
    setEditReason(reason || '');
    setEditNotes('');
    setEditStageOpen(false);
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
    const reasons = reasonsByParent[parentLabel];
    const selectedReason = (editReason || '').trim();
    const nextStageLabel = reasons && reasons.length > 0 && selectedReason
      ? buildStatusLabel(parentLabel, selectedReason)
      : parentLabel;
    const nextStage = submissionStageKeyByLabel.get(nextStageLabel) ?? nextStageLabel;

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
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-1 flex-wrap items-center gap-3">
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by name, phone, vendor..."
                className="max-w-md"
              />

              <Select value={leadVendorFilter} onValueChange={(v) => setLeadVendorFilter(v)}>
                <SelectTrigger className="w-56">
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

              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v)}>
                <SelectTrigger className="w-64">
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="__ALL__">All Statuses</SelectItem>
                    {dbSubmissionStages.map((s) => (
                      <SelectItem key={s.key} value={s.key}>
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

              <div className="w-full md:w-56 md:shrink-0">
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

          <div className="mt-4 min-h-0 flex-1 overflow-auto" onDragOver={handleKanbanDragOver}>
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

                                  {(() => {
                                    const { reason } = parseStageLabel((row.status || '').trim());
                                    return reason ? (
                                      <div className="mt-1.5">
                                        <Badge variant="outline" className="text-[11px] font-normal">{reason}</Badge>
                                      </div>
                                    ) : null;
                                  })()}

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
                    setEditReason('');
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
                            setEditReason('');
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
    </div>
  );
};

export default SubmissionPortalPage;
