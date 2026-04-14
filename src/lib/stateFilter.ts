import { US_STATES } from "@/lib/us-states";

type StateFilterOption = {
  value: string;
  label: string;
  searchText?: string;
};

const toTitleCase = (value: string) =>
  value
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const STATE_BY_CODE = new Map(
  US_STATES.map((state) => [state.code.toUpperCase(), state])
);

const STATE_BY_NAME = new Map(
  US_STATES.map((state) => [state.name.toLowerCase(), state])
);

export const getStateMatchToken = (value?: string | null): string => {
  const trimmed = (value || "").trim();
  if (!trimmed) return "";

  const byCode = STATE_BY_CODE.get(trimmed.toUpperCase());
  if (byCode) return byCode.code;

  const byName = STATE_BY_NAME.get(toTitleCase(trimmed).toLowerCase());
  if (byName) return byName.code;

  return formatStateFilterLabel(trimmed);
};

export const formatStateFilterLabel = (value?: string | null): string => {
  const trimmed = (value || "").trim();
  if (!trimmed) return "";

  if (trimmed.length <= 3) {
    return trimmed.toUpperCase();
  }

  return toTitleCase(trimmed);
};

export const getStateFilterOptions = <T extends { state?: string | null }>(records: T[]): StateFilterOption[] => {
  void records;

  return US_STATES.map((state) => ({
    value: state.code,
    label: `${state.code} - ${state.name}`,
    searchText: `${state.code} ${state.name}`,
  }));
};

export const matchesStateFilter = (value: string | null | undefined, selectedStates: string[]): boolean => {
  if (selectedStates.length === 0) return true;

  const normalizedValue = getStateMatchToken(value);
  if (!normalizedValue) return false;

  const selectedStateTokens = new Set(selectedStates.map((selectedState) => getStateMatchToken(selectedState)));
  return selectedStateTokens.has(normalizedValue);
};
