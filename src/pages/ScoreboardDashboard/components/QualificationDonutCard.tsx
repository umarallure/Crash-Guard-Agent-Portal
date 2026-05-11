import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";

interface QualificationDonutCardProps {
  qualified: number;
  notQualified: number;
  noCoverage: number;
  selectedFilter: string;
  onSegmentClick: (filter: string) => void;
  loading: boolean;
}

const SEGMENTS: Array<{
  key: "qualified" | "not_qualified" | "no_coverage";
  label: string;
  /** Tailwind class for the legend swatch + donut arc stroke. */
  swatch: string;
  arc: string;
}> = [
  {
    key: "qualified",
    label: "Qualified",
    swatch: "bg-primary",
    arc: "stroke-[hsl(var(--primary))]",
  },
  {
    key: "not_qualified",
    label: "Not Qualified",
    swatch: "bg-primary/40",
    arc: "stroke-[hsl(var(--primary)/0.45)]",
  },
  {
    key: "no_coverage",
    label: "No Coverage",
    swatch: "bg-white/25",
    arc: "stroke-white/30",
  },
];

const RADIUS = 56;
const STROKE = 14;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const GAP = 4;

export function QualificationDonutCard({
  qualified,
  notQualified,
  noCoverage,
  selectedFilter,
  onSegmentClick,
  loading,
}: QualificationDonutCardProps) {
  const [hovered, setHovered] = useState<string | null>(null);

  const values = useMemo(
    () => ({ qualified, not_qualified: notQualified, no_coverage: noCoverage }),
    [qualified, notQualified, noCoverage],
  );
  const total = qualified + notQualified + noCoverage;

  const arcs = useMemo(() => {
    if (total === 0) {
      return SEGMENTS.map((seg) => ({
        ...seg,
        offset: 0,
        length: 0,
        rotation: -90,
      }));
    }

    let cursor = -90;
    return SEGMENTS.map((seg) => {
      const value = values[seg.key];
      const fraction = value / total;
      const arcLengthDeg = fraction * 360;
      const length = (CIRCUMFERENCE * arcLengthDeg) / 360 - GAP;
      const offset = 0;
      const rotation = cursor;
      cursor += arcLengthDeg;
      return {
        ...seg,
        length: Math.max(0, length),
        offset,
        rotation,
      };
    });
  }, [total, values]);

  const focusedKey = hovered ?? null;
  const focusedValue = focusedKey ? values[focusedKey as keyof typeof values] : total;
  const focusedLabel =
    focusedKey
      ? SEGMENTS.find((s) => s.key === focusedKey)?.label || "Total"
      : "Generated leads";

  return (
    <div className="group relative h-full overflow-hidden rounded-2xl border border-primary/20 bg-zinc-900/60 backdrop-blur-xl p-5 shadow-xl shadow-black/30 transition-colors hover:border-primary/50">
      <div className="pointer-events-none absolute -bottom-12 -left-12 h-40 w-40 rounded-full bg-primary/10 blur-3xl opacity-60" />

      <div className="relative flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-white">Generated Leads</h3>
          <p className="text-xs text-white/50 mt-0.5">Qualification mix</p>
        </div>
      </div>

      <div className="relative mt-5 flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div>
            <div className="text-3xl sm:text-4xl font-semibold tracking-tight tabular-nums text-white">
              {loading ? "—" : total.toLocaleString()}
            </div>
            <div className="mt-1 text-[11px] text-white/50">{focusedLabel}</div>
          </div>

          <div className="mt-4 space-y-1">
            {SEGMENTS.map((seg) => {
              const value = values[seg.key];
              const pct = total > 0 ? (value / total) * 100 : 0;
              const isSelected = selectedFilter === seg.key;
              const isHovered = hovered === seg.key;
              return (
                <button
                  type="button"
                  key={seg.key}
                  onMouseEnter={() => setHovered(seg.key)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={() => onSegmentClick(seg.key)}
                  className={cn(
                    "w-full flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left transition-colors",
                    isSelected
                      ? "bg-primary/15 ring-1 ring-primary/40"
                      : isHovered
                        ? "bg-white/[0.06]"
                        : "hover:bg-white/[0.04]",
                  )}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <span className={cn("h-2.5 w-2.5 rounded-full flex-shrink-0", seg.swatch)} />
                    <span className="text-xs font-medium text-white/85 truncate">
                      {seg.label}
                    </span>
                  </span>
                  <span className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs tabular-nums text-white/45">
                      {pct.toFixed(1)}%
                    </span>
                    <span className="text-xs font-semibold tabular-nums text-white">
                      {value.toLocaleString()}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div
          className="relative h-36 w-36 flex-shrink-0 animate-blur-in motion-reduce:animate-none"
          style={{ animationDelay: "500ms" }}
        >
          <svg viewBox="0 0 140 140" className="h-full w-full">
            <circle
              cx="70"
              cy="70"
              r={RADIUS}
              fill="none"
              strokeWidth={STROKE}
              className="stroke-white/[0.06]"
            />
            {arcs.map((arc) => (
              <circle
                key={arc.key}
                cx="70"
                cy="70"
                r={RADIUS}
                fill="none"
                strokeWidth={STROKE}
                strokeLinecap="butt"
                className={cn(
                  arc.arc,
                  "transition-[stroke-dasharray,opacity] duration-300",
                  hovered && hovered !== arc.key ? "opacity-30" : "opacity-100",
                )}
                strokeDasharray={`${arc.length} ${CIRCUMFERENCE}`}
                strokeDashoffset={0}
                transform={`rotate(${arc.rotation} 70 70)`}
                onMouseEnter={() => setHovered(arc.key)}
                onMouseLeave={() => setHovered(null)}
                style={{ cursor: "pointer" }}
              />
            ))}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-lg font-semibold tabular-nums text-white">
              {loading ? "—" : focusedValue.toLocaleString()}
            </span>
            <span className="text-[10px] uppercase tracking-wider text-white/45">
              {hovered ? "Filter" : "Total"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
