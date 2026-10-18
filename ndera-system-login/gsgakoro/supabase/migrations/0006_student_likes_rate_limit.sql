-- ============================================================
-- SDMS — Student likes: 3 per teacher per day, 10 minutes apart
--
-- NOTE ON HOW THIS MIGRATION CAME TOGETHER:
-- The live database already had a trigger enforcing like limits
-- (trg_enforce_like_rules -> enforce_like_rules()) that was not
-- present anywhere in this project's migration history — it must
-- have been applied directly at some point without a matching file
-- checked in here. Its rules were also different from what's below:
-- a 5-minute cooldown, and a cap of 5 likes per day per STUDENT
-- shared across every teacher (not 3 per teacher).
--
-- This migration updates that existing function in place (so there
-- stays exactly one trigger on student_likes, not two stacked ones)
-- to the rule actually wanted:
--
--   1. At most 3 likes per (teacher, student) PER TEACHER per
--      school day — each teacher gets their own allowance of 3,
--      it isn't shared across teachers liking the same student.
--   2. At least 10 minutes between two likes from the same teacher
--      for the same student.
--
-- The full-marks eligibility check (current_marks = 40) and the
-- Africa/Kigali school-day boundary from the original function are
-- both kept as-is. An incident still clears all of a student's
-- likes regardless of who gave them (js/incidents.js) — unchanged.
--
-- Errors are raised with stable prefixes (like_not_eligible,
-- like_rate_limited, like_daily_limit_reached) that js/students.js
-- matches on to show a friendly message — keep those prefixes
-- stable if this function is edited again.
-- ============================================================

create or replace function public.enforce_like_rules()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_last_like_at timestamptz;
  v_today_count integer;
  v_current_marks integer;
  v_seconds_left integer;
  v_day_start timestamptz;
  v_day_end timestamptz;
begin
  -- Eligibility: only students at full marks (40/40, no incident
  -- recorded this term) can receive a like.
  select current_marks into v_current_marks
  from public.students
  where id = new.student_id;

  if v_current_marks is distinct from 40 then
    raise exception 'like_not_eligible: student must have full marks (40/40) to receive a like'
      using errcode = 'P0001';
  end if;

  -- Per-teacher cooldown: 10 minutes must pass since this same
  -- teacher's last like to this same student.
  select max(created_at) into v_last_like_at
  from public.student_likes
  where student_id = new.student_id
    and teacher_id = new.teacher_id;

  if v_last_like_at is not null and now() - v_last_like_at < interval '10 minutes' then
    v_seconds_left := ceil(extract(epoch from (interval '10 minutes' - (now() - v_last_like_at))));
    raise exception 'like_rate_limited: wait % seconds before liking this student again', v_seconds_left
      using errcode = 'P0001';
  end if;

  -- Per-teacher daily cap: at most 3 likes from the SAME teacher to
  -- the SAME student per school day (Africa/Kigali calendar day, so
  -- the cutoff lines up with the actual school day rather than UTC
  -- midnight). Each teacher gets their own separate allowance of 3.
  v_day_start := date_trunc('day', now() at time zone 'Africa/Kigali') at time zone 'Africa/Kigali';
  v_day_end := v_day_start + interval '1 day';

  select count(*) into v_today_count
  from public.student_likes
  where student_id = new.student_id
    and teacher_id = new.teacher_id
    and created_at >= v_day_start
    and created_at < v_day_end;

  if v_today_count >= 3 then
    raise exception 'like_daily_limit_reached: you have already liked this student 3 times today'
      using errcode = 'P0001';
  end if;

  return new;
end;
$function$;

comment on function public.enforce_like_rules() is
  'Caps each teacher to 3 likes per student per school day (Africa/Kigali calendar day), at least 10 minutes apart. Sole rate-limit trigger on student_likes — mirrors js/students.js client-side state.';

-- Defensive cleanup: if this migration is ever run against a copy of
-- the database that only has the old file-based 0004 unique
-- constraint (student_likes_student_id_teacher_id_key) and never saw
-- the undocumented live trigger described above, drop that
-- constraint too so multiple likes per (student, teacher) are
-- possible at all.
alter table public.student_likes
  drop constraint if exists student_likes_student_id_teacher_id_key;
