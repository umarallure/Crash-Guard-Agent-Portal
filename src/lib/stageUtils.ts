import type { PipelineStage } from "@/hooks/usePipelineStages";

/**
 * Separator used between parent stage name and reason in DB labels.
 * Example: "Docs Pending - Police Report Pending"
 */
const REASON_SEPARATOR = " - ";

/**
 * Parse a stage label into its parent name and optional reason.
 * "Docs Pending - Police Report Pending" → { parent: "Docs Pending", reason: "Police Report Pending" }
 * "Retainer Signed" → { parent: "Retainer Signed", reason: null }
 */
export function parseStageLabel(label: string): { parent: string; reason: string | null } {
  const idx = label.indexOf(REASON_SEPARATOR);
  if (idx === -1) return { parent: label, reason: null };
  return {
    parent: label.substring(0, idx),
    reason: label.substring(idx + REASON_SEPARATOR.length),
  };
}

/** Slugify a parent stage name into a key: "Docs Pending" → "docs_pending" */
export function slugifyParent(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

export interface ParentStage {
  key: string;
  label: string;
  columnClass: string;
  headerClass: string;
  reasons: string[];
}

/**
 * Given the flat list of DB stages, derive the unique parent stage columns
 * preserving display_order (uses the first sub-stage's order).
 * Also collects reasons for each parent.
 */
export function deriveParentStages(dbStages: PipelineStage[]): ParentStage[] {
  const map = new Map<string, ParentStage>();

  for (const s of dbStages) {
    const { parent, reason } = parseStageLabel(s.label);
    const key = slugifyParent(parent);

    if (!map.has(key)) {
      map.set(key, {
        key,
        label: parent,
        columnClass: s.column_class || "",
        headerClass: s.header_class || "",
        reasons: [],
      });
    }

    if (reason) {
      map.get(key)!.reasons.push(reason);
    }
  }

  return Array.from(map.values());
}

/**
 * Build the full status string to save to the DB.
 * If a reason is provided: "Docs Pending - Police Report Pending"
 * Otherwise: "Retainer Signed"
 */
export function buildStatusLabel(parentLabel: string, reason: string | null): string {
  if (reason) return `${parentLabel}${REASON_SEPARATOR}${reason}`;
  return parentLabel;
}

/**
 * Given a row status, find the parent stage key for kanban column placement.
 */
export function deriveParentKey(
  status: string,
  dbStages: PipelineStage[],
  parentStages: ParentStage[]
): string {
  const trimmed = (status || "").trim();

  // First, check if the status is directly a parent stage key
  if (parentStages.some((s) => s.key === trimmed)) {
    return trimmed;
  }

  // Check if status is a stage key (sub-stage)
  const matchedByKey = dbStages.find((s) => s.key === trimmed);
  if (matchedByKey) {
    const { parent } = parseStageLabel(matchedByKey.label);
    return slugifyParent(parent);
  }

  // Try exact match against DB stage labels
  const matched = dbStages.find((s) => s.label === trimmed);
  if (matched) {
    const { parent } = parseStageLabel(matched.label);
    return slugifyParent(parent);
  }

  // Fallback: try parsing the status directly as a parent label
  const { parent } = parseStageLabel(trimmed);
  const parentKey = slugifyParent(parent);
  if (parentStages.some((s) => s.key === parentKey)) return parentKey;

  // Last resort: first parent stage
  return parentStages[0]?.key ?? "";
}
