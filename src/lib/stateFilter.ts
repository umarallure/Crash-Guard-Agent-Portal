const toTitleCase = (value: string) =>
  value
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

export const formatStateFilterLabel = (value?: string | null): string => {
  const trimmed = (value || "").trim();
  if (!trimmed) return "";

  if (trimmed.length <= 3) {
    return trimmed.toUpperCase();
  }

  return toTitleCase(trimmed);
};

export const getStateFilterOptions = <T extends { state?: string | null }>(records: T[]): string[] => {
  const optionsByKey = new Map<string, string>();

  records.forEach((record) => {
    const rawValue = (record.state || "").trim();
    const label = formatStateFilterLabel(rawValue);
    const key = rawValue.toLowerCase();

    if (!key || !label || optionsByKey.has(key)) return;
    optionsByKey.set(key, label);
  });

  return Array.from(optionsByKey.values()).sort((a, b) => a.localeCompare(b));
};

export const matchesStateFilter = (value: string | null | undefined, selectedStates: string[]): boolean => {
  if (selectedStates.length === 0) return true;

  const normalizedValue = formatStateFilterLabel(value);
  if (!normalizedValue) return false;

  return selectedStates.includes(normalizedValue);
};
