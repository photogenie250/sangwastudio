-- ============================================================
-- SDMS — counseling_sessions: let head_teacher schedule/edit too,
-- not just administrator.
--
-- js/counseling.js has always treated administrator and
-- head_teacher as equally able to schedule/edit a counseling
-- session (canSchedule = role is administrator OR head_teacher —
-- same pattern used for announcements, profiles, and students
-- elsewhere in this schema). But counseling_sessions' insert/
-- update/delete policies checked role = 'administrator' only, so
-- a head_teacher clicking "Schedule" (or, once added, "Add student
-- to counseling") would see the button, fill the form, and have
-- the save silently rejected by RLS.
--
-- Widens all three policies to match every other admin+head_teacher
-- pair in the schema. No other change.
-- ============================================================

drop policy if exists "counseling_sessions_insert_admin" on public.counseling_sessions;
create policy "counseling_sessions_insert_admin"
  on public.counseling_sessions
  for insert
  to authenticated
  with check (
    (select current_user_role()) = any (array['administrator', 'head_teacher'])
  );

drop policy if exists "counseling_sessions_update_admin" on public.counseling_sessions;
create policy "counseling_sessions_update_admin"
  on public.counseling_sessions
  for update
  to authenticated
  using (
    (select current_user_role()) = any (array['administrator', 'head_teacher'])
  )
  with check (
    (select current_user_role()) = any (array['administrator', 'head_teacher'])
  );

drop policy if exists "counseling_sessions_delete_admin" on public.counseling_sessions;
create policy "counseling_sessions_delete_admin"
  on public.counseling_sessions
  for delete
  to authenticated
  using (
    (select current_user_role()) = any (array['administrator', 'head_teacher'])
  );
