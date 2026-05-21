import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  DollarSign,
  FileText,
  RefreshCw,
  Search,
  Send,
  User,
  XCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { useLicensedAgent } from "@/hooks/useLicensedAgent";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchLicensedCloserDirectory,
  type LicensedCloserDirectoryEntry,
} from "@/lib/agentOptions";
import { cn } from "@/lib/utils";
import { getPortalRoleFlags } from "@/lib/userPermissions";

type BoardKey = "submitted" | "approved" | "rejected" | "chargeback";

interface CallResultRow {
  id: string;
  submission_id: string | null;
  agent_who_took_call: string | null;
  licensed_agent_account: string | null;
  submitted_attorney: string | null;
  status: string | null;
  submission_date: string | null;
  created_at: string | null;
  updated_at: string | null;
  call_source: string | null;
}

interface LeadStatusRow {
  submission_id: string | null;
  customer_full_name: string | null;
  state: string | null;
  status: string | null;
}

interface CommissionItem {
  id: string;
  submissionId: string;
  closerUserId: string;
  closerName: string;
  leadName: string;
  state: string;
  attorney: string;
  leadStatus: string;
  boardKey: BoardKey;
  callDateKey: string;
  sortValue: number;
  commissionAmount: number;
}

type CloserDirectoryIndex = {
  byUserId: Map<string, LicensedCloserDirectoryEntry>;
  byAlias: Map<string, LicensedCloserDirectoryEntry>;
};

type AttributedCallResultRow = {
  row: CallResultRow;
  entry: LicensedCloserDirectoryEntry;
  dateKey: string;
  sortValue: number;
};

type PayCycle = {
  key: string;
  label: string;
  payoutLabel: string;
  startKey: string;
  endKey: string;
  isCurrent: boolean;
};

type CommissionCycleRows = {
  callResultRows: CallResultRow[];
  leadRows: LeadStatusRow[];
};

type CommissionTotals = {
  payable: number;
  submittedCount: number;
  submittedPotential: number;
  approvedCount: number;
  rejectedCount: number;
  rejectedMissed: number;
  chargebackCount: number;
  chargebackExposure: number;
};

type TrendPoint = {
  dayIndex: number;
  dateKey: string;
  value: number;
};

type PayableTrend = {
  current: TrendPoint[];
  previous: TrendPoint[];
  cycleLength: number;
  todayDayIndex: number | null;
};

type SupabaseListResult<T> = {
  data: T[] | null;
  error: unknown;
};

type SupabaseFilterBuilder<T> = PromiseLike<SupabaseListResult<T>> & {
  gte: (column: string, value: string) => SupabaseFilterBuilder<T>;
  lt: (column: string, value: string) => SupabaseFilterBuilder<T>;
  is: (column: string, value: null) => SupabaseFilterBuilder<T>;
  in: (column: string, values: string[]) => SupabaseFilterBuilder<T>;
};

type CommissionSupabaseClient = {
  from: <T>(table: string) => {
    select: (columns: string) => SupabaseFilterBuilder<T>;
  };
};

const REPORT_TIME_ZONE = "America/New_York";
const ALL_AGENTS_VALUE = "__all_agents__";
const RECORDS_PER_PAGE = 20;
const LEAD_STATUS_QUERY_BATCH_SIZE = 500;
const INBOUND_COMMISSION_AMOUNT = 50;
const OUTBOUND_COMMISSION_AMOUNT = 100;
const AGENT_CALLBACK_CALL_SOURCE = "agent callback";
const INCOME_CHART_WIDTH = 560;
const INCOME_CHART_HEIGHT = 160;
const INCOME_CHART_PAD_X = 24;
const INCOME_CHART_PAD_TOP = 24;
const INCOME_CHART_PAD_BOTTOM = 36;
const DONUT_RADIUS = 54;
const DONUT_STROKE = 12;
const DONUT_CIRCUMFERENCE = 2 * Math.PI * DONUT_RADIUS;
const DONUT_GAP = 4;

const APPROVED_STATUSES = new Set([
  "attorney_approved",
  "qualified_payable",
  "paid_to_agency",
  "paid_to_bpo",
]);

const CHARGEBACK_STATUSES = new Set([
  "chargeback",
  "chargeback_dq",
  "chargeback dq",
  "attorney_chargeback",
]);

const BOARD_DEFINITIONS: Array<{
  key: BoardKey;
  title: string;
  tone: "blue" | "green" | "rose" | "amber";
  icon: typeof Send;
}> = [
  {
    key: "submitted",
    title: "Submitted to Attorney",
    tone: "blue",
    icon: Send,
  },
  {
    key: "approved",
    title: "Approved by Attorney",
    tone: "green",
    icon: CheckCircle2,
  },
  {
    key: "rejected",
    title: "Rejected by Attorney",
    tone: "rose",
    icon: XCircle,
  },
  {
    key: "chargeback",
    title: "Chargeback",
    tone: "amber",
    icon: AlertTriangle,
  },
];

const normalizeText = (value: string | null | undefined) =>
  String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);

const formatDateKeyInTimeZone = (date: Date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: REPORT_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);

const getTimestampDateKey = (value: string | null | undefined) => {
  if (!value) return "";

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";

  return formatDateKeyInTimeZone(parsed);
};

const getCallResultDateKey = (row: CallResultRow) =>
  getTimestampDateKey(row.updated_at || row.created_at || row.submission_date);

const getRowSortValue = (row: CallResultRow, dateKey: string) => {
  const timestampCandidates = [row.updated_at, row.created_at];

  for (const value of timestampCandidates) {
    if (!value) continue;

    const parsedValue = new Date(value).getTime();
    if (!Number.isNaN(parsedValue)) {
      return parsedValue;
    }
  }

  if (!dateKey) return 0;
  return new Date(`${dateKey}T12:00:00Z`).getTime();
};

const isDateKeyInRange = (dateKey: string, startKey: string, endKey: string) =>
  Boolean(dateKey) && dateKey >= startKey && dateKey <= endKey;

const getApproxTimestampRange = (startKey: string, endKey: string) => {
  const start = new Date(`${startKey}T12:00:00Z`);
  start.setUTCDate(start.getUTCDate() - 1);

  const endExclusive = new Date(`${endKey}T12:00:00Z`);
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 2);

  return {
    startIso: start.toISOString(),
    endIso: endExclusive.toISOString(),
  };
};

const isInboundCommissionCall = (row: CallResultRow) =>
  normalizeText(row.call_source) !== AGENT_CALLBACK_CALL_SOURCE;

const getCommissionAmountForCall = (row: CallResultRow) =>
  isInboundCommissionCall(row) ? INBOUND_COMMISSION_AMOUNT : OUTBOUND_COMMISSION_AMOUNT;

const getBoardKeyForLeadStatus = (value: string | null | undefined): BoardKey | null => {
  const status = normalizeText(value);
  if (status === "attorney_review") return "submitted";
  if (APPROVED_STATUSES.has(status)) return "approved";
  if (status === "attorney_rejected") return "rejected";
  if (CHARGEBACK_STATUSES.has(status)) return "chargeback";
  return null;
};

