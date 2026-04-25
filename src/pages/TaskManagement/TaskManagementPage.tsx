import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import {
  addMonths,
  endOfWeek,
  format,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Filter,
  ListTodo,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  UserCheck2,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MultiSelect } from "@/components/ui/multi-select";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import {
  fetchLicensedCloserOptions,
  formatAgentLabelFromEmail,
} from "@/lib/agentOptions";
import { cn } from "@/lib/utils";

import { TaskCalendar } from "./components/TaskCalendar";
import { TaskDetailsSheet } from "./components/TaskDetailsSheet";
import { TaskFormDialog } from "./components/TaskFormDialog";
import {
  TASK_DEADLINE_FILTER_OPTIONS,
  TASK_PRIORITY_META,
  TASK_PRIORITY_OPTIONS,
  TASK_STATUS_META,
  TASK_STATUS_OPTIONS,
  TASK_TAG_OPTIONS,
  formatTaskDate,
  formatTaskTag,
  getRelativeDeadlineLabel,
  isTaskOpen,
  matchesDeadlineFilter,
  sortTasks,
  toDateKey,
} from "./taskManagementUtils";
import type {
  CloserTask,
  CloserTaskNote,
  TaskAssigneeOption,
  TaskDeadlineFilter,
  TaskFormValues,
  TaskLeadOption,
  TaskPriority,
  TaskStatus,
} from "./types";

const defaultMultiSelectClass = "w-full";

type QueryResult<T> = Promise<{ data: T | null; error: unknown }>;
type LeadRow = Pick<
  Database["public"]["Tables"]["leads"]["Row"],
  "id" | "submission_id" | "customer_full_name" | "phone_number" | "is_active"
>;
type AppUserAdminRow = { role?: string | null; is_super_admin?: boolean | null };

type TaskManagementDbClient = {
  from(table: "closer_tasks"): {
    select: (columns: string) => {
      order: (column: string, options?: { ascending: boolean }) => QueryResult<CloserTask[]>;
    };
    update: (values: Partial<CloserTask>) => {
      eq: (column: string, value: string) => QueryResult<null>;
    };
    insert: (values: Partial<CloserTask>) => {
      select: (columns: string) => {
        single: () => QueryResult<CloserTask>;
      };
    };
  };
  from(table: "closer_task_notes"): {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        order: (column: string, options?: { ascending: boolean }) => QueryResult<CloserTaskNote[]>;
      };
    };
    insert: (values: {
      task_id: string;
      author_user_id: string;
      author_name: string;
      content: string;
    }) => QueryResult<null>;
  };
  from(table: "app_users"): {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => QueryResult<AppUserAdminRow>;
      };
    };
  };
};

const taskDb = supabase as unknown as TaskManagementDbClient;

