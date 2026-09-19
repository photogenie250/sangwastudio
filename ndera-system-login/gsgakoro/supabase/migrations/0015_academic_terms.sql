-- ============================================================
-- SDMS — academic terms (term1/term2/term3)
--
-- This system tracks student behavior TERMLY: marks start at 40
-- and go down through the term as incidents are recorded; "this
-- term" driven views (dashboard rankings, counseling eligibility,
-- parent letters, likes) were, until now, really just "all-time,
-- since there was no term boundary at all".
--
-- This migration introduces a real term boundary:
--   - school_settings: a single row holding the current term.
--   - incidents.term / student_likes.term: stamped automatically
--     at insert time with whatever the current term is, via a
--     column default that calls get_current_term(). No app code
--     needs to set this explicitly.
--   - start_new_term(p_term): the admin action that flips
--     school_settings.current_term and resets every active
--     student's marks back to 40. It does NOT delete old
--     incidents/likes — they stay in the database stamped with
--     the term they happened in, so a full historical record
--     survives — but every "this term" view below now filters by
--     the current term, so the moment a new term starts, those
--     views show a clean slate for every student, which is what
--     "everything reset, every student clean" means in practice.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Singleton settings row
-- ------------------------------------------------------------
create table if not exists public.school_settings (
  id smallint primary key default 1 check (id = 1),
  current_term text not null default 'term1' check (current_term in ('term1', 'term2', 'term3')),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);

insert into public.school_settings (id, current_term)
values (1, 'term1')
on conflict (id) do nothing;

alter table public.school_settings enable row level security;

drop policy if exists "Active staff can view school settings" on public.school_settings;
create policy "Active staff can view school settings"
  on public.school_settings
  for select
  to authenticated
  using (
    exists (select 1 from public.profiles where id = auth.uid() and status = 'active')
  );
-- No direct insert/update/delete policies — changes only happen
-- through the security-definer start_new_term() function below.

-- ------------------------------------------------------------
-- 2. Helper to read the current term (used as a column default)
-- ------------------------------------------------------------
create or replace function public.get_current_term()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select current_term from public.school_settings where id = 1;
$$;

grant execute on function public.get_current_term() to authenticated, anon;

create or replace function public.get_school_settings()
returns table (current_term text)
language sql
stable
security definer
set search_path = public
as $$
  select current_term from public.school_settings where id = 1;
$$;

comment on function public.get_school_settings() is
  'Returns the single current-term settings row. Read by every page via js/term.js so "this term" queries know what to filter by.';

grant execute on function public.get_school_settings() to authenticated;

-- ------------------------------------------------------------
-- 3. Term-tag incidents & student_likes going forward
-- ------------------------------------------------------------
alter table public.incidents
  add column if not exists term text not null default public.get_current_term()
    check (term in ('term1', 'term2', 'term3'));

alter table public.student_likes
  add column if not exists term text not null default public.get_current_term()
    check (term in ('term1', 'term2', 'term3'));

create index if not exists idx_incidents_term on public.incidents(term);
create index if not exists idx_student_likes_term on public.student_likes(term);

