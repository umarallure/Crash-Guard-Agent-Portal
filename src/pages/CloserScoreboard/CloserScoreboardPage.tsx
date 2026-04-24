import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { addDays, format, parseISO, subDays } from "date-fns";
import {
  Award,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  PhoneCall,
  RefreshCw,
  TrendingUp,
  Users,
} from "lucide-react";
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
} from "recharts";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/hooks/useAuth";
import { useLicensedAgent } from "@/hooks/useLicensedAgent";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchLicensedCloserDirectory,
  type LicensedCloserDirectoryEntry,
} from "@/lib/agentOptions";
import { cn } from "@/lib/utils";

interface CallResultRow {
  id: string;
  submission_id: string | null;
  agent_who_took_call: string | null;
  licensed_agent_account: string | null;
  status: string | null;
  submitted_attorney_status: string | null;
  submission_date: string | null;
  created_at: string | null;
  updated_at: string | null;
}

interface CallClaimRow {
  id: string;
  submission_id: string;
  agent_id: string | null;
  agent_name: string | null;
  agent_type?: string | null;
  created_at: string | null;
}

interface CloserStats {
  name: string;
  userId: string;
  callsStarted: number;
  submittedToAttorney: number;
  opportunities: number;
  closedDeals: number;
  estimatedCommission: number;
  submitRate: number;
  rank: number;
}

interface SubmissionSnapshot {
  submissionId: string;
  closerUserId: string;
  closerName: string;
  reachedSubmittedToAttorney: boolean;
  closedDeal: boolean;
  opportunity: boolean;
  firstSubmittedDateKey: string | null;
}

type DateFilter = "today" | "yesterday" | "7days" | "30days" | "alltime" | "custom";
type SortColumn =
  | "callsStarted"
  | "submittedToAttorney"
  | "opportunities"
  | "closedDeals"
  | "estimatedCommission";
type SortDir = "asc" | "desc";

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

const REPORT_TIME_ZONE = "America/New_York";
const RECORDS_PER_PAGE = 20;
const CALL_LOG_TABLES = ["call_logs", "call_update_logs"] as const;
const ATTORNEY_REVIEW_STATUS = "attorney_review";
const CLOSED_DEAL_STATUS = "submitted";
const ESTIMATED_COMMISSION_PER_CLOSED_DEAL = 500;
const DATE_FILTER_LABEL: Record<DateFilter, string> = {
  today: "Today",
  yesterday: "Yesterday",
  "7days": "Last 7 Days",
  "30days": "Last 30 Days",
  alltime: "All Time",
  custom: "Custom Range",
};

const LOST_STATUSES = new Set([
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
  "call never sent",
  "call_never_sent",
  "disconnected",
  "disconnected - never retransferred",
  "disconnected_never_retransferred",
  "not interested",
  "not_interested",
]);

const CALLS_STAT_LINE_META = [
  {
    key: "submittedToAttorney",
    label: "Submitted to Attorney",
    color: "#60a5fa",
  },
  {
    key: "opportunities",
    label: "Opportunities",
    color: "#2dd4bf",
  },
  {
    key: "closedDeals",
    label: "Closed Deals",
    color: "#f59e0b",
  },
] as const;

// Each radar indicator is normalized using total calls (see `radarData` below):
//  - "Calls" → volume, scaled to the higher of the two compared closers
//  - "Submitted" / "Opportunities" / "Closed" → per-call rates, 0–100%
//  - "Win Rate" → closed / submitted, a distinct quality metric (not redundant
//    with the per-call rates)
const RADAR_METRIC_DEFINITIONS = [
  {
    key: "callsStarted",
    label: "Calls",
    color: "#a78bfa",
    formatValue: (value: number) => `${Math.round(value)}`,
  },
  {
    key: "submittedToAttorney",
    label: "Submitted",
    color: "#60a5fa",
    formatValue: (value: number) => `${Math.round(value)}`,
  },
  {
    key: "opportunities",
    label: "Opportunities",
    color: "#2dd4bf",
    formatValue: (value: number) => `${Math.round(value)}`,
  },
  {
    key: "closedDeals",
    label: "Closed",
    color: "#f59e0b",
    formatValue: (value: number) => `${Math.round(value)}`,
  },
  {
    key: "winRate",
    label: "Win Rate",
    color: "#f472b6",
    formatValue: (value: number) => `${value.toFixed(1)}%`,
  },
] as const satisfies ReadonlyArray<{
  key: "callsStarted" | "submittedToAttorney" | "opportunities" | "closedDeals" | "winRate";
  label: string;
  color: string;
  formatValue: (value: number) => string;
}>;

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

const getSubmissionDateKey = (row: CallResultRow) => {
  const submissionDate = String(row.submission_date || "").trim();
  if (submissionDate) {
    return submissionDate.slice(0, 10);
  }

  return getCallResultDateKey(row);
};

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
  const start = subDays(new Date(`${startKey}T12:00:00Z`), 1);
  const endExclusive = addDays(new Date(`${endKey}T12:00:00Z`), 2);

  return {
    startIso: start.toISOString(),
    endIso: endExclusive.toISOString(),
  };
};

const isSubmittedToAttorneyStatus = (value: string | null | undefined) =>
  normalizeText(value) === ATTORNEY_REVIEW_STATUS;

