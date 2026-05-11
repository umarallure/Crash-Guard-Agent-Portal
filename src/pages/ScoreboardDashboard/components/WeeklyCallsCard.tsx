import { useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { SHORT_DAY_LABELS, percentChange, type ActivityType, type DailyBucket } from "../utils";

interface WeeklyCallsCardProps {
  activityType: ActivityType;
  weekly: DailyBucket[];
  /** Headline total reflects the selected date filter, not the 7-day candles. */
  rangeTotal: number;
  prevRangeTotal: number;
  rangeLabel: string;
  loading: boolean;
}

export function WeeklyCallsCard({
  activityType,
  weekly,
  rangeTotal,
  prevRangeTotal,
  rangeLabel,
  loading,
}: WeeklyCallsCardProps) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const rangeChange = percentChange(rangeTotal, prevRangeTotal);

  const maxValue = useMemo(
    () => Math.max(1, ...weekly.map((d) => d.total)),
    [weekly],
  );

  const defaultActiveIndex = useMemo(() => {
    for (let i = weekly.length - 1; i >= 0; i--) {
      if (weekly[i].total > 0) return i;
    }
    return weekly.length - 1;
  }, [weekly]);
  const activeIndex = hoverIndex ?? defaultActiveIndex;
  const activeBucket = weekly[activeIndex];

  const dayOverDay = useMemo(() => {
    if (activeIndex <= 0) return null;
    const today = weekly[activeIndex]?.total ?? 0;
    const yesterday = weekly[activeIndex - 1]?.total ?? 0;
    return percentChange(today, yesterday);
  }, [activeIndex, weekly]);

  const title =
    activityType === "inbound" ? "Total Inbound BPO Calls" : "Total Followup Calls";

  return (
    <div className="group relative h-full overflow-hidden rounded-2xl border border-primary/20 bg-zinc-900/60 backdrop-blur-xl p-5 shadow-xl shadow-black/30 transition-colors hover:border-primary/50">
      <div className="pointer-events-none absolute -top-12 -right-12 h-40 w-40 rounded-full bg-primary/15 blur-3xl opacity-60" />

      <div className="relative flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-white">{title}</h3>
          <p className="text-xs text-white/50 mt-0.5">{rangeLabel}</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.04] border border-white/10 px-2.5 py-1">
          <span className="inline-flex h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_8px_hsl(var(--primary))]" />
          <span className="text-[10px] uppercase tracking-wider text-white/60 font-medium">
            {activityType === "inbound" ? "Publisher" : "Internal"}
          </span>
        </span>
      </div>

      <div className="relative mt-5 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="text-3xl sm:text-4xl font-semibold tracking-tight tabular-nums text-white">
            {loading ? "—" : rangeTotal.toLocaleString()}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
                rangeChange >= 0
                  ? "bg-primary/15 text-primary border border-primary/30"
                  : "bg-rose-500/10 text-rose-400 border border-rose-500/30",
              )}
            >
              {rangeChange >= 0 ? (
                <ArrowUpRight className="h-3 w-3" />
              ) : (
                <ArrowDownRight className="h-3 w-3" />
              )}
              {rangeChange >= 0 ? "+" : ""}
              {rangeChange.toFixed(1)}%
            </span>
            <span className="text-[11px] text-white/40">vs prev. period</span>
          </div>
        </div>

        <div
          className="flex-1 max-w-[280px] animate-blur-in motion-reduce:animate-none"
          style={{ animationDelay: "500ms" }}
        >
          <div className="relative h-24 flex items-end justify-between gap-1.5">
            {weekly.map((bucket, idx) => {
              const heightPct = Math.max(12, (bucket.total / maxValue) * 100);
              const isActive = idx === activeIndex;
              return (
                <button
                  type="button"
                  key={bucket.dateKey}
                  onMouseEnter={() => setHoverIndex(idx)}
                  onMouseLeave={() => setHoverIndex(null)}
                  onFocus={() => setHoverIndex(idx)}
                  onBlur={() => setHoverIndex(null)}
                  className="group/bar relative flex-1 h-full flex flex-col justify-end items-center focus:outline-none"
                  aria-label={`${format(parseISO(bucket.dateKey), "EEE MMM d")} — ${bucket.total} calls`}
                >
                  <span
                    className={cn(
                      "w-full rounded-md transition-all duration-300 ease-out",
                      isActive
                        ? "bg-primary shadow-[0_0_12px_hsl(var(--primary)/0.45)]"
                        : "bg-white/10 group-hover/bar:bg-white/20",
                    )}
                    style={{ height: `${heightPct}%` }}
                  />
                  {isActive && (
                    <span className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 rounded-md bg-primary text-primary-foreground text-[10px] font-medium px-2 py-0.5 whitespace-nowrap shadow-md">
                      {bucket.total.toLocaleString()}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex justify-between">
            {weekly.map((bucket, idx) => {
              const isActive = idx === activeIndex;
              return (
                <span
                  key={bucket.dateKey}
                  className={cn(
                    "flex-1 text-center text-[10px] font-medium transition-colors",
                    isActive ? "text-primary" : "text-white/40",
                  )}
                >
                  {SHORT_DAY_LABELS[bucket.weekday]}
                </span>
              );
            })}
          </div>
        </div>
      </div>

      <div className="relative mt-4 pt-3 border-t border-white/[0.06] flex items-center justify-between text-xs">
        <span className="text-white/50">
          7-day trend · {activeBucket ? format(parseISO(activeBucket.dateKey), "EEE, MMM d") : "—"}
        </span>
        {dayOverDay !== null && (
          <span
            className={cn(
              "font-medium tabular-nums",
              dayOverDay >= 0 ? "text-primary" : "text-rose-400",
            )}
          >
            {dayOverDay >= 0 ? "+" : ""}
            {dayOverDay.toFixed(1)}% day-over-day
          </span>
        )}
      </div>
    </div>
  );
}
