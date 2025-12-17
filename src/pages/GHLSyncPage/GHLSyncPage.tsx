import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { NavigationHeader } from "@/components/NavigationHeader";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { GHLSyncDataGrid } from "./components/GHLSyncDataGrid";
import { Loader2, RefreshCw } from "lucide-react";
import { canPerformWriteOperations } from "@/lib/userPermissions";
import { DatePicker } from "@/components/ui/date-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useCenters } from "@/hooks/useCenters";

export interface GHLSyncRow {
  id: string;
  submission_id: string;
  date?: string;
  lead_vendor?: string;
  insured_name?: string;
  client_phone_number?: string;
  agent?: string;
  status?: string;
  sync_status?: string;
  carrier?: string;
  face_amount?: number;
  monthly_premium?: number;
  draft_date?: string;
  notes?: string;
}

const GHLSyncPage = () => {
  const [data, setData] = useState<GHLSyncRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [totalRecords, setTotalRecords] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFilter, setDateFilter] = useState<Date | undefined>(undefined);
  const [leadVendorFilter, setLeadVendorFilter] = useState("__ALL__");
  const [statusFilter, setStatusFilter] = useState("__ALL__");
  const [syncStatusFilter, setSyncStatusFilter] = useState("__ALL__");

  const recordsPerPage = 100;

  // Special constant to represent "All" selections (cannot use empty string with Radix UI)
  const ALL_OPTION = "__ALL__";

  const { leadVendors } = useCenters();

  const statusOptions = [
    "All Statuses",
    "Pending Approval",
    "Previously Sold BPO",
    "Needs BPO Callback",
    "Incomplete Transfer",
    "DQ'd Can't be sold",
    "Returned To Center - DQ",
    "Future Submission Date",
    "Application Withdrawn",
    "Updated Banking/draft date",
    "Fulfilled carrier requirements",
    "Pending Failed Payment Fix",
    "Updated Banking and draft date",
    "Call Back Fix",
    "Call Never Sent",
    "Disconnected"
  ];

  const syncStatusOptions = [
    "All Sync Statuses",
    "Synced",
    "Unsynced",
    "Sync Failed"
  ];

  const { toast } = useToast();
  const { user } = useAuth();

  // Check if current user has write permissions
  const hasWritePermissions = canPerformWriteOperations(user?.id);

  // Fetch data from Supabase with lazy loading
  const fetchData = async (page = 1, showRefreshToast = false) => {
    try {
      setRefreshing(true);

      const from = (page - 1) * recordsPerPage;
      const to = from + recordsPerPage - 1;

      // First get daily deal flow data
      let query = supabase
        .from('daily_deal_flow')
        .select('id, submission_id, client_phone_number, lead_vendor, date, insured_name, agent, status, sync_status, carrier, face_amount, monthly_premium, draft_date, notes', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(from, to);

      // Apply date filter if set
      if (dateFilter) {
        // Format date to match the database format (YYYY-MM-DD)
        const year = dateFilter.getFullYear();
        const month = String(dateFilter.getMonth() + 1).padStart(2, '0');
        const day = String(dateFilter.getDate()).padStart(2, '0');
        const dateStr = `${year}-${month}-${day}`;
        query = query.eq('date', dateStr);
      }

      // Apply lead vendor filter if set
      if (leadVendorFilter && leadVendorFilter !== "__ALL__") {
        query = query.eq('lead_vendor', leadVendorFilter);
      }

      // Apply status filter if set
      if (statusFilter && statusFilter !== "__ALL__") {
        query = query.eq('status', statusFilter);
      }

      // Apply sync status filter if set
      if (syncStatusFilter && syncStatusFilter !== "__ALL__") {
        if (syncStatusFilter === "Synced") {
          query = query.eq('sync_status', 'synced');
        } else if (syncStatusFilter === "Sync Failed") {
          query = query.eq('sync_status', 'sync failed');
        } else if (syncStatusFilter === "Unsynced") {
          query = query.or('sync_status.is.null,sync_status.eq.');
        }
      }

      // Apply search filter if set
      if (searchTerm) {
        query = query.or(`insured_name.ilike.%${searchTerm}%,client_phone_number.ilike.%${searchTerm}%,submission_id.ilike.%${searchTerm}%,lead_vendor.ilike.%${searchTerm}%,agent.ilike.%${searchTerm}%,status.ilike.%${searchTerm}%,sync_status.ilike.%${searchTerm}%`);
      }

      const { data: dealFlowData, error, count } = await query;

      if (error) {
        console.error("Error fetching daily deal flow data:", error);
        toast({
          title: "Error",
          description: "Failed to fetch deal flow data",
          variant: "destructive",
        });
        return;
      }

      // For each deal flow record, try to get GHL data from leads table
      const enrichedData: GHLSyncRow[] = (dealFlowData || []).map((row: any) => {
        return {
          id: row.id,
          submission_id: row.submission_id,
          client_phone_number: row.client_phone_number,
          lead_vendor: row.lead_vendor,
          date: row.date,
          insured_name: row.insured_name,
          agent: row.agent,
          status: row.status,
          sync_status: row.sync_status,
          carrier: row.carrier,
          face_amount: row.face_amount,
          monthly_premium: row.monthly_premium,
          draft_date: row.draft_date,
          notes: row.notes,
        };
      });

      setData(enrichedData);
      setTotalRecords(count || 0);
      setCurrentPage(page);

      if (showRefreshToast) {
        toast({
          title: "Success",
          description: `Data refreshed successfully - loaded ${enrichedData.length} records for page ${page}`,
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
  }, [dateFilter, leadVendorFilter, statusFilter, syncStatusFilter]);

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

  // Handle data update (called after sync operations)
  const handleDataUpdate = () => {
    fetchData(currentPage);
  };

  const handleRefresh = () => {
    fetchData(1, true);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex items-center gap-2">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span className="text-lg">Loading GHL Sync Data...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <NavigationHeader title="GHL Sync Portal" />
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-full mx-auto space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold">GoHighLevel Sync Portal</h2>
              <p className="text-muted-foreground">
                Sync deal flow data with GoHighLevel CRM
              </p>
            </div>

            <div className="flex items-center gap-2">
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

          {/* Filters */}
          <Card>
            <CardHeader>
              <CardTitle>Filters</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                <div>
                  <Label className="text-sm font-medium">Search</Label>
                  <Input
                    type="text"
                    placeholder="Search by name, phone, submission ID..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="mt-1"
                  />
                </div>

                <div>
                  <Label className="text-sm font-medium">Date</Label>
                  <div className="mt-1">
                    <DatePicker
                      date={dateFilter}
                      onDateChange={setDateFilter}
                      placeholder="All dates"
                      className="w-full"
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-sm font-medium">
                    Lead Vendor
                    {leadVendorFilter && leadVendorFilter !== ALL_OPTION && <span className="text-blue-600 ml-1">●</span>}
                  </Label>
                  <Select value={leadVendorFilter || ALL_OPTION} onValueChange={setLeadVendorFilter}>
                    <SelectTrigger className={cn("mt-1", leadVendorFilter && leadVendorFilter !== ALL_OPTION && "ring-2 ring-blue-200")}>
                      <SelectValue placeholder="All Lead Vendors" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL_OPTION}>All Lead Vendors</SelectItem>
                      {leadVendors.map((vendor) => (
                        <SelectItem key={vendor} value={vendor}>
                          {vendor}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-sm font-medium">
                    Status
                    {statusFilter && statusFilter !== ALL_OPTION && <span className="text-blue-600 ml-1">●</span>}
                  </Label>
                  <Select value={statusFilter || ALL_OPTION} onValueChange={setStatusFilter}>
                    <SelectTrigger className={cn("mt-1", statusFilter && statusFilter !== ALL_OPTION && "ring-2 ring-blue-200")}>
                      <SelectValue placeholder="All Statuses" />
                    </SelectTrigger>
                    <SelectContent>
                      {statusOptions.map((status) => (
                        <SelectItem key={status} value={status === "All Statuses" ? ALL_OPTION : status}>
                          {status}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-sm font-medium">
                    Sync Status
                    {syncStatusFilter && syncStatusFilter !== ALL_OPTION && <span className="text-blue-600 ml-1">●</span>}
                  </Label>
                  <Select value={syncStatusFilter || ALL_OPTION} onValueChange={setSyncStatusFilter}>
                    <SelectTrigger className={cn("mt-1", syncStatusFilter && syncStatusFilter !== ALL_OPTION && "ring-2 ring-blue-200")}>
                      <SelectValue placeholder="All Sync Statuses" />
                    </SelectTrigger>
                    <SelectContent>
                      {syncStatusOptions.map((syncStatus) => (
                        <SelectItem key={syncStatus} value={syncStatus === "All Sync Statuses" ? ALL_OPTION : syncStatus}>
                          {syncStatus}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

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
              <GHLSyncDataGrid
                data={data}
                onDataUpdate={handleDataUpdate}
                hasWritePermissions={hasWritePermissions}
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

export default GHLSyncPage;