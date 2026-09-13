-- Service role 应该自动 bypass RLS，但显式加 policy 以防万一

DROP POLICY IF EXISTS "users see their own projects" ON public.projects;
DROP POLICY IF EXISTS "users insert their own projects" ON public.projects;
DROP POLICY IF EXISTS "users update their own projects" ON public.projects;
DROP POLICY IF EXISTS "users delete (soft) their own projects" ON public.projects;

-- 统一一条 policy：service_role 自由操作；用户只能操作自己的
CREATE POLICY "service role has full access to projects"
  ON public.projects FOR ALL
  USING (auth.jwt()->>'role' = 'service_role')
  WITH CHECK (auth.jwt()->>'role' = 'service_role');

CREATE POLICY "users access their own projects"
  ON public.projects FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "users see files in their projects" ON public.project_files;
DROP POLICY IF EXISTS "users insert files in their projects" ON public.project_files;
DROP POLICY IF EXISTS "users delete files in their projects" ON public.project_files;

CREATE POLICY "service role has full access to project_files"
  ON public.project_files FOR ALL
  USING (auth.jwt()->>'role' = 'service_role')
  WITH CHECK (auth.jwt()->>'role' = 'service_role');

CREATE POLICY "users access files in their projects"
  ON public.project_files FOR ALL
  USING (
    project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
  )
  WITH CHECK (
    project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "users see events in their projects" ON public.project_events;

CREATE POLICY "service role has full access to project_events"
  ON public.project_events FOR ALL
  USING (auth.jwt()->>'role' = 'service_role')
  WITH CHECK (auth.jwt()->>'role' = 'service_role');

CREATE POLICY "users see events in their projects"
  ON public.project_events FOR SELECT
  USING (
    project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
  );
