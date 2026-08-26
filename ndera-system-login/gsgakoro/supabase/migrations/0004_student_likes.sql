-- ============================================================
-- SDMS — Student likes (teacher-given good-behavior rating)
--
-- Marks (students.current_marks) only ever go down — they exist
-- to record offenses, not to recognize good behavior. This table
-- gives teachers a second, separate signal: a "like" they can give
-- a student for behaving well, so the system can identify the best
-- disciplined students from something other than "didn't lose
-- marks yet".
--
-- Important: a student is only eligible to be liked while they
-- still have full marks (current_marks = 40, i.e. no incident
-- recorded against them this term) — the app enforces that at the
-- UI level. The moment an incident is recorded for a student, the
-- app also deletes any existing rows here for that student (see
-- js/incidents.js) — losing marks dismisses them from the "best
-- disciplined" rating entirely, rather than just lowering it.
--
-- One row per (student, teacher) pair — a teacher can like a
-- student once, and can remove their own like (unlike), but can't
-- stack multiple likes on the same student.
-- ============================================================

create table if not exists public.student_likes (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (student_id, teacher_id)
);

create index if not exists student_likes_student_id_idx on public.student_likes (student_id);

alter table public.student_likes enable row level security;

-- Any active staff account can see who liked whom (drives the
-- like count shown on the Students list/profile and the Dashboard).
create policy "Active staff can view student likes"
  on public.student_likes
  for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.status = 'active'
    )
  );

-- A teacher can only insert a like as themselves.
create policy "Active staff can like a student"
  on public.student_likes
  for insert
  to authenticated
  with check (
    teacher_id = auth.uid()
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.status = 'active'
    )
  );

-- A teacher can only remove their own like (unlike).
create policy "Active staff can remove their own like"
  on public.student_likes
  for delete
  to authenticated
  using (teacher_id = auth.uid());
