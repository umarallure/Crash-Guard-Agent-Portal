import { cn } from "@/lib/utils";

interface AttorneyZonesCardProps {
  submitted: number;
  approved: number;
  denied: number;
  qualifiedPayable: number;
  selectedFilter: string;
  onZoneClick: (filter: string) => void;
  loading: boolean;
}

interface ZoneRow {
  key: "approved_attorney" | "denied_attorney" | "qualified_payable";
  label: string;
  range: string;
  bar: string;
}

const ZONES: ZoneRow[] = [
  {
    key: "approved_attorney",
    label: "Approved",
    range: "Greenlit by attorney",
    bar: "bg-primary",
  },
  {
    key: "denied_attorney",
    label: "Denied",
    range: "Returned by attorney",
    bar: "bg-primary/55",
  },
  {
    key: "qualified_payable",
    label: "Qualified Payable",
    range: "Billable",
    bar: "bg-white/30",
  },
];

export function AttorneyZonesCard({
  submitted,
  approved,
  denied,
  qualifiedPayable,
  selectedFilter,
  onZoneClick,
  loading,
}: AttorneyZonesCardProps) {
  const counts: Record<ZoneRow["key"], number> = {
    approved_attorney: approved,
    denied_attorney: denied,
    qualified_payable: qualifiedPayable,
  };

  // Share is computed against the submitted population so the rows describe
  // "of everything submitted, what fraction landed in this outcome."
  const shareDenominator = submitted > 0 ? submitted : 0;
  const isHeaderSelected = selectedFilter === "submitted_to_attorney";

  return (
    <div className="group relative h-full overflow-hidden rounded-2xl border border-primary/20 bg-zinc-900/60 backdrop-blur-xl p-5 shadow-xl shadow-black/30 transition-colors hover:border-primary/50">
      <div className="pointer-events-none absolute -top-12 -left-12 h-40 w-40 rounded-full bg-primary/10 blur-3xl opacity-60" />

      <button
        type="button"
        onClick={() => onZoneClick("submitted_to_attorney")}
        className={cn(
          "relative w-full flex items-start justify-between gap-4 text-left rounded-lg -m-1 p-1 transition-colors",
          isHeaderSelected ? "bg-primary/10" : "hover:bg-white/[0.03]",
        )}
      >
        <div>
          <h3 className="text-sm font-semibold text-white">
            Submitted to Attorney
          </h3>
          <p className="text-xs text-white/50 mt-0.5">
            Attorney review pipeline outcomes
          </p>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-3xl sm:text-4xl font-semibold tracking-tight tabular-nums text-white">
              {loading ? "—" : submitted.toLocaleString()}
            </span>
            <span className="text-xs text-white/50">records</span>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-wider text-white/50">
            Approval
          </p>
          <p className="text-base font-semibold tabular-nums text-white">
            {loading
              ? "—"
              : `${
                  submitted + approved + denied > 0
                    ? ((approved / (submitted + approved + denied)) * 100).toFixed(1)
                    : "0.0"
                }%`}
          </p>
        </div>
      </button>

      <div className="relative mt-4 pt-3 border-t border-white/[0.06]">
        <div className="grid grid-cols-[auto_1fr_auto_auto] gap-x-3 text-[10px] uppercase tracking-wider text-white/40 pb-2">
          <span>Outcome</span>
          <span />
          <span className="text-right">Count</span>
          <span className="text-right">Share</span>
        </div>
        <div className="space-y-1.5">
          {ZONES.map((zone) => {
            const value = counts[zone.key];
            const share =
              shareDenominator > 0 ? (value / shareDenominator) * 100 : 0;
            const isSelected = selectedFilter === zone.key;
            return (
              <button
                type="button"
                key={zone.key}
                onClick={() => onZoneClick(zone.key)}
                className={cn(
                  "w-full grid grid-cols-[auto_1fr_auto_auto] gap-x-3 items-center rounded-md px-2 py-1.5 transition-colors text-left",
                  isSelected
                    ? "bg-primary/15 ring-1 ring-primary/40"
                    : "hover:bg-white/[0.04]",
                )}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <span className={cn("h-4 w-1 rounded-full", zone.bar)} />
                  <span className="text-sm font-medium text-white/90 truncate">
                    {zone.label}
                  </span>
                </span>
                <span className="text-[11px] text-white/45 truncate">
                  {zone.range}
                </span>
                <span className="text-sm font-semibold tabular-nums text-white text-right">
                  {value.toLocaleString()}
                </span>
                <span className="text-xs tabular-nums text-white/45 text-right w-12">
                  {share.toFixed(1)}%
                </span>
              </button>
            );
          })}
        </div>

      </div>
    </div>
  );
}
