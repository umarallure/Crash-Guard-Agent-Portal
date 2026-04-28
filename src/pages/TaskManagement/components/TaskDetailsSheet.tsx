import { useEffect, useState } from "react";
import { format } from "date-fns";
import { CalendarClock, ExternalLink, Phone, StickyNote, Trash2, UserRound } from "lucide-react";
import { useNavigate } from "react-router-dom";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";

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
  canEditTask: boolean;
  canDeleteTask?: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (task: CloserTask) => void;
  onUpdateStatus: (task: CloserTask, status: TaskStatus) => Promise<void>;
  onAddNote: (task: CloserTask, content: string) => Promise<void>;
  onDelete?: (task: CloserTask) => Promise<void>;
}

export function TaskDetailsSheet({
  open,
  task,
  notes,
  loadingNotes,
  todayDateKey,
  canEditTask,
  canDeleteTask = false,
  onOpenChange,
  onEdit,
  onUpdateStatus,
  onAddNote,
  onDelete,
}: TaskDetailsSheetProps) {
  const navigate = useNavigate();
  const [statusDraft, setStatusDraft] = useState<TaskStatus>("todo");
  const [noteDraft, setNoteDraft] = useState("");
  const [savingStatus, setSavingStatus] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deletingTask, setDeletingTask] = useState(false);

  useEffect(() => {
    if (!task) return;
    setStatusDraft(task.status);
    setNoteDraft("");
    setDeleteConfirmOpen(false);
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

  const handleDeleteConfirmed = async () => {
    if (!task || !onDelete) return;
    setDeletingTask(true);
    try {
      await onDelete(task);
      setDeleteConfirmOpen(false);
    } finally {
      setDeletingTask(false);
    }
  };

  const openLeadCallResult = () => {
    if (!task?.lead_reference) return;
    navigate(`/call-result-update?submissionId=${encodeURIComponent(task.lead_reference)}`);
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full overflow-y-auto border-l-0 bg-zinc-950 px-0 py-0 text-white shadow-2xl shadow-black/30 ring-1 ring-white/10 [--accent:240_3.7%_15.9%] [--accent-foreground:0_0%_98%] [--background:240_10%_3.9%] [--border:240_3.7%_15.9%] [--card-foreground:0_0%_98%] [--card:240_10%_3.9%] [--foreground:0_0%_98%] [--input:240_3.7%_15.9%] [--muted-foreground:240_5%_64.9%] [--muted:240_3.7%_15.9%] [--popover-foreground:0_0%_98%] [--popover:240_10%_3.9%] [--secondary-foreground:0_0%_98%] [--secondary:240_3.7%_15.9%] sm:max-w-2xl [&>button]:text-zinc-500 [&>button:hover]:text-white"
      >
        {task ? (
          <div className="space-y-5">
            <div className="relative overflow-hidden border-b border-zinc-800 px-6 py-6">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,hsl(var(--primary)/0.28),transparent_42%),linear-gradient(135deg,hsl(var(--primary)/0.12),transparent_46%)]" />
              <SheetHeader className="relative space-y-3 text-left">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className={TASK_STATUS_META[task.status].badgeClassName}>
                    {TASK_STATUS_META[task.status].label}
                  </Badge>
                  <Badge variant="outline" className={TASK_PRIORITY_META[task.priority].badgeClassName}>
                    {TASK_PRIORITY_META[task.priority].label}
                  </Badge>
                  {task.tags.map((tag) => (
                    <Badge
                      key={tag}
                      variant="outline"
                      className="rounded-full border-white/70 bg-primary text-xs font-medium text-primary-foreground"
                    >
                      {formatTaskTag(tag)}
                    </Badge>
                  ))}
                </div>
                <SheetTitle className="text-2xl font-semibold tracking-tight text-white">
                  {task.title}
                </SheetTitle>
                <SheetDescription className="text-sm leading-6 text-zinc-400">
                  {task.description || "No description was provided for this task."}
                </SheetDescription>
              </SheetHeader>
            </div>

            <div className="space-y-5 px-6 pb-6">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl border border-zinc-800 bg-zinc-900/55 p-4">
                  <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                    <UserRound className="h-4 w-4 text-primary" />
                    Ownership
                  </div>
                  <p className="text-sm font-semibold text-white">{task.assignee_name}</p>
                  <p className="mt-1 text-sm text-zinc-500">
                    {task.assignee_user_id === task.created_by
                      ? "Self-assigned"
                      : `Assigned by ${task.created_by_name}`}
                  </p>
                </div>

                <div className="rounded-2xl border border-zinc-800 bg-zinc-900/55 p-4">
                  <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                    <CalendarClock className="h-4 w-4 text-primary" />
                    Timeline
                  </div>
                  <p className="text-sm font-semibold text-white">
                    Due {formatTaskDate(task.deadline_date)}
                  </p>
                  <p className="mt-1 text-sm text-zinc-500">
                    Assigned {formatTaskDate(task.assigned_date)}
                  </p>
                  <p className="mt-2 text-xs font-medium text-primary">
                    {getRelativeDeadlineLabel(task, todayDateKey)}
                  </p>
                </div>

                {(task.lead_name || task.lead_phone_number || task.lead_reference) && (
                  <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4 md:col-span-2">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                          <UserRound className="h-4 w-4 text-primary" />
                          Customer
                        </div>
                        <p className="truncate text-base font-semibold text-white">
                          {task.lead_name || "Customer not attached"}
                        </p>
                        <div className="mt-1 flex items-center gap-2 text-sm text-zinc-400">
                          <Phone className="h-3.5 w-3.5 text-primary" />
                          <span>{task.lead_phone_number || "Phone not attached"}</span>
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        className="border-primary/40 bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground"
                        onClick={openLeadCallResult}
                        disabled={!task.lead_reference}
                      >
                        <ExternalLink className="mr-2 h-4 w-4" />
                        Open Lead
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/55 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                  <div className="space-y-2">
                    <Label htmlFor="task-status-update" className="text-zinc-400">
                      Task status
                    </Label>
                    <Select
                      value={statusDraft}
                      onValueChange={(value) => setStatusDraft(value as TaskStatus)}
                      disabled={!canEditTask}
                    >
                      <SelectTrigger id="task-status-update" className="w-full border-zinc-800 bg-zinc-950 lg:w-[220px]">
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

                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      onClick={handleStatusSave}
                      disabled={!canEditTask || savingStatus || statusDraft === task.status}
                    >
                      {savingStatus ? "Saving..." : "Save status"}
                    </Button>
                    {canEditTask ? (
                      <Button
                        type="button"
                        variant="outline"
                        className="border-zinc-800 bg-zinc-950 text-zinc-100 hover:bg-zinc-800 hover:text-white"
                        onClick={() => onEdit(task)}
                      >
                        Edit task
                      </Button>
                    ) : null}
                    {canDeleteTask && onDelete ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        aria-label="Delete task"
                        className="border-rose-500/40 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 hover:text-rose-200"
                        onClick={() => setDeleteConfirmOpen(true)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <StickyNote className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-zinc-500">
                    Notes & Activity
                  </h3>
                </div>

                <div className="space-y-3">
                  {loadingNotes ? (
                    <div className="rounded-2xl border border-dashed border-zinc-800 px-4 py-8 text-center text-sm text-zinc-500">
                      Loading notes...
                    </div>
                  ) : notes.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-zinc-800 px-4 py-8 text-center text-sm text-zinc-500">
                      No notes yet. Add the first update to keep the task trail clear.
                    </div>
                  ) : (
                    notes.map((note) => (
                      <div key={note.id} className="rounded-2xl border border-zinc-800 bg-zinc-900/55 p-4">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-white">
                            {note.author_name}
                          </p>
                          <p className="text-xs text-zinc-500">
                            {format(new Date(note.created_at), "MMM d, yyyy h:mm a")}
                          </p>
                        </div>
                        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-400">
                          {note.content}
                        </p>
                      </div>
                    ))
                  )}
                </div>

                <div className="rounded-2xl border border-zinc-800 bg-zinc-900/55 p-4">
                  <Label htmlFor="task-note-draft" className="text-zinc-400">
                    Add note
                  </Label>
                  <Textarea
                    id="task-note-draft"
                    value={noteDraft}
                    onChange={(event) => setNoteDraft(event.target.value)}
                    rows={4}
                    placeholder="Write a concise update, blocker, or client detail."
                    className="mt-2 border-zinc-800 bg-zinc-950"
                    disabled={!canEditTask}
                  />
                  <div className="mt-3 flex justify-end">
                    <Button
                      type="button"
                      onClick={handleNoteSave}
                      disabled={!canEditTask || savingNote || !noteDraft.trim()}
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

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent className="border-zinc-800 bg-zinc-950 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Delete this task?</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              {task ? (
                <>
                  This will permanently remove <span className="font-semibold text-zinc-200">{task.title}</span> and its notes. This action cannot be undone.
                </>
              ) : (
                "This action cannot be undone."
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={deletingTask}
              className="border-zinc-800 bg-zinc-900 text-zinc-100 hover:bg-zinc-800 hover:text-white"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={deletingTask}
              onClick={(event) => {
                event.preventDefault();
                void handleDeleteConfirmed();
              }}
              className="bg-rose-600 text-white hover:bg-rose-500"
            >
              {deletingTask ? "Deleting..." : "Delete task"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  );
}
