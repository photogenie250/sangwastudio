-- ============================================================
-- SDMS — Protect marks for students authorised by DoD
--
-- Problem this closes: a student whose permission request was
-- approved (by an active staff member — Admin, DoD/discipline
-- teacher, head teacher, etc.) could still have marks removed for
-- an incident logged against them on that same date, e.g. an
-- "absent" or "left without permission" offense recorded even
-- though the school had already authorised them to be away.
--
-- This migration adds a database-level guard so the rule holds
-- everywhere incidents can ever be inserted — the staff web app
-- today, and any future client (e.g. the Android app) tomorrow —
-- not just in the one screen that currently records incidents.
--
--   1. permission_authorizes_student(p_student_id, p_date):
--      true if that student has an APPROVED permission request
--      dated p_date (matched by student_number when the request
--      carries one, falling back to full-name match against the
--      free-text student_name on the walk-in/login-page form —
--      same matching pattern as get_class_standing()).
--   2. Trigger on public.incidents (BEFORE INSERT): blocks the
--      insert with a recognisable 'DOD_AUTHORIZED:' error message
--      when permission_authorizes_student() is true, so no marks
--      are ever removed for that student on that date. The staff
--      app catches this and shows "authorised by DoD" instead of
--      a generic failure.
-- ============================================================

create or replace function public.permission_authorizes_student(
  p_student_id uuid,
  p_date date
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.students s
    join public.permission_requests pr
      on pr.status = 'approved'
     and pr.created_at::date = p_date
     and (
       (pr.student_number is not null and lower(pr.student_number) = lower(s.student_number))
       or (
         pr.student_number is null
         and lower(trim(pr.student_name)) = lower(trim(s.first_name || ' ' || s.last_name))
       )
     )
    where s.id = p_student_id
  );
$$;

comment on function public.permission_authorizes_student(uuid, date) is
  'True when the given student has an APPROVED permission request dated p_date (matched by student_number, falling back to full-name match). Used to protect marks: no incident may be recorded against a student on a date they were authorised (by DoD/staff) to be away. Powers both the client pre-check and the incidents insert trigger below.';

grant execute on function public.permission_authorizes_student(uuid, date) to authenticated;

-- ------------------------------------------------------------
-- Enforcement trigger — the actual guarantee. Even if a caller
-- skips the client-side check (a bug, a direct API call, a future
-- mobile client), this still blocks the marks deduction.
-- ------------------------------------------------------------
create or replace function public.enforce_dod_authorization_on_incident()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.permission_authorizes_student(new.student_id, new.incident_date) then
    raise exception 'DOD_AUTHORIZED: This student was authorised by DoD for %. Marks were not removed.', new.incident_date
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

comment on function public.enforce_dod_authorization_on_incident() is
  'BEFORE INSERT guard on public.incidents. Refuses to record an incident (and therefore refuses to deduct marks) for a student on a date they hold an approved permission request for. Raises a DOD_AUTHORIZED:-prefixed message so clients can show a friendly "authorised by DoD" notice instead of a generic error.';

drop trigger if exists incidents_dod_authorization_guard on public.incidents;

create trigger incidents_dod_authorization_guard
  before insert on public.incidents
  for each row
  execute function public.enforce_dod_authorization_on_incident();
