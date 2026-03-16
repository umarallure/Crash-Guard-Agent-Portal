import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useAttorneys } from "@/hooks/useAttorneys";
import { supabase } from "@/integrations/supabase/client";
import { canPerformWriteOperations } from "@/lib/userPermissions";
import { DataGrid } from "./components/DataGrid";
import { GridToolbar } from "./components/GridToolbar";
import { CreateEntryForm } from "./components/CreateEntryForm";
import { EODReports } from "@/components/EODReports";
import { WeeklyReports } from "@/components/WeeklyReports";
import { GHLExport } from "@/components/GHLExport";
import { Loader2, RefreshCw, Download, FileSpreadsheet, ChevronDown, FileText, Calendar, BarChart3, UserCheck } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { dateObjectToESTString } from "@/lib/dateUtils";
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";

export interface DailyDealFlowRow {
  id: string;
  submission_id: string;
  client_phone_number?: string;
  lead_vendor?: string;
  date?: string;
  insured_name?: string;
  buffer_agent?: string;
  agent?: string;
  licensed_agent_account?: string;
  assigned_attorney_id?: string | null;
  is_retention_call?: boolean;
  status?: string;
  call_result?: string;
  carrier?: string;
  product_type?: string;
  draft_date?: string;
  monthly_premium?: number;
  face_amount?: number;
  from_callback?: boolean;
  is_callback?: boolean;
  notes?: string;
  policy_number?: string;
  carrier_audit?: string;
  product_type_carrier?: string;
  level_or_gi?: string;
  submitted_attorney?: string;
  submitted_attorney_status?: string;
  created_at?: string;
  updated_at?: string;
}

const isTestLeadRow = (row: Partial<DailyDealFlowRow>) => {
  const valuesToInspect = [
    row.submission_id,
    row.insured_name,
    row.client_phone_number,
    row.lead_vendor,
    row.agent,
    row.licensed_agent_account,
    row.notes,
  ]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((value) => value.toLowerCase());

  return valuesToInspect.some((value) =>
    value.includes("test") ||
    value.includes("dummy") ||
    value.includes("qa") ||
    value.includes("sample")
  );
};

