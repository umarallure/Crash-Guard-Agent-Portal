import { supabase } from "@/integrations/supabase/client";
import { fetchLicensedCloserDirectory } from "@/lib/agentOptions";

export const UNASSIGNED_AGENT_VALUE = "__UNASSIGNED_AGENT__";

export interface LeadAssignmentFields {
  assigned_agent_id?: string | null;
  assigned_agent_by?: string | null;
  assigned_agent_at?: string | null;
}

export type PortalLeadRecord = Record<string, unknown> &
  LeadAssignmentFields & {
    id: string;
    submission_id?: string | null;
    is_active?: boolean | null;
    created_at?: string | null;
    submission_date?: string | null;
  };

export interface LeadAssignmentAgentOption {
  userId: string;
  label: string;
}

export interface LeadAssignmentUpdateResult extends LeadAssignmentFields {
  lead_id: string;
}

type SupabaseErrorLike = { message?: string } | null;

type VisibleLeadsRpcClient = {
  rpc: (
    functionName: "get_visible_portal_leads",
  ) => Promise<{ data: PortalLeadRecord[] | null; error: SupabaseErrorLike }>;
};

type AssignLeadRpcClient = {
  rpc: (
    functionName: "assign_lead_to_agent",
    params: { p_lead_id: string; p_agent_user_id: string },
  ) => Promise<{ data: unknown; error: SupabaseErrorLike }>;
};

type UnassignLeadRpcClient = {
  rpc: (
    functionName: "unassign_lead_agent",
    params: { p_lead_id: string },
  ) => Promise<{ data: unknown; error: SupabaseErrorLike }>;
};

const toTimestamp = (value: string | null | undefined) => {
  if (!value) return 0;
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
};

const sortPortalLeadRecords = (left: PortalLeadRecord, right: PortalLeadRecord) => {
  const submissionDateDiff =
    toTimestamp(right.submission_date ?? null) - toTimestamp(left.submission_date ?? null);
  if (submissionDateDiff !== 0) return submissionDateDiff;

  return toTimestamp(right.created_at ?? null) - toTimestamp(left.created_at ?? null);
};

const normalizeRpcAssignmentResult = (value: unknown): LeadAssignmentUpdateResult => {
  const row = Array.isArray(value) ? value[0] : value;
  const typed = (row || {}) as Partial<LeadAssignmentUpdateResult>;

  if (!typed.lead_id) {
    throw new Error("Lead assignment update did not return a lead id.");
  }

  return {
    lead_id: typed.lead_id,
    assigned_agent_id: typed.assigned_agent_id ?? null,
    assigned_agent_by: typed.assigned_agent_by ?? null,
    assigned_agent_at: typed.assigned_agent_at ?? null,
  };
};

const fetchVisibleLeadRecords = async (): Promise<PortalLeadRecord[]> => {
  const { data, error } = await (supabase as unknown as VisibleLeadsRpcClient)
    .rpc("get_visible_portal_leads");

  if (error) throw error;
  return (data ?? []).slice().sort(sortPortalLeadRecords);
};

export const fetchVisiblePortalLeads = async (): Promise<PortalLeadRecord[]> => {
  const records = await fetchVisibleLeadRecords();
  return records.filter((record) => record.is_active !== false);
};

export const fetchVisibleLeadById = async (leadId: string): Promise<PortalLeadRecord | null> => {
  const records = await fetchVisibleLeadRecords();
  return records.find((record) => record.id === leadId) ?? null;
};

export const fetchVisibleLeadBySubmissionId = async (
  submissionId: string,
): Promise<PortalLeadRecord | null> => {
  const records = await fetchVisibleLeadRecords();
  return records.find((record) => record.submission_id === submissionId) ?? null;
};

export const fetchLeadAssignmentAgents = async (): Promise<LeadAssignmentAgentOption[]> => {
  const directory = await fetchLicensedCloserDirectory();
  return directory.map((agent) => ({
    userId: agent.userId,
    label: agent.label,
  }));
};

export const assignLeadToAgent = async (
  leadId: string,
  agentUserId: string,
): Promise<LeadAssignmentUpdateResult> => {
  const { data, error } = await (supabase as unknown as AssignLeadRpcClient)
    .rpc("assign_lead_to_agent", {
      p_lead_id: leadId,
      p_agent_user_id: agentUserId,
    });

  if (error) throw error;
  return normalizeRpcAssignmentResult(data);
};

export const unassignLeadAgent = async (
  leadId: string,
): Promise<LeadAssignmentUpdateResult> => {
  const { data, error } = await (supabase as unknown as UnassignLeadRpcClient)
    .rpc("unassign_lead_agent", {
      p_lead_id: leadId,
    });

  if (error) throw error;
  return normalizeRpcAssignmentResult(data);
};

export const applyLeadAssignmentToRows = <
  T extends { id: string } & LeadAssignmentFields,
>(
  rows: T[],
  result: LeadAssignmentUpdateResult,
): T[] =>
  rows.map((row) =>
    row.id === result.lead_id
      ? {
          ...row,
          assigned_agent_id: result.assigned_agent_id ?? null,
          assigned_agent_by: result.assigned_agent_by ?? null,
          assigned_agent_at: result.assigned_agent_at ?? null,
        }
      : row,
  );

export const getLeadAssignmentAgentLabel = (
  agentId: string | null | undefined,
  agents: LeadAssignmentAgentOption[],
) => {
  if (!agentId) return "";
  return agents.find((agent) => agent.userId === agentId)?.label || "Assigned agent";
};

export const getLeadRecordString = (
  record: Record<string, unknown>,
  key: string,
) => {
  const value = record[key];
  if (value === null || value === undefined) return "";
  return typeof value === "string" ? value : String(value);
};

export const getLeadRecordBoolean = (
  record: Record<string, unknown>,
  key: string,
) => Boolean(record[key]);