const buildCloserDirectoryIndex = (
  directory: LicensedCloserDirectoryEntry[],
): CloserDirectoryIndex => {
  const byUserId = new Map<string, LicensedCloserDirectoryEntry>();
  const byAlias = new Map<string, LicensedCloserDirectoryEntry>();

  directory.forEach((entry) => {
    byUserId.set(entry.userId, entry);
    entry.aliases.forEach((alias) => {
      if (!byAlias.has(alias)) {
        byAlias.set(alias, entry);
      }
    });
  });

  return { byUserId, byAlias };
};

const resolveCloserEntry = (
  index: CloserDirectoryIndex,
  options: {
    userId?: string | null;
    names?: Array<string | null | undefined>;
  },
) => {
  const normalizedUserId = String(options.userId || "").trim();
  if (normalizedUserId && index.byUserId.has(normalizedUserId)) {
    return index.byUserId.get(normalizedUserId) ?? null;
  }

  for (const value of options.names || []) {
    const normalizedName = normalizeText(value);
    if (!normalizedName) continue;

    if (index.byAlias.has(normalizedName)) {
      return index.byAlias.get(normalizedName) ?? null;
    }
  }

  return null;
};

const getCycleBounds = (cycleKey: string) => {
  const [yearRaw, monthRaw] = cycleKey.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);

  let startYear = year;
  let startMonth = month - 1;
  if (startMonth === 0) {
    startMonth = 12;
    startYear -= 1;
  }

  return {
    startKey: `${startYear}-${String(startMonth).padStart(2, "0")}-15`,
    endKey: `${yearRaw}-${monthRaw}-14`,
  };
};

const getCurrentCycleKey = () => {
  const todayKey = formatDateKeyInTimeZone(new Date());
  const [year, month, day] = todayKey.split("-").map(Number);

  let cycleYear = year;
  let cycleMonth = month;
  if (day >= 15) {
    cycleMonth += 1;
    if (cycleMonth > 12) {
      cycleMonth = 1;
      cycleYear += 1;
    }
  }

  return `${cycleYear}-${String(cycleMonth).padStart(2, "0")}`;
};

const formatCycleLabel = (cycleKey: string) => {
  const [yearRaw, monthRaw] = cycleKey.split("-");
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(Number(yearRaw), Number(monthRaw) - 1, 1)));
};

const getPayoutLabel = (cycleKey: string) => {
  const [yearRaw, monthRaw] = cycleKey.split("-");
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(Number(yearRaw), Number(monthRaw) - 1, 15)));
};

const getCycleDayCount = (cycle: PayCycle | null): number => {
  if (!cycle) return 0;
  const start = new Date(`${cycle.startKey}T12:00:00Z`).getTime();
  const end = new Date(`${cycle.endKey}T12:00:00Z`).getTime();
  return Math.round((end - start) / 86_400_000) + 1;
};

const buildPayCycles = (): PayCycle[] => {
  const currentKey = getCurrentCycleKey();
  const cycles: PayCycle[] = [];
  let [year, month] = currentKey.split("-").map(Number);

  while (year > 2020 || (year === 2020 && month >= 1)) {
    const key = `${year}-${String(month).padStart(2, "0")}`;
    const { startKey, endKey } = getCycleBounds(key);

    cycles.push({
      key,
      label: `${formatCycleLabel(key)} Pay Cycle`,
      payoutLabel: getPayoutLabel(key),
      startKey,
      endKey,
      isCurrent: key === currentKey,
    });

    month -= 1;
    if (month === 0) {
      month = 12;
      year -= 1;
    }
  }

  return cycles;
};

