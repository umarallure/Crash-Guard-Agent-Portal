import {
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
} from "date-fns";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import { TASK_PRIORITY_META, TASK_STATUS_META } from "../taskManagementUtils";
import type { CloserTask } from "../types";

interface TaskCalendarProps {
  month: Date;
  selectedDate: string;
  tasks: CloserTask[];
  onSelectDate: (dateKey: string) => void;
  onOpenTask: (task: CloserTask) => void;
}

const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function TaskCalendar({
  month,
  selectedDate,
  tasks,
  onSelectDate,
  onOpenTask,
}: TaskCalendarProps) {
  const calendarDays = eachDayOfInterval({
    start: startOfWeek(startOfMonth(month), { weekStartsOn: 0 }),
    end: endOfWeek(endOfMonth(month), { weekStartsOn: 0 }),
  });

  const tasksByDeadline = tasks.reduce<Map<string, CloserTask[]>>((map, task) => {
    const key = task.deadline_date;
    const existing = map.get(key) || [];
    existing.push(task);
    map.set(key, existing);
    return map;
  }, new Map());

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-7 gap-2">
        {weekdayLabels.map((label) => (
          <div
            key={label}
            className="rounded-xl bg-muted/50 px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground"
          >
            {label}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-2">
        {calendarDays.map((day) => {
          const dateKey = format(day, "yyyy-MM-dd");
          const dayTasks = tasksByDeadline.get(dateKey) || [];
          const isActive = selectedDate === dateKey;
          const outsideMonth = !isSameMonth(day, month);

          return (
            <div
              key={dateKey}
              className={cn(
                "flex min-h-[92px] flex-col rounded-2xl border border-border/70 bg-white/80 p-2 shadow-sm transition sm:min-h-[128px]",
                isActive && "border-primary/40 bg-primary/5 shadow-md shadow-primary/10",
                outsideMonth && "bg-muted/30 text-muted-foreground",
              )}
            >
              <button
                type="button"
                onClick={() => onSelectDate(dateKey)}
                className="flex items-start justify-between gap-2 text-left"
              >
                <span
                  className={cn(
                    "inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold",
                    isToday(day) && "bg-primary text-primary-foreground",
                    !isToday(day) && isActive && "bg-primary/10 text-primary",
                  )}
                >
                  {format(day, "d")}
                </span>
                {dayTasks.length > 0 ? (
                  <Badge variant="outline" className="h-6 rounded-full px-2 text-[10px]">
                    {dayTasks.length}
                  </Badge>
                ) : null}
              </button>

              <div className="mt-2 flex-1 space-y-1">
                {dayTasks.slice(0, 3).map((task) => (
                  <button
                    key={task.id}
                    type="button"
                    onClick={() => onOpenTask(task)}
                    className="flex w-full items-center gap-2 rounded-xl border border-border/60 bg-background/80 px-2 py-1 text-left transition hover:border-primary/30 hover:bg-primary/5"
                  >
                    <span
                      className={cn(
                        "h-5 w-1.5 shrink-0 rounded-full",
                        TASK_PRIORITY_META[task.priority].railClassName,
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[10px] font-semibold text-foreground sm:text-[11px]">
                        {task.title}
                      </div>
                      <div className="truncate text-[10px] text-muted-foreground">
                        {task.assignee_name}
                      </div>
                    </div>
                    <span
                      className={cn(
                        "hidden rounded-full border px-1.5 py-0.5 text-[9px] font-medium md:inline-flex",
                        TASK_STATUS_META[task.status].badgeClassName,
                      )}
                    >
                      {TASK_STATUS_META[task.status].label}
                    </span>
                  </button>
                ))}

                {dayTasks.length > 3 ? (
                  <button
                    type="button"
                    onClick={() => onSelectDate(dateKey)}
                    className="w-full rounded-xl border border-dashed border-border/80 px-2 py-1 text-left text-[10px] font-medium text-muted-foreground transition hover:border-primary/30 hover:text-primary"
                  >
                    +{dayTasks.length - 3} more tasks
                  </button>
                ) : null}

                {dayTasks.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-transparent px-2 py-1 text-[10px] text-muted-foreground/70">
                    {outsideMonth ? "Outside focus month" : "No tasks due"}
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
