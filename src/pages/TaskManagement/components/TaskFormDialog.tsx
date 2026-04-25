import { useEffect, useMemo, useState } from "react";
import { Loader2, Search, X } from "lucide-react";

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
  assigneeOptions: TaskAssigneeOption[];
  currentUserAssignee: TaskAssigneeOption | null;
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

export function TaskFormDialog({
  open,
  initialTask,
  assigneeOptions,
  currentUserAssignee,
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
      setValues({
        title: initialTask.title,
        description: initialTask.description || "",
        leadId: initialTask.lead_id || "",
        leadReference: initialTask.lead_reference || "",
        assigneeUserId: initialTask.assignee_user_id,
        assigneeName: initialTask.assignee_name,
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
      assigneeOptions.some((option) => option.key === currentUserAssignee.key);

    setValues({
      ...createEmptyState(),
      assigneeUserId: canAssignCurrentUser ? currentUserAssignee.key : "",
      assigneeName: canAssignCurrentUser ? currentUserAssignee.label : "",
    });
    setLeadSearchText("");
    setShowLeadResults(false);
  }, [assigneeOptions, currentUserAssignee, initialTask, open]);

  useEffect(() => {
    if (!open) return;

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
  }, [leadSearchText, onLeadSearch, open, values.leadId, values.leadReference]);

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
    handleChange("leadId", "");
    handleChange("leadReference", "");
    setLeadSearchText("");
    setShowLeadResults(false);
    onLeadSearch("");
  };

  const handleSubmit = async () => {
    if (!values.title.trim() || !values.assigneeUserId || !values.deadlineDate) {
      return;
    }

    setSubmitting(true);

    try {
      await onSave({
        ...values,
        title: values.title.trim(),
        description: values.description.trim(),
        assigneeName: values.assigneeName.trim(),
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
      <DialogContent className="max-w-3xl border-border/70 p-0">
        <div className="rounded-t-2xl bg-gradient-to-r from-primary/10 via-amber-50 to-transparent px-6 py-5">
          <DialogHeader>
            <DialogTitle className="text-xl">
              {isEditing ? "Update Task" : "Create Task"}
            </DialogTitle>
            <DialogDescription>
              Build an actionable task with clear ownership, deadlines, and lead context for the closer team.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="space-y-6 px-6 pb-6">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-2 lg:col-span-2">
              <Label htmlFor="task-title">Task title</Label>
              <Input
                id="task-title"
                value={values.title}
                onChange={(event) => handleChange("title", event.target.value)}
                placeholder="Example: Reconnect with client after missing signature"
              />
            </div>

            <div className="space-y-2 lg:col-span-2">
              <Label htmlFor="task-description">Description</Label>
              <Textarea
                id="task-description"
                value={values.description}
                onChange={(event) => handleChange("description", event.target.value)}
                placeholder="Capture the context, blockers, and next best action."
                rows={4}
              />
            </div>

            <div className="space-y-2 lg:col-span-2">
              <Label htmlFor="task-lead-reference">Lead Reference</Label>
              <div className="relative">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="task-lead-reference"
                    value={leadSearchText}
                    onChange={(event) => handleLeadInputChange(event.target.value)}
                    onFocus={() => {
                      setShowLeadResults(true);
                      onLeadSearch(leadSearchText.trim());
                    }}
                    placeholder="Search by lead reference, customer name, or phone"
                    className="pl-9 pr-10"
                  />
                  {values.leadId ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1 h-8 w-8"
                      onClick={clearAttachedLead}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  ) : null}
                </div>

                {values.leadId ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="rounded-full px-2.5 py-1 text-xs">
                      Attached lead: {leadSearchText || values.leadReference}
                    </Badge>
                  </div>
                ) : null}

                {showLeadResults ? (
                  <div className="absolute z-20 mt-2 w-full rounded-2xl border border-border/70 bg-popover shadow-xl">
                    <ScrollArea className="h-64">
                      <div className="space-y-1 p-2">
                        {leadSearchLoading ? (
                          <div className="flex items-center gap-2 rounded-xl px-3 py-3 text-sm text-muted-foreground">
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
                              className="flex w-full flex-col rounded-xl px-3 py-3 text-left transition hover:bg-accent hover:text-accent-foreground"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="text-sm font-semibold text-foreground">
                                  {getLeadDisplayName(lead.reference, lead.customerName)}
                                </span>
                                {lead.phoneNumber ? (
                                  <Badge variant="secondary" className="rounded-full text-[10px]">
                                    {lead.phoneNumber}
                                  </Badge>
                                ) : null}
                              </div>
                              <span className="mt-1 text-xs text-muted-foreground">
                                Lead ref {lead.reference}
                              </span>
                            </button>
                          ))}

                        {showLeadEmptyState ? (
                          <div className="rounded-xl px-3 py-3 text-sm text-muted-foreground">
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
              <p className="text-xs text-muted-foreground">
                Optional. Browse recent active leads or search by name, lead reference, or phone.
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="task-assignee">Assign to Closer</Label>
                {currentUserAssignee ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => handleAssigneeChange(currentUserAssignee.key)}
                  >
                    Assign to me
                  </Button>
                ) : null}
              </div>
              <Select value={values.assigneeUserId} onValueChange={handleAssigneeChange}>
                <SelectTrigger id="task-assignee">
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

            <div className="space-y-2">
              <Label htmlFor="task-deadline">Deadline date</Label>
              <Input
                id="task-deadline"
                type="date"
                value={values.deadlineDate}
                onChange={(event) => handleChange("deadlineDate", event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="task-status">Status</Label>
              <Select
                value={values.status}
                onValueChange={(value) => handleChange("status", value as TaskFormValues["status"])}
              >
                <SelectTrigger id="task-status">
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
              <Label htmlFor="task-priority">Priority</Label>
              <Select
                value={values.priority}
                onValueChange={(value) => handleChange("priority", value as TaskFormValues["priority"])}
              >
                <SelectTrigger id="task-priority">
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

            <div className="space-y-2 lg:col-span-2">
              <Label htmlFor="task-tags">Tags</Label>
              <MultiSelect
                options={TASK_TAG_OPTIONS.map((option) => ({
                  value: option.value,
                  label: option.label,
                }))}
                selected={values.tags}
                onChange={(selected) => handleChange("tags", selected)}
                placeholder="Select tags"
                maxVisibleBadges={4}
              />
            </div>
          </div>

          <div className="flex flex-col-reverse gap-2 border-t border-border/70 pt-4 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
