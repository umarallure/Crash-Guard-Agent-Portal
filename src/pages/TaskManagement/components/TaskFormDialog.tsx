import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, Loader2, Search, X } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MultiSelect } from "@/components/ui/multi-select";
import { Badge } from "@/components/ui/badge";

import {
  TASK_PRIORITY_OPTIONS,
  TASK_STATUS_OPTIONS,
  TASK_TAG_OPTIONS,
} from "../taskManagementUtils";
import type {
  CloserTask,
  TaskAssigneeOption,
  TaskFormValues,
  TaskLeadOption,
} from "../types";

interface TaskFormDialogProps {
  open: boolean;
  initialTask: CloserTask | null;
  initialAssignee?: TaskAssigneeOption | null;
  initialLead?: TaskLeadOption | null;
  lockLead?: boolean;
  assigneeOptions: TaskAssigneeOption[];
  currentUserAssignee: TaskAssigneeOption | null;
  selfAssignOnly?: boolean;
  leadOptions: TaskLeadOption[];
  leadSearchLoading: boolean;
  onLeadSearch: (query: string) => void;
  onOpenChange: (open: boolean) => void;
  onSave: (values: TaskFormValues) => Promise<void>;
}

const createEmptyState = (): TaskFormValues => ({
  title: "",
  description: "",
  leadId: "",
  leadReference: "",
  assigneeUserId: "",
  assigneeName: "",
  status: "todo",
  priority: "medium",
  deadlineDate: "",
  tags: [],
});

const getLeadDisplayName = (
  reference: string | null | undefined,
  customerName?: string | null,
) => {
  const name = (customerName || "").trim();
  const leadRef = (reference || "").trim();
  return name || leadRef;
};

type DateInputWithPicker = HTMLInputElement & {
  showPicker?: () => void;
};

