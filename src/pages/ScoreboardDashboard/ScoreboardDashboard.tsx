import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { Calendar, RefreshCw, Send, FileText, CheckCircle, XCircle, AlertCircle, TrendingUp, TrendingDown, Minus, DollarSign, Eye } from 'lucide-react';
import { subDays, format, parseISO } from 'date-fns';
import { Loader2 } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface FilteredRow {
  id: string;
  date: string | null;
  insured_name: string | null;
  client_phone_number: string | null;
  lead_vendor: string | null;
  agent: string | null;
  status: string | null;
  call_result: string | null;
  submitted_attorney: string | null;
  submitted_attorney_status: string | null;
  notes: string | null;
}

interface DashboardMetrics {
  totalTransfers: number;
  pendingApproval: number;
  approved: number;
  qualified: number;
  missingInfo: number;
  notQualified: number;
  returnedToCenter: number;
  submittedToAttorney: number;
  qualifiedPayable: number;
  
  // Performance rates
  transferRate: number;
  qualifyingRate: number;
  billableRate: number;
  returnBackRate: number;
  
  // Counts for rates
  transferCount: number;
  transferTotal: number;
  qualifyingCount: number;
  qualifyingTotal: number;
  billableCount: number;
  billableTotal: number;
  returnBackCount: number;
  returnBackTotal: number;
  
  // Percentage changes
  totalTransfersChange: number;
  pendingApprovalChange: number;
  approvedChange: number;
  qualifiedChange: number;
  missingInfoChange: number;
  notQualifiedChange: number;
  returnedToCenterChange: number;
  submittedToAttorneyChange: number;
  qualifiedPayableChange: number;
  transferRateChange: number;
  qualifyingRateChange: number;
  billableRateChange: number;
  returnBackRateChange: number;
}

