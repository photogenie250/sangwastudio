-- ============================================================
-- SDMS — parent portal: scope "this term" numbers to the actual
-- current term.
--
-- parent-dashboard.js already talks about "this term" in its
-- Kinyarwanda copy (the empty state says "Nta manota yavanyweho
-- muri iki gihembwe" — "no marks removed this term", and the
-- letter-eligibility text says "yanditswe muri iki gihembwe" —
-- "recorded this term"), but parent_portal_lookup's
-- incident_count_active/letter_eligible and parent_portal_likes'
-- likes_count were computed all-time, with no term filter. That
-- was harmless before terms existed (there was no boundary to
-- filter by), but now that starting a new term resets the staff
-- side to a clean slate, the parent portal would keep showing a
-- stale, inflated count from a previous term unless it's scoped
-- the same way. This brings both functions in line with every
-- other "this term" view in the app (see migration
-- 0015_academic_terms.sql).
--
-- The full incident list returned to parents (for the history
-- table) IS scoped to the current term too — parent-dashboard.js's
-- own copy calls it "this term" (the empty state says "Nta manota
-- yavanyweho muri iki gihembwe" — "no marks removed this term"),
-- so a voided or historical incident from a term that's already
-- ended shouldn't reappear there once the school has moved on and
-- reset for the new term. This differs from the staff-side student
-- profile page, whose "Full history" table is explicitly an
-- all-time audit log and stays unfiltered.
-- ============================================================

create or replace function public.parent_portal_likes(p_student_number text)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_student_id uuid;
  v_current_marks integer;
  v_likes_count integer;
begin
  select id, current_marks
    into v_student_id, v_current_marks
  from public.students
  where lower(student_number) = lower(p_student_number)
  limit 1;

  if v_student_id is null then
    return jsonb_build_object('found', false);
  end if;

  select count(*)
    into v_likes_count
  from public.student_likes
  where student_id = v_student_id
    and term = public.get_current_term();

  return jsonb_build_object(
    'found', true,
    'likes_count', coalesce(v_likes_count, 0),
    'eligible', (v_current_marks = 40),
    'current_marks', v_current_marks
  );
end;
$$;

create or replace function public.parent_portal_lookup(p_student_number text, p_year_of_birth integer)
returns json
language plpgsql
security definer
set search_path = 'public'
as $$
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
        and i.term = public.get_current_term()
    ), '[]'::json),
    'incident_count_active', (
      select count(*) from public.incidents i
      where i.student_id = v_student.id
        and coalesce(i.is_voided, false) = false
        and i.term = public.get_current_term()
    ),
    'letter_eligible', (
      (select count(*) from public.incidents i
       where i.student_id = v_student.id
         and coalesce(i.is_voided, false) = false
         and i.term = public.get_current_term())
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
    ), '[]'::json),
    'permission_requests', coalesce((
      select json_agg(json_build_object(
        'reason', pr.reason,
        'status', pr.status,
        'created_at', pr.created_at,
        'decided_at', pr.decided_at
      ) order by pr.created_at desc)
      from public.permission_requests pr
      where lower(pr.student_number) = lower(v_student.student_number)
    ), '[]'::json)
  ) into v_result;

  return v_result;
end;
$$;
