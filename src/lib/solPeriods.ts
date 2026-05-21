import { addMonths, differenceInCalendarMonths, endOfDay, isAfter, startOfDay } from "date-fns";

export type SolPeriod = "3month" | "6month" | "12month" | "24month";

export type SolEvaluation = {
  ok: boolean;
  status: "valid" | "expired" | "not_configured" | "missing_accident_date" | "unknown";
  label: string;
  sol: string | null;
  expiryDate: string | null;
  monthsRemaining: number | null;
};

export const ALL_SOL_FILTER_VALUE = "__ALL_SOL__";

const SOL_MONTHS: Record<SolPeriod, number> = {
  "3month": 3,
  "6month": 6,
  "12month": 12,
  "24month": 24,
};

const SOL_ORDER = Object.keys(SOL_MONTHS) as SolPeriod[];

export const normalizeSolPeriod = (value: string | null | undefined): SolPeriod | null => {
  const normalized = String(value ?? "").trim();
  return SOL_ORDER.includes(normalized as SolPeriod) ? (normalized as SolPeriod) : null;
};

export const getSolPeriodMonths = (sol: string | null | undefined): number | null => {
  const normalizedSol = normalizeSolPeriod(sol);
  return normalizedSol ? SOL_MONTHS[normalizedSol] : null;
};

export const getSolPeriodLabel = (sol: string | null | undefined): string => {
  const months = getSolPeriodMonths(sol);
  return months ? `${months} Month SOL` : "Unknown SOL";
};

export const sortSolPeriods = (periods: string[]): SolPeriod[] => {
  const selected = new Set(periods.map((period) => normalizeSolPeriod(period)).filter(Boolean) as SolPeriod[]);
  return SOL_ORDER.filter((period) => selected.has(period));
};

const parseDateOnly = (value: string | Date | null | undefined): Date | null => {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value : null;
  }

  const trimmed = String(value ?? "").trim();
  if (!trimmed) return null;

  const [year, month, day] = trimmed.split("T")[0].split("-").map(Number);
  if (!year || !month || !day) return null;

  const date = new Date(year, month - 1, day);
  return Number.isFinite(date.getTime()) ? date : null;
};

export const getSolExpiryDate = (
  accidentDate: string | Date | null | undefined,
  sol: string | null | undefined,
): Date | null => {
  const accident = parseDateOnly(accidentDate);
  const solLimitMonths = getSolPeriodMonths(sol);
  if (!accident || solLimitMonths === null) return null;

  return endOfDay(addMonths(startOfDay(accident), solLimitMonths));
};

export const isSolValid = (
  accidentDate: string | Date | null | undefined,
  sol: string | null | undefined,
): boolean => {
  const expiryDate = getSolExpiryDate(accidentDate, sol);
  if (!expiryDate) return true;

  return !isAfter(startOfDay(new Date()), expiryDate);
};

export const getSolStatus = (
  accidentDate: string | Date | null | undefined,
  sol: string | null | undefined,
): { valid: boolean; monthsRemaining?: number } => {
  const expiryDate = getSolExpiryDate(accidentDate, sol);
  if (!expiryDate) return { valid: true };

  const today = startOfDay(new Date());
  const valid = !isAfter(today, expiryDate);
  const monthsRemaining = Math.max(0, differenceInCalendarMonths(expiryDate, today));

  return { valid, monthsRemaining };
};

export const evaluateSol = (
  sol: string | null | undefined,
  accidentDate: string | Date | null | undefined,
): SolEvaluation => {
  const normalizedSol = String(sol ?? "").trim() || null;
  if (!normalizedSol) {
    return {
      ok: true,
      status: "not_configured",
      label: "No SOL configured",
      sol: null,
      expiryDate: null,
      monthsRemaining: null,
    };
  }

  const months = getSolPeriodMonths(normalizedSol);
  if (!months) {
    return {
      ok: true,
      status: "unknown",
      label: `Unknown SOL: ${normalizedSol}`,
      sol: normalizedSol,
      expiryDate: null,
      monthsRemaining: null,
    };
  }

  const accident = parseDateOnly(accidentDate);
  if (!accident) {
    return {
      ok: true,
      status: "missing_accident_date",
      label: `${months} month SOL, accident date missing`,
      sol: normalizedSol,
      expiryDate: null,
      monthsRemaining: null,
    };
  }

  const expiryDate = endOfDay(addMonths(startOfDay(accident), months));
  const today = startOfDay(new Date());
  const valid = !isAfter(today, expiryDate);
  const monthsRemaining = Math.max(0, differenceInCalendarMonths(expiryDate, today));

  return {
    ok: valid,
    status: valid ? "valid" : "expired",
    label: valid
      ? `${months} month SOL valid (${monthsRemaining} mo remaining)`
      : `${months} month SOL expired`,
    sol: normalizedSol,
    expiryDate: expiryDate.toISOString(),
    monthsRemaining,
  };
};

export const isAccidentDateWithinSol = (
  accidentDate: string | Date | null | undefined,
  sol: string | null | undefined,
): boolean => {
  const normalizedSol = normalizeSolPeriod(sol);
  if (!normalizedSol) return false;

  const expiryDate = getSolExpiryDate(accidentDate, normalizedSol);
  if (!expiryDate) return false;

  return !isAfter(startOfDay(new Date()), expiryDate);
};

export const matchesSolPeriodFilter = (
  accidentDate: string | Date | null | undefined,
  selectedSol: string,
): boolean => {
  if (!selectedSol || selectedSol === ALL_SOL_FILTER_VALUE) return true;
  return isAccidentDateWithinSol(accidentDate, selectedSol);
};
