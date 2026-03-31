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
import { Loader2, RefreshCw, StickyNote, UserPlus } from "lucide-react";
import { usePipelineStages } from "@/hooks/usePipelineStages";
import { isDateInRange, type DateRangePreset } from "@/lib/dateRangeFilter";
import { ClaimDroppedCallModal } from "@/components/ClaimDroppedCallModal";
import { logCallUpdate, getLeadInfo } from "@/lib/callLogging";
import { ColumnInfoPopover } from "@/components/ColumnInfoPopover";

interface CloserPortalRow {
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

interface ColumnInfoDetail { label: string; value: string; }
interface ColumnInfo { description: string; details?: ColumnInfoDetail[]; }

const getColumnInfo = (label: string): ColumnInfo => {
  const l = label.toLowerCase();

  if (l.includes("new transfer") || l === "transfer_api" || l === "transfer api")
    return { description: "Newly transferred leads that arrived within the last hour. Closers should act on these quickly before they move to Pending Disposition." };

  if (l.includes("pending disposition") || l === "pending_disposition")
    return { description: "Leads that have been active for over 1 hour without a disposition. These require immediate follow-up and an outcome to be recorded." };

  if (l.includes("dispositioned") && !l.includes("pending"))
    return { description: "Leads that have been reviewed and given a final disposition by the closer. An outcome (sold, not sold, callback, etc.) has been recorded." };

  if (l.includes("returned") || l.includes("return to center") || l.includes("dq"))
    return { description: "Leads sent back to the call center because they could not be sold or were disqualified. No further closer action is needed." };

  return { description: `Leads currently in the "${label}" stage of the closer pipeline.` };
};

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
  const datePreset: DateRangePreset = "today";
  const customStartDate = "";
  const customEndDate = "";
  const [leadVendorFilter, setLeadVendorFilter] = useState("__ALL__");
  const [statusFilter, setStatusFilter] = useState("__ALL__");
  const [showDuplicates, setShowDuplicates] = useState(true);
  const [columnPage, setColumnPage] = useState<Record<string, number>>({});
  const [noteCounts, setNoteCounts] = useState<Record<string, number>>({});
  const [timeTick, setTimeTick] = useState(() => Date.now());

  // Claim call modal state
  const [claimModalOpen, setClaimModalOpen] = useState(false);
  const [claimSessionId, setClaimSessionId] = useState<string | null>(null);
  const [claimSubmissionId, setClaimSubmissionId] = useState<string | null>(null);
  const [claimLicensedAgent, setClaimLicensedAgent] = useState<string>("");
  const [claimLoading, setClaimLoading] = useState(false);
  const [claimLead, setClaimLead] = useState<any>(null);
  const [licensedAgents, setLicensedAgents] = useState<any[]>([]);
  const [fetchingAgents, setFetchingAgents] = useState(false);

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

    filtered = filtered.filter((record) =>
      isDateInRange(record.date || record.created_at || null, datePreset, customStartDate, customEndDate)
    );

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
    if (submissionIds.length > 0) {
      try {
        const { data: noteRows, error: noteError } = await supabase
          .from("daily_deal_flow")
          .select("submission_id, notes")
          .in("submission_id", submissionIds);

        if (!noteError && Array.isArray(noteRows)) {
          noteRows.forEach((row) => {
            const noteText = (row.notes as string | null)?.trim();
            if (!noteText) return;

            const leadId = submissionMap.get(row.submission_id as string);
            if (leadId) {
              counts[leadId] = (counts[leadId] || 0) + 1;
            }
          });
        }
      } catch (error) {
        console.warn("Failed to fetch closer portal note counts", error);
      }
    }

