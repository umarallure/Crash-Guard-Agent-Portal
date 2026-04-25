-- Migration: Create closer task management tables
-- Created: 2026-04-24

CREATE OR REPLACE FUNCTION public.current_user_can_manage_closer_tasks()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  has_admin_access BOOLEAN := false;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.app_users
    WHERE user_id = auth.uid()
      AND (
        role IN ('admin', 'super_admin')
        OR is_super_admin = true
      )
  )
  INTO has_admin_access;

  IF has_admin_access THEN
    RETURN true;
  END IF;

  IF to_regclass('public.user_roles') IS NOT NULL THEN
    EXECUTE $query$
      SELECT EXISTS (
        SELECT 1
        FROM public.user_roles
        WHERE user_id = auth.uid()
          AND role IN ('admin', 'super_admin')
          AND COALESCE(is_active, true)
      )
    $query$
    INTO has_admin_access;
  END IF;

  RETURN has_admin_access;
END;
$$;

GRANT EXECUTE ON FUNCTION public.current_user_can_manage_closer_tasks() TO authenticated;

CREATE TABLE IF NOT EXISTS public.closer_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  lead_reference TEXT,
  assignee_user_id UUID NOT NULL REFERENCES auth.users(id),
  assignee_name TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_by_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'waiting', 'completed')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  tags TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  assigned_date DATE NOT NULL DEFAULT CURRENT_DATE,
  deadline_date DATE NOT NULL,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_closer_tasks_assignee_user_id
  ON public.closer_tasks(assignee_user_id);

CREATE INDEX IF NOT EXISTS idx_closer_tasks_lead_id
  ON public.closer_tasks(lead_id);

CREATE INDEX IF NOT EXISTS idx_closer_tasks_lead_reference
  ON public.closer_tasks(lead_reference);

CREATE INDEX IF NOT EXISTS idx_closer_tasks_deadline_date
  ON public.closer_tasks(deadline_date);

CREATE INDEX IF NOT EXISTS idx_closer_tasks_status
  ON public.closer_tasks(status);

CREATE INDEX IF NOT EXISTS idx_closer_tasks_priority
  ON public.closer_tasks(priority);

CREATE INDEX IF NOT EXISTS idx_closer_tasks_created_by
  ON public.closer_tasks(created_by);

CREATE INDEX IF NOT EXISTS idx_closer_tasks_tags
  ON public.closer_tasks USING GIN(tags);

CREATE TABLE IF NOT EXISTS public.closer_task_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.closer_tasks(id) ON DELETE CASCADE,
  author_user_id UUID REFERENCES auth.users(id),
  author_name TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_closer_task_notes_task_id
  ON public.closer_task_notes(task_id);

CREATE INDEX IF NOT EXISTS idx_closer_task_notes_created_at
  ON public.closer_task_notes(created_at DESC);

CREATE OR REPLACE FUNCTION public.set_closer_task_derived_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();

  IF NEW.status = 'completed' THEN
    NEW.completed_at = COALESCE(NEW.completed_at, NOW());
  ELSE
    NEW.completed_at = NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_closer_task_derived_fields ON public.closer_tasks;

CREATE TRIGGER trg_set_closer_task_derived_fields
  BEFORE INSERT OR UPDATE ON public.closer_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.set_closer_task_derived_fields();

ALTER TABLE public.closer_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.closer_task_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS closer_tasks_select ON public.closer_tasks;
DROP POLICY IF EXISTS closer_tasks_insert ON public.closer_tasks;
DROP POLICY IF EXISTS closer_tasks_update ON public.closer_tasks;
DROP POLICY IF EXISTS closer_tasks_delete ON public.closer_tasks;

CREATE POLICY closer_tasks_select
  ON public.closer_tasks
  FOR SELECT
  TO authenticated
  USING (
    public.current_user_can_manage_closer_tasks()
    OR assignee_user_id = auth.uid()
  );

CREATE POLICY closer_tasks_insert
  ON public.closer_tasks
  FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_can_manage_closer_tasks());

CREATE POLICY closer_tasks_update
  ON public.closer_tasks
  FOR UPDATE
  TO authenticated
  USING (public.current_user_can_manage_closer_tasks())
  WITH CHECK (public.current_user_can_manage_closer_tasks());

CREATE POLICY closer_tasks_delete
  ON public.closer_tasks
  FOR DELETE
  TO authenticated
  USING (public.current_user_can_manage_closer_tasks());

DROP POLICY IF EXISTS closer_task_notes_select ON public.closer_task_notes;
DROP POLICY IF EXISTS closer_task_notes_insert ON public.closer_task_notes;
DROP POLICY IF EXISTS closer_task_notes_delete ON public.closer_task_notes;

CREATE POLICY closer_task_notes_select
  ON public.closer_task_notes
  FOR SELECT
  TO authenticated
  USING (
    public.current_user_can_manage_closer_tasks()
    OR EXISTS (
      SELECT 1
      FROM public.closer_tasks task
      WHERE task.id = closer_task_notes.task_id
        AND task.assignee_user_id = auth.uid()
    )
  );

CREATE POLICY closer_task_notes_insert
  ON public.closer_task_notes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.current_user_can_manage_closer_tasks()
    OR EXISTS (
      SELECT 1
      FROM public.closer_tasks task
      WHERE task.id = closer_task_notes.task_id
        AND task.assignee_user_id = auth.uid()
    )
  );

CREATE POLICY closer_task_notes_delete
  ON public.closer_task_notes
  FOR DELETE
  TO authenticated
  USING (public.current_user_can_manage_closer_tasks());

COMMENT ON TABLE public.closer_tasks IS 'Admin-managed task assignments for closers and sales reps.';
COMMENT ON TABLE public.closer_task_notes IS 'Threaded notes and updates attached to closer tasks.';
COMMENT ON COLUMN public.closer_tasks.lead_id IS 'Optional attached lead record for task context.';
COMMENT ON COLUMN public.closer_tasks.lead_reference IS 'Snapshot of the lead reference shown to admins and closers.';
