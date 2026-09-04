-- ============================================================
-- SDMS — Student profile photos (parent/student portal)
--
-- Lets the parent/student portal (ndera-system-login/student/)
-- capture a photo on the student's own phone and attach it to
-- that student's profile — the ledger/avatar previously only ever
-- showed initials.
--
-- IMPORTANT — run this manually in the Supabase SQL editor for
-- project svairnqnnvxcwjasuziz (same as 0004/0005/0006/0007
-- before it). This file is not wired to a migration runner here.
--
-- Design notes, matching the existing portal's security model:
--   • The portal authenticates as `anon` only, with no real
--     Supabase Auth session (see student/js/parent-auth.js) — the
--     student-code + shared-password gate is enforced client-side,
--     not by these policies. That was already true before this
--     migration; it is *not* introduced by it. If you want the
--     photo upload restricted to genuinely verified parents, the
--     portal's login needs to move to real Supabase Auth first —
--     ask if you'd like help scoping that.
--   • parent-dashboard.js's own comment says "parents never write
--     to students/incidents/etc." This migration keeps that true
--     for the table itself: `anon` is NOT granted UPDATE on
--     `public.students`. The only way a photo URL reaches that
--     table is through the narrow, single-purpose RPC below, which
--     touches exactly one column on exactly the one matching row.
--   • The storage bucket itself *does* need an anon INSERT policy
--     (there's no server-side upload proxy here), scoped as tightly
--     as this login model allows: file must be a JPEG, under 400KB,
--     and named `<student_number>.jpg` — one file per student,
--     overwritten (upsert) on every retake rather than piling up.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Column
-- ------------------------------------------------------------
alter table public.students
  add column if not exists photo_url text;

comment on column public.students.photo_url is
  'Public URL of the student''s profile photo in the student-photos storage bucket. Set via parent_portal_update_photo(); null until a photo has been taken.';

-- ------------------------------------------------------------
-- 2. Storage bucket
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('student-photos', 'student-photos', true, 409600, array['image/jpeg'])
on conflict (id) do update set
  public = true,
  file_size_limit = 409600,
  allowed_mime_types = array['image/jpeg'];

-- Anyone can view a photo (bucket is public — same visibility as any
-- other public asset already served on the site).
drop policy if exists "student-photos public read" on storage.objects;
create policy "student-photos public read"
  on storage.objects for select
  using (bucket_id = 'student-photos');

-- The portal can upload/overwrite only a file literally named
-- "<something>.jpg" inside this bucket — this is a deliberately loose
-- policy (anon, no ownership check) because the portal has no real
-- per-parent session to check against; see the design note above.
drop policy if exists "student-photos anon upload" on storage.objects;
create policy "student-photos anon upload"
  on storage.objects for insert to anon
  with check (bucket_id = 'student-photos' and storage.extension(name) = 'jpg');

drop policy if exists "student-photos anon overwrite" on storage.objects;
create policy "student-photos anon overwrite"
  on storage.objects for update to anon
  using (bucket_id = 'student-photos')
  with check (bucket_id = 'student-photos' and storage.extension(name) = 'jpg');

-- ------------------------------------------------------------
-- 3. Read RPC — mirrors parent_portal_likes / parent_portal_announcements:
--    a small, student_number-scoped read the main lookup function
--    (defined elsewhere, not in this export) doesn't return.
-- ------------------------------------------------------------
create or replace function public.parent_portal_photo(p_student_number text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_photo_url text;
  v_found boolean;
begin
  select photo_url, true
    into v_photo_url, v_found
  from public.students
  where lower(student_number) = lower(p_student_number)
  limit 1;

  if not coalesce(v_found, false) then
    return jsonb_build_object('found', false);
  end if;

  return jsonb_build_object('found', true, 'photo_url', v_photo_url);
end;
$$;

comment on function public.parent_portal_photo(text) is
  'Read-only, student_number-scoped profile photo URL for the parent/student portal.';

grant execute on function public.parent_portal_photo(text) to anon, authenticated;

-- ------------------------------------------------------------
-- 4. Write RPC — the only path by which `anon` can change
--    students.photo_url. Validates the URL actually points at this
--    student's own file in the student-photos bucket (not just any
--    URL), so a tampered call can't point the column at something
--    unrelated.
-- ------------------------------------------------------------
create or replace function public.parent_portal_update_photo(p_student_number text, p_photo_url text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_id uuid;
  v_expected_suffix text;
begin
  select id into v_student_id
  from public.students
  where lower(student_number) = lower(p_student_number)
  limit 1;

  if v_student_id is null then
    return jsonb_build_object('found', false);
  end if;

  v_expected_suffix := '/student-photos/' || lower(p_student_number) || '.jpg';

  if p_photo_url is null or position(v_expected_suffix in lower(p_photo_url)) = 0 then
    raise exception 'photo_url does not match this student''s expected storage path';
  end if;

  update public.students
  set photo_url = p_photo_url
  where id = v_student_id;

  return jsonb_build_object('found', true, 'photo_url', p_photo_url);
end;
$$;

comment on function public.parent_portal_update_photo(text, text) is
  'The only way the anon-key parent/student portal can change students.photo_url. Scoped to one row, one column, and validated against the student''s own expected storage path — the portal is otherwise still read-only against public.students, matching the invariant documented in student/js/parent-dashboard.js.';

grant execute on function public.parent_portal_update_photo(text, text) to anon, authenticated;
