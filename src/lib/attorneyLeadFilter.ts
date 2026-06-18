import { matchesStateFilter, getStateMatchToken, type StateFilterOption } from "@/lib/stateFilter";
import { matchesSolPeriodFilter } from "@/lib/solPeriods";

export type AttorneyLeadFilterType = "internal_lawyer" | "broker_lawyer";

export type AttorneyLeadFilterOption = {
  id: string;
  type: AttorneyLeadFilterType;
  label: string;
  coverageStates: string[];
  sol: string | null;
  sourceId: string;
  brokerId?: string | null;
  searchText?: string;
};

export type AttorneyLeadFilterRecord = {
  state?: string | null;
  accident_date?: string | Date | null;
};

const toUnknownArray = (value: unknown): unknown[] => {
  if (Array.isArray(value)) return value;

  if (typeof value !== "string") return [];

  const trimmed = value.trim();
  if (!trimmed) return [];

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // Fall through to support simple comma-separated or Postgres array text.
  }

  return trimmed
    .replace(/^\{|\}$/g, "")
    .split(",")
    .map((item) => item.trim().replace(/^"|"$/g, ""))
    .filter(Boolean);
};

export const normalizeAttorneyCoverageStates = (value: unknown): string[] => {
  const seen = new Set<string>();

  toUnknownArray(value).forEach((item) => {
    const token = getStateMatchToken(typeof item === "string" ? item : String(item ?? ""));
    if (token) seen.add(token);
  });

  return Array.from(seen).sort((left, right) => left.localeCompare(right));
};

type InternalAttorneyCoverageInput = {
  generalCoverage?: unknown;
  licensedStates?: unknown;
  blockedStates?: unknown;
};

export const buildInternalAttorneyCoverageStates = ({
  generalCoverage,
  licensedStates,
  blockedStates,
}: InternalAttorneyCoverageInput): string[] => {
  const generalCoverageStates = normalizeAttorneyCoverageStates(generalCoverage);
  const baseCoverage = generalCoverageStates.length > 0
    ? generalCoverageStates
    : normalizeAttorneyCoverageStates(licensedStates);
  const blocked = new Set(normalizeAttorneyCoverageStates(blockedStates));

  return baseCoverage.filter((state) => !blocked.has(state));
};

export const matchesAttorneyLeadFilter = (
  record: AttorneyLeadFilterRecord,
  attorneyFilter: AttorneyLeadFilterOption | null | undefined,
  stateOptions?: StateFilterOption[],
): boolean => {
  if (!attorneyFilter) return true;

  const coverageStates = normalizeAttorneyCoverageStates(attorneyFilter.coverageStates);
  if (coverageStates.length === 0) return false;

  if (!matchesStateFilter(record.state, coverageStates, stateOptions)) return false;

  if (attorneyFilter.type === "broker_lawyer" && attorneyFilter.sol) {
    return matchesSolPeriodFilter(record.accident_date, attorneyFilter.sol);
  }

  return true;
};
