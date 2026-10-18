-- ============================================================
-- SDMS — view a specific past term's data, not just "current"
--
-- Migration 0015 scoped these reports to whatever term is
-- currently active, which is right for live dashboard panels but
-- left no way to look back at term1's numbers once term2 has
-- started (the data was never deleted — see 0015's comments — but
-- there was no way to ask for it). Adding an optional p_term
-- parameter, defaulting to the current term when omitted, means
-- every existing caller keeps working unchanged, while the Reports
-- page can now pass an explicit term to look back at.
--
-- CREATE OR REPLACE with a new parameter list creates a second
-- overload rather than replacing the function (Postgres resolves
-- functions by name + argument signature), so the old
-- single-argument versions are dropped explicitly first — leaving
-- both in place causes "function is not unique" errors on any call
-- that doesn't disambiguate by exact argument count.
-- ============================================================

drop function if exists public.get_most_common_offenses(integer);
drop function if exists public.get_top_repeated_offenders(integer);
drop function if exists public.get_top_disciplined_classes(integer);

create or replace function public.get_most_common_offenses(p_limit integer default 10, p_term text default null)
returns table (offense_id uuid, offense_title text, category_name text, times_recorded bigint, total_deductions bigint)
language sql
stable
set search_path = 'public', 'pg_temp'
as $$
  select
    o.id, o.title, oc.name,
    count(i.id) filter (where not i.is_voided and i.term = coalesce(p_term, public.get_current_term())),
    coalesce(sum(i.deduction_applied) filter (where not i.is_voided and i.term = coalesce(p_term, public.get_current_term())), 0)
  from offenses o
  join offense_categories oc on oc.id = o.category_id
  left join incidents i on i.offense_id = o.id
  group by o.id, o.title, oc.name
  order by count(i.id) filter (where not i.is_voided and i.term = coalesce(p_term, public.get_current_term())) desc
  limit p_limit;
$$;

create or replace function public.get_top_repeated_offenders(p_limit integer default 10, p_term text default null)
returns table (student_id uuid, student_number text, full_name text, class_name text, current_marks integer, total_incidents bigint)
language sql
stable
set search_path = 'public', 'pg_temp'
as $$
  select
    s.id, s.student_number, s.first_name || ' ' || s.last_name, c.class_name,
    s.current_marks, count(i.id) filter (where not i.is_voided and i.term = coalesce(p_term, public.get_current_term()))
  from students s
  left join classes c on c.id = s.class_id
  join incidents i on i.student_id = s.id
  where s.status = 'active'
  group by s.id, s.student_number, s.first_name, s.last_name, c.class_name, s.current_marks
  having count(i.id) filter (where not i.is_voided and i.term = coalesce(p_term, public.get_current_term())) > 0
  order by count(i.id) filter (where not i.is_voided and i.term = coalesce(p_term, public.get_current_term())) desc
  limit p_limit;
$$;

create or replace function public.get_top_disciplined_classes(p_limit integer default 10, p_term text default null)
returns table (class_id uuid, class_name text, total_incidents bigint, total_deductions bigint, average_marks numeric)
language sql
stable
set search_path = 'public', 'pg_temp'
as $$
  select
    c.id,
    c.class_name,
    count(i.id) filter (where not i.is_voided and i.term = coalesce(p_term, public.get_current_term())),
    coalesce(sum(i.deduction_applied) filter (where not i.is_voided and i.term = coalesce(p_term, public.get_current_term())), 0),
    round(avg(s.current_marks) filter (where s.status = 'active'), 1)
  from classes c
  left join students s on s.class_id = c.id
  left join incidents i on i.student_id = s.id
  group by c.id, c.class_name
  order by avg(s.current_marks) filter (where s.status = 'active') desc nulls last,
           count(i.id) filter (where not i.is_voided and i.term = coalesce(p_term, public.get_current_term())) asc,
           c.class_name asc
  limit p_limit;
$$;

comment on function public.get_most_common_offenses(integer, text) is
  'Offense frequency for a term — defaults to the current term, or pass p_term (''term1''/''term2''/''term3'') to look back at a past term. Powers Reports page, with a term selector for browsing history.';
comment on function public.get_top_repeated_offenders(integer, text) is
  'Repeat offenders for a term — defaults to the current term, or pass p_term to look back at a past term.';
comment on function public.get_top_disciplined_classes(integer, text) is
  'Class discipline ranking for a term — defaults to the current term, or pass p_term to look back at a past term. Average marks always reflects LIVE current_marks (a running balance, not term-partitioned) even when looking at a past term''s incident counts.';
