import { Calendar, Phone, RefreshCw, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { ActivityType, DateFilter } from "../utils";

interface FilterBarProps {
  activityType: ActivityType;
  onActivityTypeChange: (value: ActivityType) => void;
  dateFilter: DateFilter;
  onDateFilterChange: (value: DateFilter) => void;
  customStartDate: string;
  customEndDate: string;
  onCustomStartChange: (value: string) => void;
  onCustomEndChange: (value: string) => void;
  onRefresh: () => void;
  refreshing: boolean;
}

const DATE_OPTIONS: Array<{ value: DateFilter; label: string }> = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "7days", label: "Last 7 Days" },
  { value: "30days", label: "Last 30 Days" },
  { value: "alltime", label: "All Time" },
  { value: "custom", label: "Custom Range" },
];

export function FilterBar({
  activityType,
  onActivityTypeChange,
  dateFilter,
  onDateFilterChange,
  customStartDate,
  customEndDate,
  onCustomStartChange,
  onCustomEndChange,
  onRefresh,
  refreshing,
}: FilterBarProps) {
  return (
    <div className="rounded-2xl border border-primary/20 bg-zinc-900/60 backdrop-blur-xl p-3 sm:p-4 shadow-xl shadow-black/30 transition-colors hover:border-primary/40">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-4">
        {/* Activity segmented toggle */}
        <div
          role="tablist"
          aria-label="Activity type"
          className="relative inline-flex items-center rounded-full bg-white/[0.04] border border-white/10 p-1 self-start"
        >
          <span
            aria-hidden
            className={cn(
              "absolute top-1 bottom-1 w-1/2 rounded-full bg-primary shadow-[0_0_18px_hsl(var(--primary)/0.45)] transition-all duration-300 ease-out",
              activityType === "inbound" ? "left-1" : "left-[calc(50%-0.25rem)]",
            )}
          />
          <button
            role="tab"
            aria-selected={activityType === "inbound"}
            onClick={() => onActivityTypeChange("inbound")}
            className={cn(
              "relative z-10 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
              activityType === "inbound" ? "text-primary-foreground" : "text-white/60 hover:text-white",
            )}
          >
            <Phone className="h-3.5 w-3.5" />
            Publisher
          </button>
          <button
            role="tab"
            aria-selected={activityType === "followup"}
            onClick={() => onActivityTypeChange("followup")}
            className={cn(
              "relative z-10 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
              activityType === "followup" ? "text-primary-foreground" : "text-white/60 hover:text-white",
            )}
          >
            <Users className="h-3.5 w-3.5" />
            Internal
          </button>
        </div>

        <div className="hidden lg:block h-6 w-px bg-white/10" />

        {/* Date range */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 flex-1 min-w-0">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-white/50">
            <Calendar className="h-3.5 w-3.5" />
            <span>Range</span>
          </div>
          <Select
            value={dateFilter}
            onValueChange={(v) => onDateFilterChange(v as DateFilter)}
          >
            <SelectTrigger className="h-9 rounded-full border-white/10 bg-white/[0.04] px-4 text-sm font-medium text-white/90 hover:bg-white/[0.07] focus:ring-primary/40 w-full sm:w-[170px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="border-white/10 bg-zinc-950 text-white [--accent:240_3.7%_15.9%] [--accent-foreground:0_0%_98%] [--popover:240_10%_3.9%] [--popover-foreground:0_0%_98%]">
              {DATE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {dateFilter === "custom" && (
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <Input
                type="date"
                value={customStartDate}
                onChange={(e) => onCustomStartChange(e.target.value)}
                className="h-9 rounded-full border-white/10 bg-white/[0.04] px-4 text-sm text-white/90 w-full sm:w-[150px] [color-scheme:dark]"
              />
              <span className="text-white/40 text-xs hidden sm:inline">to</span>
              <Input
                type="date"
                value={customEndDate}
                onChange={(e) => onCustomEndChange(e.target.value)}
                className="h-9 rounded-full border-white/10 bg-white/[0.04] px-4 text-sm text-white/90 w-full sm:w-[150px] [color-scheme:dark]"
              />
            </div>
          )}
        </div>

        <Button
          variant="ghost"
          onClick={onRefresh}
          disabled={refreshing}
          className="h-9 rounded-full px-4 text-sm font-medium border border-white/10 bg-white/[0.04] text-white/85 hover:bg-primary/15 hover:text-white hover:border-primary/40 self-start sm:self-auto"
        >
          <RefreshCw className={cn("h-3.5 w-3.5 mr-2", refreshing && "animate-spin")} />
          Refresh
        </Button>
      </div>
    </div>
  );
}
