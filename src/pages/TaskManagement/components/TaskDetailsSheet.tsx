import { useEffect, useState } from "react";
import { format } from "date-fns";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { CalendarClock, CircleUserRound, FileText, StickyNote } from "lucide-react";

import {
  TASK_PRIORITY_META,
  TASK_STATUS_META,
  TASK_STATUS_OPTIONS,
  formatTaskDate,
  formatTaskTag,
  getRelativeDeadlineLabel,
} from "../taskManagementUtils";
import type { CloserTask, CloserTaskNote, TaskStatus } from "../types";

interface TaskDetailsSheetProps {
  open: boolean;
  task: CloserTask | null;
  notes: CloserTaskNote[];
  loadingNotes: boolean;
  todayDateKey: string;
  onOpenChange: (open: boolean) => void;
  onEdit: (task: CloserTask) => void;
  onUpdateStatus: (task: CloserTask, status: TaskStatus) => Promise<void>;
  onAddNote: (task: CloserTask, content: string) => Promise<void>;
}

export function TaskDetailsSheet({
  open,
  task,
  notes,
  loadingNotes,
  todayDateKey,
  onOpenChange,
  onEdit,
  onUpdateStatus,
  onAddNote,
}: TaskDetailsSheetProps) {
  const [statusDraft, setStatusDraft] = useState<TaskStatus>("todo");
  const [noteDraft, setNoteDraft] = useState("");
  const [savingStatus, setSavingStatus] = useState(false);
  const [savingNote, setSavingNote] = useState(false);

  useEffect(() => {
    if (!task) return;
    setStatusDraft(task.status);
    setNoteDraft("");
  }, [task]);

  const handleStatusSave = async () => {
    if (!task || statusDraft === task.status) return;
    setSavingStatus(true);
    try {
      await onUpdateStatus(task, statusDraft);
    } finally {
      setSavingStatus(false);
    }
  };

  const handleNoteSave = async () => {
    if (!task || !noteDraft.trim()) return;
    setSavingNote(true);
    try {
      await onAddNote(task, noteDraft.trim());
      setNoteDraft("");
    } finally {
      setSavingNote(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto border-l border-border/70 px-0 sm:max-w-2xl">
        {task ? (
          <div className="space-y-6">
            <div className="border-b border-border/70 bg-gradient-to-br from-primary/10 via-amber-50 to-white px-6 py-6">
              <SheetHeader className="space-y-3 text-left">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className={TASK_STATUS_META[task.status].badgeClassName}>
                    {TASK_STATUS_META[task.status].label}
                  </Badge>
                  <Badge variant="outline" className={TASK_PRIORITY_META[task.priority].badgeClassName}>
                    {TASK_PRIORITY_META[task.priority].label}
                  </Badge>
                  {task.tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="rounded-full text-xs">
                      {formatTaskTag(tag)}
                    </Badge>
                  ))}
                </div>
                <SheetTitle className="text-2xl font-semibold tracking-tight">
                  {task.title}
                </SheetTitle>
                <SheetDescription className="text-sm leading-6">
                  {task.description || "No description was provided for this task."}
                </SheetDescription>
              </SheetHeader>
            </div>

            <div className="space-y-6 px-6 pb-6">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl border border-border/70 bg-card p-4">
                  <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    <CircleUserRound className="h-4 w-4" />
                    Ownership
                  </div>
                  <p className="text-sm font-semibold text-foreground">{task.assignee_name}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Assigned by {task.created_by_name}
                  </p>
                </div>

                <div className="rounded-2xl border border-border/70 bg-card p-4">
                  <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    <CalendarClock className="h-4 w-4" />
                    Timeline
                  </div>
                  <p className="text-sm font-semibold text-foreground">
                    Due {formatTaskDate(task.deadline_date)}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Assigned {formatTaskDate(task.assigned_date)}
                  </p>
                  <p className="mt-2 text-xs font-medium text-primary">
                    {getRelativeDeadlineLabel(task, todayDateKey)}
                  </p>
                </div>

                {(task.lead_reference || task.lead_name || task.lead_phone_number) && (
                  <div className="rounded-2xl border border-border/70 bg-card p-4 md:col-span-2">
                    <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      <FileText className="h-4 w-4" />
                      Lead Context
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div>
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">
                          Lead Reference
                        </p>
                        <p className="text-sm font-medium text-foreground">
                          {task.lead_reference || "Not attached"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">
                          Customer
                        </p>
                        <p className="text-sm font-medium text-foreground">
                          {task.lead_name || "Not attached"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">
                          Phone
                        </p>
                        <p className="text-sm font-medium text-foreground">
                          {task.lead_phone_number || "Not attached"}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-border/70 bg-card p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                  <div className="space-y-2">
                    <Label htmlFor="task-status-update">Task status</Label>
                    <Select
                      value={statusDraft}
                      onValueChange={(value) => setStatusDraft(value as TaskStatus)}
                    >
                      <SelectTrigger id="task-status-update" className="w-full lg:w-[220px]">
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

                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => onEdit(task)}
                    >
                      Edit task
                    </Button>
                    <Button
                      type="button"
                      onClick={handleStatusSave}
                      disabled={savingStatus || statusDraft === task.status}
                    >
                      {savingStatus ? "Saving..." : "Save status"}
                    </Button>
                  </div>
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <StickyNote className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Notes & Activity
                  </h3>
                </div>

                <div className="space-y-3">
                  {loadingNotes ? (
                    <div className="rounded-2xl border border-dashed border-border/70 px-4 py-8 text-center text-sm text-muted-foreground">
                      Loading notes...
                    </div>
                  ) : notes.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-border/70 px-4 py-8 text-center text-sm text-muted-foreground">
                      No notes yet. Add the first update to keep the task trail clear.
                    </div>
                  ) : (
                    notes.map((note) => (
                      <div key={note.id} className="rounded-2xl border border-border/70 bg-card p-4">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-foreground">
                            {note.author_name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(note.created_at), "MMM d, yyyy h:mm a")}
                          </p>
                        </div>
                        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                          {note.content}
                        </p>
                      </div>
                    ))
                  )}
                </div>

                <div className="rounded-2xl border border-border/70 bg-card p-4">
                  <Label htmlFor="task-note-draft">Add note</Label>
                  <Textarea
                    id="task-note-draft"
                    value={noteDraft}
                    onChange={(event) => setNoteDraft(event.target.value)}
                    rows={4}
                    placeholder="Write a concise update, blocker, or client detail."
                    className="mt-2"
                  />
                  <div className="mt-3 flex justify-end">
                    <Button
                      type="button"
                      onClick={handleNoteSave}
                      disabled={savingNote || !noteDraft.trim()}
                    >
                      {savingNote ? "Posting..." : "Post note"}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