const formatDateLabel = (dateKey: string) => {
  if (!dateKey) return "-";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${dateKey}T12:00:00Z`));
};

const chunkArray = <T,>(items: T[], size: number) => {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
};

const fetchCallResultRows = async (
  startKey: string,
  endKey: string,
): Promise<CallResultRow[]> => {
  const { startIso, endIso } = getApproxTimestampRange(startKey, endKey);
  const selection =
    "id, submission_id, agent_who_took_call, licensed_agent_account, submitted_attorney, status, submission_date, created_at, updated_at, call_source";
  const commissionSupabase = supabase as unknown as CommissionSupabaseClient;

  const [updatedResults, createdResults] = await Promise.all([
    commissionSupabase
      .from<CallResultRow>("call_results")
      .select(selection)
      .gte("updated_at", startIso)
      .lt("updated_at", endIso),
    commissionSupabase
      .from<CallResultRow>("call_results")
      .select(selection)
      .is("updated_at", null)
      .gte("created_at", startIso)
      .lt("created_at", endIso),
  ]);

  if (updatedResults.error) {
    throw updatedResults.error;
  }

  if (createdResults.error) {
    throw createdResults.error;
  }

  const deduped = new Map<string, CallResultRow>();

  [...(updatedResults.data || []), ...(createdResults.data || [])]
    .filter(Boolean)
    .forEach((row) => {
      const typedRow = row as CallResultRow;
      const dateKey = getCallResultDateKey(typedRow);

      if (!isDateKeyInRange(dateKey, startKey, endKey)) return;
      if (!isInboundCommissionCall(typedRow)) return;

      deduped.set(typedRow.id, typedRow);
    });

  return Array.from(deduped.values());
};

const fetchLeadRows = async (submissionIds: string[]): Promise<LeadStatusRow[]> => {
  const uniqueSubmissionIds = Array.from(
    new Set(submissionIds.map((id) => id.trim()).filter(Boolean)),
  );

  if (uniqueSubmissionIds.length === 0) return [];
  const commissionSupabase = supabase as unknown as CommissionSupabaseClient;

  const results = await Promise.all(
    chunkArray(uniqueSubmissionIds, LEAD_STATUS_QUERY_BATCH_SIZE).map((batch) =>
      commissionSupabase
        .from<LeadStatusRow>("leads")
        .select("submission_id, customer_full_name, state, status")
        .in("submission_id", batch),
    ),
  );

  const rows: LeadStatusRow[] = [];

  results.forEach((result) => {
    if (result.error) {
      throw result.error;
    }

    rows.push(...((result.data || []) as LeadStatusRow[]));
  });

  return rows;
};

const fetchCommissionCycleRows = async (cycle: PayCycle | null): Promise<CommissionCycleRows> => {
  if (!cycle) {
    return { callResultRows: [], leadRows: [] };
  }

  const callResultRows = await fetchCallResultRows(cycle.startKey, cycle.endKey);
  const submissionIds = callResultRows
    .map((row) => row.submission_id)
    .filter((id): id is string => Boolean(id));
  const leadRows = await fetchLeadRows(submissionIds);

  return { callResultRows, leadRows };
};

const shiftDateKey = (dateKey: string, days: number) => {
  const date = new Date(`${dateKey}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const getPercentChange = (current: number, previous: number) => {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
};

const buildLeadStatusMap = (leadRows: LeadStatusRow[]) => {
  const rows = new Map<string, LeadStatusRow>();

  leadRows.forEach((row) => {
    const submissionId = String(row.submission_id || "").trim();
    if (!submissionId) return;
    rows.set(submissionId, row);
  });

  return rows;
};

const buildCommissionItemsForCycle = ({
  callResultRows,
  closerDirectoryIndex,
  cycle,
  leadBySubmissionId,
}: {
  callResultRows: CallResultRow[];
  closerDirectoryIndex: CloserDirectoryIndex;
  cycle: PayCycle | null;
  leadBySubmissionId: Map<string, LeadStatusRow>;
}) => {
  const grouped = new Map<string, AttributedCallResultRow[]>();

  callResultRows.forEach((row) => {
    const submissionId = String(row.submission_id || "").trim();
    if (!submissionId) return;
    if (!isInboundCommissionCall(row)) return;

    const entry = resolveCloserEntry(closerDirectoryIndex, {
      names: [row.agent_who_took_call, row.licensed_agent_account],
    });
    if (!entry) return;

    const dateKey = getCallResultDateKey(row);
    if (!dateKey || !cycle) return;
    if (!isDateKeyInRange(dateKey, cycle.startKey, cycle.endKey)) return;

    const existing = grouped.get(submissionId) || [];
    existing.push({
      row,
      entry,
      dateKey,
      sortValue: getRowSortValue(row, dateKey),
    });
    grouped.set(submissionId, existing);
  });

  return Array.from(grouped.entries())
    .map(([submissionId, rows]) => {
      const sortedRows = [...rows].sort((left, right) => right.sortValue - left.sortValue);
      const latest = sortedRows[0];
      const lead = leadBySubmissionId.get(submissionId);
      const boardKey = getBoardKeyForLeadStatus(lead?.status);

      if (!latest || !lead || !boardKey) return null;

      return {
        id: `${submissionId}-${latest.row.id}`,
        submissionId,
        closerUserId: latest.entry.userId,
        closerName: latest.entry.label,
        leadName: lead.customer_full_name || "Unknown lead",
        state: lead.state || "-",
        attorney: latest.row.submitted_attorney || "Unassigned",
        leadStatus: lead.status || "",
        boardKey,
        callDateKey: latest.dateKey,
        sortValue: latest.sortValue,
        commissionAmount: getCommissionAmountForCall(latest.row),
      } satisfies CommissionItem;
    })
    .filter((item): item is CommissionItem => Boolean(item))
    .sort((left, right) => right.sortValue - left.sortValue);
};

const calculateCommissionTotals = (items: CommissionItem[]): CommissionTotals => {
  const submitted = items.filter((item) => item.boardKey === "submitted");
  const approved = items.filter((item) => item.boardKey === "approved");
  const rejected = items.filter((item) => item.boardKey === "rejected");
  const chargeback = items.filter((item) => item.boardKey === "chargeback");

  return {
    payable: approved.reduce((total, item) => total + item.commissionAmount, 0),
    submittedCount: submitted.length,
    submittedPotential: submitted.reduce((total, item) => total + item.commissionAmount, 0),
    approvedCount: approved.length,
    rejectedCount: rejected.length,
    rejectedMissed: rejected.reduce((total, item) => total + item.commissionAmount, 0),
    chargebackCount: chargeback.length,
    chargebackExposure: chargeback.reduce((total, item) => total + item.commissionAmount, 0),
  };
};

const buildCyclePayableSeries = (
  items: CommissionItem[],
  cycle: PayCycle | null,
  untilDateKey?: string,
): TrendPoint[] => {
  if (!cycle) return [];

  const lastDateKey = untilDateKey && untilDateKey < cycle.endKey ? untilDateKey : cycle.endKey;
  const amountByDate = new Map<string, number>();

  items
    .filter((item) => item.boardKey === "approved")
    .forEach((item) => {
      amountByDate.set(
        item.callDateKey,
        (amountByDate.get(item.callDateKey) || 0) + item.commissionAmount,
      );
    });

  const points: TrendPoint[] = [];
  let cursor = cycle.startKey;
  let dayIndex = 0;
  let runningTotal = 0;

  while (cursor <= lastDateKey && cursor <= cycle.endKey) {
    runningTotal += amountByDate.get(cursor) || 0;

    points.push({
      dayIndex,
      dateKey: cursor,
      value: runningTotal,
    });
    cursor = shiftDateKey(cursor, 1);
    dayIndex += 1;
  }

  return points;
};

const buildPayableTrend = ({
  currentCycle,
  currentItems,
  previousCycle,
  previousItems,
}: {
  currentCycle: PayCycle | null;
  currentItems: CommissionItem[];
  previousCycle: PayCycle | null;
  previousItems: CommissionItem[];
}): PayableTrend => {
  const todayKey = formatDateKeyInTimeZone(new Date());
  const currentUntil = currentCycle?.isCurrent ? todayKey : undefined;

  const current = buildCyclePayableSeries(currentItems, currentCycle, currentUntil);
  const previous = buildCyclePayableSeries(previousItems, previousCycle);

  const cycleLength = Math.max(
    getCycleDayCount(currentCycle),
    getCycleDayCount(previousCycle),
    1,
  );

  const todayDayIndex =
    currentCycle?.isCurrent && current.length > 0
      ? current[current.length - 1].dayIndex
      : null;

  return { current, previous, cycleLength, todayDayIndex };
};

const buildSmoothPath = (points: Array<{ x: number; y: number }>) => {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  const path: string[] = [`M ${points[0].x} ${points[0].y}`];

  for (let index = 0; index < points.length - 1; index += 1) {
    const p0 = points[index - 1] || points[index];
    const p1 = points[index];
    const p2 = points[index + 1];
    const p3 = points[index + 2] || p2;
    const tension = 0.18;
    const c1x = p1.x + (p2.x - p0.x) * tension;
    const c1y = p1.y + (p2.y - p0.y) * tension;
    const c2x = p2.x - (p3.x - p1.x) * tension;
    const c2y = p2.y - (p3.y - p1.y) * tension;
    path.push(`C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`);
  }

  return path.join(" ");
};

const toneClass = (tone: "blue" | "green" | "rose" | "amber") => {
  switch (tone) {
    case "blue":
      return {
        border: "border-primary/40",
        text: "text-primary",
        bg: "bg-primary/20",
        header: "bg-white/[0.025]",
      };
    case "green":
      return {
        border: "border-emerald-900/60",
        text: "text-emerald-300",
        bg: "bg-emerald-950/40",
        header: "bg-white/[0.025]",
      };
    case "rose":
      return {
        border: "border-red-900/50",
        text: "text-red-300",
        bg: "bg-red-950/40",
        header: "bg-white/[0.025]",
      };
    case "amber":
      return {
        border: "border-white/20",
        text: "text-slate-300",
        bg: "bg-white/[0.07]",
        header: "bg-white/[0.025]",
      };
  }
};

const boardAccentClass = (boardKey: BoardKey) => {
  switch (boardKey) {
    case "submitted":
      return "bg-primary";
    case "approved":
      return "bg-emerald-800";
    case "rejected":
      return "bg-red-900";
    case "chargeback":
      return "bg-slate-500";
  }
};

const boardCardHoverClass = (boardKey: BoardKey) => {
  switch (boardKey) {
    case "submitted":
      return "hover:border-primary/50 hover:bg-primary/20 hover:shadow-[0_24px_54px_-34px_rgba(234,117,38,0.68)]";
    case "approved":
      return "hover:border-emerald-900/70 hover:bg-emerald-950/40 hover:shadow-[0_24px_54px_-34px_rgba(6,78,59,0.70)]";
    case "rejected":
      return "hover:border-red-900/60 hover:bg-red-950/40 hover:shadow-[0_24px_54px_-34px_rgba(127,29,29,0.70)]";
    case "chargeback":
      return "hover:border-white/25 hover:bg-white/[0.08] hover:shadow-[0_24px_54px_-34px_rgba(148,163,184,0.40)]";
  }
};

const boardPillClass = (boardKey: BoardKey) => {
  switch (boardKey) {
    case "submitted":
      return "border-primary/40 bg-primary/20 text-primary";
    case "approved":
      return "border-emerald-900/60 bg-emerald-950/40 text-emerald-200";
    case "rejected":
      return "border-red-900/50 bg-red-950/40 text-red-200";
    case "chargeback":
      return "border-white/20 bg-white/[0.06] text-slate-200";
  }
};

const statusBadgeClass = (boardKey: BoardKey) => {
  switch (boardKey) {
    case "submitted":
      return "border-primary/40 bg-primary/20 text-primary";
    case "approved":
      return "border-emerald-900/60 bg-emerald-950/40 text-emerald-200";
    case "rejected":
      return "border-red-900/50 bg-red-950/40 text-red-200";
    case "chargeback":
      return "border-white/20 bg-white/[0.06] text-slate-200";
  }
};

const getBoardLabel = (boardKey: BoardKey) =>
  BOARD_DEFINITIONS.find((board) => board.key === boardKey)?.title ?? boardKey;

const getBoardAmount = (items: CommissionItem[], boardKey: BoardKey) => {
  if (boardKey === "approved") {
    return items.reduce((total, item) => total + item.commissionAmount, 0);
  }

  if (boardKey === "submitted") {
    return items.reduce((total, item) => total + item.commissionAmount, 0);
  }

  if (boardKey === "chargeback") {
    return -items.reduce((total, item) => total + item.commissionAmount, 0);
  }

  return 0;
};

const CommissionIncomeCard = ({
  currentPayable,
  loading,
  previousPayable,
  selectedCycleLabel,
  trend,
}: {
  currentPayable: number;
  loading: boolean;
  previousPayable: number;
  selectedCycleLabel: string;
  trend: PayableTrend;
}) => {
  const [hoverDayIndex, setHoverDayIndex] = useState<number | null>(null);
  const change = getPercentChange(currentPayable, previousPayable);
  const isPositive = change >= 0;

  const maxValue = useMemo(
    () =>
      Math.max(
        1,
        ...trend.current.map((point) => point.value),
        ...trend.previous.map((point) => point.value),
      ),
    [trend],
  );

  const innerWidth = INCOME_CHART_WIDTH - INCOME_CHART_PAD_X * 2;
  const innerHeight = INCOME_CHART_HEIGHT - INCOME_CHART_PAD_TOP - INCOME_CHART_PAD_BOTTOM;
  const baseY = INCOME_CHART_HEIGHT - INCOME_CHART_PAD_BOTTOM;
  const stepX = trend.cycleLength > 1 ? innerWidth / (trend.cycleLength - 1) : 0;

  const projectPoint = useCallback(
    (point: TrendPoint) => {
      const ratio = point.value / maxValue;
      return {
        ...point,
        x: INCOME_CHART_PAD_X + stepX * point.dayIndex,
        y: INCOME_CHART_PAD_TOP + innerHeight - ratio * innerHeight,
      };
    },
    [innerHeight, maxValue, stepX],
  );

  const currentPoints = useMemo(
    () => trend.current.map(projectPoint),
    [projectPoint, trend],
  );
  const previousPoints = useMemo(
    () => trend.previous.map(projectPoint),
    [projectPoint, trend],
  );

  const currentLinePath = useMemo(
    () => buildSmoothPath(currentPoints.map(({ x, y }) => ({ x, y }))),
    [currentPoints],
  );
  const previousLinePath = useMemo(
    () => buildSmoothPath(previousPoints.map(({ x, y }) => ({ x, y }))),
    [previousPoints],
  );

  const currentAreaPath = useMemo(() => {
    if (!currentLinePath || currentPoints.length === 0) return "";
    const first = currentPoints[0];
    const last = currentPoints[currentPoints.length - 1];
    return `${currentLinePath} L ${last.x} ${baseY} L ${first.x} ${baseY} Z`;
  }, [baseY, currentLinePath, currentPoints]);

  const todayPoint =
    trend.todayDayIndex !== null && currentPoints.length > 0
      ? currentPoints[currentPoints.length - 1]
      : null;

  const hoverCurrent =
    hoverDayIndex !== null
      ? currentPoints.find((point) => point.dayIndex === hoverDayIndex) ?? null
      : null;
  const hoverPrevious =
    hoverDayIndex !== null
      ? previousPoints.find((point) => point.dayIndex === hoverDayIndex) ?? null
      : null;
  const hoverX = hoverCurrent?.x ?? hoverPrevious?.x ?? null;
  const hoverTopY = Math.min(
    hoverCurrent?.y ?? Number.POSITIVE_INFINITY,
    hoverPrevious?.y ?? Number.POSITIVE_INFINITY,
  );
  const hoverDelta =
    hoverCurrent && hoverPrevious ? hoverCurrent.value - hoverPrevious.value : null;

  const labelEvery = Math.max(1, Math.ceil(trend.cycleLength / 6));

  return (
    <div className="group relative flex h-full min-h-[220px] flex-1 overflow-hidden rounded-2xl border border-primary/20 bg-zinc-900/60 p-5 shadow-xl shadow-black/30 backdrop-blur-xl transition-colors hover:border-primary/50 lg:min-h-0">
      <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-primary/20 opacity-70 blur-3xl" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/25 to-transparent" />

      <div className="relative grid h-full flex-1 gap-5 sm:grid-cols-[minmax(0,0.9fr)_minmax(220px,1.1fr)] sm:items-end">
        <div className="min-w-0">
          <p className="text-sm font-medium text-white/60">Commission earned</p>
          <p className="mt-2 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
            {loading ? "-" : formatCurrency(currentPayable)}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-semibold tabular-nums",
                isPositive
                  ? "border-primary/30 bg-primary/20 text-primary"
                  : "border-rose-500/30 bg-rose-500/10 text-rose-300",
              )}
            >
              {isPositive ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
              {isPositive ? "+" : ""}
              {change.toFixed(1)}%
            </span>
            <span className="text-sm text-white/50">vs last cycle</span>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-white/40">
            <span>{selectedCycleLabel}</span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-1.5 w-3 rounded-sm bg-primary" />
              This cycle
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-px w-3 border-t border-dashed border-white/50" />
              Last cycle
            </span>
          </div>
        </div>

        <div className="relative w-full">
          <svg
            viewBox={`0 0 ${INCOME_CHART_WIDTH} ${INCOME_CHART_HEIGHT}`}
            preserveAspectRatio="none"
            className="h-28 w-full"
            aria-hidden="true"
            onMouseLeave={() => setHoverDayIndex(null)}
          >
            <defs>
              <linearGradient id="commission-earned-area" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.45" />
                <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
              </linearGradient>
            </defs>

            {previousLinePath && (
              <path
                d={previousLinePath}
                fill="none"
                stroke="hsl(0 0% 100% / 0.45)"
                strokeWidth={1.5}
                strokeDasharray="4 4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {currentAreaPath && <path d={currentAreaPath} fill="url(#commission-earned-area)" />}
            {currentLinePath && (
              <path
                d={currentLinePath}
                fill="none"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {todayPoint && (
              <circle
                cx={todayPoint.x}
                cy={todayPoint.y}
                r={3.5}
                fill="hsl(var(--primary))"
                stroke="hsl(var(--primary))"
                strokeWidth={1.5}
                style={{ filter: "drop-shadow(0 0 6px hsl(var(--primary)))" }}
              />
            )}

            {Array.from({ length: trend.cycleLength }).map((_, dayIndex) => {
              const x = INCOME_CHART_PAD_X + stepX * dayIndex;
              const rectWidth = stepX || innerWidth;
              return (
                <rect
                  key={`hit-${dayIndex}`}
                  x={x - rectWidth / 2}
                  y={0}
                  width={rectWidth}
                  height={baseY}
                  fill="transparent"
                  onMouseEnter={() => setHoverDayIndex(dayIndex)}
                  style={{ cursor: "pointer" }}
                />
              );
            })}

            {hoverX !== null && (
              <g>
                <line
                  x1={hoverX}
                  x2={hoverX}
                  y1={INCOME_CHART_PAD_TOP}
                  y2={baseY}
                  strokeDasharray="3 3"
                  strokeWidth={1}
                  className="stroke-white/30"
                />
                {hoverPrevious && (
                  <circle
                    cx={hoverPrevious.x}
                    cy={hoverPrevious.y}
                    r={3.5}
                    fill="hsl(0 0% 100% / 0.65)"
                    stroke="hsl(0 0% 100% / 0.85)"
                    strokeWidth={1.5}
                  />
                )}
                {hoverCurrent && (
                  <circle
                    cx={hoverCurrent.x}
                    cy={hoverCurrent.y}
                    r={4.5}
                    fill="hsl(var(--primary))"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    style={{ filter: "drop-shadow(0 0 6px hsl(var(--primary)))" }}
                  />
                )}
              </g>
            )}

            {Array.from({ length: trend.cycleLength }).map((_, dayIndex) => {
              const isLast = dayIndex === trend.cycleLength - 1;
              const shouldShow = dayIndex === 0 || isLast || dayIndex % labelEvery === 0;
              if (!shouldShow) return null;

              const referencePoint =
                trend.current.find((point) => point.dayIndex === dayIndex) ??
                trend.previous.find((point) => point.dayIndex === dayIndex);
              const dateLabel = referencePoint
                ? new Intl.DateTimeFormat("en-US", {
                    month: "short",
                    day: "numeric",
                    timeZone: "UTC",
                  }).format(new Date(`${referencePoint.dateKey}T12:00:00Z`))
                : `Day ${dayIndex + 1}`;

              const x = INCOME_CHART_PAD_X + stepX * dayIndex;
              return (
                <text
                  key={`label-${dayIndex}`}
                  x={x}
                  y={INCOME_CHART_HEIGHT - 12}
                  textAnchor="middle"
                  fontSize="11"
                  className="fill-white/40"
                >
                  {dateLabel}
                </text>
              );
            })}
          </svg>

          {hoverX !== null && (hoverCurrent || hoverPrevious) && (
            <div
              className="pointer-events-none absolute -translate-x-1/2 -translate-y-[calc(100%+8px)] whitespace-nowrap rounded-md border border-white/10 bg-zinc-950/95 px-2.5 py-1.5 text-[11px] font-medium text-white shadow-lg backdrop-blur"
              style={{
                left: `${(hoverX / INCOME_CHART_WIDTH) * 100}%`,
                top: `${(hoverTopY / INCOME_CHART_HEIGHT) * 100}%`,
              }}
            >
              <div className="text-[10px] uppercase tracking-wider text-white/40">
                Day {(hoverDayIndex ?? 0) + 1}
              </div>
              <div className="mt-1 flex items-center gap-2">
                <span className="inline-block h-1.5 w-3 shrink-0 rounded-sm bg-primary" />
                <span className="tabular-nums">
                  {hoverCurrent ? formatCurrency(hoverCurrent.value) : "—"}
                </span>
                {hoverCurrent && (
                  <span className="text-[10px] text-white/40">
                    {formatDateLabel(hoverCurrent.dateKey)}
                  </span>
                )}
              </div>
              {hoverPrevious && (
                <div className="mt-0.5 flex items-center gap-2">
                  <span className="inline-block h-px w-3 shrink-0 border-t border-dashed border-white/60" />
                  <span className="tabular-nums text-white/70">
                    {formatCurrency(hoverPrevious.value)}
                  </span>
                  <span className="text-[10px] text-white/40">
                    {formatDateLabel(hoverPrevious.dateKey)}
                  </span>
                </div>
              )}
              {hoverDelta !== null && (
                <div
                  className={cn(
                    "mt-1 text-[10px] font-semibold tabular-nums",
                    hoverDelta >= 0 ? "text-primary" : "text-rose-300",
                  )}
                >
                  {hoverDelta >= 0 ? "+" : "-"}
                  {formatCurrency(Math.abs(hoverDelta))} vs last cycle
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const StatusMetric = ({
  amount,
  amountLabel,
  count,
  detail,
  label,
  swatchClass,
}: {
  amount?: number;
  amountLabel?: string;
  count: number;
  detail?: string;
  label: string;
  swatchClass: string;
}) => (
  <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3">
    <div className="flex items-start gap-3">
      <span className={cn("mt-1 h-10 w-1 rounded-full", swatchClass)} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <p className="truncate text-sm font-medium text-white/75">{label}</p>
          <p className="text-lg font-semibold tabular-nums text-white">{count}</p>
        </div>
        {detail ? (
          <p className="mt-1 text-xs text-white/40">{detail}</p>
        ) : amount !== undefined && amountLabel ? (
          <p className="mt-1 text-xs text-white/40">
            {formatCurrency(amount)} {amountLabel}
          </p>
        ) : (
          <p className="mt-1 text-xs text-white/30">No value recorded</p>
        )}
      </div>
    </div>
  </div>
);

const CommissionStatusMixCard = ({
  loading,
  totals,
}: {
  loading: boolean;
  totals: CommissionTotals;
}) => {
  const totalRecords =
    totals.submittedCount + totals.approvedCount + totals.rejectedCount + totals.chargebackCount;
  const approvedRate = totalRecords > 0 ? (totals.approvedCount / totalRecords) * 100 : 0;

  const segments = [
    {
      key: "submitted",
      value: totals.submittedCount,
      stroke: "stroke-[hsl(var(--primary))]",
    },
    {
      key: "approved",
      value: totals.approvedCount,
      stroke: "stroke-emerald-800",
    },
    {
      key: "rejected",
      value: totals.rejectedCount,
      stroke: "stroke-red-900",
    },
    {
      key: "chargeback",
      value: totals.chargebackCount,
      stroke: "stroke-white/30",
    },
  ];

  let rotation = -90;
  const arcs = segments.map((segment) => {
    const arcLengthDeg = totalRecords > 0 ? (segment.value / totalRecords) * 360 : 0;
    const length = totalRecords > 0 ? (DONUT_CIRCUMFERENCE * arcLengthDeg) / 360 - DONUT_GAP : 0;
    const nextArc = {
      ...segment,
      length: Math.max(0, length),
      rotation,
    };
    rotation += arcLengthDeg;
    return nextArc;
  });

  return (
    <div className="group relative h-full min-h-[300px] overflow-hidden rounded-2xl border border-primary/20 bg-zinc-900/60 p-5 shadow-xl shadow-black/30 backdrop-blur-xl transition-colors hover:border-primary/50 lg:min-h-0">
      <div className="pointer-events-none absolute -bottom-16 -left-16 h-48 w-48 rounded-full bg-primary/10 opacity-70 blur-3xl" />

      <div className="relative flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-white">Attorney Status</h2>
        </div>
        <Badge className="border-white/10 bg-white/[0.05] text-white/70 hover:bg-white/[0.05]">
          {totalRecords} records
        </Badge>
      </div>

      <div className="relative mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_150px_minmax(0,1fr)] lg:items-center">
        <div className="space-y-3">
          <StatusMetric
            amount={totals.submittedPotential}
            amountLabel="pending"
            count={totals.submittedCount}
            label="Submitted"
            swatchClass="bg-primary"
          />
          <StatusMetric
            amount={totals.payable}
            amountLabel="payable"
            count={totals.approvedCount}
            label="Approved"
            swatchClass="bg-emerald-800"
          />
        </div>

        <div className="mx-auto flex h-36 w-36 items-center justify-center">
          <div className="relative h-36 w-36">
            <svg viewBox="0 0 140 140" className="h-full w-full" aria-hidden="true">
              <circle
                cx="70"
                cy="70"
                r={DONUT_RADIUS}
                fill="none"
                strokeWidth={DONUT_STROKE}
                className="stroke-white/[0.07]"
              />
              {arcs.filter((arc) => arc.value > 0 && arc.length > 0).map((arc) => (
                <circle
                  key={arc.key}
                  cx="70"
                  cy="70"
                  r={DONUT_RADIUS}
                  fill="none"
                  strokeWidth={DONUT_STROKE}
                  strokeLinecap="round"
                  className={cn(arc.stroke, "transition-[stroke-dasharray] duration-300")}
                  strokeDasharray={`${arc.length} ${DONUT_CIRCUMFERENCE}`}
                  transform={`rotate(${arc.rotation} 70 70)`}
                />
              ))}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-semibold tabular-nums text-white">
                {loading ? "-" : `${approvedRate.toFixed(0)}%`}
              </span>
              <span className="text-[10px] uppercase tracking-wider text-white/40">
                Approved
              </span>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <StatusMetric
            detail={`${formatCurrency(totals.rejectedMissed)} not converted`}
            count={totals.rejectedCount}
            label="Rejected"
            swatchClass="bg-red-900"
          />
          <StatusMetric
            amount={totals.chargebackExposure}
            amountLabel="exposure"
            count={totals.chargebackCount}
            label="Chargeback"
            swatchClass="bg-slate-500"
          />
        </div>
      </div>
    </div>
  );
};

const CommissionPortal = () => {
  const { user, loading: authLoading } = useAuth();
  const { isLicensedAgent, loading: licensedLoading } = useLicensedAgent();
  const navigate = useNavigate();
  const { toast } = useToast();

  const payCycles = useMemo(() => buildPayCycles(), []);
  const currentCycleKey = payCycles[0]?.key ?? getCurrentCycleKey();

  const [selectedCycleKey, setSelectedCycleKey] = useState(currentCycleKey);
  const [selectedAgentUserId, setSelectedAgentUserId] = useState(ALL_AGENTS_VALUE);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const [accessChecked, setAccessChecked] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState(false);

  const [closerDirectory, setCloserDirectory] = useState<LicensedCloserDirectoryEntry[]>([]);
  const [callResultRows, setCallResultRows] = useState<CallResultRow[]>([]);
  const [leadRows, setLeadRows] = useState<LeadStatusRow[]>([]);
  const [previousCallResultRows, setPreviousCallResultRows] = useState<CallResultRow[]>([]);
  const [previousLeadRows, setPreviousLeadRows] = useState<LeadStatusRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const selectedCycle = useMemo(
    () => payCycles.find((cycle) => cycle.key === selectedCycleKey) ?? payCycles[0],
    [payCycles, selectedCycleKey],
  );
  const previousCycle = useMemo(() => {
    const selectedIndex = payCycles.findIndex((cycle) => cycle.key === selectedCycleKey);
    return selectedIndex >= 0 ? payCycles[selectedIndex + 1] ?? null : null;
  }, [payCycles, selectedCycleKey]);

  const isCurrentCycle = selectedCycle?.isCurrent ?? selectedCycleKey === currentCycleKey;

  useEffect(() => {
    if (authLoading || licensedLoading) return;

    const checkAccess = async () => {
      if (!user) {
        navigate("/auth");
        return;
      }

      const roleFlags = await getPortalRoleFlags(user.id);
      const nextIsSuperAdmin = roleFlags.isSuperAdmin;
      const nextAuthorized = nextIsSuperAdmin || isLicensedAgent;

      setIsSuperAdmin(nextIsSuperAdmin);
      setIsAuthorized(nextAuthorized);
      setAccessChecked(true);

      if (!nextAuthorized) {
        toast({
          title: "Access denied",
          description: "Commission data is available to licensed agents and super admins.",
          variant: "destructive",
        });
        navigate("/leads", { replace: true });
      }
    };

    checkAccess();
  }, [authLoading, isLicensedAgent, licensedLoading, navigate, toast, user]);

  useEffect(() => {
    if (!isSuperAdmin && user?.id) {
      setSelectedAgentUserId(user.id);
    } else if (isSuperAdmin) {
      setSelectedAgentUserId(ALL_AGENTS_VALUE);
    }
  }, [isSuperAdmin, user?.id]);

  const fetchData = useCallback(async () => {
    if (!accessChecked || !isAuthorized || !selectedCycle) return;

    setRefreshing(true);

    try {
      const [directoryResult, currentCycleResult, previousCycleResult] = await Promise.allSettled([
        fetchLicensedCloserDirectory(),
        fetchCommissionCycleRows(selectedCycle),
        fetchCommissionCycleRows(previousCycle),
      ]);

      const errors: string[] = [];

      if (directoryResult.status === "fulfilled") {
        setCloserDirectory(directoryResult.value);
      } else {
        setCloserDirectory([]);
        errors.push("active closer roster");
      }

      if (currentCycleResult.status === "fulfilled") {
        setCallResultRows(currentCycleResult.value.callResultRows);
        setLeadRows(currentCycleResult.value.leadRows);
      } else {
        setCallResultRows([]);
        setLeadRows([]);
        errors.push("current pay cycle");
      }

      if (previousCycleResult.status === "fulfilled") {
        setPreviousCallResultRows(previousCycleResult.value.callResultRows);
        setPreviousLeadRows(previousCycleResult.value.leadRows);
      } else {
        setPreviousCallResultRows([]);
        setPreviousLeadRows([]);
        errors.push("previous pay cycle comparison");
      }

      if (errors.length > 0) {
        toast({
          title: "Some commission data could not be loaded",
          description: `Missing: ${errors.join(", ")}.`,
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error loading commission data:", error);
      toast({
        title: "Unable to load commissions",
        description: "Please refresh and try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [accessChecked, isAuthorized, previousCycle, selectedCycle, toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedAgentUserId, selectedCycleKey]);

  const closerDirectoryIndex = useMemo(
    () => buildCloserDirectoryIndex(closerDirectory),
    [closerDirectory],
  );

  const leadBySubmissionId = useMemo(() => buildLeadStatusMap(leadRows), [leadRows]);
  const previousLeadBySubmissionId = useMemo(
    () => buildLeadStatusMap(previousLeadRows),
    [previousLeadRows],
  );

  const commissionItems = useMemo<CommissionItem[]>(
    () =>
      buildCommissionItemsForCycle({
        callResultRows,
        closerDirectoryIndex,
        cycle: selectedCycle,
        leadBySubmissionId,
      }),
    [callResultRows, closerDirectoryIndex, leadBySubmissionId, selectedCycle],
  );
  const previousCommissionItems = useMemo<CommissionItem[]>(
    () =>
      buildCommissionItemsForCycle({
        callResultRows: previousCallResultRows,
        closerDirectoryIndex,
        cycle: previousCycle,
        leadBySubmissionId: previousLeadBySubmissionId,
      }),
    [closerDirectoryIndex, previousCallResultRows, previousCycle, previousLeadBySubmissionId],
  );

  const agentOptions = useMemo(
    () =>
      closerDirectory
        .filter((entry) => commissionItems.some((item) => item.closerUserId === entry.userId))
        .sort((left, right) => left.label.localeCompare(right.label)),
    [closerDirectory, commissionItems],
  );

  const filterCommissionItems = useCallback((items: CommissionItem[]) => {
    const query = normalizeText(searchQuery);

    return items.filter((item) => {
      if (!isSuperAdmin && user?.id && item.closerUserId !== user.id) return false;

      if (
        isSuperAdmin &&
        selectedAgentUserId !== ALL_AGENTS_VALUE &&
        item.closerUserId !== selectedAgentUserId
      ) {
        return false;
      }

      if (!query) return true;

      const haystack = normalizeText(
        [
          item.leadName,
          item.state,
          item.attorney,
          item.closerName,
          item.submissionId,
          getBoardLabel(item.boardKey),
        ].join(" "),
      );

      return haystack.includes(query);
    });
  }, [isSuperAdmin, searchQuery, selectedAgentUserId, user?.id]);

  const visibleItems = useMemo(
    () => filterCommissionItems(commissionItems),
    [commissionItems, filterCommissionItems],
  );
  const previousVisibleItems = useMemo(
    () => filterCommissionItems(previousCommissionItems),
    [filterCommissionItems, previousCommissionItems],
  );

  const itemsByBoard = useMemo(() => {
    const grouped = new Map<BoardKey, CommissionItem[]>();
    BOARD_DEFINITIONS.forEach((board) => grouped.set(board.key, []));

    visibleItems.forEach((item) => {
      grouped.get(item.boardKey)?.push(item);
    });

    return grouped;
  }, [visibleItems]);

  const totals = useMemo(() => calculateCommissionTotals(visibleItems), [visibleItems]);
  const previousTotals = useMemo(
    () => calculateCommissionTotals(previousVisibleItems),
    [previousVisibleItems],
  );
  const payableTrend = useMemo(
    () =>
      buildPayableTrend({
        currentCycle: selectedCycle,
        currentItems: visibleItems,
        previousCycle,
        previousItems: previousVisibleItems,
      }),
    [previousCycle, previousVisibleItems, selectedCycle, visibleItems],
  );

  const pageCount = Math.max(1, Math.ceil(visibleItems.length / RECORDS_PER_PAGE));
  const paginatedItems = visibleItems.slice(
    (currentPage - 1) * RECORDS_PER_PAGE,
    currentPage * RECORDS_PER_PAGE,
  );

  useEffect(() => {
    if (currentPage > pageCount) {
      setCurrentPage(pageCount);
    }
  }, [currentPage, pageCount]);

  if (authLoading || licensedLoading || !accessChecked) {
    return (
      <div className="flex h-64 items-center justify-center">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAuthorized || !selectedCycle) {
    return null;
  }

  const renderLeadCard = (item: CommissionItem) => (
    <div
      key={item.id}
      className={cn(
        "group relative flex min-h-[158px] flex-col overflow-hidden rounded-xl border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.065)_0%,rgba(255,255,255,0.032)_100%)] p-3.5 shadow-[0_18px_40px_-32px_rgba(15,23,42,0.95)] transition-all duration-200 hover:-translate-y-0.5",
        boardCardHoverClass(item.boardKey),
      )}
    >
      <div className={cn("absolute inset-x-0 top-0 h-0.5 opacity-90", boardAccentClass(item.boardKey))} />

      <div className="flex items-start justify-between gap-3 pt-1">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white transition-colors">
            {item.leadName}
          </p>
        </div>
        <Badge variant="outline" className={cn("shrink-0 rounded-full px-2.5", boardPillClass(item.boardKey))}>
          {item.state}
        </Badge>
      </div>

      <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-3 text-xs">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            Attorney
          </p>
          <p className="mt-1 truncate font-medium text-slate-200">{item.attorney}</p>
        </div>
        <div className="min-w-[76px] text-right">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            Commission
          </p>
          <p className="mt-1 text-base font-semibold text-white">
            {formatCurrency(item.commissionAmount)}
          </p>
        </div>
      </div>

      <div className="mt-auto flex items-end justify-between gap-3 border-t border-white/10 pt-3 text-xs">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            Closer
          </p>
          <p className="mt-1 truncate font-medium text-slate-300">{item.closerName}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            Call Date
          </p>
          <p className="mt-1 font-medium text-slate-300">{formatDateLabel(item.callDateKey)}</p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-full bg-zinc-950 text-white">
      <div className="relative min-h-full overflow-hidden">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(ellipse_at_top,hsl(var(--primary)/0.18),transparent_60%)]" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />

        <div className="relative container mx-auto px-2 py-6 [scrollbar-gutter:stable] sm:px-4 sm:py-8">
          <div className="mx-auto max-w-7xl space-y-5 overflow-x-hidden">
            <div
              className="flex flex-col gap-3 animate-blur-in motion-reduce:animate-none"
              style={{ animationDelay: "60ms" }}
            >
              <span className="inline-flex items-center gap-2 self-start rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[10px] uppercase tracking-wider text-primary">
                <span className="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_8px_hsl(var(--primary))]" />
                Commission
              </span>

              <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
                <div>
                  <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                    Commission Dashboard
                  </h1>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Select value={selectedCycleKey} onValueChange={setSelectedCycleKey}>
                    <SelectTrigger className="h-9 w-full rounded-full border-white/10 bg-white/[0.04] px-4 text-sm font-medium text-white/90 hover:bg-white/[0.07] focus:ring-primary/40 sm:w-[230px]">
                      <CalendarDays className="mr-2 h-4 w-4 text-white/40" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="border-white/10 bg-zinc-950 text-white [--accent:240_3.7%_15.9%] [--accent-foreground:0_0%_98%] [--popover:240_10%_3.9%] [--popover-foreground:0_0%_98%]">
                      {payCycles.map((cycle) => (
                        <SelectItem key={cycle.key} value={cycle.key}>
                          {cycle.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Button
                    variant="ghost"
                    onClick={fetchData}
                    disabled={refreshing}
                    className="h-9 rounded-full border border-white/10 bg-white/[0.04] px-4 text-sm font-medium text-white/85 hover:border-primary/40 hover:bg-primary/15 hover:text-white disabled:text-slate-600"
                  >
                    <RefreshCw className={cn("mr-2 h-3.5 w-3.5", refreshing && "animate-spin")} />
                    Refresh
                  </Button>
                </div>
              </div>
            </div>

            <div
              className="grid gap-4 lg:h-[280px] lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:items-stretch animate-blur-in motion-reduce:animate-none"
              style={{ animationDelay: "160ms" }}
            >
              <div className="flex min-h-0 flex-col gap-4">
                <CommissionIncomeCard
                  currentPayable={totals.payable}
                  loading={loading || refreshing}
                  previousPayable={previousTotals.payable}
                  selectedCycleLabel={selectedCycle.label}
                  trend={payableTrend}
                />

                <div className="shrink-0 rounded-2xl border border-primary/20 bg-zinc-900/60 p-3 shadow-xl shadow-black/25 backdrop-blur-xl transition-colors hover:border-primary/30">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <div className="relative flex-1">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
                      <Input
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                        placeholder="Search lead, attorney, state, or agent"
                        className="h-9 rounded-full border-white/10 bg-white/[0.04] pl-9 pr-4 text-sm text-white/90 placeholder:text-white/30 hover:bg-white/[0.07] focus-visible:ring-primary/40"
                      />
                    </div>

                    {isSuperAdmin && (
                      <Select value={selectedAgentUserId} onValueChange={setSelectedAgentUserId}>
                        <SelectTrigger className="h-9 w-full rounded-full border-white/10 bg-white/[0.04] px-4 text-sm font-medium text-white/90 hover:bg-white/[0.07] focus:ring-primary/40 sm:w-[210px]">
                          <User className="mr-2 h-4 w-4 text-white/40" />
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="border-white/10 bg-zinc-950 text-white [--accent:240_3.7%_15.9%] [--accent-foreground:0_0%_98%] [--popover:240_10%_3.9%] [--popover-foreground:0_0%_98%]">
                          <SelectItem value={ALL_AGENTS_VALUE}>All Agents</SelectItem>
                          {agentOptions.map((agent) => (
                            <SelectItem key={agent.userId} value={agent.userId}>
                              {agent.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </div>
              </div>

              <CommissionStatusMixCard loading={loading || refreshing} totals={totals} />
            </div>

      <div
        className="animate-blur-in motion-reduce:animate-none"
        style={{ animationDelay: "240ms" }}
      >
      {loading ? (
        <div className="flex items-center justify-center rounded-2xl border border-dashed border-primary/20 bg-zinc-900/60 py-16 text-white/50 shadow-xl shadow-black/25 backdrop-blur-xl">
          <RefreshCw className="mr-2 h-5 w-5 animate-spin" />
          Loading commission data...
        </div>
      ) : isCurrentCycle ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {BOARD_DEFINITIONS.map((board) => {
            const items = itemsByBoard.get(board.key) || [];
            const Icon = board.icon;
            const tone = toneClass(board.tone);
            const boardAmount = getBoardAmount(items, board.key);

            return (
              <section
                key={board.key}
                className="flex min-h-[420px] min-w-0 flex-col overflow-hidden rounded-2xl border border-primary/20 bg-zinc-900/60 shadow-xl shadow-black/30 backdrop-blur-xl transition-colors hover:border-primary/30"
              >
                <div className={cn("border-b border-white/10 p-4", tone.header)}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <div
                        className={cn(
                          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10",
                          tone.bg,
                        )}
                      >
                        <Icon className={cn("h-4 w-4", tone.text)} />
                      </div>
                      <div className="min-w-0">
                        <h2 className="truncate text-sm font-semibold text-white">{board.title}</h2>
                        <p className="text-xs text-slate-500">
                          {items.length} lead{items.length === 1 ? "" : "s"}
                        </p>
                      </div>
                    </div>
                    <Badge
                      variant="outline"
                      className={cn("shrink-0 bg-white/[0.06]", tone.border, tone.text)}
                    >
                      {boardAmount < 0 ? "-" : ""}
                      {formatCurrency(Math.abs(boardAmount))}
                    </Badge>
                  </div>
                </div>

                <div className="flex-1 space-y-3 p-3">
                  {items.length > 0 ? (
                    items.map(renderLeadCard)
                  ) : (
                    <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-white/10 bg-white/[0.03] text-center text-sm text-slate-500">
                      No {board.title.toLowerCase()} leads
                    </div>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-primary/20 bg-zinc-900/60 shadow-xl shadow-black/30 backdrop-blur-xl">
          <div>
            <div className="hidden grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_72px_minmax(0,1.15fr)_minmax(0,1fr)_96px_112px] gap-4 border-b border-white/10 px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 lg:grid">
              <span>Lead</span>
              <span>Agent</span>
              <span>State</span>
              <span>Attorney</span>
              <span>Status</span>
              <span className="text-right">Commission</span>
              <span>Call Date</span>
            </div>

            <div className="divide-y divide-white/[0.06]">
              {paginatedItems.length > 0 ? (
                paginatedItems.map((item, rowIndex) => {
                  const absoluteRowIndex = (currentPage - 1) * RECORDS_PER_PAGE + rowIndex;
                  const isStripedRow = absoluteRowIndex % 2 === 0;

                  return (
                  <div
                    key={item.id}
                    className={cn(
                      "grid gap-3 px-4 py-4 transition-colors lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_72px_minmax(0,1.15fr)_minmax(0,1fr)_96px_112px] lg:items-center lg:gap-4",
                      isStripedRow
                        ? "bg-primary/[0.08] hover:bg-primary/[0.13]"
                        : "hover:bg-white/[0.05]",
                    )}
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-white">{item.leadName}</p>
                      <p className="mt-1 truncate text-xs text-slate-500 lg:hidden">
                        {item.attorney}
                      </p>
                    </div>
                    <div className="min-w-0 text-sm text-slate-300">
                      <span className="text-slate-500 lg:hidden">Agent: </span>
                      <span className="truncate">{item.closerName}</span>
                    </div>
                    <div className="text-sm text-slate-300">
                      <span className="text-slate-500 lg:hidden">State: </span>
                      {item.state}
                    </div>
                    <div className="hidden min-w-0 truncate text-sm text-slate-300 lg:block">
                      {item.attorney}
                    </div>
                    <div>
                      <Badge variant="outline" className={statusBadgeClass(item.boardKey)}>
                        {getBoardLabel(item.boardKey)}
                      </Badge>
                    </div>
                    <div className="text-sm font-semibold text-white lg:text-right">
                      {formatCurrency(item.commissionAmount)}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-slate-400">
                      <Clock3 className="h-3.5 w-3.5" />
                      {formatDateLabel(item.callDateKey)}
                    </div>
                  </div>
                  );
                })
              ) : (
                <div className="px-4 py-16 text-center text-sm text-slate-500">
                  No commission rows for this pay cycle
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 px-4 py-3 text-sm text-slate-400">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Showing {paginatedItems.length} of {visibleItems.length}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                className="border-white/10 bg-white/[0.06] text-slate-200 hover:bg-white/[0.10] hover:text-white disabled:text-slate-600"
              >
                Previous
              </Button>
              <Badge variant="outline" className="border-white/10 bg-white/[0.06] text-slate-300">
                {currentPage} / {pageCount}
              </Badge>
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage >= pageCount}
                onClick={() => setCurrentPage((page) => Math.min(pageCount, page + 1))}
                className="border-white/10 bg-white/[0.06] text-slate-200 hover:bg-white/[0.10] hover:text-white disabled:text-slate-600"
              >
                Next
              </Button>
            </div>
          </div>
        </div>
            )}
      </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CommissionPortal;
