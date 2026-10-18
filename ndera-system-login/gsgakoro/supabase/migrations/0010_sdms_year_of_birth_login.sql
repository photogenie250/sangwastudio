-- ============================================================
-- SDMS — switch student/parent portal login to per-student
-- Year of Birth, replacing the old shared "Gakoro" password.
--
-- Adds students.year_of_birth (the new login password) and
-- rewrites parent_portal_lookup to require both the SDMS number
-- (student_number) and the matching year_of_birth before it
-- returns any data. date_of_birth is left in place, unused.
--
-- Applied directly to production on 2026-09-06 (all 54 existing
-- student records were deleted beforehand at the school's
-- request, ahead of re-importing via the updated Excel template).
-- ============================================================

alter table public.students
  add column if not exists year_of_birth integer;

comment on column public.students.year_of_birth is
  'Also used as the student/parent portal login password (see parent_portal_lookup).';

-- Drop the old single-argument function -- CREATE OR REPLACE cannot
-- change a function's argument list, and the old signature must
-- not be left callable (it had no password check at all).
drop function if exists public.parent_portal_lookup(text);

create or replace function public.parent_portal_lookup(p_student_number text, p_year_of_birth integer)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_student record;
  v_result json;
  v_incident_threshold constant int := 3;
begin
  select
    s.id, s.student_number, s.first_name, s.last_name, s.gender,
    s.year_of_birth, s.parent_phone, s.parent_email, s.current_marks,
    s.status, c.class_name
  into v_student
  from public.students s
  left join public.classes c on c.id = s.class_id
  where lower(s.student_number) = lower(p_student_number)
    and s.year_of_birth = p_year_of_birth
  limit 1;

  if not found then
    return json_build_object('found', false);
  end if;

  select json_build_object(
    'found', true,
    'student', json_build_object(
      'first_name', v_student.first_name,
      'last_name', v_student.last_name,
      'student_number', v_student.student_number,
      'gender', v_student.gender,
      'year_of_birth', v_student.year_of_birth,
      'class_name', coalesce(v_student.class_name, 'Unassigned'),
      'status', v_student.status,
      'current_marks', v_student.current_marks,
      'max_marks', 40
    ),
    'incidents', coalesce((
      select json_agg(json_build_object(
        'incident_date', i.incident_date,
        'offense_title', o.title,
        'deduction_applied', i.deduction_applied,
        'comment', i.comment,
        'is_voided', i.is_voided,
        'voided_reason', i.voided_reason
      ) order by i.incident_date desc)
      from public.incidents i
      left join public.offenses o on o.id = i.offense_id
      where i.student_id = v_student.id
    ), '[]'::json),
    'incident_count_active', (
      select count(*) from public.incidents i
      where i.student_id = v_student.id and coalesce(i.is_voided, false) = false
    ),
    'letter_eligible', (
      (select count(*) from public.incidents i
       where i.student_id = v_student.id and coalesce(i.is_voided, false) = false)
      >= v_incident_threshold
    ),
    'counseling_sessions', coalesce((
      select json_agg(json_build_object(
        'status', cs.status,
        'reason', cs.reason,
        'notes', cs.notes,
        'scheduled_date', cs.scheduled_date
      ) order by cs.scheduled_date desc)
      from public.counseling_sessions cs
      where cs.student_id = v_student.id
    ), '[]'::json)
  ) into v_result;

  return v_result;
end;
$function$;

comment on function public.parent_portal_lookup(text, integer) is
  'Student/parent portal auth + read-only lookup: requires the SDMS number (student_number) and matching year_of_birth (the login password) together, returns the single matching student with incidents/counseling. Anon-only RPC.';

grant execute on function public.parent_portal_lookup(text, integer) to anon;
