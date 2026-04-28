-- Allow agent-role users to self-manage closer tasks without expanding admin access.

CREATE OR REPLACE FUNCTION public.current_user_can_self_manage_closer_tasks()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  has_agent_access BOOLEAN := false;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.app_users
    WHERE user_id = auth.uid()
      AND (
        role IN ('agent', 'admin', 'super_admin')
        OR is_super_admin = true
      )
  )
  INTO has_agent_access;

  IF has_agent_access THEN
    RETURN true;
  END IF;

  IF to_regclass('public.user_roles') IS NOT NULL THEN
    EXECUTE $query$
      SELECT EXISTS (
        SELECT 1
        FROM public.user_roles
        WHERE user_id = auth.uid()
          AND role IN ('agent', 'admin', 'super_admin')
          AND COALESCE(is_active, true)
      )
    $query$
    INTO has_agent_access;
  END IF;

  RETURN has_agent_access;
END;
$$;

GRANT EXECUTE ON FUNCTION public.current_user_can_self_manage_closer_tasks() TO authenticated;

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
    OR (
      public.current_user_can_self_manage_closer_tasks()
      AND (
        assignee_user_id = auth.uid()
        OR created_by = auth.uid()
      )
    )
  );

CREATE POLICY closer_tasks_insert
  ON public.closer_tasks
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.current_user_can_manage_closer_tasks()
    OR (
      public.current_user_can_self_manage_closer_tasks()
      AND assignee_user_id = auth.uid()
      AND created_by = auth.uid()
    )
  );

CREATE POLICY closer_tasks_update
  ON public.closer_tasks
  FOR UPDATE
  TO authenticated
  USING (
    public.current_user_can_manage_closer_tasks()
    OR (
      public.current_user_can_self_manage_closer_tasks()
      AND assignee_user_id = auth.uid()
    )
  )
  WITH CHECK (
    public.current_user_can_manage_closer_tasks()
    OR (
      public.current_user_can_self_manage_closer_tasks()
      AND assignee_user_id = auth.uid()
    )
  );

CREATE POLICY closer_tasks_delete
  ON public.closer_tasks
  FOR DELETE
  TO authenticated
  USING (public.current_user_can_manage_closer_tasks());

COMMENT ON FUNCTION public.current_user_can_self_manage_closer_tasks()
  IS 'Returns true for users allowed to create and update their own closer tasks.';
