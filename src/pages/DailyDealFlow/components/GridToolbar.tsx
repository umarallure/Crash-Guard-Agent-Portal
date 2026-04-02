import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Search, X, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCenters } from "@/hooks/useCenters";
import { fetchLicensedCloserOptions } from "@/lib/agentOptions";

interface GridToolbarProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  dateFilter?: Date;
  onDateFilterChange: (date: Date | undefined) => void;
  dateFromFilter?: Date;
  onDateFromFilterChange: (date: Date | undefined) => void;
  dateToFilter?: Date;
  onDateToFilterChange: (date: Date | undefined) => void;
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
  submittedAttorneyStatusFilter?: string;
  onSubmittedAttorneyStatusFilterChange?: (value: string) => void;
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
  submittedAttorneyStatusFilter,
  onSubmittedAttorneyStatusFilterChange,
  totalRows
}: GridToolbarProps) => {
  const ALL_OPTION = "__ALL__";
  const { leadVendors } = useCenters();
  const [showFilters, setShowFilters] = useState(false);
  const [closerOptions, setCloserOptions] = useState<string[]>(["All Closers"]);
  const [statusFilterOpen, setStatusFilterOpen] = useState(false);
  const [statusFilterQuery, setStatusFilterQuery] = useState("");

  useEffect(() => {
    const fetchClosers = async () => {
      try {
        const options = await fetchLicensedCloserOptions();
        setCloserOptions(["All Closers", ...options.map((o) => o.label)]);
      } catch (e) {
        console.error('Error fetching closers:', e);
        setCloserOptions(["All Closers"]);
      }
    };
    fetchClosers();
  }, []);

  useEffect(() => {
    if (!statusFilter || statusFilter === ALL_OPTION) {
      setStatusFilterQuery("");
      return;
    }
    setStatusFilterQuery(statusFilter);
  }, [statusFilter]);

  const statusOptions = useMemo(
    () => [
      "All Statuses",
      "Pending Approval",
      "Previously Sold BPO",
      "Needs BPO Callback",
      "Incomplete Transfer",
      "DQ'd Can't be sold",
      "Returned To Center - DQ",
      "Return DID Successfully",
      "Future Submission Date",
      "Application Withdrawn",
      "Updated Banking/draft date",
      "Fulfilled carrier requirements",
      "Call Back Fix",
      "Call Never Sent",
      "Disconnected",
    ],
    []
  );

  const statusFilterMatches = useMemo(() => {
    const normalized = statusOptions.map((s) => (s === "All Statuses" ? ALL_OPTION : s));
    const query = statusFilterQuery.trim().toLowerCase();
    if (!query) return normalized;
    return normalized.filter((opt) => opt !== ALL_OPTION && opt.toLowerCase().includes(query));
  }, [statusFilterQuery, statusOptions]);

  const callResultOptions = ["All Call Results", "Qualified", "Underwriting", "Not Qualified"];
  const retentionOptions = ["All Types", "Retention", "Regular"];
  const incompleteUpdatesOptions = ["All Updates", "Incomplete", "Complete"];

  const clearAllFilters = () => {
    onSearchChange("");
    onDateFilterChange(undefined);
    onDateFromFilterChange(undefined);
    onDateToFilterChange(undefined);
    onLicensedAgentFilterChange(ALL_OPTION);
    onLeadVendorFilterChange(ALL_OPTION);
    onStatusFilterChange(ALL_OPTION);
    onCallResultFilterChange(ALL_OPTION);
    onRetentionFilterChange(ALL_OPTION);
    onIncompleteUpdatesFilterChange(ALL_OPTION);
    if (onSubmittedAttorneyStatusFilterChange) onSubmittedAttorneyStatusFilterChange(ALL_OPTION);
  };

  const hasActiveFilters =
    !!dateFilter || !!dateFromFilter || !!dateToFilter ||
    (licensedAgentFilter && licensedAgentFilter !== ALL_OPTION) ||
    (leadVendorFilter && leadVendorFilter !== ALL_OPTION) ||
    (statusFilter && statusFilter !== ALL_OPTION) ||
    (callResultFilter && callResultFilter !== ALL_OPTION) ||
    (retentionFilter && retentionFilter !== ALL_OPTION) ||
    (incompleteUpdatesFilter && incompleteUpdatesFilter !== ALL_OPTION) ||
    (submittedAttorneyStatusFilter && submittedAttorneyStatusFilter !== ALL_OPTION);

  return (
    <div className="space-y-3">
      {/* ── Toolbar row ── */}
      <div className="flex items-center gap-2">
        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, phone, agent…"
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9 pr-9"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowFilters((v) => !v)}
          className={showFilters ? "border-primary text-primary bg-primary/5" : ""}
        >
          <SlidersHorizontal className="mr-2 h-4 w-4" />
          Filters
          {hasActiveFilters && (
            <span className="ml-2 flex h-2 w-2 rounded-full bg-primary" />
          )}
        </Button>

        <div className="flex-1" />

        <Badge variant="secondary" className="px-2.5 py-1 tabular-nums shrink-0">
          {totalRows} records{hasActiveFilters && <span className="ml-1 text-primary">(filtered)</span>}
        </Badge>
      </div>

      {/* ── Collapsible Filter Panel ── */}
      {showFilters && (
        <Card className="border-primary/20 bg-muted/30 shadow-none">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-semibold text-foreground">Filters</span>
                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={clearAllFilters}
                    className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary hover:bg-primary/20 transition"
                  >
                    <X className="h-3 w-3" />
                    Clear all
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => setShowFilters(false)}
                className="rounded-md p-1 text-muted-foreground hover:bg-muted transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-5">
              {/* Filter by Date */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Date</label>
                <div className="flex items-center gap-1">
                  <DatePicker date={dateFilter} onDateChange={onDateFilterChange} placeholder="All dates" className="flex-1" />
                  {dateFilter && (
                    <button type="button" onClick={() => onDateFilterChange(undefined)} className="rounded p-1 text-muted-foreground hover:text-foreground">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* From Date */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">From Date</label>
                <div className="flex items-center gap-1">
                  <DatePicker date={dateFromFilter} onDateChange={onDateFromFilterChange} placeholder="Start date" className="flex-1" />
                  {dateFromFilter && (
                    <button type="button" onClick={() => onDateFromFilterChange(undefined)} className="rounded p-1 text-muted-foreground hover:text-foreground">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* To Date */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">To Date</label>
                <div className="flex items-center gap-1">
                  <DatePicker date={dateToFilter} onDateChange={onDateToFilterChange} placeholder="End date" className="flex-1" />
                  {dateToFilter && (
                    <button type="button" onClick={() => onDateToFilterChange(undefined)} className="rounded p-1 text-muted-foreground hover:text-foreground">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Closer */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Closer</label>
                <Select value={licensedAgentFilter || ALL_OPTION} onValueChange={onLicensedAgentFilterChange}>
                  <SelectTrigger className={cn(licensedAgentFilter && licensedAgentFilter !== ALL_OPTION && "ring-2 ring-primary/30")}>
                    <SelectValue placeholder="All Closers" />
                  </SelectTrigger>
                  <SelectContent>
                    {closerOptions.map((closer) => (
                      <SelectItem key={closer} value={closer === "All Closers" ? ALL_OPTION : closer}>
                        {closer}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Lead Vendor */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Lead Vendor</label>
                <Select value={leadVendorFilter || ALL_OPTION} onValueChange={onLeadVendorFilterChange}>
                  <SelectTrigger className={cn(leadVendorFilter && leadVendorFilter !== ALL_OPTION && "ring-2 ring-primary/30")}>
                    <SelectValue placeholder="All Vendors" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_OPTION}>All Lead Vendors</SelectItem>
                    {leadVendors.map((vendor) => (
                      <SelectItem key={vendor} value={vendor}>{vendor}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Status */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</label>
                <div className="relative">
                  <Input
                    className={cn(statusFilter && statusFilter !== ALL_OPTION && "ring-2 ring-primary/30")}
                    value={statusFilterQuery}
                    placeholder="All Statuses"
                    onFocus={() => setStatusFilterOpen(true)}
                    onChange={(e) => {
                      const next = e.target.value;
                      setStatusFilterQuery(next);
                      setStatusFilterOpen(true);
                      if (!next.trim()) onStatusFilterChange(ALL_OPTION);
                    }}
                    onBlur={() => window.setTimeout(() => setStatusFilterOpen(false), 150)}
                  />
                  {statusFilterOpen && (
                    <div className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
                      {statusFilterMatches.length === 0 ? (
                        <div className="px-2 py-1.5 text-sm text-muted-foreground">No match found.</div>
                      ) : (
                        statusFilterMatches.map((opt) => (
                          <button
                            key={opt}
                            type="button"
                            className="w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              onStatusFilterChange(opt === ALL_OPTION ? ALL_OPTION : opt);
                              setStatusFilterQuery(opt === ALL_OPTION ? "" : opt);
                              setStatusFilterOpen(false);
                            }}
                          >
                            {opt === ALL_OPTION ? "All Statuses" : opt}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Call Result */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Call Result</label>
                <Select value={callResultFilter || ALL_OPTION} onValueChange={onCallResultFilterChange}>
                  <SelectTrigger className={cn(callResultFilter && callResultFilter !== ALL_OPTION && "ring-2 ring-primary/30")}>
                    <SelectValue placeholder="All Results" />
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

              {/* Update Status */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Update Status</label>
                <Select value={incompleteUpdatesFilter || ALL_OPTION} onValueChange={onIncompleteUpdatesFilterChange}>
                  <SelectTrigger className={cn(incompleteUpdatesFilter && incompleteUpdatesFilter !== ALL_OPTION && "ring-2 ring-primary/30")}>
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

              {/* Call Type */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Call Type</label>
                <Select value={retentionFilter || ALL_OPTION} onValueChange={onRetentionFilterChange}>
                  <SelectTrigger className={cn(retentionFilter && retentionFilter !== ALL_OPTION && "ring-2 ring-primary/30")}>
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

              {/* Attorney Status */}
              {onSubmittedAttorneyStatusFilterChange && (
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Attorney Status</label>
                  <Select value={submittedAttorneyStatusFilter || ALL_OPTION} onValueChange={onSubmittedAttorneyStatusFilterChange}>
                    <SelectTrigger className={cn(submittedAttorneyStatusFilter && submittedAttorneyStatusFilter !== ALL_OPTION && "ring-2 ring-primary/30")}>
                      <SelectValue placeholder="All Statuses" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL_OPTION}>All Statuses</SelectItem>
                      <SelectItem value="submitted">Submitted</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="nocoverage">No Coverage</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
