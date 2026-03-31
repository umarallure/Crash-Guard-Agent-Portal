import {
  endOfMonth,
  endOfWeek,
  format,
  isValid,
  parseISO,
  startOfMonth,
  startOfWeek,
  subWeeks,
} from "date-fns";

export type DateRangePreset = "all" | "today" | "this_week" | "last_week" | "this_month" | "custom";

export const normalizeDateValue = (value: string | Date | null | undefined): string | null => {
  if (!value) return null;

  if (value instanceof Date) {
    return isValid(value) ? format(value, "yyyy-MM-dd") : null;
  }

  const trimmed = value.trim();
  if (!trimmed) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const parsed = parseISO(trimmed);
  if (!isValid(parsed)) {
    return trimmed.slice(0, 10) || null;
  }

  return format(parsed, "yyyy-MM-dd");
};

export const getDateRangeBounds = (
  preset: DateRangePreset,
  customStartDate?: string,
  customEndDate?: string
) => {
  const today = new Date();

  switch (preset) {
    case "today":
      return {
        start: format(today, "yyyy-MM-dd"),
        end: format(today, "yyyy-MM-dd"),
      };
    case "this_week":
      return {
        start: format(startOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd"),
        end: format(endOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd"),
      };
    case "last_week": {
      const lastWeek = subWeeks(today, 1);
      return {
        start: format(startOfWeek(lastWeek, { weekStartsOn: 1 }), "yyyy-MM-dd"),
        end: format(endOfWeek(lastWeek, { weekStartsOn: 1 }), "yyyy-MM-dd"),
      };
    }
    case "this_month":
      return {
        start: format(startOfMonth(today), "yyyy-MM-dd"),
        end: format(endOfMonth(today), "yyyy-MM-dd"),
      };
    case "custom":
      return {
        start: normalizeDateValue(customStartDate),
        end: normalizeDateValue(customEndDate),
      };
    case "all":
    default:
      return {
        start: null,
        end: null,
      };
  }
};

export const isDateInRange = (
  value: string | Date | null | undefined,
  preset: DateRangePreset,
  customStartDate?: string,
  customEndDate?: string
) => {
  const normalizedValue = normalizeDateValue(value);
  if (!normalizedValue) return false;

  const { start, end } = getDateRangeBounds(preset, customStartDate, customEndDate);
  if (!start && !end) return true;
  if (start && normalizedValue < start) return false;
  if (end && normalizedValue > end) return false;
  return true;
};
