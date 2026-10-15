-- ============================================================
-- SDMS — counseling_sessions: assign a case to a specific staff
-- member, so counseling isn't solely handled by admin/head_teacher.
--
-- Adds assigned_teacher_id (profiles.id). Administrator/head_teacher
-- keep full control (set/change the assignment, edit any field,
-- delete). The assigned staff member additionally gets update
-- access to *their own* assigned case, scoped by the trigger below
-- to status + notes only -- so a teacher can write up what
-- happened in the session (feeding the same "Counseling report"
-- that DoD/the Headteacher receives) without being able to
-- reassign the case, change the student, or edit the reason/date.
-- ============================================================

alter table public.counseling_sessions
  add column if not exists assigned_teacher_id uuid references public.profiles(id) on delete set null;

create index if not exists counseling_sessions_assigned_teacher_id_idx
  on public.counseling_sessions (assigned_teacher_id);

comment on column public.counseling_sessions.assigned_teacher_id is
  'Staff member (profiles.id) this counseling case is assigned to. Set by administrator/head_teacher when scheduling. The assigned staff member can then update status/notes on this one case (see counseling_sessions_update_assigned_teacher policy + enforce_counseling_assigned_update_scope trigger) without needing admin/head_teacher rights.';

-- ------------------------------------------------------------
-- Row access: the assigned staff member can update their own case
-- ------------------------------------------------------------
drop policy if exists "counseling_sessions_update_assigned_teacher" on public.counseling_sessions;
create policy "counseling_sessions_update_assigned_teacher"
  on public.counseling_sessions
  for update
  to authenticated
  using (assigned_teacher_id = (select auth.uid()))
  with check (assigned_teacher_id = (select auth.uid()));

-- ------------------------------------------------------------
-- Column scope: a non admin/head_teacher assignee may only change
-- status/notes, not reassign the case or edit student/reason/date.
-- Admin/head_teacher (already allowed to touch any field via the
-- existing counseling_sessions_update_admin policy) are unaffected.
-- ------------------------------------------------------------
create or replace function public.enforce_counseling_assigned_update_scope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select current_user_role()) = any (array['administrator', 'head_teacher']) then
    return new;
  end if;

  if new.student_id is distinct from old.student_id
     or new.reason is distinct from old.reason
     or new.scheduled_date is distinct from old.scheduled_date
     or new.assigned_teacher_id is distinct from old.assigned_teacher_id
     or new.created_by is distinct from old.created_by then
    raise exception 'Only status and notes can be changed here. Reassigning or editing the student, reason or scheduled date requires an administrator or head teacher.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

comment on function public.enforce_counseling_assigned_update_scope() is
  'BEFORE UPDATE guard on counseling_sessions. The staff member granted row access by counseling_sessions_update_assigned_teacher may only write status/notes on their own case; reassigning or changing student/reason/scheduled_date stays administrator/head_teacher-only.';

drop trigger if exists counseling_sessions_assigned_update_guard on public.counseling_sessions;
create trigger counseling_sessions_assigned_update_guard
  before update on public.counseling_sessions
  for each row
  execute function public.enforce_counseling_assigned_update_scope();
