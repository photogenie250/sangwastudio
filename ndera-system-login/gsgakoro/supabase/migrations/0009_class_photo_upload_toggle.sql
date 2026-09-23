-- ============================================================
-- SDMS — Per-class control over student profile photo upload
--
-- 0008_student_photos.sql turned the feature on for every student
-- everywhere. This migration lets an administrator restrict it to
-- specific classes instead — e.g. pilot it on 2 classes first —
-- via a checkbox on the Classes admin page.
--
-- IMPORTANT — run this manually in the Supabase SQL editor for
-- project svairnqnnvxcwjasuziz, same as 0004-0008 before it.
--
-- Design: the flag lives on `classes`, not `students`, so enabling
-- it for a class immediately covers every student in it (including
-- ones added later) with a single toggle, and admins can select
-- several classes at once and flip them all in one action.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Column — off by default, so existing classes don't suddenly
--    gain the feature the moment this migration runs.
-- ------------------------------------------------------------
alter table public.classes
  add column if not exists photo_upload_enabled boolean not null default false;

comment on column public.classes.photo_upload_enabled is
  'When true, students in this class (via students.class_id) can capture/upload a profile photo from the parent/student portal. Toggled from the admin Classes page; supports enabling multiple classes at once.';

-- ------------------------------------------------------------
-- 2. Read RPC — now also reports whether the feature is on for
--    this student's class, so the portal can hide/disable the
--    camera button rather than let the tap fail at upload time.
-- ------------------------------------------------------------
create or replace function public.parent_portal_photo(p_student_number text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_photo_url text;
  v_enabled boolean;
  v_found boolean;
begin
  select s.photo_url, coalesce(c.photo_upload_enabled, false), true
    into v_photo_url, v_enabled, v_found
  from public.students s
  left join public.classes c on c.id = s.class_id
  where lower(s.student_number) = lower(p_student_number)
  limit 1;

  if not coalesce(v_found, false) then
    return jsonb_build_object('found', false);
  end if;

  return jsonb_build_object(
    'found', true,
    'photo_url', v_photo_url,
    'upload_enabled', v_enabled
  );
end;
$$;

comment on function public.parent_portal_photo(text) is
  'Read-only, student_number-scoped profile photo URL + whether this student''s class currently allows photo upload, for the parent/student portal.';

grant execute on function public.parent_portal_photo(text) to anon, authenticated;

-- ------------------------------------------------------------
-- 3. Write RPC — now refuses to save a photo unless the
--    student's class has the feature enabled. This is enforced
--    server-side (not just hidden in the UI) since the portal's
--    anon key could otherwise be called directly.
-- ------------------------------------------------------------
create or replace function public.parent_portal_update_photo(p_student_number text, p_photo_url text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_id uuid;
  v_enabled boolean;
  v_expected_suffix text;
begin
  select s.id, coalesce(c.photo_upload_enabled, false)
    into v_student_id, v_enabled
  from public.students s
  left join public.classes c on c.id = s.class_id
  where lower(s.student_number) = lower(p_student_number)
  limit 1;

  if v_student_id is null then
    return jsonb_build_object('found', false);
  end if;

  if not v_enabled then
    return jsonb_build_object('found', true, 'upload_enabled', false);
  end if;

  v_expected_suffix := '/student-photos/' || lower(p_student_number) || '.jpg';

  if p_photo_url is null or position(v_expected_suffix in lower(p_photo_url)) = 0 then
    raise exception 'photo_url does not match this student''s expected storage path';
  end if;

  update public.students
  set photo_url = p_photo_url
  where id = v_student_id;

  return jsonb_build_object('found', true, 'upload_enabled', true, 'photo_url', p_photo_url);
end;
$$;

comment on function public.parent_portal_update_photo(text, text) is
  'The only way the anon-key parent/student portal can change students.photo_url — now additionally gated on the student''s class having photo_upload_enabled = true, checked server-side so the restriction cannot be bypassed by calling the RPC directly.';

grant execute on function public.parent_portal_update_photo(text, text) to anon, authenticated;
