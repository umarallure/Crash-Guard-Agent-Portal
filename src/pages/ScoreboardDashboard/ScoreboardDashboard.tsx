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
import { Calendar, RefreshCw, Send, FileText, CheckCircle, XCircle, AlertCircle, TrendingUp, TrendingDown, Minus, DollarSign, Eye, Phone, Play, Pause, Clock } from 'lucide-react';
import { subDays, format, parseISO } from 'date-fns';
import { Loader2 } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { searchAircallCalls, formatDuration, formatTimestamp } from '@/lib/aircall';

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
  notQualified: number;
  submittedToAttorney: number;
  qualifiedPayable: number;
  noCoverage: number;
  approvedAttorney: number;
  deniedAttorney: number;
  transferRate: number;
  qualifyingRate: number;
  billableRate: number;
  returnBackRate: number;
  transferCount: number;
  transferTotal: number;
  qualifyingCount: number;
  qualifyingTotal: number;
  billableCount: number;
  billableTotal: number;
  returnBackCount: number;
  returnBackTotal: number;
  totalTransfersChange: number;
  pendingApprovalChange: number;
  approvedChange: number;
  qualifiedChange: number;
  notQualifiedChange: number;
  submittedToAttorneyChange: number;
  qualifiedPayableChange: number;
  noCoverageChange: number;
  approvedAttorneyChange: number;
  deniedAttorneyChange: number;
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
    notQualified: 0,
    submittedToAttorney: 0,
    qualifiedPayable: 0,
    noCoverage: 0,
    approvedAttorney: 0,
    deniedAttorney: 0,
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
    notQualifiedChange: 0,
    submittedToAttorneyChange: 0,
    qualifiedPayableChange: 0,
    noCoverageChange: 0,
    approvedAttorneyChange: 0,
    deniedAttorneyChange: 0,
    transferRateChange: 0,
    qualifyingRateChange: 0,
    billableRateChange: 0,
    returnBackRateChange: 0,
  });
  
  const [activityType, setActivityType] = useState<'inbound' | 'followup'>('inbound');
  const [dateFilter, setDateFilter] = useState<string>('today');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<string>('total_transfers');
  const [filteredData, setFilteredData] = useState<FilteredRow[]>([]);
  const [filteredLoading, setFilteredLoading] = useState(false);
  const [showNotesDialog, setShowNotesDialog] = useState(false);
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
      case 'yesterday': {
        const twoDaysAgo = subDays(anchorNow, 2);
        const key = formatNYDateKey(twoDaysAgo);
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
      case 'alltime': {
        return { startKey: '2019-01-01', endKey: '2019-12-31' };
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
        .select('status, call_result')
        .not('insured_name', 'ilike', 'Test -%')
        .gte('date', startKey)
        .lte('date', endKey)
        .eq('is_callback', activityType === 'followup'))

      if (error) throw error;

      // Fetch previous period data for comparison
      const { data: prevData, error: prevError } = await (supabase
        .from('daily_deal_flow')
        .select('status, call_result')
        .not('insured_name', 'ilike', 'Test -%')
        .gte('date', prevStartKey)
        .lte('date', prevEndKey)
        .eq('is_callback', activityType === 'followup'));

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

      // No Coverage: submitted_attorney_status is "nocoverage"
      const noCoverage = data?.filter(d => 
        d.submitted_attorney_status === 'nocoverage'
      ).length || 0;

      // Approved Attorney: submitted_attorney_status is "approved"
      const approvedAttorney = data?.filter(d => 
        d.submitted_attorney_status === 'approved'
      ).length || 0;

      // Denied Attorney: submitted_attorney_status is "denied"
      const deniedAttorney = data?.filter(d => 
        d.submitted_attorney_status === 'denied'
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

      // Previous period calculations for new metrics
      const prevNoCoverage = prevData?.filter(d => 
        d.submitted_attorney_status === 'nocoverage'
      ).length || 0;

      const prevApprovedAttorney = prevData?.filter(d => 
        d.submitted_attorney_status === 'approved'
      ).length || 0;

      const prevDeniedAttorney = prevData?.filter(d => 
        d.submitted_attorney_status === 'denied'
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
        notQualified,
        submittedToAttorney,
        qualifiedPayable,
        noCoverage,
        approvedAttorney,
        deniedAttorney,
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
        notQualifiedChange: calculateChange(notQualified, prevNotQualified),
        submittedToAttorneyChange: calculateChange(submittedToAttorney, prevSubmittedToAttorney),
        qualifiedPayableChange: calculateChange(qualifiedPayable, prevQualifiedPayable),
        noCoverageChange: calculateChange(noCoverage, prevNoCoverage),
        approvedAttorneyChange: calculateChange(approvedAttorney, prevApprovedAttorney),
        deniedAttorneyChange: calculateChange(deniedAttorney, prevDeniedAttorney),
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
  }, [activityType, getDateRange, getPreviousDateRange, isAdmin, toast]);

  useEffect(() => {
    if (isAdmin) {
      fetchMetrics();
    }
  }, [fetchMetrics, isAdmin]);

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
          case 'yesterday': {
            const yesterday = subDays(anchorNow, 1);
            startKey = formatNYDateKey(yesterday);
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
          case 'alltime': {
            startKey = '2020-01-01';
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
          .lte('date', endKey)
          .eq('is_callback', activityType === 'followup') as any);

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
          case 'no_coverage':
            filtered = (data || []).filter((d: any) => 
              d.submitted_attorney_status === 'nocoverage'
            );
            break;
          case 'approved_attorney':
            filtered = (data || []).filter((d: any) => 
              d.submitted_attorney_status === 'approved'
            );
            break;
          case 'denied_attorney':
            filtered = (data || []).filter((d: any) => 
              d.submitted_attorney_status === 'denied'
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
  }, [selectedFilter, dateFilter, customStartDate, customEndDate, activityType, isAdmin, toast, formatNYDateKey]);

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

  const handleDetailsClick = async (phoneNumber: string | null, notes: string | null = null) => {
    if (!phoneNumber) return;
    
    setSelectedNotes(notes);
    setShowCallDialog(true);
    setCallsLoading(true);
    setCallRecordings([]);

    try {
      // Get date range from current filter and convert to timestamps
      const { startKey, endKey } = getDateRange();
      
      // Parse the date keys (yyyy-MM-dd format) to timestamps
      // Start of day for startKey, end of day for endKey
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
                    <SelectItem value="yesterday">Yesterday</SelectItem>
                    <SelectItem value="7days">Last 7 Days</SelectItem>
                    <SelectItem value="30days">Last 30 Days</SelectItem>
                    <SelectItem value="alltime">All Time</SelectItem>
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

          {/* Activity Type Tabs */}
          <Card className="border">
            <CardContent className="pt-4 sm:pt-6">
              <Tabs value={activityType} onValueChange={(value) => setActivityType(value as 'inbound' | 'followup')} className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger 
                    value="inbound" 
                    className={`flex items-center gap-2 transition-all ${activityType === 'inbound' ? 'bg-blue-600 text-white shadow-lg shadow-blue-200 dark:shadow-blue-900' : 'bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:hover:bg-blue-900'}`}
                  >
                    <Phone className="h-4 w-4" />
                    Publisher Activity
                  </TabsTrigger>
                  <TabsTrigger 
                    value="followup" 
                    className={`flex items-center gap-2 transition-all ${activityType === 'followup' ? 'bg-orange-500 text-white shadow-lg shadow-orange-200 dark:shadow-orange-900' : 'bg-orange-100 text-orange-700 hover:bg-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:hover:bg-orange-900'}`}
                  >
                    <Clock className="h-4 w-4" />
                    Internal Activity
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </CardContent>
          </Card>

          {/* Key Metrics */}
          <div>
            <h2 className="text-lg sm:text-xl font-semibold mb-4">
              {activityType === 'inbound' ? 'Publisher Activity Metrics' : 'Internal Activity Metrics'}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Total Transfers */}
              <Card className={`bg-gradient-to-br ${selectedFilter === 'total_transfers' ? 'from-gray-200 to-gray-300 dark:from-gray-700 dark:to-gray-600' : activityType === 'inbound' ? 'from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900' : 'from-orange-50 to-orange-100 dark:from-orange-950 dark:to-orange-900'} border-2 ${selectedFilter === 'total_transfers' ? 'border-gray-400 dark:border-gray-500' : activityType === 'inbound' ? 'border-blue-200 dark:border-blue-800' : 'border-orange-200 dark:border-orange-800'} hover:shadow-lg transition-all cursor-pointer`} onClick={() => setSelectedFilter('total_transfers')}>
                <CardContent className="p-4 sm:p-6">
                  <div className="flex items-center justify-center mb-3">
                    <div className={`h-10 w-10 sm:h-12 sm:w-12 rounded-full flex items-center justify-center ${activityType === 'inbound' ? 'bg-blue-500' : 'bg-orange-500'}`}>
                      <Send className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
                    </div>
                  </div>
                  <div className="text-center">
                    <p className={`text-sm font-medium uppercase tracking-wide ${activityType === 'inbound' ? 'text-blue-700 dark:text-blue-300' : 'text-orange-700 dark:text-orange-300'}`}>
                      {activityType === 'inbound' ? 'Total Inbound BPO Transfers' : 'Total FollowUp Calls'}
                    </p>
                    <p className={`text-3xl sm:text-4xl font-bold mt-2 ${activityType === 'inbound' ? 'text-blue-900 dark:text-blue-100' : 'text-orange-900 dark:text-orange-100'}`}>{metrics.totalTransfers}</p>
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
              <Card className={`bg-gradient-to-br ${selectedFilter === 'qualified' ? 'from-gray-200 to-gray-300 dark:from-gray-700 dark:to-gray-600' : activityType === 'inbound' ? 'from-emerald-50 to-emerald-100 dark:from-emerald-950 dark:to-emerald-900' : 'from-teal-50 to-teal-100 dark:from-teal-950 dark:to-teal-900'} border-2 ${selectedFilter === 'qualified' ? 'border-gray-400 dark:border-gray-500' : activityType === 'inbound' ? 'border-emerald-200 dark:border-emerald-800' : 'border-teal-200 dark:border-teal-800'} hover:shadow-lg transition-all cursor-pointer`} onClick={() => setSelectedFilter('qualified')}>
                <CardContent className="p-4 sm:p-6">
                  <div className="flex items-center justify-center mb-3">
                    <div className={`h-10 w-10 sm:h-12 sm:w-12 rounded-full flex items-center justify-center ${activityType === 'inbound' ? 'bg-emerald-500' : 'bg-teal-500'}`}>
                      <CheckCircle className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
                    </div>
                  </div>
                  <div className="text-center">
                    <p className={`text-sm font-medium uppercase tracking-wide ${activityType === 'inbound' ? 'text-emerald-700 dark:text-emerald-300' : 'text-teal-700 dark:text-teal-300'}`}>
                      {activityType === 'inbound' ? 'Qualified Inbound' : 'Qualified Followup'}
                    </p>
                    <p className={`text-3xl sm:text-4xl font-bold mt-2 ${activityType === 'inbound' ? 'text-emerald-900 dark:text-emerald-100' : 'text-teal-900 dark:text-teal-100'}`}>{metrics.qualified}</p>
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
              <Card className={`bg-gradient-to-br ${selectedFilter === 'not_qualified' ? 'from-gray-200 to-gray-300 dark:from-gray-700 dark:to-gray-600' : 'from-red-50 to-red-100 dark:from-red-950 dark:to-red-900'} border-2 ${selectedFilter === 'not_qualified' ? 'border-gray-400 dark:border-gray-500' : 'border-red-200 dark:border-red-800'} hover:shadow-lg transition-all cursor-pointer`} onClick={() => setSelectedFilter('not_qualified')}>
                <CardContent className="p-4 sm:p-6">
                  <div className="flex items-center justify-center mb-3">
                    <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-full bg-red-500 flex items-center justify-center">
                      <XCircle className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
                    </div>
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium text-red-700 dark:text-red-300 uppercase tracking-wide">
                      {activityType === 'inbound' ? 'Not Qualified Inbound' : 'Not Qualified Followup'}
                    </p>
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

              {/* No Coverage */}
              <Card className={`bg-gradient-to-br ${selectedFilter === 'no_coverage' ? 'from-gray-200 to-gray-300 dark:from-gray-700 dark:to-gray-600' : 'from-gray-50 to-gray-100 dark:from-gray-950 dark:to-gray-900'} border-2 ${selectedFilter === 'no_coverage' ? 'border-gray-400 dark:border-gray-500' : 'border-gray-200 dark:border-gray-800'} hover:shadow-lg transition-all cursor-pointer`} onClick={() => setSelectedFilter('no_coverage')}>
                <CardContent className="p-4 sm:p-6">
                  <div className="flex items-center justify-center mb-3">
                    <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-full bg-gray-500 flex items-center justify-center">
                      <XCircle className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
                    </div>
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wide">
                      {activityType === 'inbound' ? 'No Coverage (Inbound)' : 'No Coverage (Followup)'}
                    </p>
                    <p className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-gray-100 mt-2">{metrics.noCoverage}</p>
                    <p className={`text-xs mt-1 font-medium ${
                      metrics.noCoverageChange < 0 ? 'text-green-600 dark:text-green-400' :
                      metrics.noCoverageChange > 0 ? 'text-red-600 dark:text-red-400' :
                      'text-gray-600 dark:text-gray-400'
                    }`}>
                      {metrics.noCoverageChange > 0 ? '+' : ''}{metrics.noCoverageChange.toFixed(1)}%
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Submitted to Attorney */}
              <Card className={`bg-gradient-to-br ${selectedFilter === 'submitted_to_attorney' ? 'from-gray-200 to-gray-300 dark:from-gray-700 dark:to-gray-600' : 'from-violet-50 to-violet-100 dark:from-violet-950 dark:to-violet-900'} border-2 ${selectedFilter === 'submitted_to_attorney' ? 'border-gray-400 dark:border-gray-500' : 'border-violet-200 dark:border-violet-800'} hover:shadow-lg transition-all cursor-pointer`} onClick={() => setSelectedFilter('submitted_to_attorney')}>
                <CardContent className="p-4 sm:p-6">
                  <div className="flex items-center justify-center mb-3">
                    <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-full bg-violet-500 flex items-center justify-center">
                      <Send className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
                    </div>
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium text-violet-700 dark:text-violet-300 uppercase tracking-wide">
                      {activityType === 'inbound' ? 'Submitted to Attorney (Inbound)' : 'Submitted to Attorney (Followup)'}
                    </p>
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

              {/* Approved Attorney */}
              <Card className={`bg-gradient-to-br ${selectedFilter === 'approved_attorney' ? 'from-gray-200 to-gray-300 dark:from-gray-700 dark:to-gray-600' : 'from-green-50 to-green-100 dark:from-green-950 dark:to-green-900'} border-2 ${selectedFilter === 'approved_attorney' ? 'border-gray-400 dark:border-gray-500' : 'border-green-200 dark:border-green-800'} hover:shadow-lg transition-all cursor-pointer`} onClick={() => setSelectedFilter('approved_attorney')}>
                <CardContent className="p-4 sm:p-6">
                  <div className="flex items-center justify-center mb-3">
                    <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-full bg-green-500 flex items-center justify-center">
                      <CheckCircle className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
                    </div>
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium text-green-700 dark:text-green-300 uppercase tracking-wide">
                      {activityType === 'inbound' ? 'Approved Attorney (Inbound)' : 'Approved Attorney (Followup)'}
                    </p>
                    <p className="text-3xl sm:text-4xl font-bold text-green-900 dark:text-green-100 mt-2">{metrics.approvedAttorney}</p>
                    <p className={`text-xs mt-1 font-medium ${
                      metrics.approvedAttorneyChange > 0 ? 'text-green-600 dark:text-green-400' :
                      metrics.approvedAttorneyChange < 0 ? 'text-red-600 dark:text-red-400' :
                      'text-gray-600 dark:text-gray-400'
                    }`}>
                      {metrics.approvedAttorneyChange > 0 ? '+' : ''}{metrics.approvedAttorneyChange.toFixed(1)}%
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Denied Attorney */}
              <Card className={`bg-gradient-to-br ${selectedFilter === 'denied_attorney' ? 'from-gray-200 to-gray-300 dark:from-gray-700 dark:to-gray-600' : 'from-pink-50 to-pink-100 dark:from-pink-950 dark:to-pink-900'} border-2 ${selectedFilter === 'denied_attorney' ? 'border-gray-400 dark:border-gray-500' : 'border-pink-200 dark:border-pink-800'} hover:shadow-lg transition-all cursor-pointer`} onClick={() => setSelectedFilter('denied_attorney')}>
                <CardContent className="p-4 sm:p-6">
                  <div className="flex items-center justify-center mb-3">
                    <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-full bg-pink-500 flex items-center justify-center">
                      <XCircle className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
                    </div>
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium text-pink-700 dark:text-pink-300 uppercase tracking-wide">
                      {activityType === 'inbound' ? 'Denied Attorney (Inbound)' : 'Denied Attorney (Followup)'}
                    </p>
                    <p className="text-3xl sm:text-4xl font-bold text-pink-900 dark:text-pink-100 mt-2">{metrics.deniedAttorney}</p>
                    <p className={`text-xs mt-1 font-medium ${
                      metrics.deniedAttorneyChange < 0 ? 'text-green-600 dark:text-green-400' :
                      metrics.deniedAttorneyChange > 0 ? 'text-red-600 dark:text-red-400' :
                      'text-gray-600 dark:text-gray-400'
                    }`}>
                      {metrics.deniedAttorneyChange > 0 ? '+' : ''}{metrics.deniedAttorneyChange.toFixed(1)}%
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Qualified Payable */}
              <Card className={`bg-gradient-to-br ${selectedFilter === 'qualified_payable' ? 'from-gray-200 to-gray-300 dark:from-gray-700 dark:to-gray-600' : activityType === 'inbound' ? 'from-indigo-50 to-indigo-100 dark:from-indigo-950 dark:to-indigo-900' : 'from-purple-50 to-purple-100 dark:from-purple-950 dark:to-purple-900'} border-2 ${selectedFilter === 'qualified_payable' ? 'border-gray-400 dark:border-gray-500' : activityType === 'inbound' ? 'border-indigo-200 dark:border-indigo-800' : 'border-purple-200 dark:border-purple-800'} hover:shadow-lg transition-all cursor-pointer`} onClick={() => setSelectedFilter('qualified_payable')}>
                <CardContent className="p-4 sm:p-6">
                  <div className="flex items-center justify-center mb-3">
                    <div className={`h-10 w-10 sm:h-12 sm:w-12 rounded-full flex items-center justify-center ${activityType === 'inbound' ? 'bg-indigo-500' : 'bg-purple-500'}`}>
                      <DollarSign className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
                    </div>
                  </div>
                  <div className="text-center">
                    <p className={`text-sm font-medium uppercase tracking-wide ${activityType === 'inbound' ? 'text-indigo-700 dark:text-indigo-300' : 'text-purple-700 dark:text-purple-300'}`}>
                      {activityType === 'inbound' ? 'Qualified Payable Inbound' : 'Qualified Payable Followup'}
                    </p>
                    <p className={`text-3xl sm:text-4xl font-bold mt-2 ${activityType === 'inbound' ? 'text-indigo-900 dark:text-indigo-100' : 'text-purple-900 dark:text-purple-100'}`}>{metrics.qualifiedPayable}</p>
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
            </div>
          </div>

          {/* Filtered Data Grid */}
          {selectedFilter && selectedFilter !== '' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg sm:text-xl font-semibold">
                  {selectedFilter === 'total_transfers' && (activityType === 'inbound' ? 'All Inbound BPO Transfers' : 'All FollowUp Calls')}
                  {selectedFilter === 'qualified' && 'Qualified Records'}
                  {selectedFilter === 'not_qualified' && 'Not Qualified Records'}
                  {selectedFilter === 'qualified_payable' && 'Qualified Payable Records'}
                  {selectedFilter === 'submitted_to_attorney' && 'Submitted to Attorney Records'}
                  {selectedFilter === 'no_coverage' && 'No Coverage Records'}
                  {selectedFilter === 'approved_attorney' && 'Approved Attorney Records'}
                  {selectedFilter === 'denied_attorney' && 'Denied Attorney Records'}
                </h2>
                <Button variant="outline" size="sm" onClick={() => {
                  setSelectedFilter('');
                  setCurrentPage(1);
                }}>
                  Clear
                </Button>
              </div>
              
              <Card className="border-2 border-gray-200 dark:border-gray-700">
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
                    <>
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader className="bg-gray-50 dark:bg-gray-800">
                            <TableRow>
                              <TableHead className="font-semibold">Date</TableHead>
                              <TableHead className="font-semibold">Customer Name</TableHead>
                              <TableHead className="font-semibold">Phone</TableHead>
                              <TableHead className="font-semibold">Agent</TableHead>
                              <TableHead className="font-semibold">Status</TableHead>
                              <TableHead className="font-semibold">Call Result</TableHead>
                              <TableHead className="font-semibold">Submitted Attorney</TableHead>
                              <TableHead className="font-semibold">Attorney Status</TableHead>
                              <TableHead className="w-16 text-center">Details</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {filteredData
                              .slice((currentPage - 1) * recordsPerPage, currentPage * recordsPerPage)
                              .map((row) => (
                                <TableRow key={row.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                                  <TableCell className="font-medium">{row.date ? format(parseISO(row.date), 'MMM dd, yyyy') : '-'}</TableCell>
                                  <TableCell>{row.insured_name || '-'}</TableCell>
                                  <TableCell>{row.client_phone_number || '-'}</TableCell>
                                  <TableCell>{row.agent || '-'}</TableCell>
                                  <TableCell>{row.status || '-'}</TableCell>
                                  <TableCell>{row.call_result || '-'}</TableCell>
                                  <TableCell>{row.submitted_attorney || '-'}</TableCell>
                                  <TableCell>
                                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                      row.submitted_attorney_status === 'submitted' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' :
                                      row.submitted_attorney_status === 'approved' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                                      row.submitted_attorney_status === 'denied' ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' :
                                      row.submitted_attorney_status === 'nocoverage' ? 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200' :
                                      'bg-gray-100 text-gray-800'
                                    }`}>
                                      {row.submitted_attorney_status || '-'}
                                    </span>
                                  </TableCell>
                                  <TableCell className="text-center">
                                    <Button 
                                      variant="ghost" 
                                      size="sm" 
                                      className="h-8 w-8 p-0"
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
                              ))}
                          </TableBody>
                        </Table>
                      </div>
                      
                      {/* Pagination */}
                      {filteredData.length > recordsPerPage && (
                        <div className="flex items-center justify-between px-4 py-3 border-t bg-gray-50 dark:bg-gray-800/50">
                          <div className="text-sm text-muted-foreground">
                            Showing {((currentPage - 1) * recordsPerPage) + 1} to {Math.min(currentPage * recordsPerPage, filteredData.length)} of {filteredData.length} entries
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                              disabled={currentPage === 1}
                            >
                              Previous
                            </Button>
                            <div className="flex items-center gap-1">
                              {Array.from({ length: Math.ceil(filteredData.length / recordsPerPage) }, (_, i) => i + 1).slice(
                                Math.max(0, currentPage - 3),
                                Math.min(Math.ceil(filteredData.length / recordsPerPage), currentPage + 2)
                              ).map((page) => (
                                <Button
                                  key={page}
                                  variant={currentPage === page ? "default" : "outline"}
                                  size="sm"
                                  className="h-8 w-8 p-0"
                                  onClick={() => setCurrentPage(page)}
                                >
                                  {page}
                                </Button>
                              ))}
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
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
                </CardContent>
              </Card>
            </div>
          )}

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
                    className="flex-1 data-[state=active]:bg-green-100 data-[state=active]:text-green-700 dark:data-[state=active]:bg-green-900 dark:data-[state=active]:text-green-300"
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
                        <div key={call.id} className="flex items-center justify-between p-3 border rounded-lg bg-gray-50 dark:bg-gray-800">
                          <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-full ${
                              call.direction === 'inbound' ? 'bg-blue-100 dark:bg-blue-900' : 'bg-green-100 dark:bg-green-900'
                            }`}>
                              <Phone className={`h-4 w-4 ${
                                call.direction === 'inbound' ? 'text-blue-600 dark:text-blue-400' : 'text-green-600 dark:text-green-400'
                              }`} />
                            </div>
                            <div>
                              <div className="font-medium text-sm">
                                {call.direction === 'inbound' ? 'Incoming' : 'Outgoing'} Call
                              </div>
                              <div className="text-xs text-muted-foreground flex items-center gap-2">
                                <Clock className="h-3 w-3" />
                                {formatTimestamp(call.started_at)}
                                <span className="text-gray-400">•</span>
                                {formatDuration(call.duration)}
                                <span className="text-gray-400">•</span>
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
                        <div className="mt-4 p-4 border rounded-lg bg-white dark:bg-gray-900">
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
  );
};

export default ScoreboardDashboard;