export function TaskFormDialog({
  open,
  initialTask,
  initialAssignee = null,
  initialLead = null,
  lockLead = false,
  assigneeOptions,
  currentUserAssignee,
  selfAssignOnly = false,
  leadOptions,
  leadSearchLoading,
  onLeadSearch,
  onOpenChange,
  onSave,
}: TaskFormDialogProps) {
  const [values, setValues] = useState<TaskFormValues>(createEmptyState);
  const [submitting, setSubmitting] = useState(false);
  const [leadSearchText, setLeadSearchText] = useState("");
  const [showLeadResults, setShowLeadResults] = useState(false);
  const deadlineInputRef = useRef<HTMLInputElement>(null);

  const isEditing = Boolean(initialTask);

  const selectableAssigneeOptions = useMemo(() => {
    if (
      !currentUserAssignee ||
      values.assigneeUserId !== currentUserAssignee.key
    ) {
      return assigneeOptions;
    }

    const alreadyIncluded = assigneeOptions.some(
      (option) => option.key === currentUserAssignee.key,
    );

    if (alreadyIncluded) {
      return assigneeOptions;
    }

    return [currentUserAssignee, ...assigneeOptions];
  }, [assigneeOptions, currentUserAssignee, values.assigneeUserId]);

  const assigneeLabelById = useMemo(() => {
    const map = new Map<string, string>();
    selectableAssigneeOptions.forEach((option) => {
      map.set(option.key, option.label);
    });
    return map;
  }, [selectableAssigneeOptions]);

  useEffect(() => {
    if (!open) return;

    if (initialTask) {
      const lockedAssignee = selfAssignOnly && currentUserAssignee
        ? currentUserAssignee
        : null;
      setValues({
        title: initialTask.title,
        description: initialTask.description || "",
        leadId: initialTask.lead_id || "",
        leadReference: initialTask.lead_reference || "",
        assigneeUserId: lockedAssignee?.key || initialTask.assignee_user_id,
        assigneeName: lockedAssignee?.label || initialTask.assignee_name,
        status: initialTask.status,
        priority: initialTask.priority,
        deadlineDate: initialTask.deadline_date,
        tags: initialTask.tags || [],
      });
      setLeadSearchText(
        getLeadDisplayName(initialTask.lead_reference, initialTask.lead_name),
      );
      setShowLeadResults(false);
      return;
    }

    const canAssignCurrentUser =
      currentUserAssignee &&
      (selfAssignOnly ||
        assigneeOptions.some((option) => option.key === currentUserAssignee.key));

    const presetAssignee =
      !selfAssignOnly && initialAssignee
        ? initialAssignee
        : canAssignCurrentUser
          ? currentUserAssignee
          : null;

    setValues({
      ...createEmptyState(),
      leadId: initialLead?.id || "",
      leadReference: initialLead?.reference || "",
      assigneeUserId: presetAssignee?.key || "",
      assigneeName: presetAssignee?.label || "",
    });
    setLeadSearchText(initialLead ? getLeadDisplayName(initialLead.reference, initialLead.customerName) : "");
    setShowLeadResults(false);
  }, [assigneeOptions, currentUserAssignee, initialAssignee, initialLead, initialTask, open, selfAssignOnly]);

  useEffect(() => {
    if (!open) return;
    if (lockLead) return;

    const query = leadSearchText.trim();
    if (values.leadId) {
      return;
    }

    const timer = window.setTimeout(() => {
      onLeadSearch(query);
    }, 180);

    return () => {
      window.clearTimeout(timer);
    };
  }, [leadSearchText, lockLead, onLeadSearch, open, values.leadId, values.leadReference]);

  const handleChange = <K extends keyof TaskFormValues>(key: K, value: TaskFormValues[K]) => {
    setValues((previous) => ({
      ...previous,
      [key]: value,
    }));
  };

  const handleAssigneeChange = (assigneeUserId: string) => {
    handleChange("assigneeUserId", assigneeUserId);
    handleChange("assigneeName", assigneeLabelById.get(assigneeUserId) || "");
  };

  const handleLeadInputChange = (value: string) => {
    if (lockLead) return;

    setLeadSearchText(value);
    setShowLeadResults(true);

    if (values.leadId || values.leadReference) {
      handleChange("leadId", "");
      handleChange("leadReference", "");
    }
  };

  const handleLeadSelect = (lead: TaskLeadOption) => {
    handleChange("leadId", lead.id);
    handleChange("leadReference", lead.reference);
    setLeadSearchText(getLeadDisplayName(lead.reference, lead.customerName));
    setShowLeadResults(false);
  };

  const clearAttachedLead = () => {
    if (lockLead) return;

    handleChange("leadId", "");
    handleChange("leadReference", "");
    setLeadSearchText("");
    setShowLeadResults(false);
    onLeadSearch("");
  };

  const openDeadlinePicker = () => {
    const input = deadlineInputRef.current as DateInputWithPicker | null;
    if (!input) return;

    input.focus();

    if (typeof input.showPicker === "function") {
      try {
        input.showPicker();
      } catch {
        // Some browsers reject showPicker outside direct pointer activation.
      }
    }
  };

  const handleSubmit = async () => {
    const nextValues = selfAssignOnly && currentUserAssignee
      ? {
        ...values,
        assigneeUserId: currentUserAssignee.key,
        assigneeName: currentUserAssignee.label,
      }
      : values;

    if (!nextValues.title.trim() || !nextValues.assigneeUserId || !nextValues.deadlineDate) {
      return;
    }

    setSubmitting(true);

    try {
      await onSave({
        ...nextValues,
        title: nextValues.title.trim(),
        description: nextValues.description.trim(),
        assigneeName: nextValues.assigneeName.trim(),
      });
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  const showLeadEmptyState =
    !leadSearchLoading &&
    showLeadResults &&
    leadOptions.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-2rem)] max-w-4xl overflow-hidden border-0 bg-zinc-950 p-0 text-white shadow-2xl shadow-black/30 ring-1 ring-white/10 [--accent:240_3.7%_15.9%] [--accent-foreground:0_0%_98%] [--background:240_10%_3.9%] [--border:240_3.7%_15.9%] [--foreground:0_0%_98%] [--input:240_3.7%_15.9%] [--muted-foreground:240_5%_64.9%] [--muted:240_3.7%_15.9%] [--popover-foreground:0_0%_98%] [--popover:240_10%_3.9%] [--secondary-foreground:0_0%_98%] [--secondary:240_3.7%_15.9%] [&>button]:text-zinc-500 [&>button:hover]:text-white">
        <div className="relative overflow-hidden border-b border-primary/25 px-5 py-4">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,hsl(var(--primary)/0.32),transparent_34%),linear-gradient(135deg,hsl(var(--primary)/0.12),transparent_42%)]" />
          <DialogHeader className="relative space-y-1">
            <DialogTitle className="text-lg text-white">
              {isEditing ? "Update Task" : "Create Task"}
            </DialogTitle>
            <DialogDescription className="text-zinc-500">
              Set the owner, deadline, priority, and lead context.
            </DialogDescription>
          </DialogHeader>
        </div>

        <ScrollArea className="h-[min(56vh,520px)]">
          <div className="space-y-4 p-5">
            <div className="grid gap-4 lg:grid-cols-[minmax(220px,0.75fr)_minmax(0,1.25fr)]">
              {selfAssignOnly ? (
                <div className="space-y-2">
                  <Label htmlFor="task-assignee" className="text-zinc-400">Assigned to</Label>
                  <Input
                    id="task-assignee"
                    value={currentUserAssignee?.label || values.assigneeName || "You"}
                    readOnly
                    className="h-10 border-primary/35 bg-zinc-900"
                  />
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="task-assignee" className="text-zinc-400">Assign to Closer</Label>
                    {currentUserAssignee ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs text-zinc-300 hover:bg-zinc-800 hover:text-white"
                        onClick={() => handleAssigneeChange(currentUserAssignee.key)}
                      >
                        Assign to me
                      </Button>
                    ) : null}
                  </div>
                  <Select value={values.assigneeUserId} onValueChange={handleAssigneeChange}>
                    <SelectTrigger id="task-assignee" className="h-10 border-primary/35 bg-zinc-900">
                      <SelectValue placeholder="Select a closer or sales rep" />
                    </SelectTrigger>
                    <SelectContent>
                      {selectableAssigneeOptions.map((option) => (
                        <SelectItem key={option.key} value={option.key}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="task-title" className="text-zinc-400">Task title</Label>
                <Input
                  id="task-title"
                  value={values.title}
                  onChange={(event) => handleChange("title", event.target.value)}
                  placeholder="Reconnect with client after missing signature"
                  className="h-10 border-primary/35 bg-zinc-900"
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-2">
                <Label htmlFor="task-deadline" className="text-zinc-400">Deadline</Label>
                <div className="relative" onClick={openDeadlinePicker}>
                  <Input
                    ref={deadlineInputRef}
                    id="task-deadline"
                    type="date"
                    value={values.deadlineDate}
                    onChange={(event) => handleChange("deadlineDate", event.target.value)}
                    className="relative h-10 cursor-pointer appearance-none border-primary/35 bg-zinc-900 pr-10 [color-scheme:dark] [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0"
                  />
                  <CalendarDays className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary" />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="task-status" className="text-zinc-400">Status</Label>
                <Select
                  value={values.status}
                  onValueChange={(value) => handleChange("status", value as TaskFormValues["status"])}
                >
                  <SelectTrigger id="task-status" className="h-10 border-zinc-800 bg-zinc-900">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    {TASK_STATUS_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="task-priority" className="text-zinc-400">Priority</Label>
                <Select
                  value={values.priority}
                  onValueChange={(value) => handleChange("priority", value as TaskFormValues["priority"])}
                >
                  <SelectTrigger id="task-priority" className="h-10 border-zinc-800 bg-zinc-900">
                    <SelectValue placeholder="Select priority" />
                  </SelectTrigger>
                  <SelectContent>
                    {TASK_PRIORITY_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="task-tags" className="text-zinc-400">Tags</Label>
                <MultiSelect
                  options={TASK_TAG_OPTIONS.map((option) => ({
                    value: option.value,
                    label: option.label,
                  }))}
                  selected={values.tags}
                  onChange={(selected) => handleChange("tags", selected)}
                  placeholder="Select tags"
                  maxVisibleBadges={3}
                  className="border-zinc-800 bg-zinc-900 hover:bg-zinc-800 hover:text-white"
                />
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.78fr)]">
              <div className="space-y-2">
                <Label htmlFor="task-description" className="text-zinc-400">Description</Label>
                <Textarea
                  id="task-description"
                  value={values.description}
                  onChange={(event) => handleChange("description", event.target.value)}
                  placeholder="Context, blockers, and next best action."
                  rows={3}
                  className="min-h-[40px] border-zinc-800 bg-zinc-900"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="task-lead-reference" className="text-zinc-400">Lead Reference</Label>
                <div className="relative">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-zinc-500" />
                    <Input
                      id="task-lead-reference"
                      value={leadSearchText}
                      onChange={(event) => handleLeadInputChange(event.target.value)}
                      onFocus={() => {
                        if (lockLead) return;
                        setShowLeadResults(true);
                        onLeadSearch(leadSearchText.trim());
                      }}
                      readOnly={lockLead}
                      placeholder={lockLead ? "Attached lead" : "Search customer or phone"}
                      className={`h-10 border-zinc-800 bg-zinc-900 pl-9 pr-10 ${lockLead ? "cursor-default" : ""}`}
                    />
                    {values.leadId && !lockLead ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-1 top-1 h-8 w-8 text-zinc-500 hover:bg-zinc-800 hover:text-white"
                        onClick={clearAttachedLead}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    ) : null}
                  </div>

                  {values.leadId ? (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="rounded-full border-zinc-700 px-2.5 py-1 text-xs text-zinc-300">
                        Attached: {leadSearchText || "Selected lead"}
                      </Badge>
                    </div>
                  ) : null}

                  {showLeadResults && !lockLead ? (
                    <div className="absolute z-20 mt-2 w-full rounded-2xl border border-zinc-800 bg-zinc-950 shadow-xl shadow-black/30">
                      <ScrollArea className="h-52">
                        <div className="space-y-1 p-2">
                          {leadSearchLoading ? (
                            <div className="flex items-center gap-2 rounded-xl px-3 py-3 text-sm text-zinc-500">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Loading active leads...
                            </div>
                          ) : null}

                          {!leadSearchLoading &&
                            leadOptions.map((lead) => (
                              <button
                                key={lead.id}
                                type="button"
                                onClick={() => handleLeadSelect(lead)}
                                className="flex w-full flex-col rounded-xl px-3 py-3 text-left transition hover:bg-zinc-800"
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <span className="text-sm font-semibold text-white">
                                    {getLeadDisplayName(lead.reference, lead.customerName)}
                                  </span>
                                  {lead.phoneNumber ? (
                                    <Badge variant="secondary" className="rounded-full text-[10px]">
                                      {lead.phoneNumber}
                                    </Badge>
                                  ) : null}
                                </div>
                              </button>
                            ))}

                          {showLeadEmptyState ? (
                            <div className="rounded-xl px-3 py-3 text-sm text-zinc-500">
                              {leadSearchText.trim().length > 0
                                ? "No active leads matched that search."
                                : "No active leads are available right now."}
                            </div>
                          ) : null}
                        </div>
                      </ScrollArea>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </ScrollArea>

        <div className="flex flex-col-reverse gap-2 border-t border-zinc-800 px-5 py-4 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            className="border-zinc-800 bg-zinc-900 text-zinc-100 hover:bg-zinc-800 hover:text-white"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={
              submitting ||
              !values.title.trim() ||
              !values.assigneeUserId ||
              !values.deadlineDate
            }
          >
            {submitting ? "Saving..." : isEditing ? "Save changes" : "Create task"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
