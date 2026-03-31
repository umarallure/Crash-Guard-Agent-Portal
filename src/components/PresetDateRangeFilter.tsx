import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { DateRangePreset } from "@/lib/dateRangeFilter";

type PresetDateRangeFilterProps = {
  preset: DateRangePreset;
  onPresetChange: (value: DateRangePreset) => void;
  customStartDate: string;
  customEndDate: string;
  onCustomStartDateChange: (value: string) => void;
  onCustomEndDateChange: (value: string) => void;
  selectClassName?: string;
  inputClassName?: string;
  containerClassName?: string;
  customFieldsClassName?: string;
};

export const PresetDateRangeFilter = ({
  preset,
  onPresetChange,
  customStartDate,
  customEndDate,
  onCustomStartDateChange,
  onCustomEndDateChange,
  selectClassName,
  inputClassName,
  containerClassName,
  customFieldsClassName,
}: PresetDateRangeFilterProps) => {
  return (
    <div className={containerClassName || "space-y-3"}>
      <Select value={preset} onValueChange={(value) => onPresetChange(value as DateRangePreset)}>
        <SelectTrigger className={selectClassName}>
          <SelectValue placeholder="Date Filter" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value="all">All Time</SelectItem>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="this_week">This Week</SelectItem>
            <SelectItem value="last_week">Last Week</SelectItem>
            <SelectItem value="this_month">This Month</SelectItem>
            <SelectItem value="custom">Custom</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>

      {preset === "custom" && (
        <div className={customFieldsClassName || "grid grid-cols-1 gap-3 md:grid-cols-2"}>
          <Input
            type="date"
            value={customStartDate}
            onChange={(e) => onCustomStartDateChange(e.target.value)}
            className={inputClassName}
          />
          <Input
            type="date"
            value={customEndDate}
            onChange={(e) => onCustomEndDateChange(e.target.value)}
            className={inputClassName}
          />
        </div>
      )}
    </div>
  );
};
