-- ============================================================
-- SDMS — Head teacher announcements to students
--
-- Lets a head teacher (or administrator) post an announcement that
-- shows up on a student's profile — either school-wide, to one
-- class, or to one specific student. Mirrors the audience model a
-- reader would expect: exactly one of audience_class_id /
-- audience_student_id is set, matching audience_type.
--
-- Read access is intentionally open to any authenticated staff
-- account (a teacher opening a student's profile in js/students.js
-- should see what's been announced to them, even though only head
-- teachers/administrators can author or retract one). Write access
-- is restricted to head_teacher/administrator, same pattern as
-- classes/offenses/users.
--
-- Also adds parent_portal_announcements(), a read-only RPC in the
-- same shape as parent_portal_likes (0005_parent_portal_likes.sql)
-- so the separate parent/student portal (ndera-system-login/student/,
-- not part of this export) can surface the same announcements to
-- students/parents directly, once that codebase is wired up to call
-- it — this migration only adds the database side of that.
-- ============================================================

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  audience_type text not null check (audience_type in ('all', 'class', 'student')),
  audience_class_id uuid references public.classes(id) on delete cascade,
  audience_student_id uuid references public.students(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  is_active boolean not null default true,
  constraint announcements_audience_target_matches_type check (
    (audience_type = 'all'     and audience_class_id is null     and audience_student_id is null)
    or (audience_type = 'class'   and audience_class_id is not null and audience_student_id is null)
    or (audience_type = 'student' and audience_student_id is not null and audience_class_id is null)
  )
);

comment on table public.announcements is
  'Head-teacher-authored announcements shown on a student''s profile — targeted at all students, one class, or one specific student.';

create index if not exists announcements_class_idx on public.announcements (audience_class_id) where audience_class_id is not null;
create index if not exists announcements_student_idx on public.announcements (audience_student_id) where audience_student_id is not null;
create index if not exists announcements_active_created_idx on public.announcements (is_active, created_at desc);

alter table public.announcements enable row level security;

-- Any signed-in staff account can read announcements (needed so a
-- teacher opening a student's profile sees what's been announced to
-- them) — writing is restricted below.
create policy "announcements_select_staff" on public.announcements
  for select
  to authenticated
  using (true);

create policy "announcements_insert_head_teacher" on public.announcements
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('administrator', 'head_teacher')
    )
  );

create policy "announcements_update_head_teacher" on public.announcements
  for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('administrator', 'head_teacher')
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('administrator', 'head_teacher')
    )
  );

create policy "announcements_delete_head_teacher" on public.announcements
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('administrator', 'head_teacher')
    )
  );

-- ------------------------------------------------------------
-- Parent/student portal read access
-- ------------------------------------------------------------
create or replace function public.parent_portal_announcements(p_student_number text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_id uuid;
  v_class_id uuid;
  v_result jsonb;
begin
  select id, class_id
    into v_student_id, v_class_id
  from public.students
  where lower(student_number) = lower(p_student_number)
  limit 1;

  if v_student_id is null then
    return jsonb_build_object('found', false);
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', a.id,
        'title', a.title,
        'body', a.body,
        'created_at', a.created_at
      )
      order by a.created_at desc
    ),
    '[]'::jsonb
  )
    into v_result
  from public.announcements a
  where a.is_active
    and (a.expires_at is null or a.expires_at > now())
    and (
      a.audience_type = 'all'
      or (a.audience_type = 'class' and a.audience_class_id = v_class_id)
      or (a.audience_type = 'student' and a.audience_student_id = v_student_id)
    );

  return jsonb_build_object('found', true, 'announcements', v_result);
end;
$$;

comment on function public.parent_portal_announcements(text) is
  'Read-only, student_number-scoped list of active, non-expired announcements (all-school, their class, or targeted at them individually), for the parent/student portal. Same security model as parent_portal_likes.';

grant execute on function public.parent_portal_announcements(text) to anon, authenticated;
