import { type DragEvent, useCallback, useEffect, useMemo, useState } from "react";
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
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Filter,
  LayoutList,
  Plus,
  RefreshCw,
  Search,
  Users2,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MultiSelect } from "@/components/ui/multi-select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatisticsCard5 } from "@/components/ui/statistics-card-5";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { usePipelineStages } from "@/hooks/usePipelineStages";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import {
  fetchLicensedCloserOptions,
  formatAgentLabelFromEmail,
} from "@/lib/agentOptions";
import {
  getLeadDispositionStageLabel,
  resolveStoredLeadDispositionStageKey,
  updateLeadDispositionStatus,
  type LeadDispositionPipeline,
  type LeadDispositionStagesByPipeline,
} from "@/lib/leadDisposition";
import { getPortalRoleFlags } from "@/lib/userPermissions";
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

type QueryResult<T> = Promise<{ data: T | null; error: unknown }>;
type LeadRow = Pick<
  Database["public"]["Tables"]["leads"]["Row"],
  "id" | "submission_id" | "customer_full_name" | "phone_number" | "is_active" | "status"
>;

type TaskManagementDbClient = {
  from(table: "closer_tasks"): {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        order: (column: string, options?: { ascending: boolean }) => QueryResult<CloserTask[]>;
      };
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
    delete: () => {
      eq: (column: string, value: string) => QueryResult<null>;
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

type TaskViewMode = "list" | "calendar" | "kanban";

interface AgentSummary {
  key: string;
  label: string;
  openTotal: number;
  pending: number;
  overdue: number;
  inProgress: number;
  completed: number;
  nextDeadline: string | null;
}

const buildAgentSummaries = (
  options: TaskAssigneeOption[],
  tasks: CloserTask[],
  todayDateKey: string,
): AgentSummary[] => {
  const today = parseISO(todayDateKey);

  return options
    .map<AgentSummary>((option) => {
      const ownTasks = tasks.filter(
        (task) => task.assignee_user_id === option.key,
      );
      const openTasks = ownTasks.filter(isTaskOpen);
      const sortedDeadlines = openTasks
        .map((task) => task.deadline_date)
        .sort();

      return {
        key: option.key,
        label: option.label,
        openTotal: openTasks.length,
        pending: ownTasks.filter((task) => task.status === "waiting").length,
        overdue: openTasks.filter(
          (task) => parseISO(task.deadline_date) < today,
        ).length,
        inProgress: ownTasks.filter((task) => task.status === "in_progress").length,
        completed: ownTasks.filter((task) => task.status === "completed").length,
        nextDeadline: sortedDeadlines[0] ?? null,
      };
    })
    .sort((left, right) => left.label.localeCompare(right.label));
};

const KANBAN_COLUMNS: TaskStatus[] = ["waiting", "todo", "in_progress", "completed"];
const TASK_PRIORITY_CARD_STYLES: Record<
  TaskPriority,
  { borderClassName: string; gradientClassName: string }
> = {
  high: {
    borderClassName: "border-rose-500/35 hover:border-rose-400/70",
    gradientClassName: "from-rose-500/25 via-rose-500/10",
  },
  medium: {
    borderClassName: "border-amber-400/35 hover:border-amber-300/70",
    gradientClassName: "from-amber-400/25 via-amber-400/10",
  },
  low: {
    borderClassName: "border-emerald-400/30 hover:border-emerald-300/65",
    gradientClassName: "from-emerald-400/20 via-emerald-400/10",
  },
};

const TaskManagementPage = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const { stages: transferStages, loading: transferStagesLoading } = usePipelineStages("transfer_portal");
  const { stages: submissionStages, loading: submissionStagesLoading } = usePipelineStages("submission_portal");
  const { stages: closerStages, loading: closerStagesLoading } = usePipelineStages("closer_portal");

  const [isAdmin, setIsAdmin] = useState(() => {
    if (!user?.id) return false;
    try {
      return localStorage.getItem(`cg_is_admin:${user.id}`) === "1";
    } catch {
      return false;
    }
  });
  const [isAgentRole, setIsAgentRole] = useState(false);
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
  const [taskViewMode, setTaskViewMode] = useState<TaskViewMode>("list");

  const [calendarMonth, setCalendarMonth] = useState(startOfMonth(new Date()));
  const todayDateKey = toDateKey(new Date());
  const [selectedDate, setSelectedDate] = useState(todayDateKey);

  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<CloserTask | null>(null);
  const [presetAssignee, setPresetAssignee] = useState<TaskAssigneeOption | null>(null);

  const [selectedTask, setSelectedTask] = useState<CloserTask | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [taskNotes, setTaskNotes] = useState<CloserTaskNote[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const isAgentTaskView = isAgentRole && !isAdmin;
  const canAccessTaskManagement = isAdmin || isAgentRole;
  const leadDispositionStages = useMemo<LeadDispositionStagesByPipeline>(
    () => ({
      transfer_portal: transferStages,
      submission_portal: submissionStages,
      closer_portal: closerStages,
    }),
    [closerStages, submissionStages, transferStages],
  );
  const leadDispositionStagesLoading =
    transferStagesLoading || submissionStagesLoading || closerStagesLoading;

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
      .eq("portal", "closer")
      .order("deadline_date", { ascending: true });

    if (error) {
      throw error;
    }

    const taskRows = ((data || []) as CloserTask[])
      .map((task) => ({
        ...task,
        tags: Array.isArray(task.tags) ? task.tags : [],
      }))
      .filter((task) => (
        isAdmin ||
        !user?.id ||
        task.assignee_user_id === user.id ||
        task.created_by === user.id
      ));

    const leadIds = Array.from(
      new Set(taskRows.map((task) => task.lead_id).filter(Boolean)),
    ) as string[];
    const leadReferences = Array.from(
      new Set(taskRows.map((task) => task.lead_reference).filter(Boolean)),
    ) as string[];

    if (leadIds.length === 0 && leadReferences.length === 0) {
      return taskRows;
    }

    const [leadIdsResult, leadReferencesResult] = await Promise.all([
      leadIds.length > 0
        ? supabase
            .from("leads")
            .select("id, submission_id, customer_full_name, phone_number, is_active, status")
            .in("id", leadIds)
        : Promise.resolve({ data: [] as LeadRow[], error: null }),
      leadReferences.length > 0
        ? supabase
            .from("leads")
            .select("id, submission_id, customer_full_name, phone_number, is_active, status")
            .in("submission_id", leadReferences)
        : Promise.resolve({ data: [] as LeadRow[], error: null }),
    ]);

    if (leadIdsResult.error) {
      throw leadIdsResult.error;
    }

    if (leadReferencesResult.error) {
      throw leadReferencesResult.error;
    }

    const leadById = new Map<string, LeadRow>();
    const leadBySubmissionId = new Map<string, LeadRow>();
    ([...(leadIdsResult.data || []), ...(leadReferencesResult.data || [])] as LeadRow[]).forEach((lead) => {
      leadById.set(lead.id, lead);
      if (lead.submission_id) {
        leadBySubmissionId.set(lead.submission_id, lead);
      }
    });

    return taskRows.map((task) => {
      const lead =
        (task.lead_id ? leadById.get(task.lead_id) : undefined) ||
        (task.lead_reference ? leadBySubmissionId.get(task.lead_reference) : undefined);
      return {
        ...task,
        lead_id: task.lead_id || lead?.id || null,
        lead_reference: task.lead_reference || lead?.submission_id || null,
        lead_name: lead?.customer_full_name || null,
        lead_phone_number: lead?.phone_number || null,
        lead_status: lead?.status || null,
      };
    });
  }, [isAdmin, user?.id]);

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
        isAdmin ? fetchCloserAssigneeOptions() : Promise.resolve([]),
        fetchTasks(),
      ]);

      const me = { key: user.id, label: userLabel };
      const nextAssignees = isAdmin ? dedupeAssignees([me, ...closerAssignees]) : [me];

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
  }, [fetchCloserAssigneeOptions, fetchTasks, isAdmin, resolveCurrentUserLabel, toast, user]);

  useEffect(() => {
    if (!user) {
      navigate("/auth");
      return;
    }

    let isMounted = true;

    const checkAccess = async () => {
      const roleFlags = await getPortalRoleFlags(user.id);

      if (!isMounted) return;

      try {
        localStorage.setItem(`cg_is_admin:${user.id}`, roleFlags.isAdmin ? "1" : "0");
      } catch {
        // Ignore cache write failures.
      }

      setIsAdmin(roleFlags.isAdmin);
      setIsAgentRole(roleFlags.isAgent);
      setCheckingAccess(false);

      if (!roleFlags.canAccessTaskManagement) {
        toast({
          title: "Access denied",
          description: "Task Management is reserved for admins and agents.",
          variant: "destructive",
        });
        navigate("/closer-portal", { replace: true });
      }
    };

    checkAccess();

    return () => {
      isMounted = false;
    };
  }, [navigate, toast, user]);

  useEffect(() => {
    if (!canAccessTaskManagement) return;
    void loadData();
  }, [canAccessTaskManagement, loadData]);

  useEffect(() => {
    if (!canAccessTaskManagement) return;

    const channel = supabase
      .channel("closer-task-management")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "closer_tasks",
          filter: "portal=eq.closer",
        },
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
  }, [canAccessTaskManagement, fetchTaskNotes, loadData, selectedTask?.id]);

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

  useEffect(() => {
    if (!isAgentTaskView) return;
    setAssigneeFilter("mine");
  }, [isAgentTaskView]);

  const filteredTasks = useMemo(() => {
    let nextTasks = [...tasks];

    if (isAgentTaskView) {
      nextTasks = nextTasks.filter((task) => task.assignee_user_id === user?.id);
    }

    if (!isAgentTaskView && assigneeFilter === "mine") {
      nextTasks = nextTasks.filter((task) => task.assignee_user_id === user?.id);
    } else if (!isAgentTaskView && assigneeFilter !== "all") {
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
    isAgentTaskView,
    priorityFilters,
    searchTerm,
    statusFilters,
    tagFilters,
    tasks,
    todayDateKey,
    user?.id,
  ]);

  const deadlineSortedTasks = useMemo(
    () =>
      [...filteredTasks].sort((left, right) => {
        const leftDeadline = parseISO(left.deadline_date).getTime();
        const rightDeadline = parseISO(right.deadline_date).getTime();

        if (leftDeadline !== rightDeadline) {
          return leftDeadline - rightDeadline;
        }

        return right.created_at.localeCompare(left.created_at);
      }),
    [filteredTasks],
  );

  const assigneeFocusLabel = useMemo(() => {
    if (assigneeFilter === "all") return "All Assignees";
    if (assigneeFilter === "mine") return currentUserLabel || "My Tasks";
    return (
      assigneeOptions.find((option) => option.key === assigneeFilter)?.label ||
      "Focused Assignee"
    );
  }, [assigneeFilter, assigneeOptions, currentUserLabel]);

  const metricTasks = useMemo(() => {
    if (isAgentTaskView) {
      return tasks.filter((task) => task.assignee_user_id === user?.id);
    }
    return tasks;
  }, [isAgentTaskView, tasks, user?.id]);

  const metrics = useMemo(() => {
    const today = parseISO(todayDateKey);
    const startOfCurrentWeek = startOfWeek(today, { weekStartsOn: 0 });
    const endOfCurrentWeek = endOfWeek(today, { weekStartsOn: 0 });

    return {
      openTasks: metricTasks.filter((task) => isTaskOpen(task)).length,
      pending: metricTasks.filter((task) => task.status === "waiting").length,
      overdue: metricTasks.filter((task) => {
        if (!isTaskOpen(task)) return false;
        return parseISO(task.deadline_date) < today;
      }).length,
      completedThisWeek: metricTasks.filter((task) => {
        if (!task.completed_at) return false;
        const completedDate = new Date(task.completed_at);
        return completedDate >= startOfCurrentWeek && completedDate <= endOfCurrentWeek;
      }).length,
    };
  }, [metricTasks, todayDateKey]);

  const kanbanColumns = useMemo(
    () =>
      KANBAN_COLUMNS.map((status) => ({
        status,
        tasks: filteredTasks.filter((task) => task.status === status),
      })),
    [filteredTasks],
  );

  const agentSummaries = useMemo(() => {
    if (isAgentTaskView) return [];
    const assigneePool = assigneeOptions.length > 0
      ? assigneeOptions
      : (currentUserAssignee ? [currentUserAssignee] : []);
    return buildAgentSummaries(assigneePool, tasks, todayDateKey);
  }, [assigneeOptions, currentUserAssignee, isAgentTaskView, tasks, todayDateKey]);

  const greetingName = currentUserLabel || formatAgentLabelFromEmail(user?.email || "") || "there";
  const boardScopeLabel = isAgentTaskView ? "My Tasks" : assigneeFocusLabel;
  const boardTaskCount = filteredTasks.length;
  const activeFilterCount = [
    Boolean(searchTerm.trim()),
    !isAgentTaskView && assigneeFilter !== "all",
    deadlineFilter !== "all",
    statusFilters.length > 0,
    priorityFilters.length > 0,
    tagFilters.length > 0,
  ].filter(Boolean).length;
  const statisticsSegments = useMemo(
    () => [
      {
        label: "Open",
        value: metrics.openTasks,
        colorClassName: "bg-white",
      },
      {
        label: "Pending",
        value: metrics.pending,
        colorClassName: "bg-amber-400",
      },
      {
        label: "Overdue",
        value: metrics.overdue,
        colorClassName: "bg-rose-500",
      },
      {
        label: "Completed",
        value: metrics.completedThisWeek,
        colorClassName: "bg-emerald-500",
      },
    ],
    [metrics.completedThisWeek, metrics.openTasks, metrics.overdue, metrics.pending],
  );

  const hasActiveFilters = activeFilterCount > 0;

  const openTaskDetails = (task: CloserTask) => {
    setSelectedTask(task);
    setDetailOpen(true);
  };

  const openCreateDialog = (preset: TaskAssigneeOption | null = null) => {
    setEditingTask(null);
    setPresetAssignee(preset);
    setTaskDialogOpen(true);
  };

  const focusAssignee = useCallback((key: string) => {
    setAssigneeFilter(key);
  }, []);

  const canEditTask = useCallback((task: CloserTask | null) => {
    if (!task || !user?.id) return false;
    return isAdmin || task.assignee_user_id === user.id;
  }, [isAdmin, user?.id]);

  const openEditDialog = (task: CloserTask) => {
    if (!canEditTask(task)) {
      toast({
        title: "Edit unavailable",
        description: "You can only edit tasks assigned to you.",
        variant: "destructive",
      });
      return;
    }

    setEditingTask(task);
    setTaskDialogOpen(true);
  };

  const resetFilters = () => {
    setSearchTerm("");
    setAssigneeFilter(isAgentTaskView ? "mine" : "all");
    setDeadlineFilter("all");
    setStatusFilters([]);
    setPriorityFilters([]);
    setTagFilters([]);
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

    if (editingTask && !canEditTask(editingTask)) {
      toast({
        title: "Unable to save task",
        description: "You can only update tasks assigned to you.",
        variant: "destructive",
      });
      throw new Error("Task edit is outside the current user's scope.");
    }

    const assigneeUserId = isAgentTaskView ? user.id : values.assigneeUserId;
    const assigneeName = isAgentTaskView ? currentUserLabel : values.assigneeName;

    const payload = {
      title: values.title,
      description: safeTrimmedValue(values.description),
      lead_id: safeTrimmedValue(values.leadId),
      lead_reference: safeTrimmedValue(values.leadReference),
      assignee_user_id: assigneeUserId,
      assignee_name: assigneeName,
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
            portal: "closer",
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
    if (!canEditTask(task)) {
      toast({
        title: "Unable to update status",
        description: "You can only update tasks assigned to you.",
        variant: "destructive",
      });
      throw new Error("Task status update is outside the current user's scope.");
    }

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

  const handleUpdateLeadDisposition = async (
    task: CloserTask,
    pipeline: LeadDispositionPipeline,
    stageKey: string,
  ) => {
    if (!canAccessTaskManagement) {
      toast({
        title: "Unable to update lead",
        description: "Your role does not allow lead disposition changes.",
        variant: "destructive",
      });
      throw new Error("Lead disposition update is outside the current user's scope.");
    }

    const nextStatus = resolveStoredLeadDispositionStageKey(
      pipeline,
      stageKey,
      leadDispositionStages,
    );

    if (!nextStatus) {
      toast({
        title: "Unable to update lead",
        description: "Select a pipeline stage before saving.",
        variant: "destructive",
      });
      throw new Error("Lead disposition stage is required.");
    }

    try {
      const result = await updateLeadDispositionStatus({
        leadId: task.lead_id,
        submissionId: task.lead_reference,
        status: nextStatus,
      });

      const nextStageLabel = getLeadDispositionStageLabel(
        result.status,
        leadDispositionStages,
      );

      setTasks((currentTasks) =>
        currentTasks.map((currentTask) =>
          currentTask.id === task.id
            ? {
                ...currentTask,
                lead_id: result.leadId || currentTask.lead_id,
                lead_reference: result.submissionId || currentTask.lead_reference,
                lead_status: result.status,
              }
            : currentTask,
        ),
      );
      setSelectedTask((currentTask) =>
        currentTask?.id === task.id
          ? {
              ...currentTask,
              lead_id: result.leadId || currentTask.lead_id,
              lead_reference: result.submissionId || currentTask.lead_reference,
              lead_status: result.status,
            }
          : currentTask,
      );

      toast({
        title: "Lead disposition updated",
        description: `${task.lead_name || task.lead_reference || "Lead"} moved to ${
          nextStageLabel || result.status
        }.`,
      });

      await loadData();
    } catch (error) {
      console.error("Error updating lead disposition:", error);
      toast({
        title: "Unable to update lead",
        description: "The lead pipeline and stage could not be updated.",
        variant: "destructive",
      });
      throw error;
    }
  };

  const handleDeleteTask = async (task: CloserTask) => {
    if (!isAdmin) {
      toast({
        title: "Unable to delete task",
        description: "Only admins can delete tasks.",
        variant: "destructive",
      });
      throw new Error("Task deletion requires admin access.");
    }

    try {
      const { error } = await taskDb
        .from("closer_tasks")
        .delete()
        .eq("id", task.id);

      if (error) {
        throw error;
      }

      toast({
        title: "Task deleted",
        description: `${task.title} was removed from the board.`,
      });

      setDetailOpen(false);
      setSelectedTask(null);
      await loadData();
    } catch (error) {
      console.error("Error deleting task:", error);
      toast({
        title: "Unable to delete task",
        description: "The task could not be removed. Please try again.",
        variant: "destructive",
      });
      throw error;
    }
  };

  const handleAddTaskNote = async (task: CloserTask, content: string) => {
    if (!canEditTask(task)) {
      toast({
        title: "Unable to add note",
        description: "You can only add notes to tasks assigned to you.",
        variant: "destructive",
      });
      throw new Error("Task note is outside the current user's scope.");
    }

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

  if (!canAccessTaskManagement) {
    return null;
  }

  return (
    <div className="min-h-full overflow-hidden bg-background">
      <div className="relative min-h-full">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,hsl(var(--primary)/0.15),transparent_34%),radial-gradient(circle_at_86%_12%,hsl(var(--accent)/0.13),transparent_30%)]" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />

        <div className="relative mx-auto flex w-full max-w-[1800px] flex-col gap-5 px-4 py-4 lg:px-6 lg:py-6">
          <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(380px,480px)] xl:items-end animate-in fade-in slide-in-from-bottom-2 duration-500 fill-mode-both">
            <div className="min-w-0 space-y-3">
              <Badge
                variant="outline"
                className="rounded-full border-primary/30 bg-primary/10 px-3 py-1 text-primary"
              >
                {isAgentTaskView ? "Closer task workspace" : "Admin task control center"}
              </Badge>
              <div className="space-y-2">
                <h1 className="text-3xl font-semibold tracking-tight text-foreground lg:text-4xl">
                  Hello, {greetingName}
                </h1>
                <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                  {isAgentTaskView
                    ? "Review your workload, create self-assigned tasks, and move each item through the closer pipeline."
                    : "Manage closer assignments, inspect deadline pressure, and keep the team task board current."}
                </p>
              </div>
            </div>

            <StatisticsCard5
              title="Task Signal"
              caption={isAgentTaskView ? `Attached to ${greetingName}` : undefined}
              segments={statisticsSegments}
            />
          </section>

          <div className="grid gap-5">
            {!isAgentTaskView && agentSummaries.length > 0 ? (
              <div className="animate-in fade-in slide-in-from-bottom-2 duration-500 delay-100 fill-mode-both">
                <AgentsOverviewPanel
                  summaries={agentSummaries}
                  activeAssigneeKey={assigneeFilter}
                  currentUserKey={currentUserAssignee?.key ?? null}
                  onFocusAgent={focusAssignee}
                  onAssignToAgent={(option) => openCreateDialog(option)}
                />
              </div>
            ) : null}

            <Card className={cn(
              "overflow-hidden border-0 bg-zinc-950 text-white shadow-xl shadow-black/20 ring-1 ring-white/10 [--accent:240_3.7%_15.9%] [--accent-foreground:0_0%_98%] [--background:240_10%_3.9%] [--border:240_3.7%_15.9%] [--card-foreground:0_0%_98%] [--card:240_10%_3.9%] [--foreground:0_0%_98%] [--input:240_3.7%_15.9%] [--muted-foreground:240_5%_64.9%] [--muted:240_3.7%_15.9%] [--popover-foreground:0_0%_98%] [--popover:240_10%_3.9%] [--secondary-foreground:0_0%_98%] [--secondary:240_3.7%_15.9%]",
              "animate-in fade-in slide-in-from-bottom-2 duration-500 fill-mode-both",
              isAgentTaskView ? "delay-100" : "delay-200",
            )}>
              <CardHeader className="border-b border-border/60 px-4 py-4 lg:px-5">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle className="text-xl font-semibold">
                        {boardScopeLabel}
                      </CardTitle>
                      <Badge variant="secondary" className="rounded-full px-2.5 py-1 text-xs">
                        {boardTaskCount} task{boardTaskCount === 1 ? "" : "s"}
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Search, filter, and switch views without leaving the active task workspace.
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      className="border-border/70 bg-background/60 backdrop-blur"
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
                </div>

                <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <Tabs
                      value={taskViewMode}
                      onValueChange={(value) => setTaskViewMode(value as TaskViewMode)}
                      className="w-full sm:w-auto"
                    >
                      <TabsList className="grid h-11 w-full grid-cols-3 rounded-xl border border-zinc-800 bg-zinc-900 p-1 sm:w-[380px]">
                        <TabsTrigger
                          value="list"
                          className="gap-2 rounded-lg text-zinc-400 data-[state=active]:bg-white data-[state=active]:text-zinc-950"
                        >
                          <LayoutList className="h-4 w-4" />
                          List
                        </TabsTrigger>
                        <TabsTrigger
                          value="calendar"
                          className="gap-2 rounded-lg text-zinc-400 data-[state=active]:bg-white data-[state=active]:text-zinc-950"
                        >
                          <CalendarDays className="h-4 w-4" />
                          Calendar
                        </TabsTrigger>
                        <TabsTrigger
                          value="kanban"
                          className="gap-2 rounded-lg text-zinc-400 data-[state=active]:bg-white data-[state=active]:text-zinc-950"
                        >
                          <Columns3 className="h-4 w-4" />
                          Kanban
                        </TabsTrigger>
                      </TabsList>
                    </Tabs>

                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          className="h-11 justify-between border-zinc-800 bg-zinc-900 text-zinc-100 hover:bg-zinc-800 hover:text-white sm:min-w-[132px]"
                        >
                          <span className="inline-flex items-center gap-2">
                            <Filter className="h-4 w-4" />
                            Filters
                          </span>
                          {activeFilterCount > 0 ? (
                            <Badge className="ml-2 rounded-full bg-white px-2 py-0.5 text-[10px] text-zinc-950">
                              {activeFilterCount}
                            </Badge>
                          ) : null}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent
                        align="start"
                        className="w-[min(92vw,760px)] border-zinc-800 bg-zinc-950 p-4 text-white shadow-2xl shadow-black/30 [--accent:240_3.7%_15.9%] [--accent-foreground:0_0%_98%] [--background:240_10%_3.9%] [--border:240_3.7%_15.9%] [--foreground:0_0%_98%] [--input:240_3.7%_15.9%] [--muted-foreground:240_5%_64.9%] [--muted:240_3.7%_15.9%] [--popover-foreground:0_0%_98%] [--popover:240_10%_3.9%] [--secondary-foreground:0_0%_98%] [--secondary:240_3.7%_15.9%]"
                      >
                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                          <div className="space-y-2 xl:col-span-2">
                            <Label
                              htmlFor="task-search"
                              className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500"
                            >
                              <Search className="h-4 w-4" />
                              Search
                            </Label>
                            <div className="relative">
                              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                              <Input
                                id="task-search"
                                value={searchTerm}
                                onChange={(event) => setSearchTerm(event.target.value)}
                                placeholder="Title, lead, assignee, tag..."
                                className="h-10 border-zinc-800 bg-zinc-900 pl-9 text-zinc-100 placeholder:text-zinc-600"
                              />
                            </div>
                          </div>

                          {!isAgentTaskView ? (
                            <div className="space-y-2">
                              <Label
                                htmlFor="assignee-filter"
                                className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500"
                              >
                                Assignee
                              </Label>
                              <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
                                <SelectTrigger id="assignee-filter" className="h-10 border-zinc-800 bg-zinc-900 text-zinc-100">
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
                          ) : null}

                          <div className="space-y-2">
                            <Label
                              htmlFor="deadline-filter"
                              className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500"
                            >
                              Deadline
                            </Label>
                            <Select
                              value={deadlineFilter}
                              onValueChange={(value) => setDeadlineFilter(value as TaskDeadlineFilter)}
                            >
                              <SelectTrigger id="deadline-filter" className="h-10 border-zinc-800 bg-zinc-900 text-zinc-100">
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
                            <Label className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
                              Status
                            </Label>
                            <MultiSelect
                              options={TASK_STATUS_OPTIONS.map((option) => ({
                                value: option.value,
                                label: option.label,
                              }))}
                              selected={statusFilters}
                              onChange={(selected) => setStatusFilters(selected as TaskStatus[])}
                              placeholder="All statuses"
                              className="w-full border-zinc-800 bg-zinc-900 text-zinc-100 hover:bg-zinc-800 hover:text-white"
                            />
                          </div>

                          <div className="space-y-2">
                            <Label className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
                              Priority
                            </Label>
                            <MultiSelect
                              options={TASK_PRIORITY_OPTIONS.map((option) => ({
                                value: option.value,
                                label: option.label,
                              }))}
                              selected={priorityFilters}
                              onChange={(selected) => setPriorityFilters(selected as TaskPriority[])}
                              placeholder="All priorities"
                              className="w-full border-zinc-800 bg-zinc-900 text-zinc-100 hover:bg-zinc-800 hover:text-white"
                            />
                          </div>

                          <div className="space-y-2">
                            <Label className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
                              Tags
                            </Label>
                            <MultiSelect
                              options={TASK_TAG_OPTIONS.map((option) => ({
                                value: option.value,
                                label: option.label,
                              }))}
                              selected={tagFilters}
                              onChange={setTagFilters}
                              placeholder="All tags"
                              className="w-full border-zinc-800 bg-zinc-900 text-zinc-100 hover:bg-zinc-800 hover:text-white"
                            />
                          </div>
                        </div>

                        {hasActiveFilters ? (
                          <div className="mt-4 flex justify-end border-t border-zinc-800 pt-4">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="text-zinc-300 hover:bg-zinc-800 hover:text-white"
                              onClick={resetFilters}
                            >
                              Clear filters
                            </Button>
                          </div>
                        ) : null}
                      </PopoverContent>
                    </Popover>
                  </div>

                  {taskViewMode === "calendar" ? (
                    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/60 bg-background/50 p-1.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => setCalendarMonth((previous) => addMonths(previous, -1))}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <div className="flex min-w-[170px] items-center justify-center gap-2 px-2 text-sm font-semibold">
                        <CalendarRange className="h-4 w-4 text-primary" />
                        {format(calendarMonth, "MMMM yyyy")}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => setCalendarMonth((previous) => addMonths(previous, 1))}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : null}
                </div>
              </CardHeader>

              <CardContent className="space-y-4 p-4 lg:p-5">
                {taskViewMode === "list" ? (
                  <TaskListPanel
                    tasks={deadlineSortedTasks}
                    todayDateKey={todayDateKey}
                    onOpenTask={openTaskDetails}
                    emptyDescription={
                      isAgentTaskView
                        ? "Adjust the filters or create a new self-assigned task."
                        : "Adjust the filters or create a new task to populate the board."
                    }
                  />
                ) : null}

                {taskViewMode === "calendar" ? (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">Priority legend:</span>
                      {(["high", "medium", "low"] as TaskPriority[]).map((priority) => (
                        <span
                          key={priority}
                          className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/45 px-2.5 py-1"
                        >
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
                  </div>
                ) : null}

                {taskViewMode === "kanban" ? (
                  <TaskKanbanPanel
                    columns={kanbanColumns}
                    todayDateKey={todayDateKey}
                    onOpenTask={openTaskDetails}
                    onMoveTask={(task, status) => {
                      if (task.status !== status) {
                        void handleUpdateTaskStatus(task, status).catch(() => undefined);
                      }
                    }}
                  />
                ) : null}
              </CardContent>
            </Card>

          </div>
        </div>
      </div>

      <TaskFormDialog
        open={taskDialogOpen}
        initialTask={editingTask}
        initialAssignee={presetAssignee}
        assigneeOptions={assigneeOptions}
        currentUserAssignee={currentUserAssignee}
        selfAssignOnly={isAgentTaskView}
        leadOptions={leadSearchResults}
        leadSearchLoading={leadSearchLoading}
        onLeadSearch={searchLeadReferences}
        onOpenChange={(open) => {
          setTaskDialogOpen(open);
          if (!open) {
            setEditingTask(null);
            setPresetAssignee(null);
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
        canEditTask={canEditTask(selectedTask)}
        canDeleteTask={isAdmin}
        canUpdateLeadDisposition={canAccessTaskManagement}
        leadDispositionStages={leadDispositionStages}
        leadDispositionStagesLoading={leadDispositionStagesLoading}
        onOpenChange={setDetailOpen}
        onEdit={openEditDialog}
        onUpdateStatus={handleUpdateTaskStatus}
        onUpdateLeadDisposition={handleUpdateLeadDisposition}
        onAddNote={handleAddTaskNote}
        onDelete={handleDeleteTask}
      />
    </div>
  );
};

interface TaskListPanelProps {
  tasks: CloserTask[];
  todayDateKey: string;
  onOpenTask: (task: CloserTask) => void;
  emptyDescription: string;
}

function TaskListPanel({
  tasks,
  todayDateKey,
  onOpenTask,
  emptyDescription,
}: TaskListPanelProps) {
  if (tasks.length === 0) {
    return <EmptyTaskState description={emptyDescription} />;
  }

  return (
    <div className="space-y-3">
      {tasks.map((task) => (
        <TaskPreviewButton
          key={task.id}
          task={task}
          todayDateKey={todayDateKey}
          onOpenTask={onOpenTask}
        />
      ))}
    </div>
  );
}

interface TaskKanbanPanelProps {
  columns: Array<{ status: TaskStatus; tasks: CloserTask[] }>;
  todayDateKey: string;
  onOpenTask: (task: CloserTask) => void;
  onMoveTask: (task: CloserTask, status: TaskStatus) => void;
}

function TaskKanbanPanel({
  columns,
  todayDateKey,
  onOpenTask,
  onMoveTask,
}: TaskKanbanPanelProps) {
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<TaskStatus | null>(null);
  const taskCount = columns.reduce((count, column) => count + column.tasks.length, 0);
  const taskById = useMemo(() => {
    const map = new Map<string, CloserTask>();

    columns.forEach((column) => {
      column.tasks.forEach((task) => {
        map.set(task.id, task);
      });
    });

    return map;
  }, [columns]);

  const handleDragStart = (event: DragEvent<HTMLButtonElement>, task: CloserTask) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", task.id);
    setDraggingTaskId(task.id);
  };

  const handleDragEnd = () => {
    setDraggingTaskId(null);
    setDragOverStatus(null);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>, status: TaskStatus) => {
    event.preventDefault();

    const taskId = event.dataTransfer.getData("text/plain") || draggingTaskId;
    const draggedTask = taskId ? taskById.get(taskId) : null;

    setDraggingTaskId(null);
    setDragOverStatus(null);

    if (!draggedTask || draggedTask.status === status) {
      return;
    }

    onMoveTask(draggedTask, status);
  };

  if (taskCount === 0) {
    return <EmptyTaskState description="No tasks match the current kanban filters." />;
  }

  return (
    <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-4">
      {columns.map((column) => (
        <div
          key={column.status}
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
            setDragOverStatus((currentStatus) =>
              currentStatus === column.status ? currentStatus : column.status,
            );
          }}
          onDragLeave={(event) => {
            if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
              return;
            }

            setDragOverStatus(null);
          }}
          onDrop={(event) => handleDrop(event, column.status)}
          className={cn(
            "flex min-h-[420px] flex-col rounded-2xl border border-border/60 bg-background/45 p-3 transition",
            dragOverStatus === column.status && "border-primary/60 bg-primary/10 shadow-lg shadow-primary/10",
          )}
        >
          <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-3">
            <Badge
              variant="outline"
              className={cn("rounded-full px-2.5 py-1 text-xs", TASK_STATUS_META[column.status].badgeClassName)}
            >
              {TASK_STATUS_META[column.status].label}
            </Badge>
            <span className="rounded-full border border-border/60 bg-muted/35 px-2.5 py-1 text-xs font-medium text-muted-foreground">
              {column.tasks.length}
            </span>
          </div>

          <div className="mt-3 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
            {column.tasks.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border/60 px-3 py-8 text-center text-sm text-muted-foreground">
                No tasks in this stage.
              </div>
            ) : (
              column.tasks.map((task) => (
                <TaskPreviewButton
                  key={task.id}
                  task={task}
                  todayDateKey={todayDateKey}
                  onOpenTask={onOpenTask}
                  draggable
                  isDragging={draggingTaskId === task.id}
                  onDragStart={(event) => handleDragStart(event, task)}
                  onDragEnd={handleDragEnd}
                  compact
                />
              ))
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

interface TaskPreviewButtonProps {
  task: CloserTask;
  todayDateKey: string;
  onOpenTask: (task: CloserTask) => void;
  compact?: boolean;
  draggable?: boolean;
  isDragging?: boolean;
  onDragStart?: (event: DragEvent<HTMLButtonElement>) => void;
  onDragEnd?: () => void;
}

function TaskPreviewButton({
  task,
  todayDateKey,
  onOpenTask,
  compact = false,
  draggable = false,
  isDragging = false,
  onDragStart,
  onDragEnd,
}: TaskPreviewButtonProps) {
  const deadlineSignal = getRelativeDeadlineLabel(task, todayDateKey);
  const assignmentSourceLabel =
    task.assignee_user_id === task.created_by
      ? "Self-assigned"
      : `Assigned by ${task.created_by_name}`;
  const priorityCardStyle =
    task.status === "completed"
      ? TASK_PRIORITY_CARD_STYLES.low
      : TASK_PRIORITY_CARD_STYLES[task.priority];

  if (compact) {
    return (
      <button
        type="button"
        draggable={draggable}
        onClick={() => onOpenTask(task)}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        className={cn(
          "group relative flex w-full items-start gap-3 overflow-hidden rounded-2xl border bg-background/55 px-3 py-3 text-left transition hover:shadow-sm",
          priorityCardStyle.borderClassName,
          draggable && "cursor-grab active:cursor-grabbing",
          isDragging && "opacity-60 ring-2 ring-primary/40",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute inset-y-0 left-0 w-[72%] bg-gradient-to-r to-transparent opacity-75 transition-opacity group-hover:opacity-100",
            priorityCardStyle.gradientClassName,
          )}
        />
        <span
          className={cn(
            "relative mt-1 h-9 w-1.5 shrink-0 rounded-full",
            TASK_PRIORITY_META[task.priority].railClassName,
          )}
        />
        <div className="relative min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
              {task.title}
            </p>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge variant="outline" className={TASK_STATUS_META[task.status].badgeClassName}>
              {TASK_STATUS_META[task.status].label}
            </Badge>
            {task.lead_name ? (
              <Badge
                variant="outline"
                className="rounded-full border-primary bg-white px-2 py-0.5 text-[10px] font-medium text-zinc-950"
              >
                {task.lead_name}
              </Badge>
            ) : null}
          </div>
          <p className="mt-2 text-xs font-medium text-primary">{deadlineSignal}</p>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            Due {formatTaskDate(task.deadline_date)}
          </p>
          <div className="mt-2">
            <Badge variant="outline" className={TASK_PRIORITY_META[task.priority].badgeClassName}>
              {TASK_PRIORITY_META[task.priority].label.replace(" Priority", "")}
            </Badge>
          </div>
        </div>
      </button>
    );
  }

  return (
    <button
      type="button"
      draggable={draggable}
      onClick={() => onOpenTask(task)}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={cn(
        "group relative w-full overflow-hidden rounded-2xl border bg-background/55 px-4 py-3 text-left transition hover:shadow-md",
        priorityCardStyle.borderClassName,
        draggable && "cursor-grab active:cursor-grabbing",
        isDragging && "opacity-60 ring-2 ring-primary/40",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-y-0 left-0 w-[58%] bg-gradient-to-r to-transparent opacity-75 transition-opacity group-hover:opacity-100",
          priorityCardStyle.gradientClassName,
        )}
      />
      <div className="relative grid gap-3 lg:grid-cols-[minmax(0,1.55fr)_minmax(130px,0.62fr)_minmax(145px,0.7fr)_minmax(135px,0.58fr)]">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className={cn(
              "mt-1 h-9 w-1.5 shrink-0 rounded-full",
              TASK_PRIORITY_META[task.priority].railClassName,
            )}
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="min-w-0 max-w-full truncate text-base font-semibold text-foreground">
                {task.title}
              </p>
              <Badge variant="outline" className={TASK_STATUS_META[task.status].badgeClassName}>
                {TASK_STATUS_META[task.status].label}
              </Badge>
            </div>

            {task.description ? (
              <p className="mt-1 line-clamp-2 text-sm leading-5 text-muted-foreground">
                {task.description}
              </p>
            ) : null}

            <div className="mt-2 flex flex-wrap gap-1.5">
              {task.tags.slice(0, 3).map((tag) => (
                <Badge
                  key={tag}
                  variant="outline"
                  className="rounded-full border-white/70 bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground"
                >
                  {formatTaskTag(tag)}
                </Badge>
              ))}
              {task.tags.length > 3 ? (
                <Badge
                  variant="outline"
                  className="rounded-full border-white/70 bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground"
                >
                  +{task.tags.length - 3}
                </Badge>
              ) : null}
              {task.lead_name ? (
                <Badge
                  variant="outline"
                  className="rounded-full border-primary bg-white px-2.5 py-1 text-xs font-medium text-zinc-950"
                >
                  {task.lead_name}
                </Badge>
              ) : null}
            </div>
          </div>
        </div>

        <TaskFactBlock
          label="Assignee"
          primary={task.assignee_name}
          secondary={assignmentSourceLabel}
        />
        <TaskFactBlock
          label="Dates"
          primary={`Assigned ${formatTaskDate(task.assigned_date)}`}
          secondary={`Due ${formatTaskDate(task.deadline_date)}`}
        />
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Deadline Signal
          </p>
          <p className="text-sm font-medium text-primary">
            {deadlineSignal}
          </p>
          <Badge variant="outline" className={TASK_PRIORITY_META[task.priority].badgeClassName}>
            {TASK_PRIORITY_META[task.priority].label}
          </Badge>
        </div>
      </div>
    </button>
  );
}

interface TaskFactBlockProps {
  label: string;
  primary: string;
  secondary?: string;
  primaryClassName?: string;
}

function TaskFactBlock({
  label,
  primary,
  secondary,
  primaryClassName,
}: TaskFactBlockProps) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </p>
      <p className={cn("text-sm font-medium text-foreground", primaryClassName)}>
        {primary}
      </p>
      {secondary ? (
        <p className="text-sm text-muted-foreground">{secondary}</p>
      ) : null}
    </div>
  );
}

interface EmptyTaskStateProps {
  description: string;
  title?: string;
  compact?: boolean;
}

function EmptyTaskState({
  description,
  title = "No tasks match the current filters",
  compact = false,
}: EmptyTaskStateProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-dashed border-border/60 bg-background/35 text-center",
        compact ? "px-4 py-8" : "px-6 py-14",
      )}
    >
      {!compact ? (
        <p className="text-base font-medium text-foreground">{title}</p>
      ) : null}
      <p className={cn("text-sm text-muted-foreground", !compact && "mt-2")}>
        {description}
      </p>
    </div>
  );
}

interface AgentsOverviewPanelProps {
  summaries: AgentSummary[];
  activeAssigneeKey: string;
  currentUserKey: string | null;
  onFocusAgent: (key: string) => void;
  onAssignToAgent: (option: TaskAssigneeOption) => void;
}

function AgentsOverviewPanel({
  summaries,
  activeAssigneeKey,
  currentUserKey,
  onFocusAgent,
  onAssignToAgent,
}: AgentsOverviewPanelProps) {
  const resolvedKey =
    activeAssigneeKey === "mine" && currentUserKey
      ? currentUserKey
      : activeAssigneeKey;

  const selectedSummary =
    summaries.find((summary) => summary.key === resolvedKey) ?? null;

  const dropdownValue = selectedSummary ? selectedSummary.key : "all";

  return (
    <Card className="overflow-hidden border-0 bg-zinc-950 text-white shadow-xl shadow-black/20 ring-1 ring-white/10 [--accent:240_3.7%_15.9%] [--accent-foreground:0_0%_98%] [--background:240_10%_3.9%] [--border:240_3.7%_15.9%] [--card-foreground:0_0%_98%] [--card:240_10%_3.9%] [--foreground:0_0%_98%] [--input:240_3.7%_15.9%] [--muted-foreground:240_5%_64.9%] [--muted:240_3.7%_15.9%] [--popover-foreground:0_0%_98%] [--popover:240_10%_3.9%] [--secondary-foreground:0_0%_98%] [--secondary:240_3.7%_15.9%]">
      <CardHeader className="border-b border-zinc-800 px-4 py-4 lg:px-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Users2 className="h-4 w-4 text-primary" />
              <CardTitle className="text-lg font-semibold text-white">
                Agents Overview
              </CardTitle>
            </div>
            <p className="mt-1 text-sm text-zinc-500">
              Pick a closer to focus the board, then assign work directly to them.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Label
              htmlFor="agents-overview-closer"
              className="hidden whitespace-nowrap text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500 sm:inline"
            >
              View tasks for
            </Label>
            <Select value={dropdownValue} onValueChange={onFocusAgent}>
              <SelectTrigger
                id="agents-overview-closer"
                className="h-10 w-full min-w-[220px] border-zinc-800 bg-zinc-900 text-zinc-100 sm:w-auto"
              >
                <SelectValue placeholder="Select a closer" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All assignees</SelectItem>
                {summaries.map((summary) => (
                  <SelectItem key={summary.key} value={summary.key}>
                    {summary.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4 lg:p-5">
        {selectedSummary ? (
          <SelectedAgentCard
            summary={selectedSummary}
            onShowAll={() => onFocusAgent("all")}
            onAssign={() =>
              onAssignToAgent({
                key: selectedSummary.key,
                label: selectedSummary.label,
              })
            }
          />
        ) : (
          <div className="flex items-center justify-center rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/35 px-4 py-6 text-sm text-zinc-500">
            Showing tasks across all closers. Pick a name above to view a specific closer's workload.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface SelectedAgentCardProps {
  summary: AgentSummary;
  onShowAll: () => void;
  onAssign: () => void;
}

function SelectedAgentCard({
  summary,
  onShowAll,
  onAssign,
}: SelectedAgentCardProps) {
  const segments = useMemo(
    () => [
      {
        label: "Pending",
        value: summary.pending,
        colorClassName: "bg-amber-400",
      },
      {
        label: "Overdue",
        value: summary.overdue,
        colorClassName: "bg-rose-500",
      },
      {
        label: "In Progress",
        value: summary.inProgress,
        colorClassName: "bg-sky-400",
      },
      {
        label: "Completed",
        value: summary.completed,
        colorClassName: "bg-emerald-500",
      },
    ],
    [summary.completed, summary.inProgress, summary.overdue, summary.pending],
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)] lg:items-stretch">
      <div className="flex flex-col justify-between gap-4 rounded-2xl border border-zinc-800 bg-zinc-900/55 p-4">
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
            Selected closer
          </p>
          <p className="truncate text-lg font-semibold text-white">
            {summary.label}
          </p>
          <p className="text-sm text-zinc-500">
            {summary.openTotal} open task{summary.openTotal === 1 ? "" : "s"}
            {summary.nextDeadline
              ? ` · Next due ${formatTaskDate(summary.nextDeadline, "MMM d")}`
              : ""}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-zinc-800 bg-zinc-900 text-zinc-100 hover:bg-zinc-800 hover:text-white"
            onClick={onShowAll}
          >
            Show all
          </Button>
          <Button type="button" size="sm" onClick={onAssign}>
            <Plus className="mr-1.5 h-4 w-4" />
            Assign task
          </Button>
        </div>
      </div>

      <StatisticsCard5
        title="Closer breakdown"
        caption={summary.label}
        segments={segments}
      />
    </div>
  );
}

export default TaskManagementPage;
