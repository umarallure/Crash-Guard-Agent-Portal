export type TaskStatus = "todo" | "in_progress" | "waiting" | "completed";
export type TaskPriority = "low" | "medium" | "high";
export type TaskDeadlineFilter = "all" | "today" | "this_week" | "overdue" | "upcoming";

export interface CloserTask {
  id: string;
  title: string;
  description: string | null;
  lead_id: string | null;
  lead_reference: string | null;
  assignee_user_id: string;
  assignee_name: string;
  created_by: string;
  created_by_name: string;
  status: TaskStatus;
  priority: TaskPriority;
  tags: string[];
  assigned_date: string;
  deadline_date: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  portal?: "closer" | "lawyer_onboarding";
  lead_name?: string | null;
  lead_phone_number?: string | null;
  lead_status?: string | null;
}

export interface CloserTaskNote {
  id: string;
  task_id: string;
  author_user_id: string | null;
  author_name: string;
  content: string;
  created_at: string;
}

export interface TaskAssigneeOption {
  key: string;
  label: string;
}

export interface TaskLeadOption {
  id: string;
  reference: string;
  customerName: string;
  phoneNumber: string | null;
}

export interface TaskFormValues {
  title: string;
  description: string;
  leadId: string;
  leadReference: string;
  assigneeUserId: string;
  assigneeName: string;
  status: TaskStatus;
  priority: TaskPriority;
  deadlineDate: string;
  tags: string[];
}