-- ------------------------------------------------------------
-- 4. start_new_term() — the admin action
-- ------------------------------------------------------------
create or replace function public.start_new_term(p_term text)
returns table (previous_term text, new_term text, students_reset bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_previous_term text;
  v_reset_count bigint;
begin
  v_role := public.current_user_role();

  if v_role is null or v_role not in ('administrator', 'head_teacher') then
    raise exception 'Only an administrator or head teacher can start a new term.';
  end if;

  if p_term not in ('term1', 'term2', 'term3') then
    raise exception 'Invalid term: %. Must be term1, term2 or term3.', p_term;
  end if;

  select current_term into v_previous_term from public.school_settings where id = 1;

  update public.school_settings
  set current_term = p_term, updated_at = now(), updated_by = auth.uid()
  where id = 1;

  update public.students
  set current_marks = 40
  where status = 'active';

  get diagnostics v_reset_count = row_count;

  return query select v_previous_term, p_term, v_reset_count;
end;
$$;

comment on function public.start_new_term(text) is
  'Admin/head_teacher only. Switches school_settings.current_term and resets every active student''s marks to 40. Old incidents/likes are kept (stamped with the term they happened in) but every "this term" report now filters to the new term, so the app shows a clean slate.';

grant execute on function public.start_new_term(text) to authenticated;

-- ------------------------------------------------------------
-- 5. Scope existing "this term" reporting functions to the
--    current term (previously these silently meant "all-time",
--    since there was no term boundary to filter by).
-- ------------------------------------------------------------
create or replace function public.get_top_disciplined_classes(p_limit integer default 10)
returns table (class_id uuid, class_name text, total_incidents bigint, total_deductions bigint, average_marks numeric)
language sql
stable
set search_path = 'public', 'pg_temp'
as $$
  select
    c.id,
    c.class_name,
    count(i.id) filter (where not i.is_voided and i.term = public.get_current_term()),
    coalesce(sum(i.deduction_applied) filter (where not i.is_voided and i.term = public.get_current_term()), 0),
    round(avg(s.current_marks) filter (where s.status = 'active'), 1)
  from classes c
  left join students s on s.class_id = c.id
  left join incidents i on i.student_id = s.id
  group by c.id, c.class_name
  order by avg(s.current_marks) filter (where s.status = 'active') desc nulls last,
           count(i.id) filter (where not i.is_voided and i.term = public.get_current_term()) asc,
           c.class_name asc
  limit p_limit;
$$;

create or replace function public.get_most_common_offenses(p_limit integer default 10)
returns table (offense_id uuid, offense_title text, category_name text, times_recorded bigint, total_deductions bigint)
language sql
stable
set search_path = 'public', 'pg_temp'
as $$
  select
    o.id, o.title, oc.name,
    count(i.id) filter (where not i.is_voided and i.term = public.get_current_term()),
    coalesce(sum(i.deduction_applied) filter (where not i.is_voided and i.term = public.get_current_term()), 0)
  from offenses o
  join offense_categories oc on oc.id = o.category_id
  left join incidents i on i.offense_id = o.id
  group by o.id, o.title, oc.name
  order by count(i.id) filter (where not i.is_voided and i.term = public.get_current_term()) desc
  limit p_limit;
$$;

create or replace function public.get_top_repeated_offenders(p_limit integer default 10)
returns table (student_id uuid, student_number text, full_name text, class_name text, current_marks integer, total_incidents bigint)
language sql
stable
set search_path = 'public', 'pg_temp'
as $$
  select
    s.id, s.student_number, s.first_name || ' ' || s.last_name, c.class_name,
    s.current_marks, count(i.id) filter (where not i.is_voided and i.term = public.get_current_term())
  from students s
  left join classes c on c.id = s.class_id
  join incidents i on i.student_id = s.id
  where s.status = 'active'
  group by s.id, s.student_number, s.first_name, s.last_name, c.class_name, s.current_marks
  having count(i.id) filter (where not i.is_voided and i.term = public.get_current_term()) > 0
  order by count(i.id) filter (where not i.is_voided and i.term = public.get_current_term()) desc
  limit p_limit;
$$;

create or replace function public.get_like_counts()
returns table (student_id uuid, like_count bigint)
language sql
stable
set search_path = 'public', 'pg_temp'
as $$
  select student_id, count(*) as like_count
  from public.student_likes
  where term = public.get_current_term()
  group by student_id;
$$;

create or replace function public.get_student_report(p_student_id uuid)
returns table (student_id uuid, student_number text, full_name text, class_name text, current_marks integer, status text, total_incidents bigint, total_deductions bigint, last_incident_date date)
language sql
stable
set search_path = 'public', 'pg_temp'
as $$
  select
    s.id, s.student_number, s.first_name || ' ' || s.last_name, c.class_name,
    s.current_marks, s.status,
    count(i.id) filter (where not i.is_voided and i.term = public.get_current_term()),
    coalesce(sum(i.deduction_applied) filter (where not i.is_voided and i.term = public.get_current_term()), 0),
    max(i.incident_date) filter (where not i.is_voided and i.term = public.get_current_term())
  from students s
  left join classes c on c.id = s.class_id
  left join incidents i on i.student_id = s.id
  where s.id = p_student_id
  group by s.id, s.student_number, s.first_name, s.last_name, c.class_name, s.current_marks, s.status;
$$;
