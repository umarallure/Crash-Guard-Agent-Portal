import { subDays } from "date-fns";

export type ActivityType = "inbound" | "followup";

export type DateFilter =
  | "today"
  | "yesterday"
  | "7days"
  | "30days"
  | "alltime"
  | "custom";

export interface ScoreboardDailyRow {
  date: string | null;
  status: string | null;
  call_result: string | null;
  submitted_attorney: string | null;
  submitted_attorney_status: string | null;
}

export interface DailyBucket {
  dateKey: string;
  weekday: number;
  total: number;
  qualified: number;
  notQualified: number;
  noCoverage: number;
  submittedToAttorney: number;
  approvedAttorney: number;
  deniedAttorney: number;
  qualifiedPayable: number;
  opportunities: number;
}

export const LOST_STATUSES = new Set([
  "attorney_rejected",
  "attorney rejected",
  "returned to center - dq",
  "returned_to_center_dq",
  "returned_to_center - dq",
  "application withdrawn",
  "application_withdrawn",
  "previously sold bpo",
  "previously_sold_bpo",
  "incomplete transfer",
  "incomplete_transfer",
  "dq",
  "chargeback dq",
  "chargeback_dq",
  "gi - currently dq",
  "gi_currently_dq",
]);

export const CLOSED_DEAL_STATUSES = new Set([
  "attorney_approved",
  "qualified_payable",
  "paid_to_agency",
  "paid_to_bpo",
]);

const norm = (v: string | null | undefined) =>
  (v || "").toLowerCase().trim();

export const isQualified = (row: ScoreboardDailyRow) =>
  norm(row.call_result) === "qualified" ||
  norm(row.status).includes("qualified");

export const isNotQualified = (row: ScoreboardDailyRow) =>
  norm(row.call_result) === "not qualified" ||
  norm(row.status).includes("not_qualified");

export const isNoCoverage = (row: ScoreboardDailyRow) =>
  norm(row.submitted_attorney_status) === "nocoverage";

export const isSubmittedToAttorney = (row: ScoreboardDailyRow) =>
  Boolean(row.submitted_attorney) &&
  norm(row.submitted_attorney_status) !== "nocoverage";

/**
 * Approved encompasses the entire closed-deal pipeline: a row that has been
 * approved typically advances to qualified_payable → paid_to_agency / paid_to_bpo,
 * so all four statuses count as "approved cases."
 */
export const isApprovedAttorney = (row: ScoreboardDailyRow) =>
  CLOSED_DEAL_STATUSES.has(norm(row.status));

export const isDeniedAttorney = (row: ScoreboardDailyRow) =>
  norm(row.status) === "attorney_rejected";

export const isQualifiedPayable = (row: ScoreboardDailyRow) =>
  norm(row.status) === "qualified_payable";

/**
 * Open opportunity: the row is in motion toward a closed deal but is neither lost
 * nor already closed. Attorney-review and submitted rows are still active opportunities.
 */
export const isOpportunity = (row: ScoreboardDailyRow) => {
  const status = norm(row.status);
  if (!status) return false;
  if (LOST_STATUSES.has(status)) return false;
  if (CLOSED_DEAL_STATUSES.has(status)) return false;
  return true;
};

/** Format a Date to a YYYY-MM-DD key in America/New_York. */
export const formatNYDateKey = (date: Date): string =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);

/** Build the most recent N day-keys (NY tz), oldest → newest. */
export const lastNDayKeys = (n: number, anchor: Date = new Date()): string[] => {
  const keys: string[] = [];
  const a = new Date(anchor);
  a.setUTCHours(12, 0, 0, 0);
  for (let i = n - 1; i >= 0; i--) {
    keys.push(formatNYDateKey(subDays(a, i)));
  }
  return keys;
};

/** Day-of-week (0 = Sun) for a YYYY-MM-DD key, parsed in NY noon. */
const weekdayForKey = (key: string): number => {
  const d = new Date(`${key}T12:00:00-05:00`);
  return d.getDay();
};

/** Bucketize raw rows into per-day metrics aligned to the supplied day-keys. */
export const bucketizeByDay = (
  rows: ScoreboardDailyRow[],
  dayKeys: string[],
): DailyBucket[] => {
  const empty = (key: string): DailyBucket => ({
    dateKey: key,
    weekday: weekdayForKey(key),
    total: 0,
    qualified: 0,
    notQualified: 0,
    noCoverage: 0,
    submittedToAttorney: 0,
    approvedAttorney: 0,
    deniedAttorney: 0,
    qualifiedPayable: 0,
    opportunities: 0,
  });

  const buckets = new Map<string, DailyBucket>(
    dayKeys.map((k) => [k, empty(k)]),
  );

  for (const row of rows) {
    if (!row.date) continue;
    const bucket = buckets.get(row.date);
    if (!bucket) continue;
    bucket.total += 1;
    if (isQualified(row)) bucket.qualified += 1;
    if (isNotQualified(row)) bucket.notQualified += 1;
    if (isNoCoverage(row)) bucket.noCoverage += 1;
    if (isSubmittedToAttorney(row)) bucket.submittedToAttorney += 1;
    if (isApprovedAttorney(row)) bucket.approvedAttorney += 1;
    if (isDeniedAttorney(row)) bucket.deniedAttorney += 1;
    if (isQualifiedPayable(row)) bucket.qualifiedPayable += 1;
    if (isOpportunity(row)) bucket.opportunities += 1;
  }

  return dayKeys.map((k) => buckets.get(k)!);
};

export const sumField = <K extends keyof DailyBucket>(
  buckets: DailyBucket[],
  field: K,
): number =>
  buckets.reduce(
    (acc, b) => acc + (typeof b[field] === "number" ? (b[field] as number) : 0),
    0,
  );

export const percentChange = (current: number, previous: number): number => {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
};

export const SHORT_DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"] as const;
export const LONG_DAY_LABELS = [
  "SUN",
  "MON",
  "TUE",
  "WED",
  "THU",
  "FRI",
  "SAT",
] as const;
