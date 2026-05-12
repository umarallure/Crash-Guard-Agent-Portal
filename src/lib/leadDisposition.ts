import { supabase } from "@/integrations/supabase/client";
import type { PipelineStage } from "@/hooks/usePipelineStages";

export type LeadDispositionPipeline =
  | "transfer_portal"
  | "submission_portal"
  | "closer_portal";

export type LeadDispositionStagesByPipeline = Record<
  LeadDispositionPipeline,
  PipelineStage[]
>;

export const LEAD_DISPOSITION_PIPELINE_OPTIONS: Array<{
  value: LeadDispositionPipeline;
  label: string;
}> = [
  { value: "transfer_portal", label: "Transfer Pipeline" },
  { value: "submission_portal", label: "Submission Pipeline" },
  { value: "closer_portal", label: "Closer Pipeline" },
];

const TRANSFER_DOCUMENT_SIGNED_STAGE_KEY = "document_signed_api";
const TRANSFER_HANDOFF_STAGE_KEY = "retainer_signed";

type DailyDealFlowStatusRow = {
  id: string;
  call_result: string | null;
  updated_at: string | null;
  created_at: string | null;
  date: string | null;
};

const normalizeText = (value: string | null | undefined) => value?.trim() ?? "";

const toTimestamp = (value: string | null | undefined) => {
  if (!value) return 0;
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
};

const isQualifiedDailyDealFlowRow = (row: DailyDealFlowStatusRow) =>
  normalizeText(row.call_result).toLowerCase() === "qualified";

const compareDailyDealFlowStatusRows = (
  left: DailyDealFlowStatusRow,
  right: DailyDealFlowStatusRow,
) => {
  const leftQualified = isQualifiedDailyDealFlowRow(left) ? 1 : 0;
  const rightQualified = isQualifiedDailyDealFlowRow(right) ? 1 : 0;

  if (leftQualified !== rightQualified) {
    return rightQualified - leftQualified;
  }

  const leftUpdatedAt = toTimestamp(left.updated_at);
  const rightUpdatedAt = toTimestamp(right.updated_at);
  if (leftUpdatedAt !== rightUpdatedAt) return rightUpdatedAt - leftUpdatedAt;

  const leftCreatedAt = toTimestamp(left.created_at);
  const rightCreatedAt = toTimestamp(right.created_at);
  if (leftCreatedAt !== rightCreatedAt) return rightCreatedAt - leftCreatedAt;

  const leftDate = toTimestamp(left.date);
  const rightDate = toTimestamp(right.date);
  if (leftDate !== rightDate) return rightDate - leftDate;

  return right.id.localeCompare(left.id);
};

export const getLeadDispositionStagesForPipeline = (
  stagesByPipeline: LeadDispositionStagesByPipeline,
  pipeline: LeadDispositionPipeline,
) => stagesByPipeline[pipeline] ?? [];

export const findLeadDispositionStage = (
  stages: PipelineStage[],
  status: string | null | undefined,
) => {
  const trimmed = normalizeText(status);
  if (!trimmed) return null;

  const exactMatch = stages.find(
    (stage) =>
      normalizeText(stage.key) === trimmed ||
      normalizeText(stage.label) === trimmed,
  );

  if (exactMatch) return exactMatch;

  const lower = trimmed.toLowerCase();
  return (
    stages.find(
      (stage) =>
        normalizeText(stage.key).toLowerCase() === lower ||
        normalizeText(stage.label).toLowerCase() === lower,
    ) ?? null
  );
};

export const resolveLeadDisposition = (
  status: string | null | undefined,
  stagesByPipeline: LeadDispositionStagesByPipeline,
): { pipeline: LeadDispositionPipeline; stageKey: string } => {
  const trimmedStatus = normalizeText(status);

  for (const option of LEAD_DISPOSITION_PIPELINE_OPTIONS) {
    const stage = findLeadDispositionStage(
      stagesByPipeline[option.value],
      trimmedStatus,
    );

    if (stage?.key) {
      return { pipeline: option.value, stageKey: normalizeText(stage.key) };
    }
  }

  const fallbackPipeline = "transfer_portal";
  return {
    pipeline: fallbackPipeline,
    stageKey: normalizeText(stagesByPipeline[fallbackPipeline]?.[0]?.key),
  };
};

