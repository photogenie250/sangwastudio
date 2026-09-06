-- ============================================================
-- SDMS — Expose student_likes to the parent/student portal
--
-- The parent portal (ndera-system-login/student/) signs in with a
-- shared password, never a real Supabase Auth session, so it can
-- only ever reach data through SECURITY DEFINER RPCs (see
-- parent_portal_lookup from 0003_parent_portal.sql, not included in
-- this export). student_likes itself is locked to `authenticated`
-- staff only (0004_student_likes.sql), so the anon key the portal
-- uses cannot select it directly — this migration adds a small,
-- separate RPC just for that, rather than touching the existing
-- lookup function blind.
--
-- Same eligibility rule as the staff app: a student is only
-- "likeable" while at full marks (current_marks = 40, i.e. no
-- incident recorded against them this term). The moment an incident
-- is logged, js/incidents.js deletes their existing likes and the
-- staff Like button stays disabled until marks reset for a new term
-- — this RPC surfaces that same eligible flag so the portal can
-- explain *why* likes are frozen, instead of just showing a number.
--
-- Status: applied directly to the live project (svairnqnnvxcwjasuziz)
-- via Supabase MCP, along with 0004_student_likes.sql which had been
-- written but never actually run against that database. Both are
-- live as of this commit — this file is kept for history/reference,
-- not as a pending migration to run.
-- ============================================================

create or replace function public.parent_portal_likes(p_student_number text)
returns jsonb
language plpgsql
security definer
set search_path = public
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
  where student_id = v_student_id;

  return jsonb_build_object(
    'found', true,
    'likes_count', coalesce(v_likes_count, 0),
    -- Mirrors the staff-app rule exactly: only students who still
    -- have every mark this term (nothing lost to an incident) are
    -- eligible to be liked or to keep accumulating likes.
    'eligible', (v_current_marks = 40),
    'current_marks', v_current_marks
  );
end;
$$;

comment on function public.parent_portal_likes(text) is
  'Read-only, student_number-scoped like count + eligibility for the parent/student portal. Mirrors the like-eligibility rule enforced in js/incidents.js and js/students.js: eligible only at full (40) marks; an incident clears likes and blocks new ones until marks reset next term.';

-- Anon is the only role the portal ever authenticates as (see
-- student/js/supabase-client.js) — grant matches parent_portal_lookup.
grant execute on function public.parent_portal_likes(text) to anon, authenticated;
