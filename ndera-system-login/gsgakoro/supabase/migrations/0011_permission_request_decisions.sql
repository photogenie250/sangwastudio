-- ============================================================
-- SDMS — Permission requests: staff decisions + parent visibility
--
-- Problem this closes: staff could only ever read requests
-- (0001_permission_requests.sql had no update policy at all), so
-- "approving" one meant editing the row by hand in the SQL editor,
-- and the parent who submitted it had no way to ever see an answer.
--
-- This migration:
--   1. Adds student_number, so a request can be tied to one exact
--      student record (matching on typed student_name is unreliable
--      — two "Jean Claude"s in different classes, typos, etc).
--   2. Adds decided_by / decided_at / staff_note, and a check
--      constraint narrowing status to pending | approved | declined.
--   3. Adds an UPDATE policy so active staff can actually record a
--      decision from the app (previously impossible from the client).
--   4. Adds parent_portal_permission_requests(), a read-only RPC in
--      the same security shape as parent_portal_lookup — requires
--      BOTH the SDMS number and matching year_of_birth — so the
--      parent/student portal can show a student their own requests
--      and nothing else.
-- ============================================================

alter table public.permission_requests
  add column if not exists student_number text,
  add column if not exists decided_by uuid references public.profiles(id) on delete set null,
  add column if not exists decided_at timestamptz,
  add column if not exists staff_note text;

comment on column public.permission_requests.student_number is
  'SDMS number of the student this request is about, when known. Lets the parent/student portal (parent_portal_permission_requests) show the requester their own request and its decision. Nullable: walk-in/staff-side submissions may not have it.';
comment on column public.permission_requests.decided_by is
  'Staff profile who approved/declined this request.';
comment on column public.permission_requests.staff_note is
  'Optional note from staff shown back to the parent alongside the decision (e.g. reason for declining).';

create index if not exists permission_requests_student_number_idx
  on public.permission_requests (lower(student_number))
  where student_number is not null;

-- Normalize any existing free-form status values before locking
-- the column down with a check constraint.
update public.permission_requests
  set status = 'pending'
  where status not in ('pending', 'approved', 'declined');

alter table public.permission_requests drop constraint if exists permission_requests_status_check;
alter table public.permission_requests
  add constraint permission_requests_status_check
  check (status in ('pending', 'approved', 'declined'));

alter table public.permission_requests alter column status set default 'pending';

-- Active staff can now record a decision (status/staff_note/decided_*)
-- from the app. Still can't touch the original request fields the
-- parent submitted, and still can't delete.
create policy "Active staff can decide on permission requests"
  on public.permission_requests
  for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.status = 'active'
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.status = 'active'
    )
  );

-- ------------------------------------------------------------
-- Parent/student portal read access
--
-- Same dual-factor check as parent_portal_lookup (SDMS number +
-- year of birth) rather than the single-factor pattern used by
-- parent_portal_announcements — a permission request carries a
-- phone number and a stated reason for taking the child out of
-- school, which is more sensitive than a school-wide notice, so
-- it gets the stronger check.
-- ------------------------------------------------------------
create or replace function public.parent_portal_permission_requests(
  p_student_number text,
  p_year_of_birth integer
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_id uuid;
  v_result json;
begin
  select s.id
    into v_student_id
  from public.students s
  where lower(s.student_number) = lower(p_student_number)
    and s.year_of_birth = p_year_of_birth
  limit 1;

  if v_student_id is null then
    return json_build_object('found', false);
  end if;

  select coalesce(json_agg(json_build_object(
      'id', r.id,
      'reason', r.reason,
      'status', r.status,
      'staff_note', r.staff_note,
      'created_at', r.created_at,
      'decided_at', r.decided_at
    ) order by r.created_at desc), '[]'::json)
    into v_result
  from public.permission_requests r
  where lower(r.student_number) = lower(p_student_number);

  return json_build_object('found', true, 'requests', v_result);
end;
$$;

comment on function public.parent_portal_permission_requests(text, integer) is
  'Read-only, SDMS-number + year-of-birth scoped list of this student''s own permission requests and their decisions, for the parent/student portal. Same dual-factor security model as parent_portal_lookup.';

grant execute on function public.parent_portal_permission_requests(text, integer) to anon;
