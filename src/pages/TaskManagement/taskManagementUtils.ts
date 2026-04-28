import {
  differenceInCalendarDays,
  endOfWeek,
  format,
  isWithinInterval,
  parseISO,
  startOfWeek,
} from "date-fns";

import type {
  CloserTask,
  TaskDeadlineFilter,
  TaskPriority,
  TaskStatus,
} from "./types";

export const TASK_STATUS_OPTIONS: Array<{ value: TaskStatus; label: string }> = [
  { value: "todo", label: "To Do" },
  { value: "in_progress", label: "In Progress" },
  { value: "waiting", label: "Pending" },
  { value: "completed", label: "Completed" },
];

export const TASK_PRIORITY_OPTIONS: Array<{ value: TaskPriority; label: string }> = [
  { value: "low", label: "Low Priority" },
  { value: "medium", label: "Medium Priority" },
  { value: "high", label: "High Priority" },
];

export const TASK_TAG_OPTIONS = [
  { value: "callback", label: "Callback" },
  { value: "resend", label: "Resend" },
  { value: "follow_up", label: "Follow-up" },
  { value: "documents", label: "Documents" },
  { value: "quote", label: "Quote" },
  { value: "other", label: "Other" },
] as const;

export const TASK_DEADLINE_FILTER_OPTIONS: Array<{
  value: TaskDeadlineFilter;
  label: string;
}> = [
  { value: "all", label: "All Deadlines" },
  { value: "today", label: "Due Today" },
  { value: "this_week", label: "This Week" },
  { value: "overdue", label: "Overdue" },
  { value: "upcoming", label: "Next Week" },
];

export const TASK_STATUS_META: Record<
  TaskStatus,
  { label: string; badgeClassName: string }
> = {
  todo: {
    label: "To Do",
    badgeClassName:
      "border-slate-300/70 bg-slate-100/80 text-slate-700 dark:border-slate-500/30 dark:bg-slate-400/10 dark:text-slate-200",
  },
  in_progress: {
    label: "In Progress",
    badgeClassName:
      "border-sky-300/70 bg-sky-100/80 text-sky-700 dark:border-sky-500/30 dark:bg-sky-400/10 dark:text-sky-200",
  },
  waiting: {
    label: "Pending",
    badgeClassName:
      "border-amber-300/70 bg-amber-100/80 text-amber-700 dark:border-amber-500/30 dark:bg-amber-400/10 dark:text-amber-200",
  },
  completed: {
    label: "Completed",
    badgeClassName:
      "border-emerald-300/70 bg-emerald-100/80 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-400/10 dark:text-emerald-200",
  },
};

export const TASK_PRIORITY_META: Record<
  TaskPriority,
  { label: string; badgeClassName: string; railClassName: string }
> = {
  low: {
    label: "Low Priority",
    badgeClassName:
      "border-emerald-300/70 bg-emerald-100/80 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-400/10 dark:text-emerald-200",
    railClassName: "bg-emerald-500/70",
  },
  medium: {
    label: "Medium Priority",
    badgeClassName:
      "border-amber-300/70 bg-amber-100/80 text-amber-700 dark:border-amber-500/30 dark:bg-amber-400/10 dark:text-amber-200",
    railClassName: "bg-amber-500/80",
  },
  high: {
    label: "High Priority",
    badgeClassName:
      "border-rose-300/70 bg-rose-100/80 text-rose-700 dark:border-rose-500/30 dark:bg-rose-400/10 dark:text-rose-200",
    railClassName: "bg-rose-500/80",
  },
};

export const formatTaskTag = (value: string) => {
  const match = TASK_TAG_OPTIONS.find((tag) => tag.value === value);
  if (match) return match.label;
  return value
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
};

export const toDateKey = (value: Date) => format(value, "yyyy-MM-dd");

export const formatTaskDate = (value: string, output = "MMM d, yyyy") =>
  format(parseISO(value), output);

export const isTaskOpen = (task: CloserTask) => task.status !== "completed";

export const getRelativeDeadlineLabel = (
  task: Pick<CloserTask, "deadline_date" | "status" | "completed_at">,
  referenceDateKey: string,
) => {
  if (task.status === "completed" && task.completed_at) {
    return `Completed ${format(parseISO(task.completed_at), "MMM d")}`;
  }

  const difference = differenceInCalendarDays(
    parseISO(task.deadline_date),
    parseISO(referenceDateKey),
  );

  if (difference === 0) return "Due today";
  if (difference === 1) return "Due tomorrow";
  if (difference === -1) return "1 day overdue";
  if (difference < 0) return `${Math.abs(difference)} days overdue`;
  return `Due in ${difference} days`;
};

export const matchesDeadlineFilter = (
  task: CloserTask,
  filter: TaskDeadlineFilter,
  referenceDateKey: string,
) => {
  if (filter === "all") return true;

  const deadlineDate = parseISO(task.deadline_date);
  const referenceDate = parseISO(referenceDateKey);
  const difference = differenceInCalendarDays(deadlineDate, referenceDate);

  if (filter === "today") {
    return difference === 0;
  }

  if (filter === "overdue") {
    return difference < 0 && task.status !== "completed";
  }

  if (filter === "upcoming") {
    return difference >= 0 && difference <= 7;
  }

  const interval = {
    start: startOfWeek(referenceDate, { weekStartsOn: 0 }),
    end: endOfWeek(referenceDate, { weekStartsOn: 0 }),
  };

  return isWithinInterval(deadlineDate, interval);
};

const statusOrder: Record<TaskStatus, number> = {
  in_progress: 0,
  waiting: 1,
  todo: 2,
  completed: 3,
};

const priorityOrder: Record<TaskPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

export const sortTasks = (tasks: CloserTask[]) =>
  [...tasks].sort((left, right) => {
    const leftStatus = statusOrder[left.status];
    const rightStatus = statusOrder[right.status];
    if (leftStatus !== rightStatus) {
      return leftStatus - rightStatus;
    }

    const leftDeadline = parseISO(left.deadline_date).getTime();
    const rightDeadline = parseISO(right.deadline_date).getTime();
    if (leftDeadline !== rightDeadline) {
      return leftDeadline - rightDeadline;
    }

    const leftPriority = priorityOrder[left.priority];
    const rightPriority = priorityOrder[right.priority];
    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }

    return right.created_at.localeCompare(left.created_at);
  });
