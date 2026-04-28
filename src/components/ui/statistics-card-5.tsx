import { cn } from "@/lib/utils";

import { Card, CardContent } from "./card";

export interface StatisticsCardSegment {
  label: string;
  value: number;
  colorClassName: string;
}

interface StatisticsCard5Props {
  title: string;
  caption?: string;
  segments: StatisticsCardSegment[];
  className?: string;
}

export function StatisticsCard5({
  title,
  caption,
  segments,
  className,
}: StatisticsCard5Props) {
  const displaySegments = segments.length > 0 ? segments : [];

  return (
    <Card
      className={cn(
        "w-full rounded-2xl border-0 bg-zinc-950 text-white shadow-xl shadow-black/20",
        "ring-1 ring-white/10 dark:bg-zinc-950/95",
        className,
      )}
    >
      <CardContent className="px-4 py-4">
        <div className="mb-3 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-zinc-300">{title}</p>
            {caption ? (
              <p className="truncate text-xs font-medium text-zinc-500">{caption}</p>
            ) : null}
          </div>
        </div>

        <div className="mb-3 flex w-full items-start gap-1.5">
          {displaySegments.map((segment) => (
            <div
              key={segment.label}
              className="min-w-0"
              style={{
                flexBasis: 0,
                flexGrow: Math.max(segment.value, 1),
              }}
            >
              <div
                className={cn(
                  "h-2.5 w-full rounded-sm transition-all",
                  segment.colorClassName,
                )}
              />
            </div>
          ))}
        </div>

        <div className="grid grid-cols-4 gap-2">
          {displaySegments.map((segment) => (
            <div key={segment.label} className="min-w-0">
              <span className="block truncate text-xs font-medium text-zinc-400">
                {segment.label}
              </span>
              <span className="text-base font-semibold text-white">
                {segment.value.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
