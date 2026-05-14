import type { SyntheticEvent } from "react";
import { Loader2, UserCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
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

export const LeadAssignmentControl = ({
  agents,
  assignedAgentId,
  isSuperAdmin,
  saving = false,
  onChange,
  className,
}: LeadAssignmentControlProps) => {
  const assignedLabel = getLeadAssignmentAgentLabel(assignedAgentId, agents);

  const stopCardInteraction = (event: SyntheticEvent) => {
    event.stopPropagation();
  };

  if (!isSuperAdmin) {
    if (!assignedAgentId) return null;

    return (
      <Badge
        variant="outline"
        className={cn("max-w-full w-fit gap-1 rounded-full px-2.5 py-1 text-[10.5px] font-medium", className)}
      >
        <UserCheck className="h-3 w-3 shrink-0" />
        <span className="truncate">{agents.length > 0 ? assignedLabel : "Assigned to you"}</span>
      </Badge>
    );
  }

  return (
    <div
      className={cn("w-[180px] max-w-full", className)}
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
          className="h-8 min-w-0 rounded-md border-border/70 bg-background/95 px-2 text-[11px] font-medium"
          aria-label="Assign lead"
        >
          <div className="flex min-w-0 items-center gap-1">
            {saving ? <Loader2 className="h-3 w-3 shrink-0 animate-spin" /> : <UserCheck className="h-3 w-3 shrink-0" />}
            <SelectValue placeholder="Assign" />
          </div>
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