const isTransferHandoffStage = (
  stageKey: string,
  stagesByPipeline: LeadDispositionStagesByPipeline,
) => {
  const trimmed = normalizeText(stageKey);
  if (!trimmed) return false;
  if (trimmed === TRANSFER_DOCUMENT_SIGNED_STAGE_KEY) return true;

  const stage = findLeadDispositionStage(
    stagesByPipeline.transfer_portal,
    trimmed,
  );
  if (!stage) return false;

  const key = normalizeText(stage.key).toLowerCase();
  const label = normalizeText(stage.label).toLowerCase();
  return key.includes("document_signed") || label.includes("document signed");
};

export const resolveStoredLeadDispositionStageKey = (
  pipeline: LeadDispositionPipeline,
  stageKey: string,
  stagesByPipeline: LeadDispositionStagesByPipeline,
) => {
  const trimmed = normalizeText(stageKey);
  if (!trimmed) return "";

  if (pipeline === "transfer_portal" && isTransferHandoffStage(trimmed, stagesByPipeline)) {
    return TRANSFER_HANDOFF_STAGE_KEY;
  }

  const stage = findLeadDispositionStage(stagesByPipeline[pipeline], trimmed);
  return normalizeText(stage?.key) || trimmed;
};

export const getLeadDispositionStageLabel = (
  stageKey: string | null | undefined,
  stagesByPipeline: LeadDispositionStagesByPipeline,
) => {
  const trimmed = normalizeText(stageKey);
  if (!trimmed) return "";

  for (const option of LEAD_DISPOSITION_PIPELINE_OPTIONS) {
    const stage = findLeadDispositionStage(stagesByPipeline[option.value], trimmed);
    if (stage?.label) return normalizeText(stage.label);
  }

  return trimmed;
};

const resolveLeadReference = async (input: {
  leadId?: string | null;
  submissionId?: string | null;
}) => {
  let leadId = normalizeText(input.leadId);
  let submissionId = normalizeText(input.submissionId);

  if (leadId && submissionId) {
    return { leadId, submissionId };
  }

  const query = leadId
    ? supabase.from("leads").select("id, submission_id").eq("id", leadId)
    : supabase.from("leads").select("id, submission_id").eq("submission_id", submissionId);

  const { data, error } = await query.maybeSingle();
  if (error) throw error;

  leadId = leadId || normalizeText(data?.id);
  submissionId = submissionId || normalizeText(data?.submission_id);

  return { leadId, submissionId };
};

const updateDailyDealFlowStatusRow = async (
  submissionId: string,
  status: string,
) => {
  if (!submissionId) return false;

  const { data, error } = await supabase
    .from("daily_deal_flow")
    .select("id, call_result, updated_at, created_at, date")
    .eq("submission_id", submissionId);

  if (error) throw error;

  const selectedRow = ((data ?? []) as DailyDealFlowStatusRow[])
    .slice()
    .sort(compareDailyDealFlowStatusRows)[0];

  if (!selectedRow?.id) return false;

  const { error: updateError } = await supabase
    .from("daily_deal_flow")
    .update({
      status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", selectedRow.id);

  if (updateError) throw updateError;

  return true;
};

const updateSubmissionPortalStatus = async (
  submissionId: string,
  status: string,
) => {
  if (!submissionId) return;

  try {
    const { error } = await (supabase as unknown as {
      from: (table: "submission_portal") => {
        update: (values: { status: string }) => {
          eq: (column: "submission_id", value: string) => Promise<{ error: unknown }>;
        };
      };
    })
      .from("submission_portal")
      .update({ status })
      .eq("submission_id", submissionId);

    if (error) {
      console.warn("Unable to sync submission_portal status", error);
    }
  } catch (error) {
    console.warn("Unable to sync submission_portal status", error);
  }
};

export const updateLeadDispositionStatus = async (input: {
  leadId?: string | null;
  submissionId?: string | null;
  status: string;
}) => {
  const status = normalizeText(input.status);
  if (!status) {
    throw new Error("A lead disposition status is required.");
  }

  const { leadId, submissionId } = await resolveLeadReference(input);
  if (!leadId) {
    throw new Error("Unable to resolve the lead attached to this task.");
  }

  if (submissionId) {
    await updateDailyDealFlowStatusRow(submissionId, status);
  }

  const { error: leadError } = await supabase
    .from("leads")
    .update({ status })
    .eq("id", leadId);

  if (leadError) throw leadError;

  await updateSubmissionPortalStatus(submissionId, status);

  return { leadId, submissionId, status };
};
