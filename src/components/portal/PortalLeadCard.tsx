import { type DragEvent, type ReactNode } from "react";
import { StickyNote } from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { formatUsPhone } from "@/lib/phone";
import { SentToAttorneyBadge, type SentToAttorney } from "./SentToAttorneyBadge";

export interface PortalLeadCardProps {
  name?: string | null;
  phone?: string | null;
  noteCount?: number;
  leadVendor?: string | null;
  tag?: string | null;
  /** Tone classes for the tag badge (from getLeadTagToneClass). */
  tagToneClass?: string;
  /** Which attorney the lead was sent to, if any. Drives the accent rail. */
  sentTo?: SentToAttorney | null;
  /** Slim assignment marker shown beside the card actions for regular assigned leads. */
  assignmentRibbonLabel?: string | null;
  /** Action row shown under the phone/documents line. Clicks are isolated from the card. */
  actions?: ReactNode;
  /** Extra badges rendered inline with the meta row (e.g. a linked-lead badge). */
  extraBadges?: ReactNode;
  /** Footer control, e.g. the super-admin assignment selector. */
  footer?: ReactNode;
  onClick?: () => void;
  className?: string;
  draggable?: boolean;
  onDragStart?: (event: DragEvent<HTMLDivElement>) => void;
  onDragEnd?: (event: DragEvent<HTMLDivElement>) => void;
  /** Dim the card while it is being dragged. */
  dimmed?: boolean;
}

const railToneClass = (sentTo: SentToAttorney | null | undefined) => {
  if (!sentTo) return "bg-border";
  return sentTo.channel === "internal" ? "bg-primary" : "bg-yellow-400";
};

const railWashClass = (sentTo: SentToAttorney | null | undefined) => {
  if (!sentTo) return "";
  return sentTo.channel === "internal"
    ? "bg-[linear-gradient(90deg,hsl(var(--primary)/0.10)_0%,hsl(var(--primary)/0)_38%)]"
    : "bg-[linear-gradient(90deg,rgba(234,179,8,0.14)_0%,rgba(234,179,8,0)_38%)]";
};

const stop = (event: { stopPropagation: () => void }) => event.stopPropagation();

export const PortalLeadCard = ({
  name,
  phone,
  noteCount,
  leadVendor,
  tag,
  tagToneClass,
  sentTo,
  assignmentRibbonLabel,
  actions,
  extraBadges,
  footer,
  onClick,
  className,
  draggable,
  onDragStart,
  onDragEnd,
  dimmed,
}: PortalLeadCardProps) => {
  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className={cn(
        "group relative isolate overflow-hidden rounded-xl border border-border/70",
        "bg-[linear-gradient(180deg,hsl(var(--card))_0%,hsl(var(--muted)/0.35)_100%)]",
        "shadow-[0_1px_2px_rgba(15,23,42,0.05)] transition-all duration-200",
        onClick && "cursor-pointer hover:-translate-y-0.5 hover:border-border hover:shadow-[0_10px_24px_-14px_rgba(15,23,42,0.35)]",
        dimmed && "opacity-70",
        className,
      )}
    >
      <span aria-hidden className={cn("absolute inset-y-0 left-0 z-10 w-[3px]", railToneClass(sentTo))} />
      <div aria-hidden className={cn("pointer-events-none absolute inset-0", railWashClass(sentTo))} />

      <div className="relative space-y-2.5 py-3 pl-4 pr-3">
        <div className="min-w-0 space-y-1">
            <div className="truncate text-[0.95rem] font-semibold leading-tight tracking-[-0.01em] text-foreground">
              {name || "—"}
            </div>
            <div className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
              <span className="truncate tabular-nums">{formatUsPhone(phone) || "—"}</span>
              {typeof noteCount === "number" ? (
                <span className="inline-flex shrink-0 items-center gap-1 text-foreground/70">
                  <StickyNote className="h-3.5 w-3.5" />
                  <span className="tabular-nums">{noteCount}</span>
                </span>
              ) : null}
            </div>
            {actions || assignmentRibbonLabel ? (
              <div className="flex items-center gap-1.5 pt-1" onClick={stop}>
                {actions ? <div className="flex min-w-0 flex-wrap items-center gap-1.5">{actions}</div> : null}

                {assignmentRibbonLabel ? (
                  <div className="relative isolate ml-auto mr-[-12px] flex h-7 shrink-0 items-center">
                    {/* Flat accent-orange ribbon that runs into the card's right edge (clipped there by the
                        card's overflow) so it reads as turning to the back. Inline styles keep clip-path reliable. */}
                    <div
                      aria-hidden
                      className="absolute inset-0"
                      style={{ filter: "drop-shadow(-4px 3px 4px rgba(2,6,23,0.30))" }}
                    >
                      {/* Underside fold tucking behind the card edge — same orange, darkest */}
                      <span
                        className="absolute right-0 top-full h-2 w-3.5"
                        style={{
                          background: "hsl(var(--primary))",
                          filter: "brightness(0.42)",
                          clipPath: "polygon(0 0, 100% 0, 100% 100%)",
                        }}
                      />
                      {/* Band: flat, darker accent orange; swallowtail free (left) end, right edge meets the card border */}
                      <span
                        className="absolute inset-0"
                        style={{
                          background: "hsl(var(--primary))",
                          filter: "brightness(0.78)",
                          clipPath: "polygon(0 0, 100% 0, 100% 100%, 0 100%, 9px 50%)",
                        }}
                      />
                      {/* Crease where the band turns behind the edge — a thin darker sliver of the same orange */}
                      <span
                        className="absolute inset-y-0 right-0 w-[3px]"
                        style={{ background: "hsl(var(--primary))", filter: "brightness(0.56)" }}
                      />
                    </div>
                    <span className="relative z-10 whitespace-nowrap pl-3 pr-3 text-[9px] font-bold uppercase tracking-[0.14em] text-primary-foreground">
                      {assignmentRibbonLabel}
                    </span>
                  </div>
                ) : null}
              </div>
            ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {leadVendor ? (
            <Badge
              variant="secondary"
              className="max-w-full truncate rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
            >
              {leadVendor}
            </Badge>
          ) : null}

          {tag ? (
            <Badge
              className={cn(
                "max-w-full truncate rounded-full border px-2.5 py-0.5 text-[10.5px] font-medium",
                tagToneClass,
              )}
            >
              {tag}
            </Badge>
          ) : null}

          {extraBadges}
        </div>

        {footer ? <div onClick={stop}>{footer}</div> : null}

        {sentTo ? <SentToAttorneyBadge sentTo={sentTo} className="max-w-full" /> : null}
      </div>
    </div>
  );
};
