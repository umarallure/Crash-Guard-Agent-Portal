import { useState, useMemo, useEffect } from 'react';
import React from 'react';
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ChevronDown, ChevronRight as ChevronRightIcon } from 'lucide-react';
import { DailyDealFlowRow } from "../DailyDealFlowPage";
import { EditableRow } from "./EditableRow";
import { supabase } from "@/integrations/supabase/client";

interface DataGridProps {
  data: DailyDealFlowRow[];
  onDataUpdate: () => void;
  hasWritePermissions?: boolean;
  currentPage?: number;
  totalRecords?: number;
  recordsPerPage?: number;
  onPageChange?: (page: number) => void;
}

export const DataGrid = ({ 
  data, 
  onDataUpdate, 
  hasWritePermissions = true,
  currentPage = 1,
  totalRecords = 0,
  recordsPerPage = 50,
  onPageChange
}: DataGridProps) => {
  const [groupBy, setGroupBy] = useState<string>('none');
  const [groupBySecondary, setGroupBySecondary] = useState<string>('none');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [sortConfig, setSortConfig] = useState<{key: string, direction: 'asc' | 'desc'} | null>(null);
  const [allDistinctValues, setAllDistinctValues] = useState<{[key: string]: string[]}>({});

  // Fetch all distinct values for grouping fields when component mounts
  useEffect(() => {
    const fetchDistinctValues = async () => {
      try {
        const fields = ['lead_vendor', 'buffer_agent', 'agent', 'licensed_agent_account'];
        const distinctValues: {[key: string]: string[]} = {};

        for (const field of fields) {
          const { data: values, error } = await supabase
            .from('daily_deal_flow')
            .select(field)
            .not(field, 'is', null)
            .order(field);

          if (!error && values) {
            // Get unique values
            const uniqueValues = [...new Set(values.map((v: any) => v[field]).filter(Boolean))];
            distinctValues[field] = uniqueValues;
          } else {
            distinctValues[field] = [];
          }
        }

        // Add boolean field options
        distinctValues['is_callback'] = ['Callback', 'Regular Lead'];
        distinctValues['is_retention_call'] = ['Retention', 'Regular'];

        setAllDistinctValues(distinctValues);
      } catch (error) {
        console.error('Error fetching distinct values:', error);
      }
    };

    fetchDistinctValues();
  }, []);

  const groupByOptions = [
    { value: 'none', label: 'No Grouping' },
    { value: 'lead_vendor', label: 'Lead Vendor' },
    { value: 'buffer_agent', label: 'Buffer Agent' },
    { value: 'agent', label: 'Agent' },
    { value: 'licensed_agent_account', label: 'Licensed Agent' },
    { value: 'status', label: 'Status' },
    { value: 'call_result', label: 'Call Result' },
    { value: 'carrier', label: 'Carrier' },
    { value: 'product_type', label: 'Product Type' },
    { value: 'is_callback', label: 'Callback' },
    { value: 'is_retention_call', label: 'Retention' }
  ];

  const columns = [
    "S.No", "Date", "Lead Vendor", "Insured Name", "Phone Number", "Buffer Agent", "Agent", "Licensed Account", "Status",
    "Call Result", "Notes"
  ];
  
  // Add Actions column only for users with write permissions
  if (hasWritePermissions) {
    columns.push("Actions");
  }

  // Group data based on group by selection
  const groupedData = useMemo(() => {
    if (groupBy === 'none') {
      return { groups: [], ungroupedData: data };
    }

    // Helper function to get group value
    const getGroupValue = (row: DailyDealFlowRow, groupField: string) => {
      if (groupField === 'is_callback') {
        return (row.is_callback || row.from_callback) ? 'Callback' : 'Regular Lead';
      }
      if (groupField === 'is_retention_call') {
        return row.is_retention_call ? 'Retention' : 'Regular';
      }
      return String(row[groupField as keyof DailyDealFlowRow] || 'N/A');
    };

    // Helper function to sort items within groups
    const sortItems = (items: DailyDealFlowRow[]) => {
      if (!sortConfig) {
        // Default sort by date (newest first)
        return items.sort((a, b) => {
          const aDate = new Date(a.date || a.created_at || '1970-01-01');
          const bDate = new Date(b.date || b.created_at || '1970-01-01');
          return bDate.getTime() - aDate.getTime();
        });
      }

      return items.sort((a, b) => {
        let aValue: any = a[sortConfig.key as keyof DailyDealFlowRow];
        let bValue: any = b[sortConfig.key as keyof DailyDealFlowRow];

        // Handle different data types
        if (sortConfig.key === 'date' || sortConfig.key === 'created_at' || sortConfig.key === 'updated_at' || sortConfig.key === 'draft_date') {
          aValue = new Date(aValue || '1970-01-01');
          bValue = new Date(bValue || '1970-01-01');
        } else if (sortConfig.key === 'monthly_premium' || sortConfig.key === 'face_amount') {
          aValue = Number(aValue) || 0;
          bValue = Number(bValue) || 0;
        } else {
          aValue = String(aValue || '').toLowerCase();
          bValue = String(bValue || '').toLowerCase();
        }

        if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    };

    if (groupBySecondary === 'none') {
      // Single level grouping
      const groups: { [key: string]: DailyDealFlowRow[] } = {};

      // Add data to groups (only create groups that have data)
      data.forEach(row => {
        const groupKey = getGroupValue(row, groupBy);
        if (!groups[groupKey]) {
          groups[groupKey] = [];
        }
        groups[groupKey].push(row);
      });

      // Only include groups with entries (count > 0)
      const sortedGroups = Object.keys(groups)
        .filter(groupKey => groups[groupKey].length > 0)
        .sort()
        .map(groupKey => ({
          key: groupKey,
          label: groupKey,
          items: sortItems(groups[groupKey]),
          count: groups[groupKey].length,
          subgroups: []
        }));

      return { groups: sortedGroups, ungroupedData: [] };
    } else {
      // Two level grouping
      const primaryGroups: { [key: string]: { [key: string]: DailyDealFlowRow[] } } = {};

      // Add data to groups (only create groups that have data)
      data.forEach(row => {
        const primaryKey = getGroupValue(row, groupBy);
        const secondaryKey = getGroupValue(row, groupBySecondary);

        if (!primaryGroups[primaryKey]) {
          primaryGroups[primaryKey] = {};
        }
        if (!primaryGroups[primaryKey][secondaryKey]) {
          primaryGroups[primaryKey][secondaryKey] = [];
        }
        primaryGroups[primaryKey][secondaryKey].push(row);
      });

      // Only include primary groups that have data, and only include subgroups with entries > 0
      const sortedGroups = Object.keys(primaryGroups)
        .filter(primaryKey => Object.values(primaryGroups[primaryKey]).flat().length > 0)
        .sort()
        .map(primaryKey => ({
          key: primaryKey,
          label: primaryKey,
          items: [], // Not used in nested structure
          count: Object.values(primaryGroups[primaryKey]).flat().length,
          subgroups: Object.keys(primaryGroups[primaryKey])
            .filter(secondaryKey => primaryGroups[primaryKey][secondaryKey].length > 0)
            .sort()
            .map(secondaryKey => ({
              key: `${primaryKey}::${secondaryKey}`,
              label: secondaryKey,
              items: sortItems(primaryGroups[primaryKey][secondaryKey]),
              count: primaryGroups[primaryKey][secondaryKey].length
            }))
        }))
        .filter(primaryGroup => primaryGroup.subgroups.length > 0); // Only include primary groups that have subgroups with data

      return { groups: sortedGroups, ungroupedData: [] };
    }
  }, [data, groupBy, groupBySecondary, sortConfig, allDistinctValues]);

  // Detect duplicate rows based on insured_name, client_phone_number, and lead_vendor
  const duplicateRows = useMemo(() => {
    const seen = new Map<string, number>();
    const duplicates = new Set<string>();

    data.forEach(row => {
      const key = `${row.insured_name || ''}|${row.client_phone_number || ''}|${row.lead_vendor || ''}`;
      const count = seen.get(key) || 0;
      seen.set(key, count + 1);
      if (count + 1 > 1) {
        duplicates.add(key);
      }
    });

    return duplicates;
  }, [data]);

  // Check if a row is duplicate
  const isRowDuplicate = (row: DailyDealFlowRow) => {
    const key = `${row.insured_name || ''}|${row.client_phone_number || ''}|${row.lead_vendor || ''}`;
    return duplicateRows.has(key);
  };

  // Toggle group expansion
  const toggleGroup = (groupKey: string) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(groupKey)) {
      newExpanded.delete(groupKey);
    } else {
      newExpanded.add(groupKey);
    }
    setExpandedGroups(newExpanded);
  };

  // Expand/collapse all groups
  const toggleAllGroups = (expand: boolean) => {
    const newExpanded = new Set<string>();
    if (expand) {
      if (groupBySecondary === 'none') {
        // Single level - expand all primary groups
        groupedData.groups.forEach(g => newExpanded.add(g.key));
      } else {
        // Two level - expand all primary and secondary groups
        groupedData.groups.forEach(primaryGroup => {
          newExpanded.add(primaryGroup.key);
          primaryGroup.subgroups?.forEach(subgroup => {
            newExpanded.add(subgroup.key);
          });
        });
      }
    }
    setExpandedGroups(newExpanded);
  };

  // Calculate pagination based on server-side data
  const totalPages = Math.ceil(totalRecords / recordsPerPage);
  const startIndex = (currentPage - 1) * recordsPerPage;
  const endIndex = startIndex + data.length;

  // Pagination handlers
  const goToFirstPage = () => onPageChange?.(1);
  const goToLastPage = () => onPageChange?.(totalPages);
  const goToNextPage = () => onPageChange?.(Math.min(currentPage + 1, totalPages));
  const goToPrevPage = () => onPageChange?.(Math.max(currentPage - 1, 1));

  // Row editing and saving handled inside page-level EditableRow

  return (
    <div className="w-full">
      {/* Group By Selector */}
      <div className="flex items-center justify-between mb-4 px-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Group by:</span>
            <Select value={groupBy} onValueChange={(value) => {
              setGroupBy(value);
              setExpandedGroups(new Set()); // Reset expanded groups when changing grouping
              // Reset to first page when grouping changes
              if (onPageChange) {
                onPageChange(1);
              }
            }}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Select primary grouping field" />
              </SelectTrigger>
              <SelectContent>
                {groupByOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {groupBy !== 'none' && (
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Then by:</span>
              <Select value={groupBySecondary} onValueChange={(value) => {
                setGroupBySecondary(value);
                setExpandedGroups(new Set()); // Reset expanded groups when changing grouping
                // Reset to first page when grouping changes
                if (onPageChange) {
                  onPageChange(1);
                }
              }}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Select secondary grouping field" />
                </SelectTrigger>
                <SelectContent>
                  {groupByOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          
          {groupBy !== 'none' && groupedData.groups.length > 0 && (
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => toggleAllGroups(true)}
                className="text-xs"
              >
                Expand All
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => toggleAllGroups(false)}
                className="text-xs"
              >
                Collapse All
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className="overflow-x-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: '#9CA3AF #F3F4F6' }}>
        <Table className="min-w-full">
        <TableHeader className="sticky top-0 z-10 bg-background">
          <TableRow>
            {columns.map((column) => {
              const getSortKey = (col: string) => {
                switch (col) {
                  case 'Date': return 'date';
                  case 'Lead Vendor': return 'lead_vendor';
                  case 'Insured Name': return 'insured_name';
                  case 'Phone Number': return 'client_phone_number';
                  case 'Buffer Agent': return 'buffer_agent';
                  case 'Agent': return 'agent';
                  case 'Licensed Account': return 'licensed_agent_account';
                  case 'Status': return 'status';
                  case 'Call Result': return 'call_result';
                  case 'Carrier': return 'carrier';
                  case 'Product Type': return 'product_type';
                  case 'Draft Date': return 'draft_date';
                  case 'MP': return 'monthly_premium';
                  case 'Face Amount': return 'face_amount';
                  case 'Notes': return 'notes';
                  default: return null;
                }
              };

              const sortKey = getSortKey(column);
              const isSortable = sortKey !== null && groupBy !== 'none';

              return (
                <TableHead key={column} className={
                  column === 'S.No' ? 'w-12' :
                  column === 'Date' ? 'w-20' :
                  column === 'Lead Vendor' ? 'w-20' :
                  column === 'Insured Name' ? 'w-32' :
                  column === 'Phone Number' ? 'w-28' :
                  column === 'Buffer Agent' ? 'w-24' :
                  column === 'Agent' ? 'w-20' :
                  column === 'Licensed Account' ? 'w-24' :
                  column === 'Status' ? 'w-32' :
                  column === 'Call Result' ? 'w-24' :
                  column === 'Carrier' ? 'w-16' :
                  column === 'Product Type' ? 'w-20' :
                  column === 'Draft Date' ? 'w-20' :
                  column === 'MP' ? 'w-16' :
                  column === 'Face Amount' ? 'w-20' :
                  column === 'Notes' ? 'w-32' :
                  column === 'Actions' ? 'w-20' : ''
                }>
                  {isSortable ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-auto p-0 font-medium hover:bg-transparent"
                      onClick={() => {
                        if (sortConfig?.key === sortKey) {
                          setSortConfig({
                            key: sortKey,
                            direction: sortConfig.direction === 'asc' ? 'desc' : 'asc'
                          });
                        } else {
                          setSortConfig({ key: sortKey, direction: 'asc' });
                        }
                      }}
                    >
                      {column}
                      {sortConfig?.key === sortKey && (
                        <span className="ml-1">
                          {sortConfig.direction === 'asc' ? '↑' : '↓'}
                        </span>
                      )}
                    </Button>
                  ) : (
                    column
                  )}
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {groupBy === 'none' ? (
            // Render ungrouped data
            data.map((row, index) => (
              <EditableRow 
                key={row.id} 
                row={row} 
                rowIndex={startIndex + index} 
                serialNumber={startIndex + index + 1}
                onUpdate={onDataUpdate}
                hasWritePermissions={hasWritePermissions}
                isDuplicate={isRowDuplicate(row)}
              />
            ))
          ) : (
            // Render grouped data
            groupedData.groups.map((group) => (
              <React.Fragment key={group.key}>
                {/* Primary Group Header */}
                <TableRow className="bg-muted/50 hover:bg-muted/70">
                  <td colSpan={columns.length} className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleGroup(group.key)}
                        className="h-6 w-6 p-0"
                      >
                        {expandedGroups.has(group.key) ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRightIcon className="h-4 w-4" />
                        )}
                      </Button>
                      <span className="font-semibold text-sm">
                        {group.label} ({group.count} {group.count === 1 ? 'entry' : 'entries'})
                      </span>
                    </div>
                  </td>
                </TableRow>

                {/* Primary Group Items or Subgroups */}
                {expandedGroups.has(group.key) && (
                  groupBySecondary === 'none' ? (
                    // Single level - render items directly
                    group.items.map((row, groupIndex) => {
                      const globalIndex = groupedData.groups
                        .slice(0, groupedData.groups.findIndex(g => g.key === group.key))
                        .reduce((sum, g) => sum + (expandedGroups.has(g.key) ? g.items.length : 0), 0) + groupIndex;

                      return (
                        <EditableRow
                          key={row.id}
                          row={row}
                          rowIndex={startIndex + globalIndex}
                          serialNumber={startIndex + globalIndex + 1}
                          onUpdate={onDataUpdate}
                          hasWritePermissions={hasWritePermissions}
                          isDuplicate={isRowDuplicate(row)}
                        />
                      );
                    })
                  ) : (
                    // Two level - render subgroups
                    group.subgroups?.map((subgroup) => (
                      <React.Fragment key={subgroup.key}>
                        {/* Secondary Group Header */}
                        <TableRow className="bg-muted/30 hover:bg-muted/50">
                          <td colSpan={columns.length} className="px-8 py-2">
                            <div className="flex items-center gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => toggleGroup(subgroup.key)}
                                className="h-5 w-5 p-0 ml-4"
                              >
                                {expandedGroups.has(subgroup.key) ? (
                                  <ChevronDown className="h-3 w-3" />
                                ) : (
                                  <ChevronRightIcon className="h-3 w-3" />
                                )}
                              </Button>
                              <span className="font-medium text-xs text-muted-foreground">
                                {subgroup.label} ({subgroup.count} {subgroup.count === 1 ? 'entry' : 'entries'})
                              </span>
                            </div>
                          </td>
                        </TableRow>

                        {/* Subgroup Items */}
                        {expandedGroups.has(subgroup.key) && subgroup.items.map((row, subgroupIndex) => {
                          const globalIndex = groupedData.groups
                            .slice(0, groupedData.groups.findIndex(g => g.key === group.key))
                            .reduce((sum, g) => {
                              if (expandedGroups.has(g.key) && g.subgroups) {
                                return sum + g.subgroups.reduce((subSum, sg) =>
                                  subSum + (expandedGroups.has(sg.key) ? sg.items.length : 0), 0);
                              }
                              return sum;
                            }, 0) + subgroupIndex;

                          return (
                            <EditableRow
                              key={row.id}
                              row={row}
                              rowIndex={startIndex + globalIndex}
                              serialNumber={startIndex + globalIndex + 1}
                              onUpdate={onDataUpdate}
                              hasWritePermissions={hasWritePermissions}
                              isDuplicate={isRowDuplicate(row)}
                            />
                          );
                        })}
                      </React.Fragment>
                    ))
                  )
                )}
              </React.Fragment>
            ))
          )}
        </TableBody>
      </Table>

      {((groupBy === 'none' && data.length === 0) || (groupBy !== 'none' && groupedData.groups.length === 0)) && (
        <div className="text-center py-8 text-muted-foreground">
          No data available
        </div>
      )}

      {/* Pagination Controls */}
      {totalRecords > 0 && (
        <div className="flex items-center justify-between px-4 py-4 border-t">
          <div className="text-sm text-muted-foreground">
            Showing {startIndex + 1} to {Math.min(endIndex, totalRecords)} of {totalRecords} entries
          </div>
          
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={goToFirstPage}
              disabled={currentPage === 1}
              className="h-8 w-8 p-0"
            >
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            
            <Button
              variant="outline"
              size="sm"
              onClick={goToPrevPage}
              disabled={currentPage === 1}
              className="h-8 w-8 p-0"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            
            <div className="flex items-center space-x-1">
              <span className="text-sm text-muted-foreground">Page</span>
              <span className="text-sm font-medium">{currentPage}</span>
              <span className="text-sm text-muted-foreground">of</span>
              <span className="text-sm font-medium">{totalPages}</span>
            </div>
            
            <Button
              variant="outline"
              size="sm"
              onClick={goToNextPage}
              disabled={currentPage === totalPages}
              className="h-8 w-8 p-0"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            
            <Button
              variant="outline"
              size="sm"
              onClick={goToLastPage}
              disabled={currentPage === totalPages}
              className="h-8 w-8 p-0"
            >
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
      </div>
    </div>
  );
};