const safeTrimmedValue = (value: string) => {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const dedupeAssignees = (options: TaskAssigneeOption[]) => {
  const map = new Map<string, TaskAssigneeOption>();
  options.forEach((option) => {
    if (!map.has(option.key)) {
      map.set(option.key, option);
    }
  });
  return Array.from(map.values()).sort((left, right) => left.label.localeCompare(right.label));
};

interface TaskWorkloadRow {
  assigneeUserId: string;
  assigneeName: string;
  openCount: number;
  overdueCount: number;
  dueTodayCount: number;
  highPriorityCount: number;
  nextDeadlineDate: string | null;
}

const TaskManagementPage = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();

  const [isAdmin, setIsAdmin] = useState(() => {
    if (!user?.id) return false;
    try {
      return localStorage.getItem(`cg_is_admin:${user.id}`) === "1";
    } catch {
      return false;
    }
  });
  const [checkingAccess, setCheckingAccess] = useState(true);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tasks, setTasks] = useState<CloserTask[]>([]);
  const [assigneeOptions, setAssigneeOptions] = useState<TaskAssigneeOption[]>([]);
  const [currentUserAssignee, setCurrentUserAssignee] = useState<TaskAssigneeOption | null>(null);
  const [currentUserLabel, setCurrentUserLabel] = useState("");
  const [leadSearchResults, setLeadSearchResults] = useState<TaskLeadOption[]>([]);
  const [leadSearchLoading, setLeadSearchLoading] = useState(false);

  const [searchTerm, setSearchTerm] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [deadlineFilter, setDeadlineFilter] = useState<TaskDeadlineFilter>("all");
  const [statusFilters, setStatusFilters] = useState<TaskStatus[]>([]);
  const [priorityFilters, setPriorityFilters] = useState<TaskPriority[]>([]);
  const [tagFilters, setTagFilters] = useState<string[]>([]);
  const [showCompleted, setShowCompleted] = useState(false);

  const [calendarMonth, setCalendarMonth] = useState(startOfMonth(new Date()));
  const todayDateKey = toDateKey(new Date());
  const [selectedDate, setSelectedDate] = useState(todayDateKey);

  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<CloserTask | null>(null);

  const [selectedTask, setSelectedTask] = useState<CloserTask | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [taskNotes, setTaskNotes] = useState<CloserTaskNote[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(false);

  const resolveCurrentUserLabel = useCallback(async () => {
    if (!user) return "";

    const fallback =
      formatAgentLabelFromEmail(user.email || "") ||
      user.email ||
      "Portal Admin";

    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("user_id", user.id)
      .maybeSingle();

    return profile?.display_name?.trim() || fallback;
  }, [user]);

  const fetchCloserAssigneeOptions = useCallback(async () => {
    const options = await fetchLicensedCloserOptions();
    return dedupeAssignees(options);
  }, []);

  const fetchTasks = useCallback(async () => {
    const { data, error } = await taskDb
      .from("closer_tasks")
      .select("*")
      .order("deadline_date", { ascending: true });

    if (error) {
      throw error;
    }

    const taskRows = ((data || []) as CloserTask[]).map((task) => ({
      ...task,
      tags: Array.isArray(task.tags) ? task.tags : [],
    }));

    const leadIds = Array.from(
      new Set(taskRows.map((task) => task.lead_id).filter(Boolean)),
    ) as string[];

    if (leadIds.length === 0) {
      return taskRows;
    }

    const { data: leadRows, error: leadError } = await supabase
      .from("leads")
      .select("id, submission_id, customer_full_name, phone_number, is_active")
      .in("id", leadIds);

    if (leadError) {
      throw leadError;
    }

    const leadById = new Map<string, LeadRow>();
    (leadRows || []).forEach((lead) => {
      leadById.set(lead.id, lead);
    });

    return taskRows.map((task) => {
      const lead = task.lead_id ? leadById.get(task.lead_id) : undefined;
      return {
        ...task,
        lead_reference: task.lead_reference || lead?.submission_id || null,
        lead_name: lead?.customer_full_name || null,
        lead_phone_number: lead?.phone_number || null,
      };
    });
  }, []);

  const searchLeadReferences = useCallback(async (query: string) => {
    const cleanedQuery = query.replace(/[%(),]/g, " ").trim();

    setLeadSearchLoading(true);

    try {
      let leadQuery = supabase
        .from("leads")
        .select("id, submission_id, customer_full_name, phone_number, is_active")
        .eq("is_active", true);

      if (cleanedQuery.length > 0) {
        const likePattern = `%${cleanedQuery.replace(/\s+/g, "%")}%`;
        leadQuery = leadQuery.or(
          `submission_id.ilike.${likePattern},customer_full_name.ilike.${likePattern},phone_number.ilike.${likePattern}`,
        );
      }

      const { data, error } = await leadQuery
        .order("submission_date", { ascending: false })
        .limit(cleanedQuery.length > 0 ? 12 : 16);

      if (error) {
        throw error;
      }

      setLeadSearchResults(
        ((data || []) as LeadRow[]).map((lead) => ({
          id: lead.id,
          reference: lead.submission_id,
          customerName: lead.customer_full_name,
          phoneNumber: lead.phone_number,
        })),
      );
    } catch (error) {
      console.error("Error searching leads:", error);
      setLeadSearchResults([]);
    } finally {
      setLeadSearchLoading(false);
    }
  }, []);

  const fetchTaskNotes = useCallback(async (taskId: string) => {
    setLoadingNotes(true);
    try {
      const { data, error } = await taskDb
        .from("closer_task_notes")
        .select("*")
        .eq("task_id", taskId)
        .order("created_at", { ascending: false });

      if (error) {
        throw error;
      }

      setTaskNotes((data || []) as CloserTaskNote[]);
    } catch (error) {
      console.error("Error fetching task notes:", error);
      toast({
        title: "Unable to load notes",
        description: "The task details opened, but note history could not be fetched.",
        variant: "destructive",
      });
    } finally {
      setLoadingNotes(false);
    }
  }, [toast]);

  const loadData = useCallback(async (showRefreshToast = false) => {
    if (!user) return;

    setRefreshing(true);

    try {
      const [userLabel, closerAssignees, nextTasks] = await Promise.all([
        resolveCurrentUserLabel(),
        fetchCloserAssigneeOptions(),
        fetchTasks(),
      ]);

      const me = { key: user.id, label: userLabel };
      const nextAssignees = dedupeAssignees([me, ...closerAssignees]);

      setCurrentUserLabel(userLabel);
      setCurrentUserAssignee(me);
      setAssigneeOptions(nextAssignees);
      setTasks(nextTasks);

      if (showRefreshToast) {
        toast({
          title: "Task data refreshed",
          description: "The board is now synced with the latest assignments.",
        });
      }
    } catch (error) {
      console.error("Error loading task management data:", error);
      toast({
        title: "Unable to load task management",
        description: "Task data could not be loaded from Supabase.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [fetchCloserAssigneeOptions, fetchTasks, resolveCurrentUserLabel, toast, user]);

  useEffect(() => {
    if (!user) {
      navigate("/auth");
      return;
    }

    let isMounted = true;

    const checkAccess = async () => {
      let admin = false;

      try {
        const cached = localStorage.getItem(`cg_is_admin:${user.id}`);
        if (cached === "1") {
          admin = true;
        }
      } catch {
        admin = false;
      }

      if (!admin) {
        try {
          const { data: appUser, error: appUserError } = await taskDb
            .from("app_users")
            .select("role, is_super_admin")
            .eq("user_id", user.id)
            .maybeSingle();

          admin =
            !appUserError &&
            Boolean(appUser) &&
            (
              appUser.role === "admin" ||
              appUser.role === "super_admin" ||
              appUser.is_super_admin === true
            );
        } catch {
          admin = false;
        }
      }

      if (!admin) {
        try {
          const { data: roleMatch, error: rolesError } = await supabase
            .from("user_roles")
            .select("id")
            .eq("user_id", user.id)
            .in("role", ["admin", "super_admin"])
            .eq("is_active", true)
            .limit(1)
            .maybeSingle();

          admin = !rolesError && Boolean(roleMatch);
        } catch {
          admin = false;
        }
      }

      if (!isMounted) return;

      try {
        localStorage.setItem(`cg_is_admin:${user.id}`, admin ? "1" : "0");
      } catch {
        // Ignore cache write failures.
      }

      setIsAdmin(admin);
      setCheckingAccess(false);

      if (!admin) {
        toast({
          title: "Access denied",
          description: "Task Management is reserved for admins and super admins.",
          variant: "destructive",
        });
        navigate("/scoreboard-dashboard", { replace: true });
      }
    };

    checkAccess();

    return () => {
      isMounted = false;
    };
  }, [navigate, toast, user]);

  useEffect(() => {
    if (!isAdmin) return;
    void loadData();
  }, [isAdmin, loadData]);

  useEffect(() => {
    if (!isAdmin) return;

    const channel = supabase
      .channel("closer-task-management")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "closer_tasks" },
        () => {
          void loadData();
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "closer_task_notes" },
        (payload) => {
          const taskId = selectedTask?.id;
          const changedTaskId =
            (payload.new as { task_id?: string } | null)?.task_id ||
            (payload.old as { task_id?: string } | null)?.task_id;

          if (taskId && changedTaskId === taskId) {
            void fetchTaskNotes(taskId);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchTaskNotes, isAdmin, loadData, selectedTask?.id]);

  useEffect(() => {
    if (!selectedTask) return;
    const refreshedTask = tasks.find((task) => task.id === selectedTask.id) || null;

    if (!refreshedTask) {
      setSelectedTask(null);
      setDetailOpen(false);
      return;
    }

    if (refreshedTask !== selectedTask) {
      setSelectedTask(refreshedTask);
    }
  }, [selectedTask, tasks]);

  useEffect(() => {
    if (!selectedTask || !detailOpen) return;
    void fetchTaskNotes(selectedTask.id);
  }, [detailOpen, fetchTaskNotes, selectedTask]);

  const filteredTasks = useMemo(() => {
    let nextTasks = [...tasks];

    if (!showCompleted) {
      nextTasks = nextTasks.filter((task) => task.status !== "completed");
    }

    if (assigneeFilter === "mine") {
      nextTasks = nextTasks.filter((task) => task.assignee_user_id === user?.id);
    } else if (assigneeFilter !== "all") {
      nextTasks = nextTasks.filter((task) => task.assignee_user_id === assigneeFilter);
    }

    if (deadlineFilter !== "all") {
      nextTasks = nextTasks.filter((task) =>
        matchesDeadlineFilter(task, deadlineFilter, todayDateKey),
      );
    }

    if (statusFilters.length > 0) {
      nextTasks = nextTasks.filter((task) => statusFilters.includes(task.status));
    }

    if (priorityFilters.length > 0) {
      nextTasks = nextTasks.filter((task) => priorityFilters.includes(task.priority));
    }

    if (tagFilters.length > 0) {
      nextTasks = nextTasks.filter((task) =>
        tagFilters.some((tag) => task.tags.includes(tag)),
      );
    }

    if (searchTerm.trim()) {
      const query = searchTerm.trim().toLowerCase();
      nextTasks = nextTasks.filter((task) => {
        const haystack = [
          task.title,
          task.description,
          task.assignee_name,
          task.created_by_name,
          task.lead_reference,
          task.lead_name,
          task.lead_phone_number,
          ...task.tags,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return haystack.includes(query);
      });
    }

    return sortTasks(nextTasks);
  }, [
    assigneeFilter,
    deadlineFilter,
    priorityFilters,
    searchTerm,
    showCompleted,
    statusFilters,
    tagFilters,
    tasks,
    todayDateKey,
    user?.id,
  ]);

  const selectedDateTasks = useMemo(
    () => filteredTasks.filter((task) => task.deadline_date === selectedDate),
    [filteredTasks, selectedDate],
  );

  const filteredOpenTasks = useMemo(
    () => filteredTasks.filter((task) => isTaskOpen(task)),
    [filteredTasks],
  );

  const myTasks = useMemo(() => {
    if (!user?.id) return [];
    return sortTasks(
      tasks.filter((task) => task.assignee_user_id === user.id && isTaskOpen(task)),
    ).slice(0, 6);
  }, [tasks, user?.id]);

  const assigneeFocusLabel = useMemo(() => {
    if (assigneeFilter === "all") return "All Assignees";
    if (assigneeFilter === "mine") return currentUserLabel || "My Tasks";
    return (
      assigneeOptions.find((option) => option.key === assigneeFilter)?.label ||
      "Focused Assignee"
    );
  }, [assigneeFilter, assigneeOptions, currentUserLabel]);

  const workloadRows = useMemo<TaskWorkloadRow[]>(() => {
    const grouped = new Map<string, TaskWorkloadRow>();

    filteredOpenTasks.forEach((task) => {
      const existing = grouped.get(task.assignee_user_id) || {
        assigneeUserId: task.assignee_user_id,
        assigneeName: task.assignee_name,
        openCount: 0,
        overdueCount: 0,
        dueTodayCount: 0,
        highPriorityCount: 0,
        nextDeadlineDate: null,
      };

      existing.openCount += 1;

      if (task.deadline_date === todayDateKey) {
        existing.dueTodayCount += 1;
      }

      if (task.deadline_date < todayDateKey) {
        existing.overdueCount += 1;
      }

      if (task.priority === "high") {
        existing.highPriorityCount += 1;
      }

      if (!existing.nextDeadlineDate || task.deadline_date < existing.nextDeadlineDate) {
        existing.nextDeadlineDate = task.deadline_date;
      }

      grouped.set(task.assignee_user_id, existing);
    });

    return Array.from(grouped.values()).sort(
      (left, right) =>
        right.overdueCount - left.overdueCount ||
        right.highPriorityCount - left.highPriorityCount ||
        right.dueTodayCount - left.dueTodayCount ||
        right.openCount - left.openCount ||
        left.assigneeName.localeCompare(right.assigneeName),
    );
  }, [filteredOpenTasks, todayDateKey]);

  const metrics = useMemo(() => {
    const today = parseISO(todayDateKey);
    const startOfCurrentWeek = startOfWeek(today, { weekStartsOn: 0 });
    const endOfCurrentWeek = endOfWeek(today, { weekStartsOn: 0 });

    return {
      myOpenTasks: tasks.filter(
        (task) => task.assignee_user_id === user?.id && isTaskOpen(task),
      ).length,
      dueToday: tasks.filter(
        (task) => task.deadline_date === todayDateKey && isTaskOpen(task),
      ).length,
      overdue: tasks.filter((task) => {
        if (!isTaskOpen(task)) return false;
        return parseISO(task.deadline_date) < today;
      }).length,
      completedThisWeek: tasks.filter((task) => {
        if (!task.completed_at) return false;
        const completedDate = new Date(task.completed_at);
        return completedDate >= startOfCurrentWeek && completedDate <= endOfCurrentWeek;
      }).length,
    };
  }, [tasks, todayDateKey, user?.id]);

  const hasActiveFilters =
    Boolean(searchTerm.trim()) ||
    assigneeFilter !== "all" ||
    deadlineFilter !== "all" ||
    statusFilters.length > 0 ||
    priorityFilters.length > 0 ||
    tagFilters.length > 0 ||
    showCompleted;

  const openTaskDetails = (task: CloserTask) => {
    setSelectedTask(task);
    setDetailOpen(true);
  };

  const openCreateDialog = () => {
    setEditingTask(null);
    setTaskDialogOpen(true);
  };

  const openEditDialog = (task: CloserTask) => {
    setEditingTask(task);
    setTaskDialogOpen(true);
  };

  const resetFilters = () => {
    setSearchTerm("");
    setAssigneeFilter("all");
    setDeadlineFilter("all");
    setStatusFilters([]);
    setPriorityFilters([]);
    setTagFilters([]);
    setShowCompleted(false);
  };

  const createTaskNote = useCallback(async (taskId: string, content: string) => {
    if (!user) return;

    const { error } = await taskDb
      .from("closer_task_notes")
      .insert({
        task_id: taskId,
        author_user_id: user.id,
        author_name: currentUserLabel,
        content,
      });

    if (error) {
      throw error;
    }
  }, [currentUserLabel, user]);

  const handleSaveTask = async (values: TaskFormValues) => {
    if (!user) return;

    const payload = {
      title: values.title,
      description: safeTrimmedValue(values.description),
      lead_id: safeTrimmedValue(values.leadId),
      lead_reference: safeTrimmedValue(values.leadReference),
      assignee_user_id: values.assigneeUserId,
      assignee_name: values.assigneeName,
      status: values.status,
      priority: values.priority,
      deadline_date: values.deadlineDate,
      tags: values.tags,
    };

    try {
      let taskId = editingTask?.id || null;

      if (editingTask) {
        const { error } = await taskDb
          .from("closer_tasks")
          .update(payload)
          .eq("id", editingTask.id);

        if (error) {
          throw error;
        }
      } else {
        const { data, error } = await taskDb
          .from("closer_tasks")
          .insert({
            ...payload,
            assigned_date: todayDateKey,
            created_by: user.id,
            created_by_name: currentUserLabel,
          })
          .select("*")
          .single();

        if (error) {
          throw error;
        }

        taskId = (data as CloserTask).id;
      }

      toast({
        title: editingTask ? "Task updated" : "Task created",
        description: editingTask
          ? "The task details and calendar entry have been updated."
          : "The task was assigned and added to the calendar.",
      });

      setTaskDialogOpen(false);
      setEditingTask(null);
      await loadData();

      if (taskId) {
        const refreshedTask = (await fetchTasks()).find((task) => task.id === taskId) || null;
        if (refreshedTask && detailOpen) {
          setSelectedTask(refreshedTask);
          await fetchTaskNotes(taskId);
        }
      }
    } catch (error) {
      console.error("Error saving task:", error);
      toast({
        title: "Unable to save task",
        description: "Please review the task details and try again.",
        variant: "destructive",
      });
      throw error;
    }
  };

  const handleUpdateTaskStatus = async (task: CloserTask, status: TaskStatus) => {
    try {
      const { error } = await taskDb
        .from("closer_tasks")
        .update({ status })
        .eq("id", task.id);

      if (error) {
        throw error;
      }

      toast({
        title: "Task status updated",
        description: `${task.title} is now marked ${TASK_STATUS_META[status].label.toLowerCase()}.`,
      });

      await loadData();
      await fetchTaskNotes(task.id);
    } catch (error) {
      console.error("Error updating task status:", error);
      toast({
        title: "Unable to update status",
        description: "The task status could not be updated.",
        variant: "destructive",
      });
      throw error;
    }
  };

  const handleAddTaskNote = async (task: CloserTask, content: string) => {
    try {
      await createTaskNote(task.id, content);
      toast({
        title: "Note posted",
        description: "The update is now attached to the task timeline.",
      });
      await fetchTaskNotes(task.id);
    } catch (error) {
      console.error("Error adding task note:", error);
      toast({
        title: "Unable to add note",
        description: "The note could not be attached to this task.",
        variant: "destructive",
      });
      throw error;
    }
  };

  if (checkingAccess || loading) {
    return (
      <div className="min-h-full bg-background">
        <div className="mx-auto flex min-h-[60vh] max-w-5xl items-center justify-center px-4">
          <div className="flex items-center gap-3 rounded-2xl border border-border/70 bg-card px-5 py-4 shadow-sm">
            <RefreshCw className="h-5 w-5 animate-spin text-primary" />
            <div>
              <p className="text-sm font-semibold text-foreground">Loading task management</p>
              <p className="text-sm text-muted-foreground">
                Verifying access and syncing your closer task board.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top_left,rgba(174,64,16,0.08),transparent_30%),radial-gradient(circle_at_top_right,rgba(217,119,6,0.12),transparent_25%),linear-gradient(180deg,rgba(255,255,255,0.92),rgba(248,246,243,0.96))]">
      <div className="mx-auto flex w-full max-w-[1800px] flex-col gap-6 px-4 py-4 lg:px-6 lg:py-6">
        <Card className="overflow-hidden border-0 shadow-xl shadow-primary/5">
          <div className="relative">
            <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(174,64,16,0.14),rgba(255,255,255,0.8)_45%,rgba(217,119,6,0.14))]" />
            <div className="absolute inset-y-0 right-0 hidden w-1/3 bg-[radial-gradient(circle_at_center,rgba(174,64,16,0.16),transparent_60%)] md:block" />

            <CardContent className="relative flex flex-col gap-5 px-6 py-6 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl space-y-3">
                <Badge className="w-fit rounded-full bg-primary/90 px-3 py-1 text-primary-foreground">
                  <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                  Admin task control center
                </Badge>
                <div className="space-y-2">
                  <h1 className="text-3xl font-semibold tracking-tight text-foreground lg:text-4xl">
                    Task Management
                  </h1>
                  <p className="max-w-2xl text-sm leading-6 text-muted-foreground lg:text-base">
                    Assign work, monitor due dates, and review each closer&apos;s calendar without leaving the portal.
                    The board is tuned for fast handoffs, visible priorities, and clean follow-through.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  className="bg-white/70"
                  onClick={() => void loadData(true)}
                  disabled={refreshing}
                >
                  <RefreshCw className={cn("mr-2 h-4 w-4", refreshing && "animate-spin")} />
                  Refresh
                </Button>
                <Button onClick={openCreateDialog}>
                  <Plus className="mr-2 h-4 w-4" />
                  New Task
                </Button>
              </div>
            </CardContent>
          </div>
        </Card>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            title="My Open Tasks"
            value={metrics.myOpenTasks}
            tone="from-slate-50 to-white"
            accent="text-slate-700"
            icon={<UserCheck2 className="h-5 w-5" />}
            description="Actionable items assigned directly to you."
          />
          <MetricCard
            title="Due Today"
            value={metrics.dueToday}
            tone="from-amber-50 to-white"
            accent="text-amber-700"
            icon={<CalendarDays className="h-5 w-5" />}
            description="Tasks that should move today."
          />
          <MetricCard
            title="Overdue"
            value={metrics.overdue}
            tone="from-rose-50 to-white"
            accent="text-rose-700"
            icon={<ListTodo className="h-5 w-5" />}
            description="Open items beyond their deadline."
          />
          <MetricCard
            title="Completed This Week"
            value={metrics.completedThisWeek}
            tone="from-emerald-50 to-white"
            accent="text-emerald-700"
            icon={<Sparkles className="h-5 w-5" />}
            description="Finished tasks during the current week."
          />
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_380px]">
          <Card className="border-border/70 bg-card/90 shadow-sm">
            <CardHeader className="border-b border-border/70 pb-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <CardTitle className="text-xl">Calendar View</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Deadline-based monthly calendar focused on <span className="font-medium text-foreground">{assigneeFocusLabel}</span>.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
                    <SelectTrigger className="w-[220px] bg-white">
                      <SelectValue placeholder="All assignees" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Assignees</SelectItem>
                      <SelectItem value="mine">My Tasks</SelectItem>
                      {assigneeOptions.map((option) => (
                        <SelectItem key={option.key} value={option.key}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setCalendarMonth((previous) => addMonths(previous, -1))}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <div className="min-w-[160px] text-center text-sm font-semibold">
                    {format(calendarMonth, "MMMM yyyy")}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setCalendarMonth((previous) => addMonths(previous, 1))}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-4 p-4">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Priority legend:</span>
                {(["high", "medium", "low"] as TaskPriority[]).map((priority) => (
                  <span key={priority} className="inline-flex items-center gap-2 rounded-full border border-border/70 px-2.5 py-1">
                    <span className={cn("h-3 w-1.5 rounded-full", TASK_PRIORITY_META[priority].railClassName)} />
                    {TASK_PRIORITY_META[priority].label}
                  </span>
                ))}
              </div>

              <TaskCalendar
                month={calendarMonth}
                selectedDate={selectedDate}
                tasks={filteredTasks}
                onSelectDate={setSelectedDate}
                onOpenTask={openTaskDetails}
              />
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card className="border-border/70 bg-card/90 shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-xl">
                      {format(parseISO(selectedDate), "EEEE, MMMM d")}
                    </CardTitle>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {selectedDateTasks.length} task{selectedDateTasks.length === 1 ? "" : "s"} scheduled on the selected date, plus quick access to what&apos;s currently assigned to you.
                    </p>
                  </div>
                  {assigneeFilter !== "mine" && user?.id ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setAssigneeFilter("mine")}
                    >
                      Focus mine
                    </Button>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-2xl border border-border/70 bg-muted/20 p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Scheduled For This Day
                  </p>
                  <div className="mt-3 space-y-3">
                    {selectedDateTasks.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-border/70 px-4 py-8 text-center text-sm text-muted-foreground">
                        No tasks match the current filters for this date.
                      </div>
                    ) : (
                      selectedDateTasks.slice(0, 6).map((task) => (
                        <button
                          key={task.id}
                          type="button"
                          onClick={() => openTaskDetails(task)}
                          className="w-full rounded-2xl border border-border/70 bg-background px-4 py-3 text-left transition hover:border-primary/30 hover:bg-primary/5"
                        >
                          <div className="flex items-start gap-3">
                            <span
                              className={cn(
                                "mt-1 h-8 w-1.5 shrink-0 rounded-full",
                                TASK_PRIORITY_META[task.priority].railClassName,
                              )}
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="truncate text-sm font-semibold text-foreground">
                                  {task.title}
                                </p>
                                <Badge variant="outline" className={TASK_STATUS_META[task.status].badgeClassName}>
                                  {TASK_STATUS_META[task.status].label}
                                </Badge>
                              </div>
                              <p className="mt-1 text-sm text-muted-foreground">
                                {task.assignee_name}
                              </p>
                              {task.lead_reference ? (
                                <p className="mt-1 text-xs text-muted-foreground">
                                  Lead {task.lead_reference}
                                </p>
                              ) : null}
                              <p className="mt-2 text-xs font-medium text-primary">
                                {getRelativeDeadlineLabel(task, todayDateKey)}
                              </p>
                            </div>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border border-border/70 bg-muted/20 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      Assigned To You
                    </p>
                    <Badge variant="outline" className="rounded-full px-2.5 py-1 text-xs">
                      {myTasks.length} open
                    </Badge>
                  </div>
                  <div className="mt-3 space-y-3">
                    {myTasks.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-border/70 px-4 py-8 text-center text-sm text-muted-foreground">
                        You do not have any open tasks assigned right now.
                      </div>
                    ) : (
                      myTasks.map((task) => (
                        <button
                          key={task.id}
                          type="button"
                          onClick={() => openTaskDetails(task)}
                          className="flex w-full items-start gap-3 rounded-2xl border border-border/70 bg-background px-4 py-3 text-left transition hover:border-primary/30 hover:bg-primary/5"
                        >
                          <span
                            className={cn(
                              "mt-1 h-8 w-1.5 shrink-0 rounded-full",
                              TASK_PRIORITY_META[task.priority].railClassName,
                            )}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="truncate text-sm font-semibold text-foreground">
                                {task.title}
                              </p>
                              <Badge variant="outline" className={TASK_PRIORITY_META[task.priority].badgeClassName}>
                                {TASK_PRIORITY_META[task.priority].label}
                              </Badge>
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                              Due {formatTaskDate(task.deadline_date)}
                            </p>
                            {task.lead_reference ? (
                              <p className="mt-1 text-xs text-muted-foreground">
                                Lead {task.lead_reference}
                              </p>
                            ) : null}
                            <p className="mt-2 text-xs font-medium text-primary">
                              {getRelativeDeadlineLabel(task, todayDateKey)}
                            </p>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/70 bg-card/90 shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-xl">Closer Workload</CardTitle>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Open-task pressure by assignee for the current board filters.
                    </p>
                  </div>
                  {assigneeFilter !== "all" ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setAssigneeFilter("all")}
                    >
                      Show all
                    </Button>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {workloadRows.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border/70 px-4 py-8 text-center text-sm text-muted-foreground">
                    No open workload is visible for the current filter set.
                  </div>
                ) : (
                  workloadRows.map((row) => {
                    const isFocusedAssignee =
                      assigneeFilter === row.assigneeUserId ||
                      (assigneeFilter === "mine" && row.assigneeUserId === user?.id);

                    return (
                      <button
                        key={row.assigneeUserId}
                        type="button"
                        onClick={() => setAssigneeFilter(row.assigneeUserId)}
                        className={cn(
                          "w-full rounded-2xl border border-border/70 bg-background px-4 py-3 text-left transition hover:border-primary/30 hover:bg-primary/5",
                          isFocusedAssignee && "border-primary/40 bg-primary/5 shadow-sm",
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-foreground">
                              {row.assigneeName}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {row.openCount} open task{row.openCount === 1 ? "" : "s"}
                              {row.nextDeadlineDate
                                ? ` - next due ${formatTaskDate(row.nextDeadlineDate, "MMM d")}`
                                : ""}
                            </p>
                          </div>
                          {isFocusedAssignee ? (
                            <Badge variant="outline" className="rounded-full px-2.5 py-1 text-xs">
                              Focused
                            </Badge>
                          ) : null}
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2">
                          <Badge variant="outline" className="rounded-full px-2.5 py-1 text-xs">
                            Due today: {row.dueTodayCount}
                          </Badge>
                          <Badge variant="outline" className="rounded-full px-2.5 py-1 text-xs">
                            Overdue: {row.overdueCount}
                          </Badge>
                          <Badge variant="outline" className="rounded-full px-2.5 py-1 text-xs">
                            High priority: {row.highPriorityCount}
                          </Badge>
                        </div>
                      </button>
                    );
                  })
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        <Card className="border-border/70 bg-card/90 shadow-sm">
          <CardHeader className="border-b border-border/70 pb-4">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <CardTitle className="text-xl">Task Ledger</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  Filter the team backlog by assignee, status, priority, tags, and deadline windows.
                </p>
              </div>

              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Badge variant="secondary" className="rounded-full px-3 py-1">
                  {filteredTasks.length} matching tasks
                </Badge>
                {hasActiveFilters ? (
                  <Button variant="ghost" size="sm" onClick={resetFilters}>
                    Clear filters
                  </Button>
                ) : null}
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-5 p-4">
            <div className="grid gap-4 xl:grid-cols-[1.35fr_repeat(5,minmax(0,1fr))]">
              <div className="space-y-2 xl:col-span-1">
                <Label htmlFor="task-search" className="flex items-center gap-2">
                  <Search className="h-4 w-4 text-muted-foreground" />
                  Search
                </Label>
                <Input
                  id="task-search"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search title, lead reference, assignee, or tag..."
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="assignee-filter">Assignee</Label>
                <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
                  <SelectTrigger id="assignee-filter">
                    <SelectValue placeholder="All assignees" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Assignees</SelectItem>
                    <SelectItem value="mine">My Tasks</SelectItem>
                    {assigneeOptions.map((option) => (
                      <SelectItem key={option.key} value={option.key}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="deadline-filter" className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-muted-foreground" />
                  Deadline
                </Label>
                <Select
                  value={deadlineFilter}
                  onValueChange={(value) => setDeadlineFilter(value as TaskDeadlineFilter)}
                >
                  <SelectTrigger id="deadline-filter">
                    <SelectValue placeholder="All deadlines" />
                  </SelectTrigger>
                  <SelectContent>
                    {TASK_DEADLINE_FILTER_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Status</Label>
                <MultiSelect
                  options={TASK_STATUS_OPTIONS.map((option) => ({
                    value: option.value,
                    label: option.label,
                  }))}
                  selected={statusFilters}
                  onChange={(selected) => setStatusFilters(selected as TaskStatus[])}
                  placeholder="All statuses"
                  className={defaultMultiSelectClass}
                />
              </div>

              <div className="space-y-2">
                <Label>Priority</Label>
                <MultiSelect
                  options={TASK_PRIORITY_OPTIONS.map((option) => ({
                    value: option.value,
                    label: option.label,
                  }))}
                  selected={priorityFilters}
                  onChange={(selected) => setPriorityFilters(selected as TaskPriority[])}
                  placeholder="All priorities"
                  className={defaultMultiSelectClass}
                />
              </div>

              <div className="space-y-2">
                <Label>Tags</Label>
                <MultiSelect
                  options={TASK_TAG_OPTIONS.map((option) => ({
                    value: option.value,
                    label: option.label,
                  }))}
                  selected={tagFilters}
                  onChange={setTagFilters}
                  placeholder="All tags"
                  className={defaultMultiSelectClass}
                />
              </div>
            </div>

            <div className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-muted/25 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Calendar mode</p>
                <p className="text-sm text-muted-foreground">
                  Hide completed tasks to keep the schedule focused on work that still needs movement.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">Show completed</span>
                <Switch checked={showCompleted} onCheckedChange={setShowCompleted} />
              </div>
            </div>

            <div className="space-y-3">
              {filteredTasks.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border/70 px-6 py-14 text-center">
                  <p className="text-base font-medium text-foreground">No tasks match the current filters</p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Adjust the filters or create a new task to populate the board.
                  </p>
                </div>
              ) : (
                filteredTasks.map((task) => (
                  <button
                    key={task.id}
                    type="button"
                    onClick={() => openTaskDetails(task)}
                    className="group w-full rounded-3xl border border-border/70 bg-background px-4 py-4 text-left transition hover:border-primary/30 hover:bg-primary/5 hover:shadow-md"
                  >
                    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(140px,0.7fr)_minmax(160px,0.8fr)_minmax(170px,0.9fr)]">
                      <div className="flex items-start gap-3">
                        <span
                          className={cn(
                            "mt-1 h-10 w-1.5 shrink-0 rounded-full",
                            TASK_PRIORITY_META[task.priority].railClassName,
                          )}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-base font-semibold text-foreground">
                              {task.title}
                            </p>
                            <Badge variant="outline" className={TASK_STATUS_META[task.status].badgeClassName}>
                              {TASK_STATUS_META[task.status].label}
                            </Badge>
                            <Badge variant="outline" className={TASK_PRIORITY_META[task.priority].badgeClassName}>
                              {TASK_PRIORITY_META[task.priority].label}
                            </Badge>
                          </div>

                          {task.description ? (
                            <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">
                              {task.description}
                            </p>
                          ) : null}

                          <div className="mt-3 flex flex-wrap gap-2">
                            {task.tags.map((tag) => (
                              <Badge key={tag} variant="secondary" className="rounded-full px-2.5 py-1 text-xs">
                                {formatTaskTag(tag)}
                              </Badge>
                            ))}
                            {task.lead_reference ? (
                              <Badge variant="outline" className="rounded-full px-2.5 py-1 text-xs">
                                Lead {task.lead_reference}
                              </Badge>
                            ) : null}
                            {task.lead_name ? (
                              <Badge variant="outline" className="rounded-full px-2.5 py-1 text-xs">
                                {task.lead_name}
                              </Badge>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                          Assignee
                        </p>
                        <p className="text-sm font-medium text-foreground">
                          {task.assignee_name}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Assigned by {task.created_by_name}
                        </p>
                      </div>

                      <div className="space-y-1">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                          Dates
                        </p>
                        <p className="text-sm font-medium text-foreground">
                          Assigned {formatTaskDate(task.assigned_date)}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Due {formatTaskDate(task.deadline_date)}
                        </p>
                      </div>

                      <div className="space-y-1">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                          Deadline Signal
                        </p>
                        <p className="text-sm font-medium text-primary">
                          {getRelativeDeadlineLabel(task, todayDateKey)}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Updated {format(new Date(task.updated_at), "MMM d, h:mm a")}
                        </p>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <TaskFormDialog
        open={taskDialogOpen}
        initialTask={editingTask}
        assigneeOptions={assigneeOptions}
        currentUserAssignee={currentUserAssignee}
        leadOptions={leadSearchResults}
        leadSearchLoading={leadSearchLoading}
        onLeadSearch={searchLeadReferences}
        onOpenChange={(open) => {
          setTaskDialogOpen(open);
          if (!open) {
            setEditingTask(null);
            setLeadSearchResults([]);
          }
        }}
        onSave={handleSaveTask}
      />

      <TaskDetailsSheet
        open={detailOpen}
        task={selectedTask}
        notes={taskNotes}
        loadingNotes={loadingNotes}
        todayDateKey={todayDateKey}
        onOpenChange={setDetailOpen}
        onEdit={openEditDialog}
        onUpdateStatus={handleUpdateTaskStatus}
        onAddNote={handleAddTaskNote}
      />
    </div>
  );
};

interface MetricCardProps {
  title: string;
  value: number;
  tone: string;
  accent: string;
  icon: ReactNode;
  description: string;
}

function MetricCard({ title, value, tone, accent, icon, description }: MetricCardProps) {
  return (
    <Card className={cn("border-border/70 bg-gradient-to-br shadow-sm", tone)}>
      <CardContent className="px-5 py-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {title}
            </p>
            <p className={cn("text-3xl font-semibold tracking-tight", accent)}>{value}</p>
            <p className="text-sm leading-6 text-muted-foreground">{description}</p>
          </div>
          <div className={cn("rounded-2xl border border-white/70 bg-white/70 p-3", accent)}>
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default TaskManagementPage;
