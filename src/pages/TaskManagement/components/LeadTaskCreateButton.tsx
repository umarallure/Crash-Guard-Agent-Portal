import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarPlus, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchLicensedCloserOptions,
  formatAgentLabelFromEmail,
} from "@/lib/agentOptions";
import {
  getPortalRoleFlags,
  isCenterUser,
  isRestrictedUser,
} from "@/lib/userPermissions";

import { TaskFormDialog } from "./TaskFormDialog";
import { toDateKey } from "../taskManagementUtils";
import type {
  CloserTask,
  TaskAssigneeOption,
  TaskFormValues,
  TaskLeadOption,
} from "../types";

type QueryResult<T> = Promise<{ data: T | null; error: unknown }>;

type LeadTaskCreateDbClient = {
  from(table: "closer_tasks"): {
    insert: (values: Partial<CloserTask>) => {
      select: (columns: string) => {
        single: () => QueryResult<CloserTask>;
      };
    };
  };
};

interface LeadTaskCreateButtonProps {
  lead: {
    id: string;
    submissionId: string;
    customerName: string | null;
    phoneNumber?: string | null;
  };
  className?: string;
}

const taskDb = supabase as unknown as LeadTaskCreateDbClient;

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

export function LeadTaskCreateButton({ lead, className }: LeadTaskCreateButtonProps) {
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [loadingContext, setLoadingContext] = useState(false);
  const [canCreateTask, setCanCreateTask] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isAgentRole, setIsAgentRole] = useState(false);
  const [currentUserAssignee, setCurrentUserAssignee] = useState<TaskAssigneeOption | null>(null);
  const [assigneeOptions, setAssigneeOptions] = useState<TaskAssigneeOption[]>([]);

  const attachedLead = useMemo<TaskLeadOption>(() => ({
    id: lead.id,
    reference: lead.submissionId,
    customerName: lead.customerName || lead.submissionId,
    phoneNumber: lead.phoneNumber || null,
  }), [lead.customerName, lead.id, lead.phoneNumber, lead.submissionId]);

  const selfAssignOnly = isAgentRole && !isAdmin;
  const buttonClassName = `h-9 rounded-full px-4 text-xs font-semibold ${className || ""}`;

  const resolveCurrentUserLabel = useCallback(async () => {
    if (!user) return "";

    const fallback =
      formatAgentLabelFromEmail(user.email || "") ||
      user.email ||
      "Portal User";

    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("user_id", user.id)
      .maybeSingle();

    return profile?.display_name?.trim() || fallback;
  }, [user]);

  const loadTaskContext = useCallback(async () => {
    if (!user || !canCreateTask) return;

    setLoadingContext(true);
    try {
      const userLabel = await resolveCurrentUserLabel();
      const me = { key: user.id, label: userLabel };
      const closerAssignees = isAdmin ? await fetchLicensedCloserOptions() : [];

      setCurrentUserAssignee(me);
      setAssigneeOptions(isAdmin ? dedupeAssignees([me, ...closerAssignees]) : [me]);
    } catch (error) {
      console.error("Error loading task creation context:", error);
      toast({
        title: "Unable to load task options",
        description: "Task assignees could not be loaded. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoadingContext(false);
    }
  }, [canCreateTask, isAdmin, resolveCurrentUserLabel, toast, user]);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      setCheckingAccess(false);
      setCanCreateTask(false);
      return;
    }

    let isMounted = true;

    const checkAccess = async () => {
      setCheckingAccess(true);
      try {
        const [roleFlags, centerUser] = await Promise.all([
          getPortalRoleFlags(user.id),
          isCenterUser(user.id),
        ]);

        if (!isMounted) return;

        setIsAdmin(roleFlags.isAdmin);
        setIsAgentRole(roleFlags.isAgent);
        setCanCreateTask(
          roleFlags.canAccessTaskManagement &&
          !centerUser &&
          !isRestrictedUser(user.id),
        );
      } catch (error) {
        console.error("Error checking task creation access:", error);
        if (isMounted) {
          setCanCreateTask(false);
        }
      } finally {
        if (isMounted) {
          setCheckingAccess(false);
        }
      }
    };

    void checkAccess();

    return () => {
      isMounted = false;
    };
  }, [authLoading, user]);

  useEffect(() => {
    if (!canCreateTask) return;
    void loadTaskContext();
  }, [canCreateTask, loadTaskContext]);

  const handleSaveTask = async (values: TaskFormValues) => {
    if (!user || !currentUserAssignee) {
      throw new Error("Task creation context is not ready.");
    }

    const assigneeUserId = selfAssignOnly ? user.id : values.assigneeUserId;
    const assigneeName = selfAssignOnly ? currentUserAssignee.label : values.assigneeName;

    const payload: Partial<CloserTask> = {
      title: values.title,
      description: safeTrimmedValue(values.description),
      lead_id: lead.id,
      lead_reference: lead.submissionId,
      assignee_user_id: assigneeUserId,
      assignee_name: assigneeName,
      status: values.status,
      priority: values.priority,
      deadline_date: values.deadlineDate,
      tags: values.tags,
      assigned_date: toDateKey(new Date()),
      created_by: user.id,
      created_by_name: currentUserAssignee.label,
    };

    try {
      const { error } = await taskDb
        .from("closer_tasks")
        .insert(payload)
        .select("*")
        .single();

      if (error) {
        throw error;
      }

      toast({
        title: "Task created",
        description: "The task was attached to this lead and assigned.",
      });
    } catch (error) {
      console.error("Error creating lead task:", error);
      toast({
        title: "Unable to create task",
        description: "Please review the task details and try again.",
        variant: "destructive",
      });
      throw error;
    }
  };

  if (authLoading || checkingAccess) {
    return (
      <Button
        type="button"
        className={buttonClassName}
        disabled
        aria-busy="true"
      >
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Assign Task
      </Button>
    );
  }

  if (!canCreateTask) {
    return null;
  }

  const buttonDisabled = loadingContext || !currentUserAssignee || assigneeOptions.length === 0;

  return (
    <>
      <Button
        type="button"
        className={buttonClassName}
        onClick={() => setOpen(true)}
        disabled={buttonDisabled}
      >
        {loadingContext ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <CalendarPlus className="mr-2 h-4 w-4" />
        )}
        Assign Task
      </Button>

      <TaskFormDialog
        open={open}
        initialTask={null}
        initialLead={attachedLead}
        lockLead
        assigneeOptions={assigneeOptions}
        currentUserAssignee={currentUserAssignee}
        selfAssignOnly={selfAssignOnly}
        leadOptions={[]}
        leadSearchLoading={false}
        onLeadSearch={() => undefined}
        onOpenChange={setOpen}
        onSave={handleSaveTask}
      />
    </>
  );
}
