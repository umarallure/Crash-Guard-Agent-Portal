import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { format } from "date-fns";
import { Search, X, Filter } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCenters } from "@/hooks/useCenters";

interface GridToolbarProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  dateFilter?: Date;
  onDateFilterChange: (date: Date | undefined) => void;
  dateFromFilter?: Date;
  onDateFromFilterChange: (date: Date | undefined) => void;
  dateToFilter?: Date;
  onDateToFilterChange: (date: Date | undefined) => void;
  bufferAgentFilter: string;
  onBufferAgentFilterChange: (value: string) => void;
  licensedAgentFilter: string;
  onLicensedAgentFilterChange: (value: string) => void;
  leadVendorFilter: string;
  onLeadVendorFilterChange: (value: string) => void;
  statusFilter: string;
  onStatusFilterChange: (value: string) => void;
  callResultFilter: string;
  onCallResultFilterChange: (value: string) => void;
  retentionFilter: string;
  onRetentionFilterChange: (value: string) => void;
  incompleteUpdatesFilter: string;
  onIncompleteUpdatesFilterChange: (value: string) => void;
  totalRows: number;
}

export const GridToolbar = ({
  searchTerm,
  onSearchChange,
  dateFilter,
  onDateFilterChange,
  dateFromFilter,
  onDateFromFilterChange,
  dateToFilter,
  onDateToFilterChange,
  bufferAgentFilter,
  onBufferAgentFilterChange,
  licensedAgentFilter,
  onLicensedAgentFilterChange,
  leadVendorFilter,
  onLeadVendorFilterChange,
  statusFilter,
  onStatusFilterChange,
  callResultFilter,
  onCallResultFilterChange,
  retentionFilter,
  onRetentionFilterChange,
  incompleteUpdatesFilter,
  onIncompleteUpdatesFilterChange,
  totalRows
}: GridToolbarProps) => {
  // Special constant to represent "All" selections (cannot use empty string with Radix UI)
  const ALL_OPTION = "__ALL__";
  const { leadVendors } = useCenters();
  // Filter options (these should match your database values)
  const bufferAgentOptions = [
    "All Buffer Agents",
    "Kyla",
    "Justine",
    "Nicole Mejia",
    "Angelica",
    "Laiza Batain",
    "Aqib Afridi",
    "Qasim Raja",
    "Noah Akins",
    "Hussain Khan",
    "N/A",
  ];

  const licensedAgentOptions = [
    "All Licensed Agents",
    "Claudia",
    "Lydia",
    "Isaac",
    "Trinity",
    "Benjamin",
    "Tatumn",
    "Noah",
    "N/A"
  ];


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
    "Call Back Fix",
    "Call Never Sent",
    "Disconnected"
  ];

  const callResultOptions = [
    "All Call Results",
    "Underwriting",
    "Submitted",
    "Not Submitted"
  ];

  const retentionOptions = [
    "All Types",
    "Retention",
    "Regular"
  ];

  const incompleteUpdatesOptions = [
    "All Updates",
    "Incomplete",
    "Complete"
  ];

  const clearDateFilter = () => {
    onDateFilterChange(undefined);
  };

  const clearDateFromFilter = () => {
    onDateFromFilterChange(undefined);
  };

  const clearDateToFilter = () => {
    onDateToFilterChange(undefined);
  };

  const clearAllDateFilters = () => {
    onDateFilterChange(undefined);
    onDateFromFilterChange(undefined);
    onDateToFilterChange(undefined);
  };

  const clearSearch = () => {
    onSearchChange("");
  };

  const clearAllFilters = () => {
    onSearchChange("");
    onDateFilterChange(undefined);
    onDateFromFilterChange(undefined);
    onDateToFilterChange(undefined);
    onBufferAgentFilterChange(ALL_OPTION);
    onLicensedAgentFilterChange(ALL_OPTION);
    onLeadVendorFilterChange(ALL_OPTION);
    onStatusFilterChange(ALL_OPTION);
    onCallResultFilterChange(ALL_OPTION);
    onRetentionFilterChange(ALL_OPTION);
    onIncompleteUpdatesFilterChange(ALL_OPTION);
  };

  const hasActiveFilters = searchTerm || dateFilter || dateFromFilter || dateToFilter ||
    (bufferAgentFilter && bufferAgentFilter !== ALL_OPTION) || 
    (licensedAgentFilter && licensedAgentFilter !== ALL_OPTION) || 
    (leadVendorFilter && leadVendorFilter !== ALL_OPTION) || 
    (statusFilter && statusFilter !== ALL_OPTION) || 
    (callResultFilter && callResultFilter !== ALL_OPTION) ||
    (retentionFilter && retentionFilter !== ALL_OPTION) ||
    (incompleteUpdatesFilter && incompleteUpdatesFilter !== ALL_OPTION);

  return (
    <div className="space-y-4 p-4 bg-card rounded-lg border">
      {/* First Row: Search and Date Filter */}
      <div className="flex items-end gap-4">
        {/* Search */}
        <div className="flex-1 max-w-sm">
          <Label htmlFor="search" className="text-sm font-medium">
            Search Records
          </Label>
          <div className="relative mt-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="search"
              placeholder="Search by name, phone, agent, etc..."
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-10 pr-10"
            />
            {searchTerm && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearSearch}
                className="absolute right-1 top-1/2 transform -translate-y-1/2 h-6 w-6 p-0"
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>

        {/* Date Filter */}
        <div>
          <Label className="text-sm font-medium">
            Filter by Date
          </Label>
          <div className="flex items-center gap-2 mt-1">
            <DatePicker
              date={dateFilter}
              onDateChange={onDateFilterChange}
              placeholder="All dates"
              className="min-w-[140px]"
            />
            
            {dateFilter && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearDateFilter}
                className="h-8 w-8 p-0"
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>

        {/* Date Range Filters */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* From Date Filter */}
          <div>
            <Label className="text-sm font-medium">
              From Date
            </Label>
            <div className="flex items-center gap-2 mt-1">
              <DatePicker
                date={dateFromFilter}
                onDateChange={onDateFromFilterChange}
                placeholder="Select start date"
                className="min-w-[140px]"
              />
              
              {dateFromFilter && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearDateFromFilter}
                  className="h-8 w-8 p-0"
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>
          </div>

          {/* To Date Filter */}
          <div>
            <Label className="text-sm font-medium">
              To Date
            </Label>
            <div className="flex items-center gap-2 mt-1">
              <DatePicker
                date={dateToFilter}
                onDateChange={onDateToFilterChange}
                placeholder="Select end date"
                className="min-w-[140px]"
              />
              
              {dateToFilter && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearDateToFilter}
                  className="h-8 w-8 p-0"
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Clear Date Range Button */}
        {(dateFromFilter || dateToFilter) && (
          <div className="flex justify-center">
            <Button
              variant="outline"
              size="sm"
              onClick={clearAllDateFilters}
              className="text-sm"
            >
              <X className="mr-1 h-3 w-3" />
              Clear Date Range
            </Button>
          </div>
        )}

        {/* Clear All Filters Button */}
        {hasActiveFilters && (
          <Button
            variant="outline"
            onClick={clearAllFilters}
            className="flex items-center gap-2"
          >
            <Filter className="h-4 w-4" />
            Clear All Filters
          </Button>
        )}

        {/* Results Count */}
        <div className="text-sm text-muted-foreground ml-auto">
          <strong>{totalRows}</strong> records found
          {hasActiveFilters && (
            <span className="ml-2 text-blue-600">
              (filtered)
            </span>
          )}
        </div>
      </div>

      {/* Second Row: Additional Filters */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-4">
        {/* Buffer Agent Filter */}
        <div>
          <Label className="text-sm font-medium">
            Buffer Agent
            {bufferAgentFilter && bufferAgentFilter !== ALL_OPTION && <span className="text-blue-600 ml-1">●</span>}
          </Label>
          <Select value={bufferAgentFilter || ALL_OPTION} onValueChange={onBufferAgentFilterChange}>
            <SelectTrigger className={cn("mt-1", bufferAgentFilter && bufferAgentFilter !== ALL_OPTION && "ring-2 ring-blue-200")}>
              <SelectValue placeholder="All Buffer Agents" />
            </SelectTrigger>
            <SelectContent>
              {bufferAgentOptions.map((agent) => (
                <SelectItem key={agent} value={agent === "All Buffer Agents" ? ALL_OPTION : agent}>
                  {agent}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Licensed Agent Filter */}
        <div>
          <Label className="text-sm font-medium">
            Licensed Agent
            {licensedAgentFilter && licensedAgentFilter !== ALL_OPTION && <span className="text-blue-600 ml-1">●</span>}
          </Label>
          <Select value={licensedAgentFilter || ALL_OPTION} onValueChange={onLicensedAgentFilterChange}>
            <SelectTrigger className={cn("mt-1", licensedAgentFilter && licensedAgentFilter !== ALL_OPTION && "ring-2 ring-blue-200")}>
              <SelectValue placeholder="All Licensed Agents" />
            </SelectTrigger>
            <SelectContent>
              {licensedAgentOptions.map((agent) => (
                <SelectItem key={agent} value={agent === "All Licensed Agents" ? ALL_OPTION : agent}>
                  {agent}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Lead Vendor Filter */}
        <div>
          <Label className="text-sm font-medium">
            Lead Vendor
            {leadVendorFilter && leadVendorFilter !== ALL_OPTION && <span className="text-blue-600 ml-1">●</span>}
          </Label>
          <Select value={leadVendorFilter || ALL_OPTION} onValueChange={onLeadVendorFilterChange}>
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

        {/* Status Filter */}
        <div>
          <Label className="text-sm font-medium">
            Status
            {statusFilter && statusFilter !== ALL_OPTION && <span className="text-blue-600 ml-1">●</span>}
          </Label>
          <Select value={statusFilter || ALL_OPTION} onValueChange={onStatusFilterChange}>
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

        {/* Call Result Filter */}
        <div>
          <Label className="text-sm font-medium">
            Call Result
            {callResultFilter && callResultFilter !== ALL_OPTION && <span className="text-blue-600 ml-1">●</span>}
          </Label>
          <Select value={callResultFilter || ALL_OPTION} onValueChange={onCallResultFilterChange}>
            <SelectTrigger className={cn("mt-1", callResultFilter && callResultFilter !== ALL_OPTION && "ring-2 ring-blue-200")}>
              <SelectValue placeholder="All Call Results" />
            </SelectTrigger>
            <SelectContent>
              {callResultOptions.map((result) => (
                <SelectItem key={result} value={result === "All Call Results" ? ALL_OPTION : result}>
                  {result}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Incomplete Updates Filter */}
        <div>
          <Label className="text-sm font-medium">
            Update Status
            {incompleteUpdatesFilter && incompleteUpdatesFilter !== ALL_OPTION && <span className="text-blue-600 ml-1">●</span>}
          </Label>
          <Select value={incompleteUpdatesFilter || ALL_OPTION} onValueChange={onIncompleteUpdatesFilterChange}>
            <SelectTrigger className={cn("mt-1", incompleteUpdatesFilter && incompleteUpdatesFilter !== ALL_OPTION && "ring-2 ring-blue-200")}>
              <SelectValue placeholder="All Updates" />
            </SelectTrigger>
            <SelectContent>
              {incompleteUpdatesOptions.map((option) => (
                <SelectItem key={option} value={option === "All Updates" ? ALL_OPTION : option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Retention Filter */}
        <div>
          <Label className="text-sm font-medium">
            Call Type
            {retentionFilter && retentionFilter !== ALL_OPTION && <span className="text-blue-600 ml-1">●</span>}
          </Label>
          <Select value={retentionFilter || ALL_OPTION} onValueChange={onRetentionFilterChange}>
            <SelectTrigger className={cn("mt-1", retentionFilter && retentionFilter !== ALL_OPTION && "ring-2 ring-blue-200")}>
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              {retentionOptions.map((type) => (
                <SelectItem key={type} value={type === "All Types" ? ALL_OPTION : type}>
                  {type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
};