const ScoreboardDashboard = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const formatNYDateKey = useCallback((date: Date): string => {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  }, []);
  
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    totalTransfers: 0,
    pendingApproval: 0,
    approved: 0,
    qualified: 0,
    missingInfo: 0,
    notQualified: 0,
    returnedToCenter: 0,
    submittedToAttorney: 0,
    qualifiedPayable: 0,
    transferRate: 0,
    qualifyingRate: 0,
    billableRate: 0,
    returnBackRate: 0,
    transferCount: 0,
    transferTotal: 0,
    qualifyingCount: 0,
    qualifyingTotal: 0,
    billableCount: 0,
    billableTotal: 0,
    returnBackCount: 0,
    returnBackTotal: 0,
    totalTransfersChange: 0,
    pendingApprovalChange: 0,
    approvedChange: 0,
    qualifiedChange: 0,
    missingInfoChange: 0,
    notQualifiedChange: 0,
    returnedToCenterChange: 0,
    submittedToAttorneyChange: 0,
    qualifiedPayableChange: 0,
    transferRateChange: 0,
    qualifyingRateChange: 0,
    billableRateChange: 0,
    returnBackRateChange: 0,
  });
  
  const [dateFilter, setDateFilter] = useState<string>('today');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<string | null>(null);
  const [filteredData, setFilteredData] = useState<FilteredRow[]>([]);
  const [filteredLoading, setFilteredLoading] = useState(false);
  const [showNotesDialog, setShowNotesDialog] = useState(false);
  const [selectedNotes, setSelectedNotes] = useState<string | null>(null);
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
        // Check if user has admin role in app_users table
        const { data, error } = await (supabase as any)
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
    // Use a UTC-midday anchor to avoid DST boundary issues when shifting days.
    const now = new Date();
    const anchorNow = new Date(now);
    anchorNow.setUTCHours(12, 0, 0, 0);

    switch (dateFilter) {
      case 'today': {
        const key = formatNYDateKey(anchorNow);
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
      case 'custom': {
        if (customStartDate && customEndDate) {
          // These are already yyyy-MM-dd; treat them as NY-local date keys.
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
  }, [customEndDate, customStartDate, dateFilter, formatNYDateKey]);

  const getPreviousDateRange = useCallback((): { startKey: string; endKey: string } => {
    const now = new Date();
    const anchorNow = new Date(now);
    anchorNow.setUTCHours(12, 0, 0, 0);

    switch (dateFilter) {
      case 'today': {
        const key = formatNYDateKey(subDays(anchorNow, 1));
        return { startKey: key, endKey: key };
      }
      case '7days': {
        return {
          startKey: formatNYDateKey(subDays(anchorNow, 13)),
          endKey: formatNYDateKey(subDays(anchorNow, 7)),
        };
      }
      case '30days': {
        return {
          startKey: formatNYDateKey(subDays(anchorNow, 59)),
          endKey: formatNYDateKey(subDays(anchorNow, 30)),
        };
      }
      case 'custom': {
        if (customStartDate && customEndDate) {
          const startAnchor = new Date(`${customStartDate}T12:00:00Z`);
          const endAnchor = new Date(`${customEndDate}T12:00:00Z`);
          const daysDiff = Math.round((endAnchor.getTime() - startAnchor.getTime()) / (1000 * 60 * 60 * 24));
          return {
            startKey: formatNYDateKey(subDays(startAnchor, daysDiff + 1)),
            endKey: formatNYDateKey(subDays(startAnchor, 1)),
          };
        }
        const key = formatNYDateKey(subDays(anchorNow, 1));
        return { startKey: key, endKey: key };
      }
      default: {
        const key = formatNYDateKey(subDays(anchorNow, 1));
        return { startKey: key, endKey: key };
      }
    }
  }, [customEndDate, customStartDate, dateFilter, formatNYDateKey]);

  const fetchMetrics = useCallback(async () => {
    if (!isAdmin) return;
    
    setRefreshing(true);
    try {
      const { startKey, endKey } = getDateRange();
      const { startKey: prevStartKey, endKey: prevEndKey } = getPreviousDateRange();

      // Fetch current period data
      const { data, error } = await (supabase
        .from('daily_deal_flow')
        .select('status, call_result, submitted_attorney, submitted_attorney_status') as any)
        .gte('date', startKey)
        .lte('date', endKey);

      if (error) throw error;

      // Fetch previous period data for comparison
      const { data: prevData, error: prevError } = await (supabase
        .from('daily_deal_flow')
        .select('status, call_result, submitted_attorney, submitted_attorney_status') as any)
        .gte('date', prevStartKey)
        .lte('date', prevEndKey);

      if (prevError) throw prevError;

      const totalTransfers = data?.length || 0;
      const prevTotalTransfers = prevData?.length || 0;
      
      // Count by status field from daily_deal_flow
      const pendingApproval = data?.filter(d => 
        d.status?.toLowerCase().includes('pending approval') ||
        d.status?.toLowerCase().includes('pending_approval')
      ).length || 0;
      
      const approved = data?.filter(d => 
        d.status?.toLowerCase().includes('approved') ||
        d.status?.toLowerCase().includes('qualified_approved')
      ).length || 0;
      
      const qualified = data?.filter(d => 
        d.call_result?.toLowerCase() === 'qualified' ||
        d.status?.toLowerCase().includes('qualified')
      ).length || 0;

      const missingInfo = data?.filter(d => {
        const status = (d.status || '').toLowerCase();
        return (
          status === 'qualified_missing_info' ||
          status.includes('qualified: missing information') ||
          status.includes('missing information')
        );
      }).length || 0;
      
      const notQualified = data?.filter(d => 
        d.call_result?.toLowerCase() === 'not qualified' ||
        d.status?.toLowerCase().includes('not_qualified')
      ).length || 0;
      
      const returnedToCenter = data?.filter(d => 
        d.status?.toLowerCase().includes('returned to center') ||
        d.status?.toLowerCase().includes('returned_to_center')
      ).length || 0;

      // Submitted to Attorney: submitted_attorney is not null AND not "No Coverage"
      const submittedToAttorney = data?.filter(d => 
        d.submitted_attorney && 
        d.submitted_attorney_status !== 'nocoverage'
      ).length || 0;

      // Qualified Payable: status is "qualified_payable"
      const qualifiedPayable = data?.filter(d => 
        d.status?.toLowerCase() === 'qualified_payable'
      ).length || 0;

      // Calculate performance rates based on status field
      // Transfer Rate: Total transfers that moved forward / Total Transfers
      const transferCount = data?.filter(d => 
        d.status && !d.status.toLowerCase().includes('incomplete') && 
        !d.status.toLowerCase().includes('not_qualified')
      ).length || 0;
      const transferTotal = totalTransfers;
      const transferRate = transferTotal > 0 ? (transferCount / transferTotal) * 100 : 0;

      // Qualifying Rate: call_result is qualified / Total Transfers
      const qualifyingCount = data?.filter(d => (d.call_result || '').toLowerCase() === 'qualified').length || 0;
      const qualifyingTotal = totalTransfers;
      const qualifyingRate = qualifyingTotal > 0 ? (qualifyingCount / qualifyingTotal) * 100 : 0;

      // Billable Rate: Status is qualified_payable OR label is Qualified/Payable
      const billableCount = data?.filter(d => {
        const status = (d.status || '').toLowerCase();
        return status === 'qualified_payable' || status.includes('qualified/payable');
      }).length || 0;
      const billableTotal = totalTransfers;
      const billableRate = billableTotal > 0 ? (billableCount / billableTotal) * 100 : 0;

      // Return Back Rate: Returned to Center / Total Transfers
      const returnBackCount = returnedToCenter;
      const returnBackTotal = totalTransfers;
      const returnBackRate = returnBackTotal > 0 ? (returnBackCount / returnBackTotal) * 100 : 0;

      // Calculate previous period metrics for comparison
      const prevPendingApproval = prevData?.filter(d => 
        d.status?.toLowerCase().includes('pending approval') ||
        d.status?.toLowerCase().includes('pending_approval')
      ).length || 0;
      
      const prevApproved = prevData?.filter(d => 
        d.status?.toLowerCase().includes('approved') ||
        d.status?.toLowerCase().includes('qualified_approved')
      ).length || 0;
      
      const prevQualified = prevData?.filter(d => 
        d.call_result?.toLowerCase() === 'qualified' ||
        d.status?.toLowerCase().includes('qualified')
      ).length || 0;

      const prevMissingInfo = prevData?.filter(d => {
        const status = (d.status || '').toLowerCase();
        return (
          status === 'qualified_missing_info' ||
          status.includes('qualified: missing information') ||
          status.includes('missing information')
        );
      }).length || 0;
      
      const prevNotQualified = prevData?.filter(d => 
        d.call_result?.toLowerCase() === 'not qualified' ||
        d.status?.toLowerCase().includes('not_qualified')
      ).length || 0;
      
      const prevReturnedToCenter = prevData?.filter(d => 
        d.status?.toLowerCase().includes('returned to center') ||
        d.status?.toLowerCase().includes('returned_to_center')
      ).length || 0;

      // Previous period calculations for new metrics
      const prevSubmittedToAttorney = prevData?.filter(d => 
        d.submitted_attorney && 
        d.submitted_attorney_status !== 'nocoverage'
      ).length || 0;

      const prevQualifiedPayable = prevData?.filter(d => 
        d.status?.toLowerCase() === 'qualified_payable'
      ).length || 0;

      const prevTransferCount = prevData?.filter(d => 
        d.status && !d.status.toLowerCase().includes('incomplete') && 
        !d.status.toLowerCase().includes('not_qualified')
      ).length || 0;
      const prevTransferRate = prevTotalTransfers > 0 ? (prevTransferCount / prevTotalTransfers) * 100 : 0;

      const prevQualifyingCount = prevData?.filter(d => (d.call_result || '').toLowerCase() === 'qualified').length || 0;
      const prevQualifyingRate = prevTotalTransfers > 0 ? (prevQualifyingCount / prevTotalTransfers) * 100 : 0;

      const prevBillableCount = prevData?.filter(d => {
        const status = (d.status || '').toLowerCase();
        return status === 'qualified_payable' || status.includes('qualified/payable');
      }).length || 0;
      const prevBillableRate = prevTotalTransfers > 0 ? (prevBillableCount / prevTotalTransfers) * 100 : 0;

      const prevReturnBackRate = prevTotalTransfers > 0 ? (prevReturnedToCenter / prevTotalTransfers) * 100 : 0;

      // Calculate percentage changes
      const calculateChange = (current: number, previous: number): number => {
        if (previous === 0) return current > 0 ? 100 : 0;
        return ((current - previous) / previous) * 100;
      };

      setMetrics({
        totalTransfers,
        pendingApproval,
        approved,
        qualified,
        missingInfo,
        notQualified,
        returnedToCenter,
        submittedToAttorney,
        qualifiedPayable,
        transferRate,
        qualifyingRate,
        billableRate,
        returnBackRate,
        transferCount,
        transferTotal,
        qualifyingCount,
        qualifyingTotal,
        billableCount,
        billableTotal,
        returnBackCount,
        returnBackTotal,
        totalTransfersChange: calculateChange(totalTransfers, prevTotalTransfers),
        pendingApprovalChange: calculateChange(pendingApproval, prevPendingApproval),
        approvedChange: calculateChange(approved, prevApproved),
        qualifiedChange: calculateChange(qualified, prevQualified),
        missingInfoChange: calculateChange(missingInfo, prevMissingInfo),
        notQualifiedChange: calculateChange(notQualified, prevNotQualified),
        returnedToCenterChange: calculateChange(returnedToCenter, prevReturnedToCenter),
        submittedToAttorneyChange: calculateChange(submittedToAttorney, prevSubmittedToAttorney),
        qualifiedPayableChange: calculateChange(qualifiedPayable, prevQualifiedPayable),
        transferRateChange: calculateChange(transferRate, prevTransferRate),
        qualifyingRateChange: calculateChange(qualifyingRate, prevQualifyingRate),
        billableRateChange: calculateChange(billableRate, prevBillableRate),
        returnBackRateChange: calculateChange(returnBackRate, prevReturnBackRate),
      });
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
  }, [getDateRange, getPreviousDateRange, isAdmin, toast]);

  useEffect(() => {
    if (isAdmin) {
      fetchMetrics();
    }
  }, [fetchMetrics, isAdmin]);

  // Fetch filtered data when selectedFilter or date filter changes
  useEffect(() => {
    const fetchFilteredData = async () => {
      if (!selectedFilter || !isAdmin) {
        setFilteredData([]);
        return;
      }

      setFilteredLoading(true);
      try {
        // Calculate date range directly in the effect
        const now = new Date();
        const anchorNow = new Date(now);
        anchorNow.setUTCHours(12, 0, 0, 0);
        
        let startKey: string;
        let endKey: string;
        
        switch (dateFilter) {
          case 'today': {
            startKey = formatNYDateKey(anchorNow);
            endKey = startKey;
            break;
          }
          case '7days': {
            startKey = formatNYDateKey(subDays(anchorNow, 6));
            endKey = formatNYDateKey(anchorNow);
            break;
          }
          case '30days': {
            startKey = formatNYDateKey(subDays(anchorNow, 29));
            endKey = formatNYDateKey(anchorNow);
            break;
          }
          case 'custom': {
            if (customStartDate && customEndDate) {
              startKey = customStartDate;
              endKey = customEndDate;
            } else {
              startKey = formatNYDateKey(anchorNow);
              endKey = startKey;
            }
            break;
          }
          default: {
            startKey = formatNYDateKey(anchorNow);
            endKey = startKey;
          }
        }
        
        const { data, error } = await (supabase
          .from('daily_deal_flow')
          .select('id, date, insured_name, client_phone_number, lead_vendor, agent, status, call_result, submitted_attorney, submitted_attorney_status, notes')
          .gte('date', startKey)
          .lte('date', endKey) as any);

        if (error) {
          console.error('Query error:', error);
          throw error;
        }

        let filtered: FilteredRow[] = [];
        
        switch (selectedFilter) {
          case 'total_transfers':
            filtered = (data || []);
            break;
          case 'qualified':
            filtered = (data || []).filter((d: any) => 
              d.call_result?.toLowerCase() === 'qualified' ||
              d.status?.toLowerCase().includes('qualified')
            );
            break;
          case 'not_qualified':
            filtered = (data || []).filter((d: any) => 
              d.call_result?.toLowerCase() === 'not qualified' ||
              d.status?.toLowerCase().includes('not_qualified')
            );
            break;
          case 'missing_info':
            filtered = (data || []).filter((d: any) => {
              const status = (d.status || '').toLowerCase();
              return (
                status === 'qualified_missing_info' ||
                status.includes('qualified: missing information') ||
                status.includes('missing information')
              );
            });
            break;
          case 'returned_to_center':
            filtered = (data || []).filter((d: any) => 
              d.status?.toLowerCase().includes('returned to center') ||
              d.status?.toLowerCase().includes('returned_to_center')
            );
            break;
          case 'submitted_to_attorney':
            filtered = (data || []).filter((d: any) => 
              d.submitted_attorney && 
              d.submitted_attorney_status !== 'nocoverage'
            );
            break;
          case 'qualified_payable':
            filtered = (data || []).filter((d: any) => 
              d.status?.toLowerCase() === 'qualified_payable'
            );
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
  }, [selectedFilter, dateFilter, customStartDate, customEndDate, isAdmin, toast, formatNYDateKey]);

  const handleRefresh = () => {
    fetchMetrics();
    toast({
      title: "Refreshing...",
      description: "Fetching latest metrics",
    });
  };

  const getPerformanceIcon = (rate: number, target: number) => {
    if (rate > target) return <TrendingUp className="h-4 w-4 text-green-600" />;
    if (rate < target) return <TrendingDown className="h-4 w-4 text-red-600" />;
    return <Minus className="h-4 w-4 text-gray-600" />;
  };

  const getPerformanceColor = (rate: number, target: number) => {
    if (rate > target) return 'text-green-600';
    if (rate < target) return 'text-red-600';
    return 'text-gray-600';
  };

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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <div className="container mx-auto px-2 sm:px-4 py-6 sm:py-8">
        <div className="max-w-7xl mx-auto space-y-6">

          {/* Date Filter - Compact */}
          <Card className="border">
            <CardContent className="pt-4 sm:pt-6">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <Label htmlFor="time-range" className="text-sm font-medium">Date Filter:</Label>
                </div>
                <Select value={dateFilter} onValueChange={setDateFilter}>
                  <SelectTrigger id="time-range" className="w-full sm:w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="today">Today</SelectItem>
                    <SelectItem value="7days">Last 7 Days</SelectItem>
                    <SelectItem value="30days">Last 30 Days</SelectItem>
                    <SelectItem value="custom">Custom Range</SelectItem>
                  </SelectContent>
                </Select>

                {dateFilter === 'custom' && (
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 w-full sm:w-auto">
                    <Input
                      id="start-date"
                      type="date"
                      value={customStartDate}
                      onChange={(e) => setCustomStartDate(e.target.value)}
                      className="w-full sm:w-[160px]"
                      placeholder="Start Date"
                    />
                    <span className="text-muted-foreground hidden sm:inline">to</span>
                    <Input
                      id="end-date"
                      type="date"
                      value={customEndDate}
                      onChange={(e) => setCustomEndDate(e.target.value)}
                      className="w-full sm:w-[160px]"
                      placeholder="End Date"
                    />
                  </div>
                )}
                <Button
                  variant="outline"
                  onClick={handleRefresh}
                  disabled={refreshing}
                  className="flex items-center justify-center gap-2 w-full sm:w-auto sm:ml-auto"
                >
                  <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Key Metrics */}
          <div>
            <h2 className="text-lg sm:text-xl font-semibold mb-4">Key Metrics</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-7 gap-4">
              {/* Total Transfers */}
              <Card className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900 border-blue-200 dark:border-blue-800 hover:shadow-lg transition-shadow cursor-pointer" onClick={() => setSelectedFilter('total_transfers')}>
                <CardContent className="p-4 sm:p-6">
                  <div className="flex items-center justify-center mb-3">
                    <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-full bg-blue-500 flex items-center justify-center">
                      <Send className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
                    </div>
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium text-blue-700 dark:text-blue-300 uppercase tracking-wide">Total Transfers</p>
                    <p className="text-3xl sm:text-4xl font-bold text-blue-900 dark:text-blue-100 mt-2">{metrics.totalTransfers}</p>
                    <p className={`text-xs mt-1 font-medium ${
                      metrics.totalTransfersChange > 0 ? 'text-green-600 dark:text-green-400' : 
                      metrics.totalTransfersChange < 0 ? 'text-red-600 dark:text-red-400' : 
                      'text-gray-600 dark:text-gray-400'
                    }`}>
                      {metrics.totalTransfersChange > 0 ? '+' : ''}{metrics.totalTransfersChange.toFixed(1)}%
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Qualified */}
              <Card className="bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-950 dark:to-emerald-900 border-emerald-200 dark:border-emerald-800 hover:shadow-lg transition-shadow cursor-pointer" onClick={() => setSelectedFilter('qualified')}>
                <CardContent className="p-4 sm:p-6">
                  <div className="flex items-center justify-center mb-3">
                    <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-full bg-emerald-500 flex items-center justify-center">
                      <CheckCircle className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
                    </div>
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300 uppercase tracking-wide">Qualified</p>
                    <p className="text-3xl sm:text-4xl font-bold text-emerald-900 dark:text-emerald-100 mt-2">{metrics.qualified}</p>
                    <p className={`text-xs mt-1 font-medium ${
                      metrics.qualifiedChange > 0 ? 'text-green-600 dark:text-green-400' : 
                      metrics.qualifiedChange < 0 ? 'text-red-600 dark:text-red-400' : 
                      'text-gray-600 dark:text-gray-400'
                    }`}>
                      {metrics.qualifiedChange > 0 ? '+' : ''}{metrics.qualifiedChange.toFixed(1)}%
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Not Qualified */}
              <Card className="bg-gradient-to-br from-red-50 to-red-100 dark:from-red-950 dark:to-red-900 border-red-200 dark:border-red-800 hover:shadow-lg transition-shadow cursor-pointer" onClick={() => setSelectedFilter('not_qualified')}>
                <CardContent className="p-4 sm:p-6">
                  <div className="flex items-center justify-center mb-3">
                    <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-full bg-red-500 flex items-center justify-center">
                      <XCircle className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
                    </div>
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium text-red-700 dark:text-red-300 uppercase tracking-wide">Not Qualified</p>
                    <p className="text-3xl sm:text-4xl font-bold text-red-900 dark:text-red-100 mt-2">{metrics.notQualified}</p>
                    <p className={`text-xs mt-1 font-medium ${
                      metrics.notQualifiedChange < 0 ? 'text-green-600 dark:text-green-400' : 
                      metrics.notQualifiedChange > 0 ? 'text-red-600 dark:text-red-400' : 
                      'text-gray-600 dark:text-gray-400'
                    }`}>
                      {metrics.notQualifiedChange > 0 ? '+' : ''}{metrics.notQualifiedChange.toFixed(1)}%
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Submitted to Attorney */}
              <Card className="bg-gradient-to-br from-violet-50 to-violet-100 dark:from-violet-950 dark:to-violet-900 border-violet-200 dark:border-violet-800 hover:shadow-lg transition-shadow cursor-pointer" onClick={() => setSelectedFilter('submitted_to_attorney')}>
                <CardContent className="p-4 sm:p-6">
                  <div className="flex items-center justify-center mb-3">
                    <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-full bg-violet-500 flex items-center justify-center">
                      <Send className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
                    </div>
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium text-violet-700 dark:text-violet-300 uppercase tracking-wide">Submitted to Attorney</p>
                    <p className="text-3xl sm:text-4xl font-bold text-violet-900 dark:text-violet-100 mt-2">{metrics.submittedToAttorney}</p>
                    <p className={`text-xs mt-1 font-medium ${
                      metrics.submittedToAttorneyChange > 0 ? 'text-green-600 dark:text-green-400' : 
                      metrics.submittedToAttorneyChange < 0 ? 'text-red-600 dark:text-red-400' : 
                      'text-gray-600 dark:text-gray-400'
                    }`}>
                      {metrics.submittedToAttorneyChange > 0 ? '+' : ''}{metrics.submittedToAttorneyChange.toFixed(1)}%
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Qualified Payable */}
              <Card className="bg-gradient-to-br from-teal-50 to-teal-100 dark:from-teal-950 dark:to-teal-900 border-teal-200 dark:border-teal-800 hover:shadow-lg transition-shadow cursor-pointer" onClick={() => setSelectedFilter('qualified_payable')}>
                <CardContent className="p-4 sm:p-6">
                  <div className="flex items-center justify-center mb-3">
                    <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-full bg-teal-500 flex items-center justify-center">
                      <DollarSign className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
                    </div>
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium text-teal-700 dark:text-teal-300 uppercase tracking-wide">Qualified Payable</p>
                    <p className="text-3xl sm:text-4xl font-bold text-teal-900 dark:text-teal-100 mt-2">{metrics.qualifiedPayable}</p>
                    <p className={`text-xs mt-1 font-medium ${
                      metrics.qualifiedPayableChange > 0 ? 'text-green-600 dark:text-green-400' : 
                      metrics.qualifiedPayableChange < 0 ? 'text-red-600 dark:text-red-400' : 
                      'text-gray-600 dark:text-gray-400'
                    }`}>
                      {metrics.qualifiedPayableChange > 0 ? '+' : ''}{metrics.qualifiedPayableChange.toFixed(1)}%
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Missing Info */}
              <Card className="bg-gradient-to-br from-sky-50 to-sky-100 dark:from-sky-950 dark:to-sky-900 border-sky-200 dark:border-sky-800 hover:shadow-lg transition-shadow cursor-pointer" onClick={() => setSelectedFilter('missing_info')}>
                <CardContent className="p-4 sm:p-6">
                  <div className="flex items-center justify-center mb-3">
                    <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-full bg-sky-500 flex items-center justify-center">
                      <FileText className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
                    </div>
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium text-sky-700 dark:text-sky-300 uppercase tracking-wide">Missing Info</p>
                    <p className="text-3xl sm:text-4xl font-bold text-sky-900 dark:text-sky-100 mt-2">{metrics.missingInfo}</p>
                    <p className={`text-xs mt-1 font-medium ${
                      metrics.missingInfoChange < 0 ? 'text-green-600 dark:text-green-400' : 
                      metrics.missingInfoChange > 0 ? 'text-red-600 dark:text-red-400' : 
                      'text-gray-600 dark:text-gray-400'
                    }`}>
                      {metrics.missingInfoChange > 0 ? '+' : ''}{metrics.missingInfoChange.toFixed(1)}%
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Returned to Center */}
              <Card className="bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-950 dark:to-orange-900 border-orange-200 dark:border-orange-800 hover:shadow-lg transition-shadow cursor-pointer" onClick={() => setSelectedFilter('returned_to_center')}>
                <CardContent className="p-4 sm:p-6">
                  <div className="flex items-center justify-center mb-3">
                    <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-full bg-orange-500 flex items-center justify-center">
                      <AlertCircle className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
                    </div>
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium text-orange-700 dark:text-orange-300 uppercase tracking-wide">Returned to Center</p>
                    <p className="text-3xl sm:text-4xl font-bold text-orange-900 dark:text-orange-100 mt-2">{metrics.returnedToCenter}</p>
                    <p className={`text-xs mt-1 font-medium ${
                      metrics.returnedToCenterChange < 0 ? 'text-green-600 dark:text-green-400' : 
                      metrics.returnedToCenterChange > 0 ? 'text-red-600 dark:text-red-400' : 
                      'text-gray-600 dark:text-gray-400'
                    }`}>
                      {metrics.returnedToCenterChange > 0 ? '+' : ''}{metrics.returnedToCenterChange.toFixed(1)}%
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Performance Rates */}
          <div>
            <h2 className="text-lg sm:text-xl font-semibold mb-4">Performance Rates</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Transfer Rate */}
              <Card className="border hover:shadow-lg transition-shadow">
                <CardContent className="p-4 sm:p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="h-9 w-9 rounded-lg bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
                        <Send className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                      </div>
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Transfer Rate</span>
                    </div>
                    {getPerformanceIcon(metrics.transferRate, 70)}
                  </div>
                  <div className="space-y-2">
                    <p className={`text-3xl sm:text-4xl font-bold ${getPerformanceColor(metrics.transferRate, 70)}`}>
                      {metrics.transferRate.toFixed(1)}%
                    </p>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{metrics.transferCount} of {metrics.transferTotal}</span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 mt-2">
                      <div 
                        className="bg-gradient-to-r from-blue-500 to-blue-600 h-1.5 rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(metrics.transferRate, 100)}%` }}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Qualifying Rate */}
              <Card className="border hover:shadow-lg transition-shadow">
                <CardContent className="p-4 sm:p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="h-9 w-9 rounded-lg bg-emerald-100 dark:bg-emerald-900 flex items-center justify-center">
                        <CheckCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                      </div>
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Qualifying Rate</span>
                    </div>
                    {getPerformanceIcon(metrics.qualifyingRate, 40)}
                  </div>
                  <div className="space-y-2">
                    <p className={`text-3xl sm:text-4xl font-bold ${getPerformanceColor(metrics.qualifyingRate, 40)}`}>
                      {metrics.qualifyingRate.toFixed(1)}%
                    </p>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{metrics.qualifyingCount} of {metrics.qualifyingTotal}</span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 mt-2">
                      <div 
                        className="bg-gradient-to-r from-emerald-500 to-emerald-600 h-1.5 rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(metrics.qualifyingRate, 100)}%` }}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Billable Rate */}
              <Card className="border hover:shadow-lg transition-shadow">
                <CardContent className="p-4 sm:p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="h-9 w-9 rounded-lg bg-emerald-100 dark:bg-emerald-900 flex items-center justify-center">
                        <DollarSign className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                      </div>
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Billable Rate</span>
                    </div>
                    {getPerformanceIcon(metrics.billableRate, 60)}
                  </div>
                  <div className="space-y-2">
                    <p className={`text-3xl sm:text-4xl font-bold ${getPerformanceColor(metrics.billableRate, 60)}`}>
                      {metrics.billableRate.toFixed(1)}%
                    </p>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{metrics.billableCount} of {metrics.billableTotal}</span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 mt-2">
                      <div 
                        className="bg-gradient-to-r from-emerald-500 to-emerald-600 h-1.5 rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(metrics.billableRate, 100)}%` }}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Return Back Rate */}
              <Card className="border hover:shadow-lg transition-shadow">
                <CardContent className="p-4 sm:p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="h-9 w-9 rounded-lg bg-orange-100 dark:bg-orange-900 flex items-center justify-center">
                        <AlertCircle className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                      </div>
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Return Back Rate</span>
                    </div>
                    {getPerformanceIcon(20 - metrics.returnBackRate, 20)}
                  </div>
                  <div className="space-y-2">
                    <p className={`text-3xl sm:text-4xl font-bold ${getPerformanceColor(20 - metrics.returnBackRate, 20)}`}>
                      {metrics.returnBackRate.toFixed(1)}%
                    </p>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{metrics.returnBackCount} of {metrics.returnBackTotal}</span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 mt-2">
                      <div 
                        className="bg-gradient-to-r from-orange-500 to-orange-600 h-1.5 rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(metrics.returnBackRate, 100)}%` }}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Filtered Data Grid */}
          {selectedFilter && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg sm:text-xl font-semibold">
                  {selectedFilter === 'total_transfers' && 'All Transfers'}
                  {selectedFilter === 'qualified' && 'Qualified Records'}
                  {selectedFilter === 'not_qualified' && 'Not Qualified Records'}
                  {selectedFilter === 'missing_info' && 'Missing Info Records'}
                  {selectedFilter === 'returned_to_center' && 'Returned to Center Records'}
                  {selectedFilter === 'submitted_to_attorney' && 'Submitted to Attorney Records'}
                  {selectedFilter === 'qualified_payable' && 'Qualified Payable Records'}
                </h2>
                <Button variant="outline" size="sm" onClick={() => setSelectedFilter(null)}>
                  Close
                </Button>
              </div>
              
              <Card>
                <CardContent className="p-0">
                  {filteredLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="h-8 w-8 animate-spin" />
                    </div>
                  ) : filteredData.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                      No records found for the selected filter.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>Customer Name</TableHead>
                            <TableHead>Agent</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Call Result</TableHead>
                            <TableHead>Submitted Attorney</TableHead>
                            <TableHead>Attorney Status</TableHead>
                            <TableHead className="w-16">Notes</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredData.map((row) => (
                            <TableRow key={row.id}>
                              <TableCell>{row.date ? format(parseISO(row.date), 'MMM dd, yyyy') : '-'}</TableCell>
                              <TableCell>{row.insured_name || '-'}</TableCell>
                              <TableCell>{row.agent || '-'}</TableCell>
                              <TableCell>{row.status || '-'}</TableCell>
                              <TableCell>{row.call_result || '-'}</TableCell>
                              <TableCell>{row.submitted_attorney || '-'}</TableCell>
                              <TableCell>{row.submitted_attorney_status || '-'}</TableCell>
                              <TableCell>{row.notes ? (
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  className="h-8 w-8 p-0"
                                  onClick={() => {
                                    setSelectedNotes(row.notes);
                                    setShowNotesDialog(true);
                                  }}
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                              ) : '-'}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* Notes Dialog */}
          <Dialog open={showNotesDialog} onOpenChange={setShowNotesDialog}>
            <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Notes</DialogTitle>
              </DialogHeader>
              <div className="mt-4">
                <div className="whitespace-pre-wrap text-sm">
                  {selectedNotes || 'No notes available'}
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </div>
  );
};

export default ScoreboardDashboard;
