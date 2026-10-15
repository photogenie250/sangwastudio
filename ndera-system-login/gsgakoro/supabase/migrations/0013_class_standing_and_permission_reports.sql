-- ============================================================
-- SDMS — daily class standing (girls/boys/total + who has an
-- approved permission that day) and a date-range report of
-- permission requests, for the "students who got permission this
-- term" report.
--
-- get_class_standing(p_date):
--   One row per class: female/male/total active-student counts,
--   plus the names of students with an APPROVED permission request
--   for that date. A request is matched to a class two ways —
--   first via student_number -> students.class_id (the reliable
--   path, available once staff link the request to a real student
--   record), falling back to matching the free-text student_class
--   typed on the walk-in form against classes.class_name when no
--   student_number was recorded. Defaults to today, so opening the
--   dashboard on a Monday shows Monday's standing without arguments.
--
-- get_permission_requests_by_date_range(p_start, p_end):
--   Flat list of every request in a date range (any status), with
--   the student's resolved class name — the source for the
--   Reports page's termly "students who got permission" report.
--   Mirrors the shape/pattern of get_incidents_by_date_range.
-- ============================================================

create or replace function public.get_class_standing(p_date date default current_date)
returns table (
  class_id uuid,
  class_name text,
  female_count bigint,
  male_count bigint,
  total_count bigint,
  permitted_count bigint,
  permitted_students json
)
language sql
stable
security definer
set search_path = public
as $$
  with class_counts as (
    select
      c.id as class_id,
      c.class_name,
      count(s.id) filter (where s.gender = 'F') as female_count,
      count(s.id) filter (where s.gender = 'M') as male_count,
      count(s.id) as total_count
    from public.classes c
    left join public.students s on s.class_id = c.id and s.status = 'active'
    group by c.id, c.class_name
  ),
  approved as (
    select
      coalesce(st.class_id, fallback_c.id) as class_id,
      coalesce(st.first_name || ' ' || st.last_name, pr.student_name) as full_name
    from public.permission_requests pr
    left join public.students st on lower(st.student_number) = lower(pr.student_number)
    left join public.classes fallback_c
      on st.id is null and lower(fallback_c.class_name) = lower(pr.student_class)
    where pr.status = 'approved'
      and pr.created_at::date = p_date
  )
  select
    cc.class_id,
    cc.class_name,
    cc.female_count,
    cc.male_count,
    cc.total_count,
    coalesce((select count(*) from approved a where a.class_id = cc.class_id), 0) as permitted_count,
    coalesce((
      select json_agg(a.full_name order by a.full_name)
      from approved a
      where a.class_id = cc.class_id
    ), '[]'::json) as permitted_students
  from class_counts cc
  order by cc.class_name;
$$;

comment on function public.get_class_standing(date) is
  'Per-class girls/boys/total (active students) plus names of students with an approved permission request on the given date (defaults to today). Powers the admin dashboard "Class standing" panel.';

grant execute on function public.get_class_standing(date) to authenticated;

create or replace function public.get_permission_requests_by_date_range(
  p_start_date date,
  p_end_date date
)
returns table (
  request_date date,
  student_name text,
  class_name text,
  status text,
  reason text,
  decided_at timestamptz,
  staff_note text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    pr.created_at::date as request_date,
    coalesce(st.first_name || ' ' || st.last_name, pr.student_name) as student_name,
    coalesce(c.class_name, pr.student_class, 'Unassigned') as class_name,
    pr.status,
    pr.reason,
    pr.decided_at,
    pr.staff_note
  from public.permission_requests pr
  left join public.students st on lower(st.student_number) = lower(pr.student_number)
  left join public.classes c on c.id = st.class_id
  where pr.created_at::date between p_start_date and p_end_date
  order by pr.created_at desc;
$$;

comment on function public.get_permission_requests_by_date_range(date, date) is
  'Every permission request (any status) submitted in a date range, with resolved class name. Powers the Reports page "Permission requests by date range" report, e.g. a full-term list of students who got permission.';

grant execute on function public.get_permission_requests_by_date_range(date, date) to authenticated;