const DailyDealFlowPage = () => {
  // Special constant to match GridToolbar (cannot use empty string with Radix UI)
  const ALL_OPTION = "__ALL__";
  
  const [data, setData] = useState<DailyDealFlowRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [totalRecords, setTotalRecords] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFilter, setDateFilter] = useState<Date | undefined>(undefined);
  const [dateFromFilter, setDateFromFilter] = useState<Date | undefined>(undefined);
  const [dateToFilter, setDateToFilter] = useState<Date | undefined>(undefined);
  const [licensedAgentFilter, setLicensedAgentFilter] = useState(ALL_OPTION);
  const [leadVendorFilter, setLeadVendorFilter] = useState(ALL_OPTION);
  const [statusFilter, setStatusFilter] = useState(ALL_OPTION);
  const [callResultFilter, setCallResultFilter] = useState(ALL_OPTION);
  const [retentionFilter, setRetentionFilter] = useState(ALL_OPTION);
  const [incompleteUpdatesFilter, setIncompleteUpdatesFilter] = useState(ALL_OPTION);
  const [submittedAttorneyFilter, setSubmittedAttorneyFilter] = useState(ALL_OPTION);
  const [submittedAttorneyStatusFilter, setSubmittedAttorneyStatusFilter] = useState(ALL_OPTION);
  
  const recordsPerPage = 100;
  
  const { toast } = useToast();
  const { user } = useAuth();
  const navigate = useNavigate();

  const { attorneys, loading: attorneysLoading } = useAttorneys();
  const attorneyById = useMemo(() => {
    const map: Record<string, { full_name: string | null; primary_email: string | null }> = {};
    for (const attorney of attorneys) {
      map[attorney.user_id] = {
        full_name: attorney.full_name,
        primary_email: attorney.primary_email
      };
    }
    return map;
  }, [attorneys]);

  // Check if user has write permissions
  const hasWritePermissions = canPerformWriteOperations(user?.id);

  // Helper functions to handle mutual exclusivity between single date and date range
  const handleDateFilterChange = (date: Date | undefined) => {
    setDateFilter(date);
    // Clear date range when single date is set
    if (date) {
      setDateFromFilter(undefined);
      setDateToFilter(undefined);
    }
  };

  const handleDateFromFilterChange = (date: Date | undefined) => {
    setDateFromFilter(date);
    // Clear single date when range is used
    if (date || dateToFilter) {
      setDateFilter(undefined);
    }
  };

  const handleDateToFilterChange = (date: Date | undefined) => {
    setDateToFilter(date);
    // Clear single date when range is used
    if (date || dateFromFilter) {
      setDateFilter(undefined);
    }
  };

  // Fetch data from Supabase with lazy loading - only current page
  const fetchData = async (page = 1, showRefreshToast = false) => {
    try {
      setRefreshing(true);

      const from = (page - 1) * recordsPerPage;
      const to = from + recordsPerPage - 1;

      let query = supabase
        .from('daily_deal_flow')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(from, to);

      // Apply date filter if set - using EST timezone for consistency
      if (dateFilter) {
        const dateStr = dateObjectToESTString(dateFilter);
        query = query.eq('date', dateStr);
      }

      // Apply date range filter if set - using EST timezone for consistency
      if (dateFromFilter) {
        const dateFromStr = dateObjectToESTString(dateFromFilter);
        query = query.gte('date', dateFromStr);
      }

      if (dateToFilter) {
        const dateToStr = dateObjectToESTString(dateToFilter);
        query = query.lte('date', dateToStr);
      }

      // Apply other filters
      if (licensedAgentFilter && licensedAgentFilter !== ALL_OPTION) {
        query = query.eq('licensed_agent_account', licensedAgentFilter);
      }

      if (leadVendorFilter && leadVendorFilter !== ALL_OPTION) {
        query = query.eq('lead_vendor', leadVendorFilter);
      }

      if (statusFilter && statusFilter !== ALL_OPTION) {
        query = query.eq('status', statusFilter);
      }

      if (callResultFilter && callResultFilter !== ALL_OPTION) {
        query = query.eq('call_result', callResultFilter);
      }

      if (retentionFilter && retentionFilter !== ALL_OPTION) {
        const isRetention = retentionFilter === 'Retention';
        query = query.eq('is_retention_call', isRetention);
      }

      // Apply incomplete updates filter if set
      if (incompleteUpdatesFilter && incompleteUpdatesFilter !== ALL_OPTION) {
        if (incompleteUpdatesFilter === 'Incomplete') {
          // Filter for entries where status is null, empty, or undefined
          query = query.or('status.is.null,status.eq.');
        } else if (incompleteUpdatesFilter === 'Complete') {
          // Filter for entries where status is not null and not empty
          query = query.not('status', 'is', null).not('status', 'eq', '');
        }
      }

      // Apply submitted attorney filter
      if (submittedAttorneyFilter && submittedAttorneyFilter !== ALL_OPTION) {
        query = query.eq('submitted_attorney', submittedAttorneyFilter);
      }

      // Apply submitted attorney status filter
      if (submittedAttorneyStatusFilter && submittedAttorneyStatusFilter !== ALL_OPTION) {
        query = query.eq('submitted_attorney_status', submittedAttorneyStatusFilter);
      }

      // Apply search filter if set
      if (searchTerm) {
        query = query.or(`insured_name.ilike.%${searchTerm}%,client_phone_number.ilike.%${searchTerm}%,submission_id.ilike.%${searchTerm}%,lead_vendor.ilike.%${searchTerm}%,agent.ilike.%${searchTerm}%,status.ilike.%${searchTerm}%,carrier.ilike.%${searchTerm}%,licensed_agent_account.ilike.%${searchTerm}%`);
      }

      const { data: pageData, error, count } = await query;

      if (error) {
        console.error("Error fetching daily deal flow data:", error);
        toast({
          title: "Error",
          description: "Failed to fetch deal flow data",
          variant: "destructive",
        });
        return;
      }

      setData(pageData || []);
      setTotalRecords(count || 0);
      setCurrentPage(page);

      if (showRefreshToast) {
        toast({
          title: "Success",
          description: `Data refreshed successfully - loaded ${pageData?.length || 0} records for page ${page}`,
        });
      }
    } catch (error) {
      console.error("Error:", error);
      toast({
        title: "Error",
        description: "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Initial data load and refetch when filters change
  useEffect(() => {
    setCurrentPage(1); // Reset to first page when filters change
    fetchData(1);
  }, [dateFilter, dateFromFilter, dateToFilter, licensedAgentFilter, leadVendorFilter, statusFilter, callResultFilter, retentionFilter, incompleteUpdatesFilter, submittedAttorneyFilter, submittedAttorneyStatusFilter]);

  // Refetch when search term changes (debounced)
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setCurrentPage(1);
      fetchData(1);
    }, 300); // Debounce search by 300ms

    return () => clearTimeout(timeoutId);
  }, [searchTerm]);

  // Handle page changes
  const handlePageChange = (page: number) => {
    fetchData(page);
  };


  // With server-side filtering, data is already filtered
  const filteredData = data;

  const handleRefresh = () => {
    fetchData(1, true);
  };

  const handleExport = async () => {
    try {
      // Fetch all filtered data (not just current page) for export
      let query = supabase
        .from('daily_deal_flow')
        .select('*')
        .order('created_at', { ascending: false });

      // Apply all the same filters
      if (dateFilter) {
        const dateStr = dateObjectToESTString(dateFilter);
        query = query.eq('date', dateStr);
      }

      if (dateFromFilter) {
        const dateFromStr = dateObjectToESTString(dateFromFilter);
        query = query.gte('date', dateFromStr);
      }

      if (dateToFilter) {
        const dateToStr = dateObjectToESTString(dateToFilter);
        query = query.lte('date', dateToStr);
      }

      if (licensedAgentFilter && licensedAgentFilter !== ALL_OPTION) {
        query = query.eq('licensed_agent_account', licensedAgentFilter);
      }

      if (leadVendorFilter && leadVendorFilter !== ALL_OPTION) {
        query = query.eq('lead_vendor', leadVendorFilter);
      }

      if (statusFilter && statusFilter !== ALL_OPTION) {
        query = query.eq('status', statusFilter);
      }

      if (callResultFilter && callResultFilter !== ALL_OPTION) {
        query = query.eq('call_result', callResultFilter);
      }

      if (retentionFilter && retentionFilter !== ALL_OPTION) {
        const isRetention = retentionFilter === 'Retention';
        query = query.eq('is_retention_call', isRetention);
      }

      if (incompleteUpdatesFilter && incompleteUpdatesFilter !== ALL_OPTION) {
        if (incompleteUpdatesFilter === 'Incomplete') {
          query = query.or('status.is.null,status.eq.');
        } else if (incompleteUpdatesFilter === 'Complete') {
          query = query.not('status', 'is', null).not('status', 'eq', '');
        }
      }

      // Apply submitted attorney filter for export
      if (submittedAttorneyFilter && submittedAttorneyFilter !== ALL_OPTION) {
        query = query.eq('submitted_attorney', submittedAttorneyFilter);
      }

      // Apply submitted attorney status filter for export
      if (submittedAttorneyStatusFilter && submittedAttorneyStatusFilter !== ALL_OPTION) {
        query = query.eq('submitted_attorney_status', submittedAttorneyStatusFilter);
      }

      if (searchTerm) {
        query = query.or(`insured_name.ilike.%${searchTerm}%,client_phone_number.ilike.%${searchTerm}%,submission_id.ilike.%${searchTerm}%,lead_vendor.ilike.%${searchTerm}%,agent.ilike.%${searchTerm}%,status.ilike.%${searchTerm}%,carrier.ilike.%${searchTerm}%,licensed_agent_account.ilike.%${searchTerm}%`);
      }

      const { data: exportData, error } = await query;

      // Cast to any to handle new columns that may not be in generated types
      const typedData = exportData as unknown as Array<Record<string, unknown>>;

      if (error) {
        console.error("Error fetching data for export:", error);
        toast({
          title: "Export Failed",
          description: "Failed to fetch data for export",
          variant: "destructive",
        });
        return;
      }

      if (!exportData || exportData.length === 0) {
        toast({
          title: "No Data",
          description: "No data to export",
          variant: "destructive",
        });
        return;
      }

      const nonTestExportData = exportData.filter((row) => !isTestLeadRow(row));

      if (nonTestExportData.length === 0) {
        toast({
          title: "No Data",
          description: "No non-test leads available to export",
          variant: "destructive",
        });
        return;
      }

      // Define CSV headers
      const headers = [
        'Submission ID',
        'Date',
        'Customer Name',
        'Lead Vendor',
        'Phone Number',
        'Agent',
        'Closer',
        'Status',
        'Call Result',
        'Carrier',
        'Product Type',
        'Draft Date',
        'Monthly Premium',
        'Face Amount',
        'From Callback',
        'Is Callback',
        'Notes',
        'Policy Number',
        'Carrier Audit',
        'Product Type Carrier',
        'Level or GI',
        'Submitted Attorney',
        'Submitted Attorney Status',
        'Created At',
        'Updated At'
      ];

      // Generate CSV content
      const csvContent = [
        headers.join(','),
        ...nonTestExportData.map(row => [
          row.submission_id || '',
          row.date || '',
          row.insured_name || '',
          row.lead_vendor || '',
          row.client_phone_number || '',
          row.agent || '',
          row.licensed_agent_account || '',
          row.status || '',
          row.call_result || '',
          row.carrier || '',
          row.product_type || '',
          row.draft_date || '',
          row.monthly_premium || '',
          row.face_amount || '',
          row.from_callback ? 'Yes' : 'No',
          row.is_callback ? 'Yes' : 'No',
          ((row.notes as string) || '').replace(/"/g, '""'), // Escape quotes in notes
          (row.policy_number as string) || '',
          (row.carrier_audit as string) || '',
          (row.product_type_carrier as string) || '',
          (row.level_or_gi as string) || '',
          (row.submitted_attorney as string) || '',
          (row.submitted_attorney_status as string) || '',
          (row.created_at as string) || '',
          (row.updated_at as string) || ''
        ].map(field => `"${field}"`).join(','))
      ].join('\n');

      // Create and download CSV file
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      
      // Generate filename with current date and filter info
      let filename = `daily-deal-flow-${new Date().toISOString().split('T')[0]}`;
      if (dateFilter) {
        filename += `-${dateObjectToESTString(dateFilter)}`;
      } else if (dateFromFilter || dateToFilter) {
        filename += `-range`;
      }
      filename += '.csv';
      
      link.download = filename;
      link.click();
      window.URL.revokeObjectURL(url);

      toast({
        title: "Export Complete",
        description: `Successfully exported ${nonTestExportData.length} non-test records to CSV`,
      });
    } catch (error) {
      console.error("Error exporting data:", error);
      toast({
        title: "Export Failed",
        description: "An error occurred while exporting data",
        variant: "destructive",
      });
    }
  };

  if (loading || attorneysLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex items-center gap-2">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span className="text-lg">Loading Daily Deal Flow...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-full mx-auto space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-muted-foreground">
                Manage and edit your daily deal flow data in real-time
              </p>
            </div>
          
            <div className="flex items-center gap-2">
              {hasWritePermissions && (
                <>
                  {/* Create Entry Button */}
                  <CreateEntryForm onSuccess={fetchData} />

                  <Button variant="outline" onClick={handleExport} className="flex items-center gap-2">
                    <Download className="h-4 w-4" />
                    Export CSV
                  </Button>
                  
                  {/* Reports Menu */}
                  <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="flex items-center gap-2">
                    <FileSpreadsheet className="h-4 w-4" />
                    Reports
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-72">
                  <DropdownMenuLabel className="text-base font-semibold">Export Reports</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  
                  <div className="px-2 py-1.5">
                    <EODReports className="w-full justify-start text-sm font-medium" />
                  </div>
                  
                  <div className="px-2 py-1.5">
                    <WeeklyReports className="w-full justify-start text-sm font-medium" />
                  </div>
                  
                  <div className="px-2 py-1.5">
                    <GHLExport className="w-full justify-start text-sm font-medium" />
                  </div>
                  
                  <DropdownMenuSeparator />
                  
                  <DropdownMenuItem onClick={handleExport} className="cursor-pointer">
                    <Download className="mr-2 h-4 w-4" />
                    <div className="flex flex-col">
                      <span className="font-medium">Export Filtered Data</span>
                      <span className="text-xs text-muted-foreground">Download current view as CSV</span>
                    </div>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
                </>
              )}
              
              {/* Refresh Button */}
              <Button
                variant="outline"
                onClick={handleRefresh}
                disabled={refreshing}
                className="flex items-center gap-2"
              >
                <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
        </div>

        {/* Toolbar */}
        <GridToolbar
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          dateFilter={dateFilter}
          onDateFilterChange={handleDateFilterChange}
          dateFromFilter={dateFromFilter}
          onDateFromFilterChange={handleDateFromFilterChange}
          dateToFilter={dateToFilter}
          onDateToFilterChange={handleDateToFilterChange}
          licensedAgentFilter={licensedAgentFilter}
          onLicensedAgentFilterChange={setLicensedAgentFilter}
          attorneys={attorneys}
          leadVendorFilter={leadVendorFilter}
          onLeadVendorFilterChange={setLeadVendorFilter}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          callResultFilter={callResultFilter}
          onCallResultFilterChange={setCallResultFilter}
          retentionFilter={retentionFilter}
          onRetentionFilterChange={setRetentionFilter}
          incompleteUpdatesFilter={incompleteUpdatesFilter}
          onIncompleteUpdatesFilterChange={setIncompleteUpdatesFilter}
          submittedAttorneyFilter={submittedAttorneyFilter}
          onSubmittedAttorneyFilterChange={setSubmittedAttorneyFilter}
          submittedAttorneyStatusFilter={submittedAttorneyStatusFilter}
          onSubmittedAttorneyStatusFilterChange={setSubmittedAttorneyStatusFilter}
          totalRows={totalRecords}
        />

        {/* Data Grid */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Deal Flow Data</span>
              <span className="text-sm font-normal text-muted-foreground">
                {totalRecords} total records • Page {currentPage} of {Math.ceil(totalRecords / recordsPerPage)} • Showing {data.length} records
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <DataGrid
              data={filteredData}
              onDataUpdate={fetchData}
              hasWritePermissions={hasWritePermissions}
              attorneys={attorneys}
              attorneyById={attorneyById}
              currentPage={currentPage}
              totalRecords={totalRecords}
              recordsPerPage={recordsPerPage}
              onPageChange={handlePageChange}
            />
          </CardContent>
        </Card>
        </div>
      </div>
    </div>
  );
};

export default DailyDealFlowPage;
