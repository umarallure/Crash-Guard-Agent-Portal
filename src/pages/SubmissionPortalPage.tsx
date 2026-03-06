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
import { usePipelineStages, type PipelineStage } from "@/hooks/usePipelineStages";
import {
  parseStageLabel,
  deriveParentStages,
  buildStatusLabel,
  deriveParentKey,
  type ParentStage,
} from "@/lib/stageUtils";

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

  // --- Dynamic pipeline stages from DB ---
  const { stages: dbSubmissionStages, loading: stagesLoading } = usePipelineStages("submission_portal");
  const { stages: dbTransferStages } = usePipelineStages("transfer_portal");

  // --- Derive parent stages (kanban columns) from flat DB stages ---
  const parentStages = useMemo(() => deriveParentStages(dbSubmissionStages), [dbSubmissionStages]);

  const kanbanStages = useMemo(() => {
    return parentStages.map((s) => ({ key: s.key, label: s.label }));
  }, [parentStages]);

  const stageTheme = useMemo(() => {
    const theme: Record<string, { column: string; header: string }> = {};
    parentStages.forEach((s) => {
      theme[s.key] = { column: s.columnClass, header: s.headerClass };
    });
    return theme;
  }, [parentStages]);

  // Map of parent label → reasons for edit form
  const reasonsByParent = useMemo(() => {
    const map: Record<string, string[]> = {};
    parentStages.forEach((s) => {
      if (s.reasons.length > 0) map[s.label] = s.reasons;
    });
    return map;
  }, [parentStages]);

  const deriveStageKey = (row: SubmissionPortalRow): string => {
    const status = (row.status || '').trim();
    if (!status) return parentStages[0]?.key ?? '';
    return deriveParentKey(status, dbSubmissionStages, parentStages);
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
    const parent = parentStages.find((s) => s.key === stageKey);
    if (!parent) return parentStages[0]?.label ?? '';
    // If the parent has reasons, default to the first reason sub-stage
    if (parent.reasons.length > 0) {
      return buildStatusLabel(parent.label, parent.reasons[0]);
    }
    return parent.label;
  };

  const getStatusKeyForStage = (columnStageKey: string) => {
    const exact = dbSubmissionStages.find((s) => s.key === columnStageKey);
    if (exact?.key) return exact.key;
    const matches = (dbSubmissionStages ?? []).filter((s) => {
      const { parent } = parseStageLabel((s?.label ?? '').trim());
      if (!parent) return false;
      const parentStage = parentStages.find((p) => p.label === parent);
      return parentStage?.key === columnStageKey;
    });

    if (matches.length > 0) {
      const sorted = [...matches].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
      return sorted[0]?.key ?? columnStageKey;
    }

    return columnStageKey;
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
  const [dateFilter, setDateFilter] = useState<string>("");
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
    if (dateFilter) {
      filtered = filtered.filter(record => record.date === dateFilter);
    }

    // Apply status filter
    if (statusFilter !== "__ALL__") {
      const selectedStageLabel = dbSubmissionStages.find((s) => s.key === statusFilter)?.label;
      const selectedParentLabel = parentStages.find((s) => s.key === statusFilter)?.label;
      filtered = filtered.filter((record) => {
        const current = (record.status || '').trim();
        if (!current) return false;
        if (current === statusFilter) return true;
        if (selectedStageLabel && current === selectedStageLabel) return true;
        if (selectedParentLabel && current === selectedParentLabel) return true;
        return false;
      });
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

      const allowedStatuses = buildAllowedStatuses();
      const allowedStatusSet = new Set(allowedStatuses.map((s) => (s || '').toString().trim()).filter(Boolean));

      let transfersQuery = supabase
        .from('daily_deal_flow')
        .select('*')
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

      const normalizedTransferData = (Array.isArray(transferData) ? transferData : []).filter((row) => {
        const status = (row as { status?: string | null }).status;
        const normalized = (status || "").toString().trim();
        if (!normalized) return true;
        // Exclude Transfer Portal pipeline leads from Submission Portal view
        return !transferStatusSet.has(normalized);
      });

      // Get submission portal data for entries that exist
      let submissionQuery = (supabase as any)
        .from('submission_portal')
        .select('*');

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

      const normalizedSubmissionData = Array.isArray(submissionDataRaw) ? submissionDataRaw : [];

      // Create a map of submission data by submission_id for quick lookup
      const submissionMap = new Map<string, any>();
      normalizedSubmissionData.forEach((row: any) => {
        if (row.submission_id) {
          submissionMap.set(row.submission_id, row);
        }
      });

      // Merge transfer data with submission data
      const mergedData = normalizedTransferData.map((transfer: any) => {
        const submission = submissionMap.get(transfer.submission_id);

        if (submission) {
          return {
            ...transfer,
            ...submission,
            // Prefer transfer's current status/notes (source of truth for kanban)
            status: transfer.status,
            notes: transfer.notes,
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
            has_submission_data: true,
          };
        }

        // No submission data - show transfer data with missing label
        const isCallback = Boolean((transfer as any).from_callback) || Boolean((transfer as any).is_callback);
        return {
          ...transfer,
          // Mark as missing submission data
          has_submission_data: false,
          verification_logs: "Update log missing - No submission data found",
          source_type: isCallback ? 'callback' : 'zapier',
        };
      });

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
  }, [data, dateFilter, statusFilter, leadVendorFilter, showDuplicates, searchTerm, dataCompletenessFilter]);

  useEffect(() => {
    if (stagesLoading) return;
    fetchData();
  }, [dateFilter, stagesLoading]);

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

    // lead_notes (deduped)
    const submissionIds = Array.from(submissionMap.keys());
    try {
      let query = (supabase as any)
        .from('lead_notes')
        .select('id, lead_id, submission_id');

      if (leadIds.length > 0) {
        query = query.in('lead_id', leadIds);
      }
      if (submissionIds.length > 0) {
        query = query.in('submission_id', submissionIds);
      }

      const { data: noteRows, error: notesErr } = await query;

      if (!notesErr && Array.isArray(noteRows)) {
        const seen = new Set<string>();
        noteRows.forEach((row: { id: string; lead_id?: string | null; submission_id?: string | null }) => {
          if (!row?.id || seen.has(row.id)) return;
          seen.add(row.id);

          const directLeadId = (row.lead_id || '').toString();
          if (directLeadId && counts[directLeadId] !== undefined) {
            counts[directLeadId] = (counts[directLeadId] || 0) + 1;
            return;
          }

          const subId = (row.submission_id || '').toString();
          if (subId) {
            const leadId = submissionMap.get(subId);
            if (leadId) {
              counts[leadId] = (counts[leadId] || 0) + 1;
            }
          }
        });
      }
    } catch (e) {
      console.warn('Failed to fetch lead note counts', e);
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

  const handleDropToStage = async (rowId: string, stageKey: string) => {
    const nextStatusKey = getStatusKeyForStage(stageKey);
    const nextStatusLabel = dbSubmissionStages.find((s) => s.key === nextStatusKey)?.label ?? getStatusForStage(stageKey);

    const prev = data;
    const next = prev.map((r) => (r.id === rowId ? { ...r, status: nextStatusKey } : r));
    setData(next);

    try {
      const { error: transferError } = await supabase
        .from('daily_deal_flow')
        .update({ status: nextStatusKey })
        .eq('id', rowId);

      if (transferError) throw transferError;

      const droppedRow = prev.find((r) => r.id === rowId);
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
    if (!row?.id) return;
    navigate(`/daily-deal-flow/lead/${encodeURIComponent(row.id)}`, {
      state: { activeNav: '/submission-portal' },
    });
  };

  const handleOpenEdit = (row: SubmissionPortalRow) => {
    setEditRow(row);
    const { parent, reason } = parseStageLabel((row.status || '').trim());
    setEditStage(parent);
    setEditReason(reason || '');
    setEditNotes('');
    setEditStageOpen(false);
    setEditOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editRow) return;
    const parentLabel = (editStage || '').trim();
    if (!parentLabel) return;

    // Build the full status: "Parent - Reason" or just "Parent"
    const reasons = reasonsByParent[parentLabel];
    const selectedReason = (editReason || '').trim();
    const nextStage = reasons && reasons.length > 0 && selectedReason
      ? buildStatusLabel(parentLabel, selectedReason)
      : parentLabel;

    const previousStage = (editRow.status || '').trim();
    const stageChanged = previousStage !== nextStage;

    try {
      setEditSaving(true);

      const { error: flowError } = await supabase
        .from('daily_deal_flow')
        .update({ status: nextStage, notes: editNotes })
        .eq('id', editRow.id);

      if (flowError) throw flowError;

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

      const notesText = (editNotes || '').trim() || 'No notes provided.';

      const trimmedNote = (editNotes || '').trim();
      if (trimmedNote.length > 0) {
        try {
          const { data: userData, error: userErr } = await supabase.auth.getUser();
          if (!userErr) {
            const user = userData?.user;
            const createdBy = user?.id || null;
            const emailPrefix = user?.email ? user.email.split('@')[0] : null;

            let displayName: string | null = null;
            if (user?.id) {
              try {
                const { data: profileData } = await (supabase as any)
                  .from('profiles')
                  .select('display_name')
                  .eq('user_id', user.id)
                  .limit(1);

                const raw = Array.isArray(profileData) ? profileData?.[0]?.display_name : profileData?.display_name;
                displayName = typeof raw === 'string' ? raw.trim() : null;
                if (displayName && displayName.length === 0) displayName = null;
              } catch (e) {
                console.warn('Failed to fetch profile display_name', e);
              }
            }

            const authorName =
              displayName || (user?.user_metadata as any)?.full_name || emailPrefix || user?.id || null;

            const { error: insertErr } = await (supabase as any).from('lead_notes').insert({
              lead_id: editRow.id,
              submission_id: editRow.submission_id ?? null,
              note: trimmedNote,
              source: 'Submission Portal',
              created_by: createdBy,
              author_name: authorName,
            });

            if (insertErr) {
              console.warn('Failed to insert lead note', insertErr);
            }
          } else {
            console.warn('Failed to fetch auth user for note insert', userErr);
          }
        } catch (e) {
          console.warn('Unexpected error inserting lead note', e);
        }
      }
      if (stageChanged || trimmedNote.length > 0) {
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