    setNoteCounts(counts);
  };

  const fetchData = async (showRefreshToast = false) => {
    try {
      setRefreshing(true);

      let leadsQuery = (supabase as any)
        .from("leads")
        .select("*")
        .order("submission_date", { ascending: false })
        .order("created_at", { ascending: false });

      const leadsRes = await leadsQuery;

      if (leadsRes.error) {
        console.error("Error fetching closer portal data:", leadsRes.error);
        toast({
          title: "Error",
          description: "Failed to fetch closer portal data",
          variant: "destructive",
        });
        return;
      }

      const normalizedRows = ((leadsRes.data ?? []) as any[]).map((lead) => {
        const submissionId = (lead?.submission_id || "").trim();
        const isCallback = Boolean(lead?.is_callback);
        return {
          id: lead.id,
          submission_id: submissionId,
          insured_name: lead.customer_full_name || "",
          client_phone_number: lead.phone_number || "",
          lead_vendor: lead.lead_vendor || "",
          buffer_agent: lead.buffer_agent || "",
          agent: lead.agent || "",
          licensed_agent_account: (lead as any).licensed_agent_account || "",
          assigned_attorney_id: (lead as any).assigned_attorney_id || null,
          carrier: lead.carrier || "",
          product_type: lead.product_type || "",
          notes: "",
          status: (lead.status || "").trim(),
          date: lead.submission_date ? String(lead.submission_date).split(" ")[0] : "",
          created_at: lead.created_at || "",
          updated_at: lead.updated_at || "",
          from_callback: isCallback,
          is_callback: isCallback,
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
  }, [data, datePreset, customStartDate, customEndDate, leadVendorFilter, statusFilter, searchTerm, showDuplicates, timeTick]);

  useEffect(() => {
    if (closerStagesLoading) return;
    void fetchData();
  }, [closerStagesLoading]);

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
    if (!row?.submission_id) return;
    navigate(`/leads/${encodeURIComponent(row.submission_id)}`, {
      state: { activeNav: "/closer-portal" },
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

  const fetchAgents = async () => {
    setFetchingAgents(true);
    try {
      const { data: agentStatus } = await supabase
        .from("agent_status")
        .select("user_id")
        .eq("agent_type", "licensed");

      const ids = (agentStatus as AgentStatusRow[] | null | undefined)?.map((a) => a.user_id) || [];
      let profiles: Array<{ user_id: string; display_name: string }> = [];

      if (ids.length > 0) {
        const { data: fetchedProfiles } = await (supabase as unknown as AppUsersQueryClient)
          .from("app_users")
          .select("user_id, display_name, email")
          .in("user_id", ids);

        profiles = ((fetchedProfiles || []) as AppUserRow[]).map((u) => ({
          user_id: u.user_id,
          display_name: u.display_name || (u.email ? String(u.email).split("@")[0] : ""),
        }));
      }

      setLicensedAgents(profiles);
    } catch (error) {
      console.log(error);
    } finally {
      setFetchingAgents(false);
    }
  };

  const openClaimModal = async (submissionId: string) => {
    const { data: existingSession } = await supabase
      .from("verification_sessions")
      .select("id, status, total_fields")
      .eq("submission_id", submissionId)
      .gt("total_fields", 0)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let sessionId = existingSession?.id;

    if (!sessionId) {
      const { data: leadData, error: leadError } = await supabase
        .from("leads")
        .select("*")
        .eq("submission_id", submissionId)
        .single();

      if (leadError || !leadData) {
        toast({ title: "Error", description: "Failed to fetch lead data", variant: "destructive" });
        return;
      }

      const { data: newSession, error } = await supabase
        .from("verification_sessions")
        .insert({ submission_id: submissionId, status: "pending", progress_percentage: 0, total_fields: 0, verified_fields: 0 })
        .select("id")
        .single();

      if (error) {
        toast({ title: "Error", description: "Failed to create verification session", variant: "destructive" });
        return;
      }
      sessionId = newSession.id;

      const leadFields = [
        "accident_date", "accident_location", "accident_scenario", "injuries", "medical_attention",
        "police_attended", "insured", "vehicle_registration", "insurance_company",
        "third_party_vehicle_registration", "other_party_admit_fault", "passengers_count",
        "prior_attorney_involved", "prior_attorney_details", "contact_name", "contact_number",
        "contact_address", "lead_vendor", "customer_full_name", "street_address", "beneficiary_information",
        "billing_and_mailing_address_is_the_same", "date_of_birth", "age", "phone_number",
        "social_security", "driver_license", "exp", "existing_coverage",
        "applied_to_life_insurance_last_two_years", "height", "weight", "doctors_name",
        "tobacco_use", "health_conditions", "medications", "insurance_application_details",
        "carrier", "monthly_premium", "coverage_amount", "draft_date", "first_draft",
        "institution_name", "beneficiary_routing", "beneficiary_account", "account_type",
        "city", "state", "zip_code", "birth_state", "call_phone_landline", "additional_notes",
      ];

      const verificationItems = leadFields
        .map((field) => {
          const value = leadData[field as keyof typeof leadData];
          if (value === null || value === undefined) return null;
          return { session_id: sessionId, field_name: field, original_value: String(value), verified_value: String(value), is_verified: false, is_modified: false };
        })
        .filter(Boolean);

      if (verificationItems.length > 0) {
        await supabase.from("verification_items").insert(verificationItems);
        await supabase.from("verification_sessions").update({ total_fields: verificationItems.length }).eq("id", sessionId);
      }
    }

    const { data: lead } = await supabase
      .from("leads")
      .select("lead_vendor, customer_full_name, is_retention_call")
      .eq("submission_id", submissionId)
      .single();

    setClaimSessionId(sessionId);
    setClaimSubmissionId(submissionId);
    setClaimLead(lead);
    setClaimLicensedAgent("");
    setClaimModalOpen(true);
    fetchAgents();
  };

  const handleClaimCall = async () => {
    setClaimLoading(true);
    try {
      if (!claimLicensedAgent) {
        toast({ title: "Error", description: "Please select a closer", variant: "destructive" });
        return;
      }

      await supabase
        .from("verification_sessions")
        .update({ status: "in_progress", licensed_agent_id: claimLicensedAgent })
        .eq("id", claimSessionId);

      const agentName = licensedAgents.find((a) => a.user_id === claimLicensedAgent)?.display_name || "Licensed Agent";
      const { customerName, leadVendor } = await getLeadInfo(claimSubmissionId!);

      await logCallUpdate({
        submissionId: claimSubmissionId!,
        agentId: claimLicensedAgent,
        agentType: "licensed",
        agentName,
        eventType: "call_claimed",
        eventDetails: {
          verification_session_id: claimSessionId,
          claimed_at: new Date().toISOString(),
          claimed_from_dashboard: true,
          claim_type: "manual_claim",
        },
        verificationSessionId: claimSessionId!,
        customerName,
        leadVendor,
        isRetentionCall: false,
      });

      await supabase.functions.invoke("center-transfer-notification", {
        body: { type: "reconnected", submissionId: claimSubmissionId, agentType: "licensed", agentName, leadData: claimLead },
      });

      const submissionIdForRedirect = claimSubmissionId;
      setClaimModalOpen(false);
      setClaimSessionId(null);
      setClaimSubmissionId(null);
      setClaimLead(null);
      setClaimLicensedAgent("");

      toast({ title: "Success", description: `Call claimed by ${agentName}` });
      void fetchData();
      navigate(`/call-result-update?submissionId=${submissionIdForRedirect}`);
    } catch (error) {
      console.error("Error claiming call:", error);
      toast({ title: "Error", description: "Failed to claim call", variant: "destructive" });
    } finally {
      setClaimLoading(false);
    }
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
                  const pageRows = rows.slice(startIndex, startIndex + pageSize);

                  return (
                    <Card
                      key={stage.key}
                      className={`flex min-h-[560px] flex-col bg-muted/20 ${stageTheme[stage.key]?.column ?? ""}`}
                    >
                      <CardHeader className={`flex flex-row items-center justify-between border-b px-3 py-2 ${stageTheme[stage.key]?.header ?? ""}`}>
                        <div className="flex items-center gap-1.5">
                          <CardTitle className="text-sm font-semibold">{stage.label}</CardTitle>
                          <ColumnInfoPopover info={getColumnInfo(stage.label)} />
                        </div>
                        <Badge variant="secondary">{rows.length}</Badge>
                      </CardHeader>
                      <CardContent className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
                        {pageRows.length === 0 ? (
                          <div className="flex h-full items-center justify-center rounded-md border border-dashed border-muted-foreground/30 px-3 py-6 text-center text-xs text-muted-foreground">
                            No leads
                          </div>
                        ) : (
                          pageRows.map((row) => {
                            const statusText = toDispositionLabel(row.status) || row.status || "No status";
                            const noteCount = noteCounts[row.id] ?? 0;

                            return (
                              <Card
                                key={row.id}
                                className="w-full cursor-pointer transition hover:shadow-md"
                                onClick={() => handleView(row)}
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
                                          <span>{noteCount}</span>
                                        </div>
                                      </div>
                                    </div>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-7 shrink-0 self-start gap-1 border-primary/40 px-2 text-[11px] font-medium text-primary hover:bg-primary hover:text-primary-foreground"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        openClaimModal(row.submission_id);
                                      }}
                                    >
                                      <UserPlus className="h-3 w-3" />
                                      Claim
                                    </Button>
                                  </div>

                                  <div className="flex flex-col gap-1.5 pt-0.5">
                                    <Badge variant="secondary" className="max-w-full w-fit truncate rounded-full px-2.5 py-1 text-[11px] font-semibold">
                                      {row.lead_vendor || "—"}
                                    </Badge>
                                    <Badge variant="outline" className="max-w-full w-fit truncate rounded-full px-2.5 py-1 text-[10.5px] font-medium">
                                      {statusText}
                                    </Badge>
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

export default CloserPortalPage;
