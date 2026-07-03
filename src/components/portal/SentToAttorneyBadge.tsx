import { Send } from "lucide-react";

import { cn } from "@/lib/utils";

export type SentToChannel = "internal" | "broker";

export type SentToAttorney = {
  label: string;
  channel: SentToChannel;
};

const CHANNEL_LABEL: Record<SentToChannel, string> = {
  internal: "Internal",
  broker: "Broker",
};

/**
 * The signature element of the pipeline card: a channel-keyed pill that states
 * which attorney a lead was sent to. Reads distinctly from vendor/status badges.
 */
export const SentToAttorneyBadge = ({
  sentTo,
  className,
}: {
  sentTo: SentToAttorney;
  className?: string;
}) => {
  const isInternal = sentTo.channel === "internal";

  return (
    <div
      title={`Sent to ${sentTo.label} (${CHANNEL_LABEL[sentTo.channel]})`}
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-lg border px-2 py-1 leading-none",
        isInternal
          ? "border-primary/25 bg-primary/10 text-primary"
          : "border-yellow-300/80 bg-yellow-50 text-yellow-700 dark:border-yellow-400/25 dark:bg-yellow-500/10 dark:text-yellow-300",
        className,
      )}
    >
      <Send className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="truncate text-[11.5px] font-semibold">{sentTo.label}</span>
      <span
        className={cn(
          "shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em]",
          isInternal
            ? "bg-primary/15 text-primary"
            : "bg-yellow-100 text-yellow-800 dark:bg-yellow-400/15 dark:text-yellow-200",
        )}
      >
        {CHANNEL_LABEL[sentTo.channel]}
      </span>
    </div>
  );
};
