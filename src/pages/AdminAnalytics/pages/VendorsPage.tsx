import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Building2, Phone, Users, TrendingUp, Calendar, RefreshCw, Filter, X, CheckCircle, FileText } from 'lucide-react';
import { useAdminAnalyticsData } from '@/hooks/useAdminAnalyticsData';
import { ParsedPolicyItem } from '@/lib/mondayApi';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { format, startOfDay, endOfDay, subDays } from 'date-fns';

interface VendorTransferData {
  vendor_name: string;
  total_transfers: number;
  daily_average: number;
}

interface VendorConvertedData {
  vendor_name: string;
  converted_calls: number;
  conversion_rate: number;
}

export const VendorsPage = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [vendors, setVendors] = useState<string[]>([]);
  const [selectedVendors, setSelectedVendors] = useState<string[]>([]);
  const [vendorStats, setVendorStats] = useState<VendorTransferData[]>([]);
  const [convertedStats, setConvertedStats] = useState<Map<string, VendorConvertedData>>(new Map());
  
  // Monday.com data
  const [mondaySubmissions, setMondaySubmissions] = useState<Map<string, number>>(new Map());
  
  // Time range filter
  const [timeRange, setTimeRange] = useState<string>('7days');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  // Use React Query for Monday.com data fetching
  const { 
    data: mondayData = [], 
    isLoading: mondayLoading, 
    isError: mondayError,
    refetch: refetchMonday,
    isFetching: mondayFetching
  } = useAdminAnalyticsData(true);

  useEffect(() => {
    fetchVendors();
  }, []);

  useEffect(() => {
    if (vendors.length > 0) {
      fetchVendorPerformance();
    }
  }, [selectedVendors, timeRange, customStartDate, customEndDate, vendors]);

  useEffect(() => {
    if (mondayData.length > 0) {
      processMondaySubmissions();
    }
  }, [mondayData, timeRange, customStartDate, customEndDate, selectedVendors, vendors]);

  // Helper functions for Monday.com data
  const getColumnValue = (item: ParsedPolicyItem, columnId: string): string => {
    const column = item.column_values?.find(col => col.id === columnId);
    return column?.text || '';
  };

  const fetchVendors = async () => {
    try {
      const { data, error } = await supabase
        .from('daily_deal_flow')
        .select('lead_vendor')
        .not('insured_name', 'ilike', 'Test -%')
        .not('lead_vendor', 'is', null);

      if (error) throw error;

      const uniqueVendors = Array.from(
        new Set(data?.map(item => item.lead_vendor).filter(Boolean) as string[])
      ).sort();

      setVendors(uniqueVendors);
      setSelectedVendors(uniqueVendors);
    } catch (error) {
      console.error('Error fetching vendors:', error);
      toast({
        title: "Error",
        description: "Failed to load vendors",
        variant: "destructive",
      });
    }
  };

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
        return { start: startOfDay(subDays(now, 7)), end };
      default:
        return { start: startOfDay(subDays(now, 7)), end };
    }
  };

  const fetchVendorPerformance = async () => {
    setLoading(true);
    try {
      const { start, end } = getDateRange();
      
      const vendorsToQuery = selectedVendors.length > 0 ? selectedVendors : vendors;

      if (vendorsToQuery.length === 0) {
        setVendorStats([]);
        setConvertedStats(new Map());
        setLoading(false);
        return;
      }

      // Fetch all transfers
      const { data, error } = await supabase
        .from('daily_deal_flow')
        .select('lead_vendor, date')
        .not('insured_name', 'ilike', 'Test -%')
        .in('lead_vendor', vendorsToQuery)
        .gte('date', format(start, 'yyyy-MM-dd'))
        .lte('date', format(end, 'yyyy-MM-dd'));

      if (error) throw error;

      // Fetch converted calls (Pending Approval status)
      const { data: convertedData, error: convertedError } = await supabase
        .from('daily_deal_flow')
        .select('lead_vendor, date')
        .not('insured_name', 'ilike', 'Test -%')
        .in('lead_vendor', vendorsToQuery)
        .eq('status', 'Pending Approval')
        .gte('date', format(start, 'yyyy-MM-dd'))
        .lte('date', format(end, 'yyyy-MM-dd'));

      if (convertedError) throw convertedError;

      const vendorMap = new Map<string, { transfers: number; dates: Set<string> }>();

      data?.forEach(item => {
        if (!item.lead_vendor) return;
        
        const existing = vendorMap.get(item.lead_vendor) || { 
          transfers: 0, 
          dates: new Set<string>() 
        };
        
        existing.transfers += 1;
        if (item.date) {
          existing.dates.add(item.date);
        }
        
        vendorMap.set(item.lead_vendor, existing);
      });

      // Process converted calls
      const convertedMap = new Map<string, number>();
      convertedData?.forEach(item => {
        if (!item.lead_vendor) return;
        const current = convertedMap.get(item.lead_vendor) || 0;
        convertedMap.set(item.lead_vendor, current + 1);
      });

      const daysDiff = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
      
      const stats: VendorTransferData[] = Array.from(vendorMap.entries()).map(([vendor, data]) => {
        const daily_average = data.transfers / daysDiff;
        
        return {
          vendor_name: vendor,
          total_transfers: data.transfers,
          daily_average: parseFloat(daily_average.toFixed(2))
        };
      });

      stats.sort((a, b) => b.total_transfers - a.total_transfers);

      // Create converted stats map
      const convertedStatsMap = new Map<string, VendorConvertedData>();
      stats.forEach(stat => {
        const converted = convertedMap.get(stat.vendor_name) || 0;
        const rate = stat.total_transfers > 0 ? (converted / stat.total_transfers) * 100 : 0;
        convertedStatsMap.set(stat.vendor_name, {
          vendor_name: stat.vendor_name,
          converted_calls: converted,
          conversion_rate: parseFloat(rate.toFixed(1))
        });
      });

      setVendorStats(stats);
      setConvertedStats(convertedStatsMap);
    } catch (error) {
      console.error('Error fetching vendor performance:', error);
      toast({
        title: "Error",
        description: "Failed to load performance data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const processMondaySubmissions = () => {
    const { start, end } = getDateRange();
    const submissionsMap = new Map<string, number>();

    // CORRECT COLUMN IDS based on actual Monday.com data:
    const POLICY_NUMBER_COLUMN = 'text_mkpx3j6w';  // Policy numbers like FEX435127
    const CALL_CENTER_COLUMN = 'dropdown_mkq2x0kx'; // Call center dropdown (VYN, Argon Comm, etc.)
    const DATE_COLUMN = 'date1';                    // Date field (2025-05-31)

    // Get selected vendors for filtering
    const vendorsToFilter = selectedVendors.length > 0 ? selectedVendors : vendors;

    mondayData.forEach((item) => {
      // Get policy number
      const policyNumber = getColumnValue(item, POLICY_NUMBER_COLUMN);
      const hasPolicyNumber = policyNumber && policyNumber.trim().length > 0;

      if (!hasPolicyNumber) return; // Skip items without policy numbers

      // Get call center name
      const centerName = getColumnValue(item, CALL_CENTER_COLUMN);
      
      if (!centerName || !centerName.trim()) return; // Skip items without call center
      
      // Filter by selected vendors - only show centers that are selected
      if (!vendorsToFilter.includes(centerName)) return;
      
      // Get date and apply filtering
      const dateStr = getColumnValue(item, DATE_COLUMN);
      
      if (dateStr) {
        const itemDate = new Date(dateStr);
        if (itemDate >= start && itemDate <= end) {
          const current = submissionsMap.get(centerName) || 0;
          submissionsMap.set(centerName, current + 1);
        }
      }
    });

    setMondaySubmissions(submissionsMap);
  };

  const handleVendorToggle = (vendor: string) => {
    setSelectedVendors(prev => {
      if (prev.includes(vendor)) {
        return prev.filter(v => v !== vendor);
      } else {
        return [...prev, vendor];
      }
    });
  };

  const handleSelectAllVendors = () => {
    if (selectedVendors.length === vendors.length) {
      setSelectedVendors([]);
    } else {
      setSelectedVendors(vendors);
    }
  };

  const handleClearFilters = () => {
    setTimeRange('7days');
    setCustomStartDate('');
    setCustomEndDate('');
    setSelectedVendors(vendors);
  };

  const handleRefresh = () => {
    fetchVendorPerformance();
    toast({
      title: "Refreshing data...",
      description: "Fetching latest transfer data",
    });
  };

  const totalTransfers = vendorStats.reduce((sum, v) => sum + v.total_transfers, 0);
  const totalConverted = Array.from(convertedStats.values()).reduce((sum, v) => sum + v.converted_calls, 0);
  const totalSubmissions = Array.from(mondaySubmissions.values()).reduce((sum, v) => sum + v, 0);
  const overallConversionRate = totalTransfers > 0 ? ((totalConverted / totalTransfers) * 100).toFixed(1) : '0';
  const avgTransfersPerVendor = vendorStats.length > 0 
    ? (totalTransfers / vendorStats.length).toFixed(1) 
    : '0';

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
        <Card className="bg-blue-50 border-blue-100">
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Building2 className="h-4 w-4 text-blue-600" />
              <span className="text-sm text-blue-700 font-medium">Active Vendors</span>
            </div>
            <p className="text-2xl font-bold text-blue-900">{vendorStats.length}</p>
            <p className="text-xs text-blue-600 mt-1">
              {selectedVendors.length === vendors.length ? 'All selected' : `${selectedVendors.length} selected`}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-green-50 border-green-100">
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Phone className="h-4 w-4 text-green-600" />
              <span className="text-sm text-green-700 font-medium">Total Transfers</span>
            </div>
            <p className="text-2xl font-bold text-green-900">{totalTransfers.toLocaleString()}</p>
            <p className="text-xs text-green-600 mt-1">In selected period</p>
          </CardContent>
        </Card>

        <Card className="bg-amber-50 border-amber-100">
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <CheckCircle className="h-4 w-4 text-amber-600" />
              <span className="text-sm text-amber-700 font-medium">Converted Calls</span>
            </div>
            <p className="text-2xl font-bold text-amber-900">{totalConverted.toLocaleString()}</p>
            <p className="text-xs text-amber-600 mt-1">Pending Approval status</p>
          </CardContent>
        </Card>

        <Card className="bg-red-50 border-red-100">
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <FileText className="h-4 w-4 text-red-600" />
              <span className="text-sm text-red-700 font-medium">Policy Submissions</span>
            </div>
            <p className="text-2xl font-bold text-red-900">{totalSubmissions.toLocaleString()}</p>
            <p className="text-xs text-red-600 mt-1">Monday.com policies</p>
          </CardContent>
        </Card>

        <Card className="bg-purple-50 border-purple-100">
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <TrendingUp className="h-4 w-4 text-purple-600" />
              <span className="text-sm text-purple-700 font-medium">Conversion Rate</span>
            </div>
            <p className="text-2xl font-bold text-purple-900">{overallConversionRate}%</p>
            <p className="text-xs text-purple-600 mt-1">Overall rate</p>
          </CardContent>
        </Card>

        <Card className="bg-orange-50 border-orange-100">
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Calendar className="h-4 w-4 text-orange-600" />
              <span className="text-sm text-orange-700 font-medium">Time Range</span>
            </div>
            <p className="text-lg font-bold text-orange-900">
              {timeRange === 'today' && 'Today'}
              {timeRange === '7days' && 'Last 7 Days'}
              {timeRange === '30days' && 'Last 30 Days'}
              {timeRange === '90days' && 'Last 90 Days'}
              {timeRange === 'custom' && 'Custom Range'}
            </p>
            <p className="text-xs text-orange-600 mt-1">Selected period</p>
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

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Select Vendors ({selectedVendors.length} of {vendors.length})</Label>
              <Button variant="ghost" size="sm" onClick={handleSelectAllVendors}>
                {selectedVendors.length === vendors.length ? 'Deselect All' : 'Select All'}
              </Button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 max-h-60 overflow-y-auto border rounded-md p-4">
              {vendors.map(vendor => (
                <div key={vendor} className="flex items-center space-x-2">
                  <Checkbox
                    id={`vendor-${vendor}`}
                    checked={selectedVendors.includes(vendor)}
                    onCheckedChange={() => handleVendorToggle(vendor)}
                  />
                  <label
                    htmlFor={`vendor-${vendor}`}
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                  >
                    {vendor}
                  </label>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Vendor Performance Cards - Three Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Transfers Per Call Center */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Phone className="h-5 w-5 text-green-600" />
              <span>Transfers Per Call Center</span>
            </CardTitle>
            <CardDescription>
              Total transfers from daily deal flow
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
                <p className="mt-4 text-muted-foreground">Loading transfer data...</p>
              </div>
            ) : (
              <div className="space-y-3">
                {vendorStats.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p className="text-lg font-medium">No data available</p>
                    <p className="text-sm">Try selecting different vendors or time range</p>
                  </div>
                ) : (
                  vendorStats.map((vendor, index) => (
                    <div key={vendor.vendor_name} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                      <div className="flex items-center space-x-3">
                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-green-100 text-green-600 font-bold text-sm">
                          #{index + 1}
                        </div>
                        <div>
                          <h4 className="font-medium">{vendor.vendor_name}</h4>
                          <p className="text-xs text-muted-foreground">{vendor.daily_average.toFixed(1)}/day avg</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold text-green-600">
                          {vendor.total_transfers.toLocaleString()}
                        </p>
                        <p className="text-xs text-muted-foreground">transfers</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Converted Calls Per Call Center */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <CheckCircle className="h-5 w-5 text-amber-600" />
              <span>Converted Calls Per Call Center</span>
            </CardTitle>
            <CardDescription>
              Calls with "Pending Approval" status
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
                <p className="mt-4 text-muted-foreground">Loading conversion data...</p>
              </div>
            ) : (
              <div className="space-y-3">
                {vendorStats.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <CheckCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p className="text-lg font-medium">No data available</p>
                    <p className="text-sm">Try selecting different vendors or time range</p>
                  </div>
                ) : (
                  vendorStats.map((vendor, index) => {
                    const converted = convertedStats.get(vendor.vendor_name);
                    return (
                      <div key={vendor.vendor_name} className="flex items-center justify-between p-3 bg-amber-50 rounded-lg hover:bg-amber-100 transition-colors">
                        <div className="flex items-center space-x-3">
                          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-amber-100 text-amber-600 font-bold text-sm">
                            #{index + 1}
                          </div>
                          <div>
                            <h4 className="font-medium">{vendor.vendor_name}</h4>
                            <p className="text-xs text-muted-foreground">
                              {converted?.conversion_rate || 0}% conversion rate
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold text-amber-600">
                            {(converted?.converted_calls || 0).toLocaleString()}
                          </p>
                          <p className="text-xs text-muted-foreground">converted</p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Policy Submissions Per Call Center */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <FileText className="h-5 w-5 text-red-600" />
              <span>Policy Submissions Per Call Center</span>
            </CardTitle>
            <CardDescription>
              Application submissions with policy numbers from Monday.com
            </CardDescription>
          </CardHeader>
          <CardContent>
            {mondayLoading ? (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
                <p className="mt-4 text-muted-foreground">Loading Monday.com data...</p>
              </div>
            ) : mondayError ? (
              <div className="text-center py-12 text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium">Monday.com API Error</p>
                <p className="text-sm">Unable to load policy submission data</p>
              </div>
            ) : (
              <div className="space-y-3">
                {mondaySubmissions.size === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p className="text-lg font-medium">No policy submissions</p>
                    <p className="text-sm">No entries with policy numbers found in selected period</p>
                  </div>
                ) : (
                  Array.from(mondaySubmissions.entries())
                    .sort(([, a], [, b]) => b - a)
                    .map(([centerName, submissions], index) => (
                      <div key={centerName} className="flex items-center justify-between p-3 bg-red-50 rounded-lg hover:bg-red-100 transition-colors">
                        <div className="flex items-center space-x-3">
                          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-red-100 text-red-600 font-bold text-sm">
                            #{index + 1}
                          </div>
                          <div>
                            <h4 className="font-medium">{centerName}</h4>
                            <p className="text-xs text-muted-foreground">Call center</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold text-red-600">
                            {submissions.toLocaleString()}
                          </p>
                          <p className="text-xs text-muted-foreground">submissions</p>
                        </div>
                      </div>
                    ))
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default VendorsPage;
