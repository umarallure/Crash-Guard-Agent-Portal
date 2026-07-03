import type { SyntheticEvent } from "react";
import { Loader2, UserPlus } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import {
  type LeadAssignmentAgentOption,
  UNASSIGNED_AGENT_VALUE,
  getLeadAssignmentAgentLabel,
} from "@/lib/leadAssignments";
import { cn } from "@/lib/utils";

interface LeadAssignmentControlProps {
  agents: LeadAssignmentAgentOption[];
  assignedAgentId?: string | null;
  isSuperAdmin: boolean;
  saving?: boolean;
  onChange: (agentUserId: string | null) => void;
  className?: string;
}

const getInitials = (label: string) => {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
};

const avatarClass =
  "grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary/15 text-[10px] font-bold text-primary";

export const LeadAssignmentControl = ({
  agents,
  assignedAgentId,
  isSuperAdmin,
  saving = false,
  onChange,
  className,
}: LeadAssignmentControlProps) => {
  const isAssigned = Boolean(assignedAgentId);
  const assignedLabel = getLeadAssignmentAgentLabel(assignedAgentId, agents);

  const stopCardInteraction = (event: SyntheticEvent) => {
    event.stopPropagation();
  };

  // Agents who can't reassign only see who a lead already belongs to.
  if (!isSuperAdmin) {
    if (!assignedAgentId) return null;
    const label = agents.length > 0 ? assignedLabel : "Assigned to you";

    return (
      <div
        className={cn(
          "inline-flex max-w-full items-center gap-2 rounded-lg border border-border/70 bg-muted/40 px-2 py-1",
          className,
        )}
      >
        <span className={avatarClass}>{getInitials(label)}</span>
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="text-[8.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Agent
          </span>
          <span className="truncate text-[11.5px] font-medium text-foreground">{label}</span>
        </span>
      </div>
    );
  }

  return (
    <div
      className={cn("w-full max-w-full", className)}
      onClick={stopCardInteraction}
      onMouseDown={stopCardInteraction}
      onPointerDown={stopCardInteraction}
    >
      <Select
        value={assignedAgentId || UNASSIGNED_AGENT_VALUE}
        disabled={saving}
        onValueChange={(value) => {
          onChange(value === UNASSIGNED_AGENT_VALUE ? null : value);
        }}
      >
        <SelectTrigger
          aria-label="Assign lead"
          className={cn(
            "h-9 gap-2 rounded-lg px-2 text-[11.5px] font-medium transition-colors",
            isAssigned
              ? "border-border/70 bg-background/95 hover:border-primary/40"
              : "border-dashed border-border/60 bg-transparent text-muted-foreground hover:border-primary/40 hover:bg-primary/[0.04] hover:text-foreground",
          )}
        >
          <span className="!flex min-w-0 flex-1 items-center gap-2">
            {saving ? (
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-muted">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              </span>
            ) : isAssigned ? (
              <span className={avatarClass}>{getInitials(assignedLabel)}</span>
            ) : (
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-dashed border-muted-foreground/50 text-muted-foreground">
                <UserPlus className="h-3.5 w-3.5" />
              </span>
            )}
            <span className="min-w-0 flex-1 truncate text-left">
              {isAssigned ? assignedLabel : "Assign agent"}
            </span>
          </span>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={UNASSIGNED_AGENT_VALUE}>Unassigned</SelectItem>
          {agents.map((agent) => (
            <SelectItem key={agent.userId} value={agent.userId}>
              {agent.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};
