import { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { subDays } from 'date-fns';
import { Loader2, Eye, Phone, Play, Pause, Clock, Users, Briefcase } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { searchAircallCalls, formatDuration, formatTimestamp } from '@/lib/aircall';
import { FilterBar } from './components/FilterBar';
import { WeeklyCallsCard } from './components/WeeklyCallsCard';
import { QualificationDonutCard } from './components/QualificationDonutCard';
import { AttorneyZonesCard } from './components/AttorneyZonesCard';
import { OpportunitiesAreaCard } from './components/OpportunitiesAreaCard';
import { QuickLinkCard } from './components/QuickLinkCard';
import { formatDateUS } from '@/lib/dateUtils';
import {
  bucketizeByDay,
  formatNYDateKey,
  isApprovedAttorney,
  isDeniedAttorney,
  isNoCoverage,
  isNotQualified,
  isQualified,
  isQualifiedPayable,
  isSubmittedToAttorney,
  lastNDayKeys,
  type ActivityType,
  type DailyBucket,
  type DateFilter,
  type ScoreboardDailyRow,
} from './utils';

interface FilteredRow {
  id: string;
  date: string | null;
  insured_name: string | null;
  client_phone_number: string | null;
  state: string | null;
  lead_vendor: string | null;
  agent: string | null;
  status: string | null;
  call_result: string | null;
  submitted_attorney: string | null;
  submitted_attorney_status: string | null;
  notes: string | null;
}

type AppUserRoleRow = {
  role: string | null;
};

type AppUsersRoleClient = {
  from: (table: 'app_users') => {
    select: (columns: 'role') => {
      eq: (column: 'user_id', value: string) => {
        single: () => Promise<{ data: AppUserRoleRow | null; error: unknown }>;
      };
    };
  };
};

interface RangeMetrics {
  total: number;
  qualified: number;
  notQualified: number;
  noCoverage: number;
  submittedToAttorney: number;
  approvedAttorney: number;
  deniedAttorney: number;
  qualifiedPayable: number;
}

const EMPTY_RANGE_METRICS: RangeMetrics = {
  total: 0,
  qualified: 0,
  notQualified: 0,
  noCoverage: 0,
  submittedToAttorney: 0,
  approvedAttorney: 0,
  deniedAttorney: 0,
  qualifiedPayable: 0,
};

const ScoreboardDashboard = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rangeMetrics, setRangeMetrics] = useState<RangeMetrics>(EMPTY_RANGE_METRICS);
  const [prevRangeTotal, setPrevRangeTotal] = useState(0);
  const [weekly, setWeekly] = useState<DailyBucket[]>([]);
  const [prevWeekly, setPrevWeekly] = useState<DailyBucket[]>([]);

  const [activityType, setActivityType] = useState<ActivityType>('inbound');
  const [dateFilter, setDateFilter] = useState<DateFilter>('today');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<string>('total_transfers');
  const [filteredData, setFilteredData] = useState<FilteredRow[]>([]);
  const [filteredLoading, setFilteredLoading] = useState(false);
  const [selectedNotes, setSelectedNotes] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const recordsPerPage = 20;
  const [showCallDialog, setShowCallDialog] = useState(false);
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [callRecordings, setCallRecordings] = useState<Array<{
    id: number;
    direction: string;
    status: string;
    duration: number;
    started_at: number;
    recording: string | null;
    user: { name: string } | null;
  }>>([]);
  const [callsLoading, setCallsLoading] = useState(false);
  const [playingRecording, setPlayingRecording] = useState<number | null>(null);
  const [isAdmin, setIsAdmin] = useState(() => {
    if (!user?.id) return false;
    try {
      return localStorage.getItem(`cg_is_admin:${user.id}`) === '1';
    } catch {
      return false;
    }
  });

  // Check admin status
  useEffect(() => {
    const checkAdminStatus = async () => {
      if (!user) {
        navigate('/auth');
        return;
      }

      try {
        const cached = localStorage.getItem(`cg_is_admin:${user.id}`);
        if (cached === '1') {
          setIsAdmin(true);
          return;
        }
      } catch {
        console.log("User is not admin");
      }

      try {
        const { data, error } = await (supabase as unknown as AppUsersRoleClient)
          .from('app_users')
          .select('role')
          .eq('user_id', user.id)
          .single();

        const nextIsAdmin = !error && data && (data.role === 'admin' || data.role === 'super_admin');
        try {
          localStorage.setItem(`cg_is_admin:${user.id}`, nextIsAdmin ? '1' : '0');
        } catch {
          console.log("Failed to set admin status in localStorage");
        }

        if (!nextIsAdmin) {
          toast({
            title: "Access Denied",
            description: "You don't have permission to access this page.",
            variant: "destructive",
          });
          navigate('/leads');
          return;
        }
        setIsAdmin(true);
      } catch (error) {
        console.error('Error checking admin status:', error);
        navigate('/leads');
      }
    };

    checkAdminStatus();
  }, [user, navigate, toast]);

  const getDateRange = useCallback((): { startKey: string; endKey: string } => {
    const now = new Date();
    const anchorNow = new Date(now);
    anchorNow.setUTCHours(12, 0, 0, 0);

    switch (dateFilter) {
      case 'today': {
        const key = formatNYDateKey(anchorNow);
        return { startKey: key, endKey: key };
      }
      case 'yesterday': {
        const yesterday = subDays(anchorNow, 1);
        const key = formatNYDateKey(yesterday);
        return { startKey: key, endKey: key };
      }
      case '7days': {
        return {
          startKey: formatNYDateKey(subDays(anchorNow, 6)),
          endKey: formatNYDateKey(anchorNow),
        };
      }
      case '30days': {
        return {
          startKey: formatNYDateKey(subDays(anchorNow, 29)),
          endKey: formatNYDateKey(anchorNow),
        };
      }
      case 'alltime': {
        return { startKey: '2020-01-01', endKey: formatNYDateKey(anchorNow) };
      }
      case 'custom': {
        if (customStartDate && customEndDate) {
          return { startKey: customStartDate, endKey: customEndDate };
        }
        const key = formatNYDateKey(anchorNow);
        return { startKey: key, endKey: key };
      }
      default: {
        const key = formatNYDateKey(anchorNow);
        return { startKey: key, endKey: key };
      }
    }
  }, [customEndDate, customStartDate, dateFilter]);

  /** Mirror of the active date range, shifted back by one period — used to compute % change. */
  const getPreviousDateRange = useCallback((): { startKey: string; endKey: string } => {
    const now = new Date();
    const anchorNow = new Date(now);
    anchorNow.setUTCHours(12, 0, 0, 0);

    switch (dateFilter) {
      case 'today':
        return { startKey: formatNYDateKey(subDays(anchorNow, 1)), endKey: formatNYDateKey(subDays(anchorNow, 1)) };
      case 'yesterday':
        return { startKey: formatNYDateKey(subDays(anchorNow, 2)), endKey: formatNYDateKey(subDays(anchorNow, 2)) };
      case '7days':
        return {
          startKey: formatNYDateKey(subDays(anchorNow, 13)),
          endKey: formatNYDateKey(subDays(anchorNow, 7)),
        };
      case '30days':
        return {
          startKey: formatNYDateKey(subDays(anchorNow, 59)),
          endKey: formatNYDateKey(subDays(anchorNow, 30)),
        };
      case 'alltime':
        return { startKey: '2019-01-01', endKey: '2019-12-31' };
      case 'custom': {
        if (customStartDate && customEndDate) {
          const startAnchor = new Date(`${customStartDate}T12:00:00Z`);
          const endAnchor = new Date(`${customEndDate}T12:00:00Z`);
          const days = Math.round((endAnchor.getTime() - startAnchor.getTime()) / 86_400_000);
          return {
            startKey: formatNYDateKey(subDays(startAnchor, days + 1)),
            endKey: formatNYDateKey(subDays(startAnchor, 1)),
          };
        }
        return { startKey: formatNYDateKey(subDays(anchorNow, 1)), endKey: formatNYDateKey(subDays(anchorNow, 1)) };
      }
      default:
        return { startKey: formatNYDateKey(subDays(anchorNow, 1)), endKey: formatNYDateKey(subDays(anchorNow, 1)) };
    }
  }, [customEndDate, customStartDate, dateFilter]);

  const rangeLabel = useMemo(() => {
    switch (dateFilter) {
      case 'today':
        return 'Today';
      case 'yesterday':
        return 'Yesterday';
      case '7days':
        return 'Last 7 Days';
      case '30days':
        return 'Last 30 Days';
      case 'alltime':
        return 'All Time';
      case 'custom':
        return customStartDate && customEndDate
          ? `${formatDateUS(customStartDate)} → ${formatDateUS(customEndDate)}`
          : 'Custom Range';
      default:
        return '';
    }
  }, [dateFilter, customStartDate, customEndDate]);

  const fetchAllMetrics = useCallback(async () => {
    if (!isAdmin) return;

    setRefreshing(true);
    try {
      const { startKey, endKey } = getDateRange();
      const { startKey: prevStartKey, endKey: prevEndKey } = getPreviousDateRange();

      const weekKeys = lastNDayKeys(7);
      const prevWeekKeys = lastNDayKeys(7, subDays(new Date(), 7));
      const fourteenStart = prevWeekKeys[0];
      const fourteenEnd = weekKeys[weekKeys.length - 1];

      const baseSelect = 'date, status, call_result, submitted_attorney, submitted_attorney_status';

      // Run all three queries in parallel:
      //   1) the selected-range rows (drives the donut + zone numbers + headline total)
      //   2) the previous-range rows (drives the headline % delta)
      //   3) the 14-day window for the weekly candles + opportunities area chart
      const [rangeRes, prevRangeRes, weeklyRes] = await Promise.all([
        (supabase
          .from('daily_deal_flow')
          .select(baseSelect)
          .not('insured_name', 'ilike', 'Test -%')
          .gte('date', startKey)
          .lte('date', endKey)
          .eq('is_callback', activityType === 'followup')) as unknown as PromiseLike<{
            data: ScoreboardDailyRow[] | null; error: unknown;
          }>,
        (supabase
          .from('daily_deal_flow')
          .select('date')
          .not('insured_name', 'ilike', 'Test -%')
          .gte('date', prevStartKey)
          .lte('date', prevEndKey)
          .eq('is_callback', activityType === 'followup')) as unknown as PromiseLike<{
            data: Array<{ date: string | null }> | null; error: unknown;
          }>,
        (supabase
          .from('daily_deal_flow')
          .select(baseSelect)
          .not('insured_name', 'ilike', 'Test -%')
          .gte('date', fourteenStart)
          .lte('date', fourteenEnd)
          .eq('is_callback', activityType === 'followup')) as unknown as PromiseLike<{
            data: ScoreboardDailyRow[] | null; error: unknown;
          }>,
      ]);

      if (rangeRes.error) throw rangeRes.error;
      if (prevRangeRes.error) throw prevRangeRes.error;
      if (weeklyRes.error) throw weeklyRes.error;

      const rangeRows = (rangeRes.data || []) as ScoreboardDailyRow[];
      const prevRangeRows = prevRangeRes.data || [];
      const weeklyRows = (weeklyRes.data || []) as ScoreboardDailyRow[];

      const aggregated: RangeMetrics = {
        total: rangeRows.length,
        qualified: rangeRows.filter(isQualified).length,
        notQualified: rangeRows.filter(isNotQualified).length,
        noCoverage: rangeRows.filter(isNoCoverage).length,
        submittedToAttorney: rangeRows.filter(isSubmittedToAttorney).length,
        approvedAttorney: rangeRows.filter(isApprovedAttorney).length,
        deniedAttorney: rangeRows.filter(isDeniedAttorney).length,
        qualifiedPayable: rangeRows.filter(isQualifiedPayable).length,
      };
      setRangeMetrics(aggregated);
      setPrevRangeTotal(prevRangeRows.length);

      setWeekly(bucketizeByDay(weeklyRows, weekKeys));
      setPrevWeekly(bucketizeByDay(weeklyRows, prevWeekKeys));
    } catch (error) {
      console.error('Error fetching metrics:', error);
      toast({
        title: "Error",
        description: "Failed to load dashboard metrics. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activityType, getDateRange, getPreviousDateRange, isAdmin, toast]);

  useEffect(() => {
    if (isAdmin) {
      fetchAllMetrics();
    }
  }, [fetchAllMetrics, isAdmin]);

  // Fetch filtered data when selectedFilter or date filter changes
  useEffect(() => {
    const fetchFilteredData = async () => {
      if (!isAdmin) {
        setFilteredData([]);
        setCurrentPage(1);
        return;
      }

      setFilteredLoading(true);
      setCurrentPage(1);
      try {
        const { startKey, endKey } = getDateRange();

        const filteredQuery = supabase
          .from('daily_deal_flow')
          .select('id, date, insured_name, client_phone_number, state, lead_vendor, agent, status, call_result, submitted_attorney, submitted_attorney_status, notes')
          .gte('date', startKey)
          .lte('date', endKey)
          .eq('is_callback', activityType === 'followup');
        const { data, error } = await (filteredQuery as unknown as PromiseLike<{
          data: FilteredRow[] | null;
          error: unknown;
        }>);

        if (error) {
          console.error('Query error:', error);
          throw error;
        }

        const rows = data || [];
        let filtered: FilteredRow[] = [];

        switch (selectedFilter) {
          case 'total_transfers':
            filtered = rows;
            break;
          case 'qualified':
            filtered = rows.filter(isQualified);
            break;
          case 'not_qualified':
            filtered = rows.filter(isNotQualified);
            break;
          case 'submitted_to_attorney':
            filtered = rows.filter(isSubmittedToAttorney);
            break;
          case 'qualified_payable':
            filtered = rows.filter(isQualifiedPayable);
            break;
          case 'no_coverage':
            filtered = rows.filter(isNoCoverage);
            break;
          case 'approved_attorney':
            filtered = rows.filter(isApprovedAttorney);
            break;
          case 'denied_attorney':
            filtered = rows.filter(isDeniedAttorney);
            break;
          default:
            filtered = [];
        }

        setFilteredData(filtered);
      } catch (error) {
        console.error('Error fetching filtered data:', error);
        toast({
          title: "Error",
          description: "Failed to load filtered data.",
          variant: "destructive",
        });
      } finally {
        setFilteredLoading(false);
      }
    };

    fetchFilteredData();
  }, [selectedFilter, getDateRange, activityType, isAdmin, toast]);

  const handleRefresh = () => {
    fetchAllMetrics();
    toast({
      title: "Refreshing...",
      description: "Fetching latest metrics",
    });
  };

  const handleDetailsClick = async (phoneNumber: string | null, notes: string | null = null) => {
    if (!phoneNumber) return;

    setSelectedNotes(notes);
    setShowCallDialog(true);
    setCallsLoading(true);
    setCallRecordings([]);

    try {
      const { startKey, endKey } = getDateRange();
      const fromTimestamp = Math.floor(new Date(`${startKey}T00:00:00Z`).getTime() / 1000);
      const toTimestamp = Math.floor(new Date(`${endKey}T23:59:59Z`).getTime() / 1000);

      const calls = await searchAircallCalls(phoneNumber, fromTimestamp, toTimestamp);
      setCallRecordings(calls.map(call => ({
        id: call.id,
        direction: call.direction,
        status: call.status,
        duration: call.duration,
        started_at: call.started_at,
        recording: call.recording,
        user: call.user,
      })));
    } catch (error) {
      console.error('Error fetching calls:', error);
      toast({
        title: "Error",
        description: "Failed to load call recordings.",
        variant: "destructive",
      });
    } finally {
      setCallsLoading(false);
    }
  };

  const showLeadStateColumn = true;

  const filteredTitle = useMemo(() => {
    switch (selectedFilter) {
      case 'total_transfers':
        return activityType === 'inbound' ? 'All Inbound BPO Transfers' : 'All Followup Calls';
      case 'qualified':
        return 'Qualified Records';
      case 'not_qualified':
        return 'Not Qualified Records';
      case 'qualified_payable':
        return 'Qualified Payable Records';
      case 'submitted_to_attorney':
        return 'Submitted to Attorney Records';
      case 'no_coverage':
        return 'No Coverage Records';
      case 'approved_attorney':
        return 'Approved Attorney Records';
      case 'denied_attorney':
        return 'Denied Attorney Records';
      default:
        return '';
    }
  }, [selectedFilter, activityType]);
  const isInboundTransferList = selectedFilter === 'total_transfers' && activityType === 'inbound';

  if (loading || !isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex items-center gap-2">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span className="text-lg">Loading Dashboard...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="relative min-h-screen">
        {/* Dim orange wash from the top, fading to pure black */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(ellipse_at_top,hsl(var(--primary)/0.18),transparent_60%)]" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />

        <div className="relative container mx-auto px-2 sm:px-4 py-6 sm:py-8">
          <div className="max-w-7xl mx-auto space-y-5">
            <div className="flex flex-col gap-2">
              <span className="inline-flex items-center gap-2 self-start rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[10px] uppercase tracking-wider text-primary">
                <span className="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_8px_hsl(var(--primary))]" />
                Dashboard
              </span>
              <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-white">
                {activityType === 'inbound' ? 'Publisher activity' : 'Internal activity'}
              </h1>
            </div>

            <div
              className="animate-fade-in-up motion-reduce:animate-none"
              style={{ animationDelay: "80ms" }}
            >
              <FilterBar
                activityType={activityType}
                onActivityTypeChange={setActivityType}
                dateFilter={dateFilter}
                onDateFilterChange={setDateFilter}
                customStartDate={customStartDate}
                customEndDate={customEndDate}
                onCustomStartChange={setCustomStartDate}
                onCustomEndChange={setCustomEndDate}
                onRefresh={handleRefresh}
                refreshing={refreshing}
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div
                className="h-full animate-fade-in-up motion-reduce:animate-none"
                style={{ animationDelay: "140ms" }}
              >
                <WeeklyCallsCard
                  activityType={activityType}
                  weekly={weekly}
                  rangeTotal={rangeMetrics.total}
                  prevRangeTotal={prevRangeTotal}
                  rangeLabel={rangeLabel}
                  loading={refreshing}
                />
              </div>
              <div
                className="h-full animate-fade-in-up motion-reduce:animate-none"
                style={{ animationDelay: "200ms" }}
              >
                <QualificationDonutCard
                  qualified={rangeMetrics.qualified}
                  notQualified={rangeMetrics.notQualified}
                  noCoverage={rangeMetrics.noCoverage}
                  selectedFilter={selectedFilter}
                  onSegmentClick={setSelectedFilter}
                  loading={refreshing}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:items-stretch">
              <div
                className="h-full animate-fade-in-up motion-reduce:animate-none"
                style={{ animationDelay: "260ms" }}
              >
                <AttorneyZonesCard
                  submitted={rangeMetrics.submittedToAttorney}
                  approved={rangeMetrics.approvedAttorney}
                  denied={rangeMetrics.deniedAttorney}
                  qualifiedPayable={rangeMetrics.qualifiedPayable}
                  selectedFilter={selectedFilter}
                  onZoneClick={setSelectedFilter}
                  loading={refreshing}
                />
              </div>
              <div className="flex h-full flex-col gap-4">
                <div
                  className="flex-1 animate-fade-in-up motion-reduce:animate-none"
                  style={{ animationDelay: "320ms" }}
                >
                  <OpportunitiesAreaCard
                    weekly={weekly}
                    prevWeekly={prevWeekly}
                    loading={refreshing}
                  />
                </div>
                <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                  <div
                    className="h-full min-w-0 animate-fade-in-up motion-reduce:animate-none"
                    style={{ animationDelay: "370ms" }}
                  >
                    <QuickLinkCard
                      title="Recent Transfers"
                      to="/closer-portal"
                      icon={Briefcase}
                    />
                  </div>
                  <div
                    className="h-full min-w-0 animate-fade-in-up motion-reduce:animate-none"
                    style={{ animationDelay: "410ms" }}
                  >
                    <QuickLinkCard
                      title="Team Performance"
                      to="/closer-scoreboard"
                      icon={Users}
                    />
                  </div>
                </div>
              </div>
            </div>

          {/* Filtered records — always visible, mirrors the active card filter */}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-semibold text-white">
                  {filteredTitle || 'Records'}
                </h2>
                {!filteredLoading && (
                  <span className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-primary">
                    {filteredData.length.toLocaleString()} rows
                  </span>
                )}
              </div>
            </div>

            <div
              className="relative overflow-hidden rounded-2xl border border-primary/20 bg-zinc-900/60 backdrop-blur-xl shadow-xl shadow-black/30 transition-colors hover:border-primary/40 animate-fade-in-up motion-reduce:animate-none"
              style={{ animationDelay: "460ms" }}
            >
              {filteredLoading ? (
                <div className="flex items-center justify-center py-12 text-white/60">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : filteredData.length === 0 ? (
                <div className="text-center py-12 text-white/55 text-sm">
                  No records found for the selected filter.
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-white/[0.06] hover:bg-transparent">
                          <TableHead className="text-[10px] uppercase tracking-wider text-white/45 font-medium">Date</TableHead>
                          <TableHead className="text-[10px] uppercase tracking-wider text-white/45 font-medium">Customer</TableHead>
                          <TableHead className="text-[10px] uppercase tracking-wider text-white/45 font-medium">Phone</TableHead>
                          {showLeadStateColumn && <TableHead className="text-[10px] uppercase tracking-wider text-white/45 font-medium">State</TableHead>}
                          <TableHead className="text-[10px] uppercase tracking-wider text-white/45 font-medium">Agent</TableHead>
                          <TableHead className="text-[10px] uppercase tracking-wider text-white/45 font-medium">Status</TableHead>
                          <TableHead className="text-[10px] uppercase tracking-wider text-white/45 font-medium">Call Result</TableHead>
                          <TableHead className="text-[10px] uppercase tracking-wider text-white/45 font-medium">Submitted Attorney</TableHead>
                          <TableHead className="text-[10px] uppercase tracking-wider text-white/45 font-medium">Attorney</TableHead>
                          <TableHead className="w-16 text-center text-[10px] uppercase tracking-wider text-white/45 font-medium">Details</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredData
                          .slice((currentPage - 1) * recordsPerPage, currentPage * recordsPerPage)
                          .map((row, rowIndex) => {
                            const absoluteRowIndex = (currentPage - 1) * recordsPerPage + rowIndex;
                            const useTransferStripe = isInboundTransferList && absoluteRowIndex % 2 === 0;

                            return (
                              <TableRow
                                key={row.id}
                                className={`border-white/[0.05] text-white/85 transition-colors ${
                                  useTransferStripe
                                    ? 'bg-primary/[0.2] hover:bg-primary/[0.13]'
                                    : 'hover:bg-white/[0.04]'
                                }`}
                              >
                                <TableCell className="font-medium tabular-nums text-white">
                                  {row.date ? formatDateUS(row.date, '-') : '-'}
                                </TableCell>
                                <TableCell>{row.insured_name || '-'}</TableCell>
                                <TableCell className="tabular-nums text-white/70">{row.client_phone_number || '-'}</TableCell>
                                {showLeadStateColumn && <TableCell className="text-white/70">{row.state || '-'}</TableCell>}
                                <TableCell className="text-white/70">{row.agent || '-'}</TableCell>
                                <TableCell className="text-white/70">{row.status || '-'}</TableCell>
                                <TableCell className="text-white/70">{row.call_result || '-'}</TableCell>
                                <TableCell className="text-white/70">{row.submitted_attorney || '-'}</TableCell>
                                <TableCell>
                                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                                    row.submitted_attorney_status === 'submitted' ? 'border-primary/40 bg-primary/15 text-primary' :
                                    row.submitted_attorney_status === 'approved' ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300' :
                                    row.submitted_attorney_status === 'denied' ? 'border-rose-500/40 bg-rose-500/15 text-rose-300' :
                                    row.submitted_attorney_status === 'nocoverage' ? 'border-white/15 bg-white/[0.04] text-white/60' :
                                    'border-white/15 bg-white/[0.04] text-white/60'
                                  }`}>
                                    {row.submitted_attorney_status || '-'}
                                  </span>
                                </TableCell>
                                <TableCell className="text-center">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0 text-white/70 hover:bg-primary/15 hover:text-primary"
                                    onClick={() => {
                                      setSelectedNotes(row.notes);
                                      setSelectedPhone(row.client_phone_number);
                                      setShowCallDialog(true);
                                      if (row.client_phone_number) {
                                        handleDetailsClick(row.client_phone_number, row.notes);
                                      }
                                    }}
                                  >
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                      </TableBody>
                    </Table>
                  </div>

                  {filteredData.length > recordsPerPage && (
                    <div className="flex items-center justify-between px-4 py-3 border-t border-white/[0.06] bg-white/[0.02]">
                      <div className="text-xs text-white/55">
                        Showing {((currentPage - 1) * recordsPerPage) + 1}–
                        {Math.min(currentPage * recordsPerPage, filteredData.length)} of{' '}
                        {filteredData.length.toLocaleString()}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-3 text-xs text-white/70 border border-white/10 bg-white/[0.04] hover:bg-primary/15 hover:text-white hover:border-primary/40"
                          onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                          disabled={currentPage === 1}
                        >
                          Previous
                        </Button>
                        {Array.from({ length: Math.ceil(filteredData.length / recordsPerPage) }, (_, i) => i + 1).slice(
                          Math.max(0, currentPage - 3),
                          Math.min(Math.ceil(filteredData.length / recordsPerPage), currentPage + 2)
                        ).map((page) => (
                          <Button
                            key={page}
                            variant="ghost"
                            size="sm"
                            className={
                              currentPage === page
                                ? 'h-8 w-8 p-0 text-xs bg-primary text-primary-foreground hover:bg-primary/90'
                                : 'h-8 w-8 p-0 text-xs text-white/70 border border-white/10 bg-white/[0.04] hover:bg-primary/15 hover:text-white hover:border-primary/40'
                            }
                            onClick={() => setCurrentPage(page)}
                          >
                            {page}
                          </Button>
                        ))}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-3 text-xs text-white/70 border border-white/10 bg-white/[0.04] hover:bg-primary/15 hover:text-white hover:border-primary/40"
                          onClick={() => setCurrentPage(p => Math.min(Math.ceil(filteredData.length / recordsPerPage), p + 1))}
                          disabled={currentPage >= Math.ceil(filteredData.length / recordsPerPage)}
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Call Recordings Dialog */}
          <Dialog open={showCallDialog} onOpenChange={setShowCallDialog}>
            <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Details - {selectedPhone}</DialogTitle>
              </DialogHeader>
              <Tabs defaultValue="notes" className="w-full">
                <TabsList className="w-full">
                  <TabsTrigger
                    value="notes"
                    className="flex-1 data-[state=active]:bg-blue-100 data-[state=active]:text-blue-700 dark:data-[state=active]:bg-blue-900 dark:data-[state=active]:text-blue-300"
                  >
                    Notes
                  </TabsTrigger>
                  <TabsTrigger
                    value="recordings"
                    className="flex-1 data-[state=active]:bg-emerald-100 data-[state=active]:text-emerald-700 dark:data-[state=active]:bg-emerald-900 dark:data-[state=active]:text-emerald-300"
                  >
                    Call Recordings
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="notes" className="mt-4">
                  <div className="whitespace-pre-wrap text-sm">
                    {selectedNotes || 'No notes available for this record.'}
                  </div>
                </TabsContent>
                <TabsContent value="recordings" className="mt-4">
                  {callsLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-8 w-8 animate-spin" />
                    </div>
                  ) : callRecordings.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No call recordings found for this phone number.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {callRecordings.map((call) => (
                        <div key={call.id} className="flex items-center justify-between p-3 border rounded-lg bg-muted/30">
                          <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-full ${
                              call.direction === 'inbound' ? 'bg-blue-100 dark:bg-blue-900' : 'bg-emerald-100 dark:bg-emerald-900'
                            }`}>
                              <Phone className={`h-4 w-4 ${
                                call.direction === 'inbound' ? 'text-blue-600 dark:text-blue-400' : 'text-emerald-600 dark:text-emerald-400'
                              }`} />
                            </div>
                            <div>
                              <div className="font-medium text-sm">
                                {call.direction === 'inbound' ? 'Incoming' : 'Outgoing'} Call
                              </div>
                              <div className="text-xs text-muted-foreground flex items-center gap-2">
                                <Clock className="h-3 w-3" />
                                {formatTimestamp(call.started_at)}
                                <span className="text-muted-foreground/60">•</span>
                                {formatDuration(call.duration)}
                                <span className="text-muted-foreground/60">•</span>
                                {call.user?.name || 'Unknown'}
                              </div>
                            </div>
                          </div>
                          {call.recording ? (
                            playingRecording === call.id ? (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setPlayingRecording(null)}
                              >
                                <Pause className="h-4 w-4 mr-1" />
                                Stop
                              </Button>
                            ) : (
                              <Button
                                variant="default"
                                size="sm"
                                onClick={() => setPlayingRecording(call.id)}
                              >
                                <Play className="h-4 w-4 mr-1" />
                                Play
                              </Button>
                            )
                          ) : (
                            <span className="text-xs text-muted-foreground">No recording</span>
                          )}
                        </div>
                      ))}
                      {playingRecording && callRecordings.find(c => c.id === playingRecording)?.recording && (
                        <div className="mt-4 p-4 border rounded-lg bg-card">
                          <audio
                            controls
                            autoPlay
                            className="w-full"
                            src={callRecordings.find(c => c.id === playingRecording)?.recording || ''}
                            onEnded={() => setPlayingRecording(null)}
                          />
                        </div>
                      )}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </DialogContent>
          </Dialog>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ScoreboardDashboard;