const isClosedDealStatus = (value: string | null | undefined) =>
  normalizeText(value) === CLOSED_DEAL_STATUS;

const isLostDealStatus = (value: string | null | undefined) =>
  LOST_STATUSES.has(normalizeText(value));

const isOpportunityRow = (row: CallResultRow) => {
  const normalizedStatus = normalizeText(row.status);
  if (!normalizedStatus) return false;
  if (isSubmittedToAttorneyStatus(row.status)) return false;
  if (isClosedDealStatus(row.submitted_attorney_status)) return false;
  if (isLostDealStatus(row.status)) return false;
  return true;
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

const formatShortDateLabel = (dateKey: string) => format(parseISO(dateKey), "MMM d");

const fetchCallResultRows = async (
  startKey: string,
  endKey: string,
): Promise<CallResultRow[]> => {
  const { startIso, endIso } = getApproxTimestampRange(startKey, endKey);
  const selection =
    "id, submission_id, agent_who_took_call, licensed_agent_account, status, submitted_attorney_status, submission_date, created_at, updated_at";

  const [updatedResults, createdResults] = await Promise.all([
    (supabase as any)
      .from("call_results")
      .select(selection)
      .gte("updated_at", startIso)
      .lt("updated_at", endIso),
    (supabase as any)
      .from("call_results")
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
      deduped.set(typedRow.id, typedRow);
    });

  return Array.from(deduped.values());
};

const fetchCloserCallClaims = async (
  startKey: string,
  endKey: string,
): Promise<CallClaimRow[]> => {
  const { startIso, endIso } = getApproxTimestampRange(startKey, endKey);
  let lastError: unknown = null;

  for (const tableName of CALL_LOG_TABLES) {
    const { data, error } = await (supabase as any)
      .from(tableName)
      .select("id, submission_id, agent_id, agent_name, agent_type, created_at")
      .eq("event_type", "call_claimed")
      .gte("created_at", startIso)
      .lt("created_at", endIso)
      .order("created_at", { ascending: false });

    if (error) {
      lastError = error;
      continue;
    }

    return ((data || []) as CallClaimRow[]).filter((row) => {
      const agentType = normalizeText(row.agent_type);
      if (agentType && agentType !== "licensed") {
        return false;
      }

      return isDateKeyInRange(getTimestampDateKey(row.created_at), startKey, endKey);
    });
  }

  throw lastError ?? new Error("Unable to load closer call claim activity.");
};

const CloserScoreboardPage = () => {
  const { user } = useAuth();
  const { isLicensedAgent, loading: licensedLoading } = useLicensedAgent();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [isAdmin, setIsAdmin] = useState(() => {
    if (!user?.id) return false;
    try {
      return localStorage.getItem(`cg_is_admin:${user.id}`) === "1";
    } catch {
      return false;
    }
  });
  const [accessChecked, setAccessChecked] = useState(false);

  const [dateFilter, setDateFilter] = useState<DateFilter>("30days");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");

  const [closerDirectory, setCloserDirectory] = useState<LicensedCloserDirectoryEntry[]>([]);
  const [callResultRows, setCallResultRows] = useState<CallResultRow[]>([]);
  const [callClaimRows, setCallClaimRows] = useState<CallClaimRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [sortColumn, setSortColumn] = useState<SortColumn>("closedDeals");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [currentPage, setCurrentPage] = useState(1);
  const [dateRangeOpen, setDateRangeOpen] = useState(false);
  const [draftDateFilter, setDraftDateFilter] = useState<DateFilter>("30days");
  const [draftCustomStartDate, setDraftCustomStartDate] = useState("");
  const [draftCustomEndDate, setDraftCustomEndDate] = useState("");
  const [comparisonLeftUserId, setComparisonLeftUserId] = useState("");
  const [comparisonRightUserId, setComparisonRightUserId] = useState("");

  useEffect(() => {
    if (!user) {
      navigate("/auth");
      return;
    }

    const checkAdminAccess = async () => {
      let admin = false;

      try {
        const cached = localStorage.getItem(`cg_is_admin:${user.id}`);
        if (cached === "1") {
          admin = true;
        }
      } catch {
        // Ignore local cache lookup issues.
      }

      if (!admin) {
        try {
          const { data, error } = await (supabase as any)
            .from("app_users")
            .select("role")
            .eq("user_id", user.id)
            .single();

          admin =
            !error &&
            Boolean(data) &&
            (data.role === "admin" || data.role === "super_admin");

          try {
            localStorage.setItem(`cg_is_admin:${user.id}`, admin ? "1" : "0");
          } catch {
            // Ignore cache write issues.
          }
        } catch {
          // Ignore lookup issues and fall back to licensed access check.
        }
      }

      setIsAdmin(admin);
      setAccessChecked(true);
    };

    checkAdminAccess();
  }, [navigate, user]);

  useEffect(() => {
    if (!accessChecked || licensedLoading) return;
    if (!isAdmin && !isLicensedAgent) {
      navigate("/scoreboard-dashboard");
    }
  }, [accessChecked, isAdmin, isLicensedAgent, licensedLoading, navigate]);

  const getDateRange = useCallback(() => {
    const anchor = new Date();
    anchor.setUTCHours(12, 0, 0, 0);

    switch (dateFilter) {
      case "today": {
        const key = formatDateKeyInTimeZone(anchor);
        return { startKey: key, endKey: key };
      }
      case "yesterday": {
        const key = formatDateKeyInTimeZone(subDays(anchor, 1));
        return { startKey: key, endKey: key };
      }
      case "7days":
        return {
          startKey: formatDateKeyInTimeZone(subDays(anchor, 6)),
          endKey: formatDateKeyInTimeZone(anchor),
        };
      case "30days":
        return {
          startKey: formatDateKeyInTimeZone(subDays(anchor, 29)),
          endKey: formatDateKeyInTimeZone(anchor),
        };
      case "alltime":
        return {
          startKey: "2020-01-01",
          endKey: formatDateKeyInTimeZone(anchor),
        };
      case "custom":
        if (customStartDate && customEndDate) {
          return { startKey: customStartDate, endKey: customEndDate };
        }
        return {
          startKey: formatDateKeyInTimeZone(anchor),
          endKey: formatDateKeyInTimeZone(anchor),
        };
      default: {
        const key = formatDateKeyInTimeZone(anchor);
        return { startKey: key, endKey: key };
      }
    }
  }, [customEndDate, customStartDate, dateFilter]);

  const fetchData = useCallback(async () => {
    if (!accessChecked) return;
    if (!isAdmin && !isLicensedAgent) return;

    setRefreshing(true);

    const { startKey, endKey } = getDateRange();
    const [directoryResult, callResultsResult, claimsResult] = await Promise.allSettled([
      fetchLicensedCloserDirectory(),
      fetchCallResultRows(startKey, endKey),
      fetchCloserCallClaims(startKey, endKey),
    ]);

    const errors: string[] = [];

    if (directoryResult.status === "fulfilled") {
      setCloserDirectory(directoryResult.value);
    } else {
      setCloserDirectory([]);
      errors.push("active closer roster");
    }

    if (callResultsResult.status === "fulfilled") {
      setCallResultRows(callResultsResult.value);
    } else {
      setCallResultRows([]);
      errors.push("call result outcomes");
    }

    if (claimsResult.status === "fulfilled") {
      setCallClaimRows(claimsResult.value);
    } else {
      setCallClaimRows([]);
      errors.push("claimed call activity");
    }

    if (errors.length > 0) {
      toast({
        title: "Some scoreboard data could not be loaded",
        description: `Missing: ${errors.join(", ")}.`,
        variant: "destructive",
      });
    }

    setRefreshing(false);
    setLoading(false);
  }, [accessChecked, getDateRange, isAdmin, isLicensedAgent, toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    setCurrentPage(1);
  }, [customEndDate, customStartDate, dateFilter]);

  const closerDirectoryIndex = useMemo(
    () => buildCloserDirectoryIndex(closerDirectory),
    [closerDirectory],
  );

  const submissionSnapshots = useMemo<SubmissionSnapshot[]>(() => {
    const grouped = new Map<string, AttributedCallResultRow[]>();

    callResultRows.forEach((row) => {
      if (!row.submission_id) return;

      const entry = resolveCloserEntry(closerDirectoryIndex, {
        names: [row.agent_who_took_call, row.licensed_agent_account],
      });
      if (!entry) return;

      const dateKey = getCallResultDateKey(row);
      if (!dateKey) return;

      const existing = grouped.get(row.submission_id) || [];
      existing.push({
        row,
        entry,
        dateKey,
        sortValue: getRowSortValue(row, dateKey),
      });
      grouped.set(row.submission_id, existing);
    });

    return Array.from(grouped.entries()).map(([submissionId, rows]) => {
      const sortedRows = [...rows].sort((left, right) => right.sortValue - left.sortValue);
      const latest = sortedRows[0];
      const firstSubmitted = [...rows]
        .filter((item) => isSubmittedToAttorneyStatus(item.row.status))
        .sort((left, right) => left.sortValue - right.sortValue)[0];

      const reachedSubmittedToAttorney = rows.some((item) =>
        isSubmittedToAttorneyStatus(item.row.status),
      );
      const closedDeal = rows.some((item) =>
        isClosedDealStatus(item.row.submitted_attorney_status),
      );

      return {
        submissionId,
        closerUserId: latest.entry.userId,
        closerName: latest.entry.label,
        reachedSubmittedToAttorney,
        closedDeal,
        opportunity: !closedDeal && isOpportunityRow(latest.row),
        firstSubmittedDateKey: firstSubmitted
          ? getSubmissionDateKey(firstSubmitted.row)
          : null,
      };
    });
  }, [callResultRows, closerDirectoryIndex]);

  const closerStats = useMemo<CloserStats[]>(() => {
    const statsMap = new Map<string, Omit<CloserStats, "submitRate" | "rank">>();

    closerDirectory.forEach((entry) => {
      statsMap.set(entry.userId, {
        name: entry.label,
        userId: entry.userId,
        callsStarted: 0,
        submittedToAttorney: 0,
        opportunities: 0,
        closedDeals: 0,
        estimatedCommission: 0,
      });
    });

    callClaimRows.forEach((row) => {
      const entry = resolveCloserEntry(closerDirectoryIndex, {
        userId: row.agent_id,
        names: [row.agent_name],
      });
      if (!entry) return;

      const stats = statsMap.get(entry.userId);
      if (!stats) return;

      stats.callsStarted += 1;
    });

    submissionSnapshots.forEach((snapshot) => {
      const stats = statsMap.get(snapshot.closerUserId);
      if (!stats) return;

      if (snapshot.reachedSubmittedToAttorney) {
        stats.submittedToAttorney += 1;
      }

      if (snapshot.closedDeal) {
        stats.closedDeals += 1;
        stats.estimatedCommission += ESTIMATED_COMMISSION_PER_CLOSED_DEAL;
      }

      if (snapshot.opportunity) {
        stats.opportunities += 1;
      }
    });

    return Array.from(statsMap.values())
      .map((stats) => ({
        ...stats,
        submitRate:
          stats.callsStarted > 0
            ? (stats.submittedToAttorney / stats.callsStarted) * 100
            : 0,
      }))
      .sort(
        (left, right) =>
          right.closedDeals - left.closedDeals ||
          right.submittedToAttorney - left.submittedToAttorney ||
          right.opportunities - left.opportunities ||
          right.callsStarted - left.callsStarted,
      )
      .map((stats, index) => ({ ...stats, rank: index + 1 }));
  }, [callClaimRows, closerDirectory, closerDirectoryIndex, submissionSnapshots]);

  const teamTotals = useMemo(
    () => {
      const callsStarted = closerStats.reduce((total, closer) => total + closer.callsStarted, 0);
      const submittedToAttorney = closerStats.reduce(
        (total, closer) => total + closer.submittedToAttorney,
        0,
      );
      const opportunities = closerStats.reduce(
        (total, closer) => total + closer.opportunities,
        0,
      );
      const closedDeals = closerStats.reduce((total, closer) => total + closer.closedDeals, 0);
      const estimatedCommission = closerStats.reduce(
        (total, closer) => total + closer.estimatedCommission,
        0,
      );

      return {
        callsStarted,
        submittedToAttorney,
        opportunities,
        closedDeals,
        estimatedCommission,
        submitRate: callsStarted > 0 ? (submittedToAttorney / callsStarted) * 100 : 0,
      };
    },
    [closerStats],
  );

  const activeCloserCount = useMemo(
    () =>
      closerStats.filter(
        (closer) =>
          closer.callsStarted > 0 ||
          closer.submittedToAttorney > 0 ||
          closer.opportunities > 0 ||
          closer.closedDeals > 0,
      ).length,
    [closerStats],
  );

  const topCloserName = useMemo(() => {
    // closerStats is sorted by closedDeals desc; prefer a closer with actual activity.
    const candidate = closerStats.find(
      (closer) =>
        closer.closedDeals > 0 || closer.submittedToAttorney > 0 || closer.callsStarted > 0,
    );
    return candidate?.name ?? "";
  }, [closerStats]);

  const teamCloseRate =
    teamTotals.callsStarted > 0 ? (teamTotals.closedDeals / teamTotals.callsStarted) * 100 : 0;

  const sortedStats = useMemo(() => {
    const rows = [...closerStats];

    rows.sort((left, right) => {
      const leftValue = left[sortColumn] as number;
      const rightValue = right[sortColumn] as number;
      return sortDir === "desc" ? rightValue - leftValue : leftValue - rightValue;
    });

    return rows;
  }, [closerStats, sortColumn, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sortedStats.length / RECORDS_PER_PAGE));
  const paginatedStats = sortedStats.slice(
    (currentPage - 1) * RECORDS_PER_PAGE,
    currentPage * RECORDS_PER_PAGE,
  );

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDir((direction) => (direction === "desc" ? "asc" : "desc"));
    } else {
      setSortColumn(column);
      setSortDir("desc");
    }

    setCurrentPage(1);
  };

  const currentDateRangeLabel = useMemo(() => {
    if (dateFilter === "custom" && customStartDate && customEndDate) {
      return `${formatShortDateLabel(customStartDate)} - ${formatShortDateLabel(customEndDate)}`;
    }

    return DATE_FILTER_LABEL[dateFilter];
  }, [customEndDate, customStartDate, dateFilter]);

  const teamStatLines = useMemo(
    () =>
      CALLS_STAT_LINE_META.map((item) => {
        const value = teamTotals[item.key];
        const ratio = teamTotals.callsStarted > 0 ? (value / teamTotals.callsStarted) * 100 : 0;

        return {
          ...item,
          value,
          ratio,
          width: value > 0 ? Math.max(ratio, 8) : 0,
          percentageLabel: `${ratio.toFixed(1)}%`,
        };
      }),
    [teamTotals],
  );

  const comparisonOptions = useMemo(() => {
    const activeClosers = closerStats.filter(
      (closer) =>
        closer.callsStarted > 0 ||
        closer.submittedToAttorney > 0 ||
        closer.opportunities > 0 ||
        closer.closedDeals > 0,
    );

    return activeClosers.length >= 2 ? activeClosers : closerStats;
  }, [closerStats]);

  useEffect(() => {
    const fallbackLeft = comparisonOptions[0]?.userId ?? "";
    const nextLeft = comparisonOptions.some((closer) => closer.userId === comparisonLeftUserId)
      ? comparisonLeftUserId
      : fallbackLeft;
    const fallbackRight =
      comparisonOptions.find((closer) => closer.userId !== nextLeft)?.userId ?? "";
    const nextRight = comparisonOptions.some(
      (closer) =>
        closer.userId === comparisonRightUserId && closer.userId !== nextLeft,
    )
      ? comparisonRightUserId
      : fallbackRight;

    if (nextLeft !== comparisonLeftUserId) {
      setComparisonLeftUserId(nextLeft);
    }

    if (nextRight !== comparisonRightUserId) {
      setComparisonRightUserId(nextRight);
    }
  }, [comparisonLeftUserId, comparisonOptions, comparisonRightUserId]);

  const comparisonLeftCloser = useMemo(
    () => closerStats.find((closer) => closer.userId === comparisonLeftUserId) ?? null,
    [closerStats, comparisonLeftUserId],
  );

  const comparisonRightCloser = useMemo(
    () => closerStats.find((closer) => closer.userId === comparisonRightUserId) ?? null,
    [closerStats, comparisonRightUserId],
  );

  const radarChartConfig = useMemo<ChartConfig>(
    () => ({
      left: {
        label: comparisonLeftCloser?.name || "Closer A",
        color: "#60a5fa",
      },
      right: {
        label: comparisonRightCloser?.name || "Closer B",
        color: "#2dd4bf",
      },
    }),
    [comparisonLeftCloser?.name, comparisonRightCloser?.name],
  );

  // Radar axes are normalized using each closer's own `callsStarted`:
  //  • Calls         → volume vs the higher of the two compared (keeps a sense of scale)
  //  • Submitted/Opp/Closed → per-call rate (count ÷ own calls × 100)
  //  • Win Rate      → closed ÷ submitted × 100 (quality of submissions)
  // This prevents the chart from looking "full" for whichever closer has more
  // raw volume — each indicator becomes a true efficiency comparison.
  const radarData = useMemo(() => {
    if (!comparisonLeftCloser || !comparisonRightCloser) return [];

    const rate = (numerator: number, denominator: number) =>
      denominator > 0 ? (numerator / denominator) * 100 : 0;

    const computeForMetric = (
      metricKey: (typeof RADAR_METRIC_DEFINITIONS)[number]["key"],
      closer: CloserStats,
    ) => {
      switch (metricKey) {
        case "callsStarted": {
          const cap = Math.max(
            comparisonLeftCloser.callsStarted,
            comparisonRightCloser.callsStarted,
            1,
          );
          return { scaled: rate(closer.callsStarted, cap), actual: closer.callsStarted };
        }
        case "submittedToAttorney":
          return {
            scaled: Math.min(rate(closer.submittedToAttorney, closer.callsStarted), 100),
            actual: closer.submittedToAttorney,
          };
        case "opportunities":
          return {
            scaled: Math.min(rate(closer.opportunities, closer.callsStarted), 100),
            actual: closer.opportunities,
          };
        case "closedDeals":
          return {
            scaled: Math.min(rate(closer.closedDeals, closer.callsStarted), 100),
            actual: closer.closedDeals,
          };
        case "winRate":
          return {
            scaled: Math.min(rate(closer.closedDeals, closer.submittedToAttorney), 100),
            actual: rate(closer.closedDeals, closer.submittedToAttorney),
          };
      }
    };

    return RADAR_METRIC_DEFINITIONS.map((metric) => {
      const left = computeForMetric(metric.key, comparisonLeftCloser);
      const right = computeForMetric(metric.key, comparisonRightCloser);

      return {
        metric: metric.label,
        left: Number(left.scaled.toFixed(1)),
        right: Number(right.scaled.toFixed(1)),
        leftDisplay: metric.formatValue(left.actual),
        rightDisplay: metric.formatValue(right.actual),
        axisColor: metric.color,
      };
    });
  }, [comparisonLeftCloser, comparisonRightCloser]);

  const comparisonLeadSummary = useMemo(() => {
    if (radarData.length === 0) return "";

    let leftWins = 0;
    let rightWins = 0;

    radarData.forEach((row) => {
      if (row.left > row.right) leftWins += 1;
      else if (row.right > row.left) rightWins += 1;
    });

    const left = comparisonLeftCloser;
    const right = comparisonRightCloser;
    if (!left || !right) return "";

    if (leftWins === rightWins) {
      return `${left.name} and ${right.name} are even across the selected indicators.`;
    }

    const winner = leftWins > rightWins ? left.name : right.name;
    const winningCount = Math.max(leftWins, rightWins);

    return `${winner} leads ${winningCount} of ${radarData.length} indicators in this range.`;
  }, [comparisonLeftCloser, comparisonRightCloser, radarData]);

  const hasAnyActivity = closerStats.some(
    (closer) =>
      closer.callsStarted > 0 ||
      closer.submittedToAttorney > 0 ||
      closer.opportunities > 0 ||
      closer.closedDeals > 0,
  );

  const SortIcon = ({ column }: { column: SortColumn }) => {
    if (sortColumn !== column) {
      return <ChevronsUpDown className="ml-1 h-3 w-3 opacity-40" />;
    }

    return sortDir === "desc" ? (
      <ChevronDown className="ml-1 h-3 w-3" />
    ) : (
      <ChevronUp className="ml-1 h-3 w-3" />
    );
  };

  const SortableHead = ({
    column,
    label,
    className,
  }: {
    column: SortColumn;
    label: string;
    className?: string;
  }) => (
    <TableHead
      className={`cursor-pointer select-none transition-colors hover:text-foreground ${className ?? ""}`}
      onClick={() => handleSort(column)}
    >
      <span className="inline-flex items-center">
        {label}
        <SortIcon column={column} />
      </span>
    </TableHead>
  );

  const rankBadge = (rank: number) => {
    if (rank === 1) {
      return <Badge className="border-0 bg-yellow-400 font-bold text-yellow-950">#1</Badge>;
    }

    if (rank === 2) {
      return <Badge className="border-0 bg-slate-300 font-bold text-slate-800">#2</Badge>;
    }

    if (rank === 3) {
      return <Badge className="border-0 bg-orange-400 font-bold text-orange-950">#3</Badge>;
    }

    return <span className="text-sm font-medium text-muted-foreground">#{rank}</span>;
  };

  const handleDateRangeOpenChange = (open: boolean) => {
    setDateRangeOpen(open);

    if (open) {
      setDraftDateFilter(dateFilter);
      setDraftCustomStartDate(customStartDate);
      setDraftCustomEndDate(customEndDate);
    }
  };

  const handlePresetDateRangeSelect = (nextFilter: DateFilter) => {
    setDraftDateFilter(nextFilter);

    if (nextFilter !== "custom") {
      setDateFilter(nextFilter);
      setDateRangeOpen(false);
    }
  };

  const handleApplyCustomRange = () => {
    if (!draftCustomStartDate || !draftCustomEndDate) return;
    if (draftCustomStartDate > draftCustomEndDate) return;

    setDateFilter("custom");
    setCustomStartDate(draftCustomStartDate);
    setCustomEndDate(draftCustomEndDate);
    setDateRangeOpen(false);
  };

  const isCustomRangeDraftValid =
    Boolean(draftCustomStartDate) &&
    Boolean(draftCustomEndDate) &&
    draftCustomStartDate <= draftCustomEndDate;

  if (!accessChecked || licensedLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-screen-2xl space-y-6 p-4 md:p-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          Closer Scoreboard
        </h1>

        <div className="flex flex-wrap items-center gap-2">
          <Popover open={dateRangeOpen} onOpenChange={handleDateRangeOpenChange}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="min-w-[178px] justify-between bg-background/80"
              >
                <span className="inline-flex items-center gap-2">
                  <CalendarDays className="h-4 w-4" />
                  {currentDateRangeLabel}
                </span>
                <ChevronDown className="h-4 w-4 opacity-60" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[320px] p-3">
              <div className="grid gap-2 sm:grid-cols-2">
                {(
                  ["today", "yesterday", "7days", "30days", "alltime", "custom"] as DateFilter[]
                ).map((option) => (
                  <Button
                    key={option}
                    type="button"
                    variant="ghost"
                    className={cn(
                      "justify-start rounded-xl border border-transparent",
                      (draftDateFilter === option ||
                        (dateFilter === option && draftDateFilter === option)) &&
                        "border-border bg-muted text-foreground",
                    )}
                    onClick={() => handlePresetDateRangeSelect(option)}
                  >
                    {DATE_FILTER_LABEL[option]}
                  </Button>
                ))}
              </div>

              {draftDateFilter === "custom" ? (
                <div className="mt-3 grid gap-2 border-t pt-3">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label htmlFor="closer-scoreboard-start-date" className="text-xs">
                        Start Date
                      </Label>
                      <Input
                        id="closer-scoreboard-start-date"
                        type="date"
                        value={draftCustomStartDate}
                        onChange={(event) => setDraftCustomStartDate(event.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="closer-scoreboard-end-date" className="text-xs">
                        End Date
                      </Label>
                      <Input
                        id="closer-scoreboard-end-date"
                        type="date"
                        value={draftCustomEndDate}
                        onChange={(event) => setDraftCustomEndDate(event.target.value)}
                      />
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleApplyCustomRange}
                    disabled={!isCustomRangeDraftValid}
                  >
                    Apply custom range
                  </Button>
                </div>
              ) : null}
            </PopoverContent>
          </Popover>

          <Button
            variant="outline"
            size="sm"
            onClick={fetchData}
            disabled={refreshing}
            className="self-start sm:self-auto"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* ── Top row: Calls Started + Team Snapshot (half-half on desktop) ── */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {/* Calls Started card — volume headline + one segmented stat bar */}
        <Card className="overflow-hidden border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(96,165,250,0.18),transparent_34%),radial-gradient(circle_at_top_right,rgba(45,212,191,0.16),transparent_28%),linear-gradient(135deg,#111318,#1b2030_54%,#10141f)] shadow-[0_24px_90px_-42px_rgba(15,23,42,0.95)]">
          <CardContent className="relative space-y-6 p-6 sm:p-7">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">
                  Calls Started
                </p>
                <div className="flex flex-wrap items-end gap-3">
                  <p className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                    {loading ? "-" : teamTotals.callsStarted}
                  </p>
                  <Badge className="rounded-full border-0 bg-emerald-500/15 px-3 py-1 text-emerald-300">
                    {loading ? "-" : `${teamTotals.submitRate.toFixed(1)}% submit rate`}
                  </Badge>
                </div>
              </div>
              <PhoneCall className="h-5 w-5 text-slate-300" />
            </div>

            {/* One segmented stat bar — submitted / opportunities / closed */}
            <div className="space-y-3">
              <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-white/10">
                {teamStatLines.map((item) => {
                  const pct = teamTotals.callsStarted > 0 ? item.ratio : 0;
                  if (pct <= 0) return null;
                  return (
                    <div
                      key={item.key}
                      className="h-full transition-all duration-500"
                      style={{
                        width: `${Math.min(pct, 100)}%`,
                        backgroundColor: item.color,
                      }}
                      title={`${item.label}: ${item.value} (${item.percentageLabel})`}
                    />
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
                {teamStatLines.map((item) => (
                  <div key={item.key} className="flex items-center gap-2">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                      {item.label}
                    </span>
                    <span className="font-semibold text-white">
                      {loading ? "-" : item.value}
                    </span>
                    <span className="text-xs text-slate-500">
                      {loading ? "" : item.percentageLabel}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Team Snapshot card — active closers, top closer, commission, close rate */}
        <Card className="overflow-hidden border-white/10 bg-[radial-gradient(circle_at_top_right,rgba(168,85,247,0.18),transparent_34%),radial-gradient(circle_at_bottom_left,rgba(244,114,182,0.14),transparent_32%),linear-gradient(135deg,#111318,#1b2030_54%,#10141f)] shadow-[0_24px_90px_-42px_rgba(15,23,42,0.95)]">
          <CardContent className="relative space-y-6 p-6 sm:p-7">
            <div className="flex items-center justify-between gap-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">
                Team Snapshot
              </p>
              <Users className="h-5 w-5 text-slate-300" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Active Closers
                </p>
                <p className="text-2xl font-semibold text-white">
                  {loading ? "-" : activeCloserCount}
                  <span className="ml-1 text-sm font-normal text-slate-500">
                    / {closerStats.length}
                  </span>
                </p>
              </div>

              <div className="space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Top Closer
                </p>
                <p className="truncate text-2xl font-semibold text-white">
                  {loading ? "-" : topCloserName || "—"}
                </p>
              </div>

              <div className="space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Commission Paid
                </p>
                <p className="text-2xl font-semibold text-white">
                  {loading ? "-" : formatCurrency(teamTotals.estimatedCommission)}
                </p>
              </div>

              <div className="space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Team Close Rate
                </p>
                <p className="text-2xl font-semibold text-white">
                  {loading ? "-" : `${teamCloseRate.toFixed(1)}%`}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Second row: Full Rankings (~63%) + Radar Compare (~37%) ─────── */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4" />
              Full Rankings
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-16 text-muted-foreground">
                <RefreshCw className="mr-2 h-5 w-5 animate-spin" />
                Loading closers...
              </div>
            ) : closerStats.length === 0 ? (
              <div className="py-16 text-center text-muted-foreground">
                <Users className="mx-auto mb-2 h-8 w-8 opacity-30" />
                <p>No closer data is available yet.</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-b hover:bg-transparent">
                        <TableHead className="w-12 text-center">#</TableHead>
                        <TableHead>Closer</TableHead>
                        <SortableHead column="callsStarted" label="Calls" />
                        <SortableHead
                          column="submittedToAttorney"
                          label="Submitted"
                          className="text-blue-700 dark:text-blue-400"
                        />
                        <SortableHead column="opportunities" label="Opportunities" />
                        <SortableHead
                          column="closedDeals"
                          label="Closed Deals"
                          className="text-green-700 dark:text-green-400"
                        />
                        <SortableHead column="estimatedCommission" label="Commission" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedStats.map((closer) => {
                        const isMe = Boolean(user?.id) && closer.userId === user?.id;
                        const isInactive =
                          closer.callsStarted === 0 &&
                          closer.submittedToAttorney === 0 &&
                          closer.opportunities === 0 &&
                          closer.closedDeals === 0;

                        return (
                          <TableRow
                            key={closer.userId}
                            className={isMe ? "bg-primary/5 font-medium" : undefined}
                          >
                            <TableCell className="text-center">{rankBadge(closer.rank)}</TableCell>
                            <TableCell className="font-medium">
                              {closer.name}
                              {isMe && (
                                <Badge variant="outline" className="ml-2 text-xs">
                                  You
                                </Badge>
                              )}
                              {isInactive && (
                                <Badge
                                  variant="outline"
                                  className="ml-2 text-xs text-muted-foreground"
                                >
                                  No activity
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {closer.callsStarted}
                            </TableCell>
                            <TableCell className="font-bold text-blue-700 dark:text-blue-400">
                              {closer.submittedToAttorney}
                            </TableCell>
                            <TableCell className="font-semibold text-amber-700 dark:text-amber-400">
                              {closer.opportunities}
                            </TableCell>
                            <TableCell className="font-semibold text-green-700 dark:text-green-400">
                              {closer.closedDeals}
                            </TableCell>
                            <TableCell className="font-semibold text-violet-700 dark:text-violet-400">
                              {closer.estimatedCommission > 0
                                ? formatCurrency(closer.estimatedCommission)
                                : "-"}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                {totalPages > 1 && (
                  <div className="flex items-center justify-between border-t px-4 py-3 text-sm text-muted-foreground">
                    <span>
                      Page {currentPage} of {totalPages}
                    </span>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={currentPage === 1}
                        onClick={() => setCurrentPage((page) => page - 1)}
                      >
                        Previous
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={currentPage === totalPages}
                        onClick={() => setCurrentPage((page) => page + 1)}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Closer Radar Compare — normalized using each closer's own call volume */}
        <Card className="border-border/70 bg-card/90 shadow-sm">
          <CardHeader className="flex flex-col gap-3 pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <TrendingUp className="h-4 w-4" />
              Closer Comparison
            </CardTitle>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Select
                value={comparisonLeftUserId}
                onValueChange={setComparisonLeftUserId}
                disabled={comparisonOptions.length < 2}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select closer" />
                </SelectTrigger>
                <SelectContent>
                  {comparisonOptions
                    .filter((closer) => closer.userId !== comparisonRightUserId)
                    .map((closer) => (
                      <SelectItem key={closer.userId} value={closer.userId}>
                        {closer.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>

              <Select
                value={comparisonRightUserId}
                onValueChange={setComparisonRightUserId}
                disabled={comparisonOptions.length < 2}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select closer" />
                </SelectTrigger>
                <SelectContent>
                  {comparisonOptions
                    .filter((closer) => closer.userId !== comparisonLeftUserId)
                    .map((closer) => (
                      <SelectItem key={closer.userId} value={closer.userId}>
                        {closer.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {comparisonOptions.length < 2 || !comparisonLeftCloser || !comparisonRightCloser ? (
              <div className="flex h-[320px] items-center justify-center text-sm text-muted-foreground">
                Add at least two active closers in this range to compare them here.
              </div>
            ) : (
              <div className="space-y-4">
                <ChartContainer
                  config={radarChartConfig}
                  className="mx-auto aspect-square max-h-[300px] w-full"
                >
                  <RadarChart data={radarData}>
                    <ChartTooltip
                      cursor={false}
                      content={
                        <ChartTooltipContent
                          labelFormatter={(_, payload) => payload?.[0]?.payload?.metric ?? ""}
                          formatter={(_value, name, _item, _index, payload) => {
                            const metricValue =
                              name === "left" ? payload.leftDisplay : payload.rightDisplay;

                            return (
                              <div className="flex min-w-[150px] items-center justify-between gap-6">
                                <span>
                                  {name === "left"
                                    ? comparisonLeftCloser.name
                                    : comparisonRightCloser.name}
                                </span>
                                <span className="font-semibold text-foreground">
                                  {metricValue}
                                </span>
                              </div>
                            );
                          }}
                        />
                      }
                    />
                    <PolarGrid gridType="circle" radialLines={false} />
                    <PolarRadiusAxis axisLine={false} tick={false} domain={[0, 100]} />
                    <PolarAngleAxis dataKey="metric" tick={{ fontSize: 11 }} />
                    <Radar
                      name="left"
                      dataKey="left"
                      stroke="var(--color-left)"
                      fill="var(--color-left)"
                      fillOpacity={0.28}
                      strokeWidth={2}
                      dot={(props) => {
                        const { cx, cy, index, payload } = props;
                        return (
                          <circle
                            key={`left-dot-${index}`}
                            cx={cx}
                            cy={cy}
                            r={3.5}
                            fill={payload.axisColor}
                            stroke="var(--color-left)"
                            strokeWidth={1.25}
                          />
                        );
                      }}
                      activeDot={{ r: 5, strokeWidth: 2 }}
                    />
                    <Radar
                      name="right"
                      dataKey="right"
                      stroke="var(--color-right)"
                      fill="var(--color-right)"
                      fillOpacity={0.16}
                      strokeWidth={2}
                      dot={(props) => {
                        const { cx, cy, index, payload } = props;
                        return (
                          <circle
                            key={`right-dot-${index}`}
                            cx={cx}
                            cy={cy}
                            r={3.5}
                            fill={payload.axisColor}
                            stroke="var(--color-right)"
                            strokeWidth={1.25}
                          />
                        );
                      }}
                      activeDot={{ r: 5, strokeWidth: 2 }}
                    />
                  </RadarChart>
                </ChartContainer>

                {/* Indicator legend — dot colors match the axis dots on the chart */}
                <div className="flex flex-wrap gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
                  {RADAR_METRIC_DEFINITIONS.map((metric) => (
                    <span key={metric.key} className="inline-flex items-center gap-1.5">
                      <span
                        className="inline-block h-2 w-2 rounded-full"
                        style={{ backgroundColor: metric.color }}
                      />
                      {metric.label}
                    </span>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Badge
                    variant="outline"
                    className="rounded-full border-sky-200 bg-sky-50 text-sky-700"
                  >
                    {comparisonLeftCloser.name}
                  </Badge>
                  <Badge
                    variant="outline"
                    className="rounded-full border-teal-200 bg-teal-50 text-teal-700"
                  >
                    {comparisonRightCloser.name}
                  </Badge>
                  <span className="text-[11px]">{comparisonLeadSummary}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {!loading && closerStats.length > 0 && !hasAnyActivity && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Award className="mb-3 h-10 w-10 opacity-20" />
            <p className="text-base font-medium">No closer activity for this period</p>
            <p className="mt-1 text-sm">
              The active closer roster is loaded. Expand the date range to see historical
              performance.
            </p>
          </CardContent>
        </Card>
      )}

      {!loading && closerStats.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Award className="mb-3 h-10 w-10 opacity-20" />
            <p className="text-lg font-medium">No licensed closers configured</p>
            <p className="mt-1 text-sm">
              Add users to <code className="rounded bg-muted px-1.5 py-0.5">agent_status</code>{" "}
              with <code className="rounded bg-muted px-1.5 py-0.5">agent_type = "licensed"</code>.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default CloserScoreboardPage;
