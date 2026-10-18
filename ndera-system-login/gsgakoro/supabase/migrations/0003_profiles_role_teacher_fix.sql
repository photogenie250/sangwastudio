-- ============================================================
-- SDMS — Fix: 'teacher' role rejected on assignment
--
-- Symptom: on Users, picking "Teacher" in the role dropdown for a
-- user appears to work in the UI, but the change doesn't stick —
-- the row reverts to the old role next time the list loads.
--
-- Cause: public.profiles.role has a CHECK constraint from when the
-- table was first created, before the "teacher" role existed in the
-- app (originally only administrator / discipline_teacher /
-- head_teacher were valid). js/users.js has offered "Teacher" as an
-- option since it was added app-side, but every UPDATE that sets
-- role = 'teacher' is rejected by Postgres with a check-constraint
-- violation, which supabase-js reports as `error` — js/users.js's
-- handleRoleChange() alerts and reloads the list on that error, so
-- it looks like the save was silently undone.
--
-- Fix: replace whatever check constraint currently exists on
-- profiles.role with one that includes all four roles the app
-- actually supports.
-- ============================================================

do $$
declare
  con record;
begin
  for con in
    select conname
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%role%'
  loop
    execute format('alter table public.profiles drop constraint %I', con.conname);
  end loop;
end $$;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('administrator', 'teacher', 'discipline_teacher', 'head_teacher'));

-- If profiles.role is also restricted by an RLS UPDATE policy's
-- WITH CHECK clause (rather than, or in addition to, the column
-- constraint above), that policy needs the same four values. Run
-- this to see current policies on profiles and confirm:
--
--   select policyname, cmd, qual, with_check
--   from pg_policies
--   where schemaname = 'public' and tablename = 'profiles';
--
-- If a WITH CHECK clause hardcodes role names, update it in the
-- dashboard (Authentication → Policies) to include 'teacher' too.
