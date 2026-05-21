import { US_STATES } from "@/lib/us-states";

export type StateFilterOption = {
  value: string;
  label: string;
  searchText?: string;
  stateName?: string;
  availabilityStatus?: string;
  itemClassName?: string;
};

export type StateFilterSourceRow = {
  state_code?: string | null;
  state_name?: string | null;
  availability_status?: string | null;
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

const buildStateLookup = (stateOptions: StateFilterOption[] = []) => {
  const byCode = new Map<string, string>();
  const byName = new Map<string, string>();

  stateOptions.forEach((option) => {
    const code = option.value.trim().toUpperCase();
    if (!code) return;

    byCode.set(code, code);

    const name = (option.stateName || option.label.replace(`${option.value} - `, "")).trim();
    if (name) {
      byName.set(toTitleCase(name).toLowerCase(), code);
    }
  });

  return { byCode, byName };
};

export const getStateMatchToken = (
  value?: string | null,
  stateOptions?: StateFilterOption[],
): string => {
  const trimmed = (value || "").trim();
  if (!trimmed) return "";

  if (stateOptions?.length) {
    const lookup = buildStateLookup(stateOptions);
    const dynamicCode = lookup.byCode.get(trimmed.toUpperCase());
    if (dynamicCode) return dynamicCode;

    const dynamicName = lookup.byName.get(toTitleCase(trimmed).toLowerCase());
    if (dynamicName) return dynamicName;
  }

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

export const getStateFilterOptions = (states: StateFilterSourceRow[]): StateFilterOption[] => {
  const seen = new Set<string>();

  return states
    .reduce<StateFilterOption[]>((options, row) => {
      const code = (row.state_code || "").trim().toUpperCase();
      if (!code || seen.has(code)) return options;

      const stateName = formatStateFilterLabel(row.state_name || code);
      seen.add(code);

      options.push({
        value: code,
        label: `${code} - ${stateName}`,
        searchText: `${code} ${stateName}`,
        stateName,
        availabilityStatus: row.availability_status || undefined,
      });

      return options;
    }, [])
    .sort((left, right) => (left.stateName || left.value).localeCompare(right.stateName || right.value));
};

export const matchesStateFilter = (
  value: string | null | undefined,
  selectedStates: string[],
  stateOptions?: StateFilterOption[],
): boolean => {
  if (selectedStates.length === 0) return true;

  const normalizedValue = getStateMatchToken(value, stateOptions);
  if (!normalizedValue) return false;

  const selectedStateTokens = new Set(selectedStates.map((selectedState) => getStateMatchToken(selectedState, stateOptions)));
  return selectedStateTokens.has(normalizedValue);
};
