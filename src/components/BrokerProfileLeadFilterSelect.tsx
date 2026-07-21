import { useMemo, useState } from "react";
import { BriefcaseBusiness, Check, ChevronsUpDown, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  getBrokerRequirementSolLabel,
  type BrokerProfileLeadFilterOption,
} from "@/lib/brokerProfileLeadFilter";
import { cn } from "@/lib/utils";

type BrokerProfileLeadFilterSelectProps = {
  options: BrokerProfileLeadFilterOption[];
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  loading?: boolean;
  placeholder?: string;
  className?: string;
};

const getOptionSearchValue = (option: BrokerProfileLeadFilterOption) =>
  [
    option.id,
    option.label,
    option.companyName,
    option.fullName,
    option.primaryEmail,
    option.searchText,
    option.coverageStates.join(" "),
    option.solCriteria.map(getBrokerRequirementSolLabel).join(" "),
  ]
    .filter(Boolean)
    .join(" ");

function BrokerProfileOptionRow({
  option,
  selected,
  onSelect,
}: {
  option: BrokerProfileLeadFilterOption;
  selected: boolean;
  onSelect: () => void;
}) {
  const stateSummary = option.coverageStates.length > 0
    ? option.coverageStates.slice(0, 5).join(", ")
    : "No states";
  const extraCount = Math.max(0, option.coverageStates.length - 5);
  const solSummary = option.solCriteria.length > 0
    ? option.solCriteria.map(getBrokerRequirementSolLabel).join(", ")
    : "No SOL";

  return (
    <CommandItem value={getOptionSearchValue(option)} onSelect={onSelect}>
      <Check className={cn("mr-2 h-4 w-4", selected ? "opacity-100" : "opacity-0")} />
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <BriefcaseBusiness className="h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{option.label}</div>
          <div className="truncate text-xs text-muted-foreground">
            {option.attorneyCount} attorney{option.attorneyCount === 1 ? "" : "s"}
            {" | "}
            {stateSummary}
            {extraCount > 0 ? ` +${extraCount}` : ""}
            {" | "}
            {solSummary}
          </div>
        </div>
        <Badge variant="secondary" className="shrink-0 text-[10px]">
          Broker
        </Badge>
      </div>
    </CommandItem>
  );
}

export function BrokerProfileLeadFilterSelect({
  options,
  value,
  onValueChange,
  disabled = false,
  loading = false,
  placeholder = "All Brokers",
  className,
}: BrokerProfileLeadFilterSelectProps) {
  const [open, setOpen] = useState(false);
  const selectedOption = useMemo(
    () => options.find((option) => option.id === value) ?? null,
    [options, value],
  );

  const handleOpenChange = (nextOpen: boolean) => {
    if (!disabled) setOpen(nextOpen);
  };

  return (
    <Popover open={disabled ? false : open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn("h-10 w-full justify-between", className)}
        >
          <span className={cn("min-w-0 flex-1 truncate text-left", !selectedOption && "text-muted-foreground")}>
            {selectedOption?.label ?? (loading ? "Loading brokers..." : placeholder)}
          </span>
          <span className="ml-2 flex shrink-0 items-center gap-1">
            {selectedOption ? (
              <span
                role="button"
                tabIndex={0}
                className="rounded-sm p-0.5 text-muted-foreground hover:text-foreground"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onValueChange("");
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    event.stopPropagation();
                    onValueChange("");
                  }
                }}
              >
                <X className="h-4 w-4" />
              </span>
            ) : null}
            <ChevronsUpDown className="h-4 w-4 opacity-50" />
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[360px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search brokers..." />
          <CommandList>
            <CommandEmpty>{loading ? "Loading brokers..." : "No brokers found."}</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="all brokers clear no broker"
                onSelect={() => {
                  onValueChange("");
                  setOpen(false);
                }}
              >
                <Check className={cn("mr-2 h-4 w-4", !value ? "opacity-100" : "opacity-0")} />
                All Brokers
              </CommandItem>
            </CommandGroup>
            <CommandGroup heading="Broker Profiles">
              {options.map((option) => (
                <BrokerProfileOptionRow
                  key={option.id}
                  option={option}
                  selected={option.id === value}
                  onSelect={() => {
                    onValueChange(option.id);
                    setOpen(false);
                  }}
                />
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
