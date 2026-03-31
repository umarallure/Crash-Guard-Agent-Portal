import { useRef, useState } from "react";
import { Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface ColumnInfoDetail {
  label: string;
  value: string;
}

export interface ColumnInfo {
  description: string;
  details?: ColumnInfoDetail[];
}

interface ColumnInfoPopoverProps {
  info: ColumnInfo;
}

export const ColumnInfoPopover = ({ info }: ColumnInfoPopoverProps) => {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  };

  const scheduleClose = () => {
    closeTimer.current = setTimeout(() => setOpen(false), 120);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="rounded p-0.5 text-muted-foreground/50 transition-colors hover:text-muted-foreground focus:outline-none"
          onMouseEnter={() => { cancelClose(); setOpen(true); }}
          onMouseLeave={scheduleClose}
          onClick={(e) => { e.stopPropagation(); setOpen((prev) => !prev); }}
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="start"
        className="w-64 p-0"
        onMouseEnter={cancelClose}
        onMouseLeave={scheduleClose}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="space-y-2 p-3">
          <p className="text-xs leading-relaxed text-popover-foreground">{info.description}</p>
          {info.details && (
            <div className="space-y-1 border-t pt-2">
              {info.details.map((d) => (
                <div key={d.label} className="flex items-center justify-between gap-3">
                  <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    {d.label}
                  </span>
                  <span className="text-[11px] font-semibold text-popover-foreground">
                    {d.value}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};
