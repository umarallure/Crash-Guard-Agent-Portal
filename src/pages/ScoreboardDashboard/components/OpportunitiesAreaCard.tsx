import { useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import {
  LONG_DAY_LABELS,
  percentChange,
  sumField,
  type DailyBucket,
} from "../utils";

interface OpportunitiesAreaCardProps {
  weekly: DailyBucket[];
  prevWeekly: DailyBucket[];
  loading: boolean;
}

const VIEWBOX_W = 560;
const VIEWBOX_H = 160;
const PAD_X = 24;
const PAD_TOP = 24;
const PAD_BOTTOM = 36;

export function OpportunitiesAreaCard({
  weekly,
  prevWeekly,
  loading,
}: OpportunitiesAreaCardProps) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const total = useMemo(() => sumField(weekly, "opportunities"), [weekly]);
  const prevTotal = useMemo(() => sumField(prevWeekly, "opportunities"), [prevWeekly]);
  const change = percentChange(total, prevTotal);

  const maxValue = useMemo(
    () => Math.max(1, ...weekly.map((d) => d.opportunities)),
    [weekly],
  );

  const points = useMemo(() => {
    if (weekly.length === 0)
      return [] as Array<{ x: number; y: number; v: number; key: string; weekday: number }>;
    const innerW = VIEWBOX_W - PAD_X * 2;
    const innerH = VIEWBOX_H - PAD_TOP - PAD_BOTTOM;
    const stepX = weekly.length > 1 ? innerW / (weekly.length - 1) : 0;
    return weekly.map((b, i) => {
      const x = PAD_X + stepX * i;
      const ratio = b.opportunities / maxValue;
      const y = PAD_TOP + innerH - ratio * innerH;
      return { x, y, v: b.opportunities, key: b.dateKey, weekday: b.weekday };
    });
  }, [weekly, maxValue]);

  const linePath = useMemo(() => {
    if (points.length === 0) return "";
    if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

    const path: string[] = [`M ${points[0].x} ${points[0].y}`];
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i - 1] || points[i];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[i + 2] || p2;
      const tension = 0.18;
      const c1x = p1.x + (p2.x - p0.x) * tension;
      const c1y = p1.y + (p2.y - p0.y) * tension;
      const c2x = p2.x - (p3.x - p1.x) * tension;
      const c2y = p2.y - (p3.y - p1.y) * tension;
      path.push(`C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`);
    }
    return path.join(" ");
  }, [points]);

  const areaPath = useMemo(() => {
    if (!linePath || points.length === 0) return "";
    const last = points[points.length - 1];
    const first = points[0];
    const baseY = VIEWBOX_H - PAD_BOTTOM;
    return `${linePath} L ${last.x} ${baseY} L ${first.x} ${baseY} Z`;
  }, [linePath, points]);

  // Indicator (dot + crosshair + tooltip) only appears while hovering — keeps
  // the chart calm at rest and avoids a "stuck open" look on first paint.
  const activeIndex = hoverIndex;
  const activePoint = activeIndex !== null ? points[activeIndex] : null;
  const activeBucket = activeIndex !== null ? weekly[activeIndex] : null;

  return (
    <div className="group relative h-full overflow-hidden rounded-2xl border border-primary/20 bg-zinc-900/60 backdrop-blur-xl p-5 shadow-xl shadow-black/30 transition-colors hover:border-primary/50">
      <div className="pointer-events-none absolute -top-12 -right-12 h-40 w-40 rounded-full bg-primary/15 blur-3xl opacity-60" />

      <div className="relative flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-white">Opportunities</h3>
          <p className="text-xs text-white/50 mt-0.5">
            Open stages trending toward a closed deal
          </p>
        </div>
        <span className="text-[10px] uppercase tracking-wider text-white/50">
          Weekly Report
        </span>
      </div>

      <div className="relative mt-4 grid grid-cols-[auto_1fr] gap-4 items-end">
        <div className="min-w-0">
          <div className="text-3xl sm:text-4xl font-semibold tracking-tight tabular-nums text-white">
            {loading ? "—" : total.toLocaleString()}
          </div>
          <div className="mt-1 flex items-center gap-1">
            {change >= 0 ? (
              <ArrowUpRight className="h-3.5 w-3.5 text-primary" />
            ) : (
              <ArrowDownRight className="h-3.5 w-3.5 text-rose-400" />
            )}
            <span
              className={cn(
                "text-xs font-medium tabular-nums",
                change >= 0 ? "text-primary" : "text-rose-400",
              )}
            >
              {change >= 0 ? "+" : ""}
              {change.toFixed(1)}%
            </span>
          </div>
        </div>

        <div
          className="relative w-full animate-blur-in motion-reduce:animate-none"
          style={{ animationDelay: "500ms" }}
        >
          <svg
            viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`}
            preserveAspectRatio="none"
            className="w-full h-28"
            onMouseLeave={() => setHoverIndex(null)}
          >
            <defs>
              <linearGradient id="opportunities-area" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.45" />
                <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
              </linearGradient>
            </defs>

            {areaPath && <path d={areaPath} fill="url(#opportunities-area)" />}
            {linePath && (
              <path
                d={linePath}
                fill="none"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {points.map((p, i) => {
              const stepX =
                points.length > 1 ? (VIEWBOX_W - PAD_X * 2) / (points.length - 1) : VIEWBOX_W;
              return (
                <rect
                  key={`hit-${p.key}`}
                  x={p.x - stepX / 2}
                  y={0}
                  width={stepX}
                  height={VIEWBOX_H - PAD_BOTTOM}
                  fill="transparent"
                  onMouseEnter={() => setHoverIndex(i)}
                  style={{ cursor: "pointer" }}
                />
              );
            })}

            {activePoint && (
              <g>
                <line
                  x1={activePoint.x}
                  x2={activePoint.x}
                  y1={PAD_TOP}
                  y2={VIEWBOX_H - PAD_BOTTOM}
                  strokeDasharray="3 3"
                  strokeWidth={1}
                  className="stroke-white/30"
                />
                <circle
                  cx={activePoint.x}
                  cy={activePoint.y}
                  r={4.5}
                  fill="hsl(var(--primary))"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  style={{ filter: "drop-shadow(0 0 6px hsl(var(--primary)))" }}
                />
              </g>
            )}

            {points.map((p) => (
              <text
                key={`label-${p.key}`}
                x={p.x}
                y={VIEWBOX_H - 12}
                textAnchor="middle"
                fontSize="11"
                className="fill-white/40"
              >
                {LONG_DAY_LABELS[p.weekday].slice(0, 2)}
              </text>
            ))}
          </svg>

          {activePoint && activeBucket && (
            <div
              className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-md bg-primary text-primary-foreground text-[11px] font-medium px-2 py-1 shadow-md whitespace-nowrap"
              style={{
                left: `${(activePoint.x / VIEWBOX_W) * 100}%`,
                top: `${(activePoint.y / VIEWBOX_H) * 100}%`,
              }}
            >
              <div className="tabular-nums font-semibold">
                {activeBucket.opportunities.toLocaleString()}
              </div>
              <div className="text-[10px] opacity-90">
                {format(parseISO(activeBucket.dateKey), "MMM d")}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
