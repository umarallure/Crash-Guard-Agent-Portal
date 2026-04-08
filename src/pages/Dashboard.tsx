import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Bar, BarChart, CartesianGrid, XAxis } from 'recharts';
import {
  addDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subMonths,
  subWeeks,
} from 'date-fns';

type DashboardStats = {
  retainers: number;
  transfers: number;
  conversions: number;
  agents: number;
};

type TimeRange = 'this_week' | 'last_week' | 'this_month' | 'last_month';

const getRangeLabel = (range: TimeRange) => {
  switch (range) {
    case 'this_week':
      return 'This Week';
    case 'last_week':
      return 'Last Week';
    case 'this_month':
      return 'This Month';
    case 'last_month':
      return 'Last Month';
  }
};

const getRangeBounds = (range: TimeRange) => {
  const now = new Date();
  if (range === 'this_week') {
    const start = startOfWeek(now, { weekStartsOn: 1 });
    const end = endOfWeek(now, { weekStartsOn: 1 });
    return { start, end };
  }

  if (range === 'last_week') {
    const ref = subWeeks(now, 1);
    const start = startOfWeek(ref, { weekStartsOn: 1 });
    const end = endOfWeek(ref, { weekStartsOn: 1 });
    return { start, end };
  }

  if (range === 'this_month') {
    const start = startOfMonth(now);
    const end = endOfMonth(now);
    return { start, end };
  }

  const ref = subMonths(now, 1);
  const start = startOfMonth(ref);
  const end = endOfMonth(ref);
  return { start, end };
};

const Dashboard = () => {
  const [stats, setStats] = useState<DashboardStats>({
    retainers: 0,
    transfers: 0,
    conversions: 0,
    agents: 0,
  });

  const [timeRange, setTimeRange] = useState<TimeRange>('this_week');

  const [dealFlowTrend, setDealFlowTrend] = useState<
    Array<{ day: string; total: number; pending: number }>
  >([]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const pendingApprovalStatus = 'Pending Approval';

      const { start, end } = getRangeBounds(timeRange);
      const startIso = start.toISOString();
      const endExclusiveIso = addDays(startOfDay(end), 1).toISOString();

      const days = eachDayOfInterval({ start, end });

      const [leadsRes, dailyTotalRes, dailyPendingRes, agentsRes, dealFlowRowsRes] = await Promise.all([
        supabase
          .from('leads')
          .select('*', { count: 'exact', head: true })
          .eq('is_active', true)
          .gte('created_at', startIso)
          .lt('created_at', endExclusiveIso),
        supabase
          .from('daily_deal_flow')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', startIso)
          .lt('created_at', endExclusiveIso),
        supabase
          .from('daily_deal_flow')
          .select('*', { count: 'exact', head: true })
          .eq('status', pendingApprovalStatus),
        supabase.from('agents').select('*', { count: 'exact', head: true }),
        supabase
          .from('daily_deal_flow')
          .select('created_at,status')
          .gte('created_at', startIso)
          .lt('created_at', endExclusiveIso)
          .order('created_at', { ascending: true }),
      ]);

      if (cancelled) return;

      const retainers = dailyPendingRes.count ?? 0;
      const dailyTotal = dailyTotalRes.count ?? 0;
      const conversions = dailyPendingRes.count ?? 0;
      const transfers = dailyTotal;
      const agents = agentsRes.count ?? 0;

      setStats({ retainers, transfers, conversions, agents });

      const rows = (dealFlowRowsRes.data ?? []) as Array<{
        created_at: string | null;
        status: string | null;
      }>;

      const byDay = new Map<string, { total: number; pending: number }>();
      days.forEach((d) => {
        const key = format(d, 'yyyy-MM-dd');
        byDay.set(key, { total: 0, pending: 0 });
      });

      rows.forEach((r) => {
        if (!r.created_at) return;
        const key = format(new Date(r.created_at), 'yyyy-MM-dd');
        const bucket = byDay.get(key);
        if (!bucket) return;
        bucket.total += 1;
        if ((r.status || '').trim() === pendingApprovalStatus) bucket.pending += 1;
      });

      const trend = Array.from(byDay.entries()).map(([key, v]) => ({
        day: format(new Date(key), 'MMM d'),
        total: v.total,
        pending: v.pending,
      }));

      setDealFlowTrend(trend);
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [timeRange]);

  const chartConfig = useMemo(
    () =>
      ({
        total: {
          label: 'Total Deal Flow',
          color: 'hsl(var(--primary))',
        },
        pending: {
          label: 'Pending Approval',
          color: 'hsl(var(--muted-foreground))',
        },
      }) satisfies ChartConfig,
    []
  );

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Retainers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">{stats.retainers}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Transfers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">{stats.transfers}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Conversions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">{stats.conversions}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Closers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">{stats.agents}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle className="text-sm">Daily Deal Flow Trend ({getRangeLabel(timeRange)})</CardTitle>
          <Select value={timeRange} onValueChange={(v) => setTimeRange(v as TimeRange)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="this_week">This Week</SelectItem>
                <SelectItem value="last_week">Last Week</SelectItem>
                <SelectItem value="this_month">This Month</SelectItem>
                <SelectItem value="last_month">Last Month</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className="h-[320px] w-full">
            <BarChart data={dealFlowTrend} margin={{ left: 12, right: 12 }}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="day"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar dataKey="total" fill="var(--color-total)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="pending" fill="var(--color-pending)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>
    </div>
  );
};

export default Dashboard;
