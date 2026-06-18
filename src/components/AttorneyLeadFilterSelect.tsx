import { useMemo, useState } from "react";
import { BriefcaseBusiness, Check, ChevronsUpDown, Scale, X } from "lucide-react";

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
import { cn } from "@/lib/utils";
import type { AttorneyLeadFilterOption, AttorneyLeadFilterType } from "@/lib/attorneyLeadFilter";

type AttorneyLeadFilterSelectProps = {
  options: AttorneyLeadFilterOption[];
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  loading?: boolean;
  placeholder?: string;
  className?: string;
};

const ATTORNEY_TYPE_META: Record<
  AttorneyLeadFilterType,
  {
    heading: string;
    badge: string;
    icon: typeof Scale;
  }
> = {
  internal_lawyer: {
    heading: "Internal Attorneys",
    badge: "Internal",
    icon: Scale,
  },
  broker_lawyer: {
    heading: "Broker Attorneys",
    badge: "Broker",
    icon: BriefcaseBusiness,
  },
};

const getOptionSearchValue = (option: AttorneyLeadFilterOption) =>
  [
    option.id,
    option.label,
    option.type,
    option.searchText,
    option.coverageStates.join(" "),
    option.sol,
  ]
    .filter(Boolean)
    .join(" ");

function AttorneyOptionRow({
  option,
  selected,
  onSelect,
}: {
  option: AttorneyLeadFilterOption;
  selected: boolean;
  onSelect: () => void;
}) {
  const meta = ATTORNEY_TYPE_META[option.type];
  const Icon = meta.icon;
  const stateSummary = option.coverageStates.length > 0
    ? option.coverageStates.slice(0, 5).join(", ")
    : "No states";
  const extraCount = Math.max(0, option.coverageStates.length - 5);

  return (
    <CommandItem value={getOptionSearchValue(option)} onSelect={onSelect}>
      <Check className={cn("mr-2 h-4 w-4", selected ? "opacity-100" : "opacity-0")} />
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{option.label}</div>
          <div className="truncate text-xs text-muted-foreground">
            {stateSummary}
            {extraCount > 0 ? ` +${extraCount}` : ""}
            {option.type === "broker_lawyer" && option.sol ? ` | SOL ${option.sol}` : ""}
          </div>
        </div>
        <Badge variant="secondary" className="shrink-0 text-[10px]">
          {meta.badge}
        </Badge>
      </div>
    </CommandItem>
  );
}

export function AttorneyLeadFilterSelect({
  options,
  value,
  onValueChange,
  disabled = false,
  loading = false,
  placeholder = "All Attorneys",
  className,
}: AttorneyLeadFilterSelectProps) {
  const [open, setOpen] = useState(false);
  const selectedOption = useMemo(
    () => options.find((option) => option.id === value) ?? null,
    [options, value],
  );
  const groupedOptions = useMemo(
    () => ({
      internal_lawyer: options.filter((option) => option.type === "internal_lawyer"),
      broker_lawyer: options.filter((option) => option.type === "broker_lawyer"),
    }),
    [options],
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
            {selectedOption?.label ?? (loading ? "Loading attorneys..." : placeholder)}
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
      <PopoverContent className="w-[320px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search attorneys..." />
          <CommandList>
            <CommandEmpty>{loading ? "Loading attorneys..." : "No attorneys found."}</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="all attorneys clear no attorney"
                onSelect={() => {
                  onValueChange("");
                  setOpen(false);
                }}
              >
                <Check className={cn("mr-2 h-4 w-4", !value ? "opacity-100" : "opacity-0")} />
                All Attorneys
              </CommandItem>
            </CommandGroup>
            {(["internal_lawyer", "broker_lawyer"] as AttorneyLeadFilterType[]).map((type) => {
              const typeOptions = groupedOptions[type];
              if (typeOptions.length === 0) return null;

              return (
                <CommandGroup key={type} heading={ATTORNEY_TYPE_META[type].heading}>
                  {typeOptions.map((option) => (
                    <AttorneyOptionRow
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
              );
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
