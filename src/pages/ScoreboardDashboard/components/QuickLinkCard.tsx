import { ArrowUpRight, type LucideIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

interface QuickLinkCardProps {
  title: string;
  to: string;
  icon: LucideIcon;
  className?: string;
}

export function QuickLinkCard({
  title,
  to,
  icon: Icon,
  className,
}: QuickLinkCardProps) {
  const navigate = useNavigate();

  return (
    <button
      type="button"
      onClick={() => navigate(to)}
      className={cn(
        "group relative h-full w-full min-w-0 overflow-hidden rounded-2xl border border-primary/20 bg-zinc-900/60 backdrop-blur-xl p-4 text-left shadow-xl shadow-black/30 transition-all hover:border-primary/55 hover:bg-zinc-900/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
        className,
      )}
    >
      <span className="pointer-events-none absolute -bottom-10 -right-10 h-28 w-28 rounded-full bg-primary/15 blur-2xl opacity-0 transition-opacity group-hover:opacity-80" />

      <div className="relative flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/30">
            <Icon className="h-4 w-4" />
          </span>
          <span className="truncate text-sm font-semibold text-white">{title}</span>
        </span>
        <ArrowUpRight className="h-4 w-4 text-white/40 transition-all group-hover:text-primary group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
      </div>
    </button>
  );
}
