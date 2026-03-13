import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Calendar, RefreshCw, Filter, X, DollarSign, TrendingUp, Phone } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { format, subDays, startOfDay, endOfDay, eachDayOfInterval, parseISO } from 'date-fns';

interface DailyStat {
  date: string;
  total_transfers: number;
  total_premium: number;
  unique_vendors: number;
  unique_agents: number;
}

export const DailyPage = () => {
  const { toast } = useToast();

  // State
  const [loading, setLoading] = useState(true);
  const [dailyStats, setDailyStats] = useState<DailyStat[]>([]);
  
  // Time range filter
  const [timeRange, setTimeRange] = useState<string>('30days');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  useEffect(() => {
    fetchDailyStats();
  }, [timeRange, customStartDate, customEndDate]);

  const getDateRange = (): { start: Date; end: Date } => {
    const now = new Date();
    const end = endOfDay(now);
    
    switch (timeRange) {
      case 'today':
        return { start: startOfDay(now), end };
      case '7days':
        return { start: startOfDay(subDays(now, 7)), end };
      case '30days':
        return { start: startOfDay(subDays(now, 30)), end };
      case '90days':
        return { start: startOfDay(subDays(now, 90)), end };
      case 'custom':
        if (customStartDate && customEndDate) {
          return {
            start: startOfDay(new Date(customStartDate)),
            end: endOfDay(new Date(customEndDate))
          };
        }
        return { start: startOfDay(subDays(now, 30)), end };
      default:
        return { start: startOfDay(subDays(now, 30)), end };
    }
  };

  const fetchDailyStats = async () => {
    setLoading(true);
    try {
      const { start, end } = getDateRange();

      const { data, error } = await supabase
        .from('daily_deal_flow')
        .select('date, lead_vendor, licensed_agent_account, monthly_premium')
        .not('insured_name', 'ilike', 'Test -%')
        .gte('date', format(start, 'yyyy-MM-dd'))
        .lte('date', format(end, 'yyyy-MM-dd'));

      if (error) throw error;

      // Group by date
      const dateMap = new Map<string, {
        transfers: number;
        premium: number;
        vendors: Set<string>;
        agents: Set<string>;
      }>();

      // Initialize all days in range
      const allDays = eachDayOfInterval({ start, end });
      allDays.forEach(day => {
        const dateKey = format(day, 'yyyy-MM-dd');
        dateMap.set(dateKey, {
          transfers: 0,
          premium: 0,
          vendors: new Set(),
          agents: new Set()
        });
      });

      // Populate with actual data
      data?.forEach(item => {
        if (!item.date) return;
        
        const existing = dateMap.get(item.date) || {
          transfers: 0,
          premium: 0,
          vendors: new Set<string>(),
          agents: new Set<string>()
        };
        
        existing.transfers += 1;
        
        // Parse premium (handle currency formatting)
        if (item.monthly_premium) {
          const premiumStr = String(item.monthly_premium).replace(/[^0-9.-]+/g, '');
          const premium = parseFloat(premiumStr) || 0;
          existing.premium += premium;
        }
        
        if (item.lead_vendor) {
          existing.vendors.add(item.lead_vendor);
        }
        
        if (item.licensed_agent_account) {
          existing.agents.add(item.licensed_agent_account);
        }
        
        dateMap.set(item.date, existing);
      });

      // Convert to array and sort by date descending (most recent first)
      const stats: DailyStat[] = Array.from(dateMap.entries())
        .map(([date, data]) => ({
          date,
          total_transfers: data.transfers,
          total_premium: data.premium,
          unique_vendors: data.vendors.size,
          unique_agents: data.agents.size
        }))
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      setDailyStats(stats);
    } catch (error) {
      console.error('Error fetching daily stats:', error);
      toast({
        title: "Error",
        description: "Failed to load daily statistics. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClearFilters = () => {
    setTimeRange('30days');
    setCustomStartDate('');
    setCustomEndDate('');
  };

  const handleRefresh = () => {
    fetchDailyStats();
    toast({
      title: "Refreshing data...",
      description: "Fetching latest daily statistics",
    });
  };

  // Calculate summary stats
  const totalTransfers = dailyStats.reduce((sum, d) => sum + d.total_transfers, 0);
  const totalPremium = dailyStats.reduce((sum, d) => sum + d.total_premium, 0);
  const avgDailyTransfers = dailyStats.length > 0 ? (totalTransfers / dailyStats.length).toFixed(1) : '0';
  const daysWithData = dailyStats.filter(d => d.total_transfers > 0).length;

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-blue-50 border-blue-100">
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Phone className="h-4 w-4 text-blue-600" />
              <span className="text-sm text-blue-700 font-medium">Total Transfers</span>
            </div>
            <p className="text-2xl font-bold text-blue-900">{totalTransfers.toLocaleString()}</p>
            <p className="text-xs text-blue-600 mt-1">In selected period</p>
          </CardContent>
        </Card>

        <Card className="bg-green-50 border-green-100">
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <DollarSign className="h-4 w-4 text-green-600" />
              <span className="text-sm text-green-700 font-medium">Total Premium</span>
            </div>
            <p className="text-2xl font-bold text-green-900">${totalPremium.toLocaleString()}</p>
            <p className="text-xs text-green-600 mt-1">Combined monthly premium</p>
          </CardContent>
        </Card>

        <Card className="bg-purple-50 border-purple-100">
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <TrendingUp className="h-4 w-4 text-purple-600" />
              <span className="text-sm text-purple-700 font-medium">Avg Daily Transfers</span>
            </div>
            <p className="text-2xl font-bold text-purple-900">{avgDailyTransfers}</p>
            <p className="text-xs text-purple-600 mt-1">Transfers per day</p>
          </CardContent>
        </Card>

        <Card className="bg-orange-50 border-orange-100">
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Calendar className="h-4 w-4 text-orange-600" />
              <span className="text-sm text-orange-700 font-medium">Active Days</span>
            </div>
            <p className="text-2xl font-bold text-orange-900">{daysWithData}</p>
            <p className="text-xs text-orange-600 mt-1">Days with transfers</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center space-x-2">
              <Filter className="h-5 w-5" />
              <span>Filters</span>
            </CardTitle>
            <div className="flex items-center space-x-2">
              <Button variant="outline" size="sm" onClick={handleClearFilters}>
                <X className="h-4 w-4 mr-2" />
                Clear
              </Button>
              <Button variant="default" size="sm" onClick={handleRefresh}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="time-range">Time Range</Label>
            <Select value={timeRange} onValueChange={setTimeRange}>
              <SelectTrigger id="time-range">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="7days">Last 7 Days</SelectItem>
                <SelectItem value="30days">Last 30 Days</SelectItem>
                <SelectItem value="90days">Last 90 Days</SelectItem>
                <SelectItem value="custom">Custom Range</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {timeRange === 'custom' && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="start-date">Start Date</Label>
                <Input
                  id="start-date"
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="end-date">End Date</Label>
                <Input
                  id="end-date"
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Daily Stats Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Calendar className="h-5 w-5" />
            <span>Daily Breakdown</span>
            <Badge variant="outline">{dailyStats.length} Days</Badge>
          </CardTitle>
          <CardDescription>
            Daily transfers and premium from the daily deal flow
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
              <p className="mt-4 text-muted-foreground">Loading daily statistics...</p>
            </div>
          ) : (
            <div className="space-y-3">
              {dailyStats.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p className="text-lg font-medium">No data available</p>
                  <p className="text-sm">Try selecting a different time range</p>
                </div>
              ) : (
                dailyStats.map((stat) => (
                  <Card key={stat.date} className={`hover:shadow-md transition-shadow ${stat.total_transfers === 0 ? 'opacity-50' : ''}`}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-4">
                          <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-blue-100 text-blue-600">
                            <Calendar className="h-5 w-5" />
                          </div>
                          <div>
                            <h3 className="font-semibold text-lg">
                              {format(parseISO(stat.date), 'EEEE, MMM d, yyyy')}
                            </h3>
                            <p className="text-xs text-muted-foreground">
                              {stat.unique_vendors} vendors • {stat.unique_agents} agents
                            </p>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-8">
                          <div className="text-center">
                            <p className="text-3xl font-bold text-blue-600">
                              {stat.total_transfers}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">Transfers</p>
                          </div>
                          <div className="text-center">
                            <p className="text-3xl font-bold text-green-600">
                              ${stat.total_premium.toLocaleString()}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">Premium</p>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default DailyPage;
