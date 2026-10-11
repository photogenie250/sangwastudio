-- ============================================================
-- SDMS — make recalc_student_marks term-safe
--
-- Not called from any page today (verified against every .js
-- file), but it recomputed a student's marks from ALL-TIME
-- non-voided incidents. If anyone ever ran it directly (e.g. from
-- the SQL editor to fix a marks discrepancy), it would silently
-- undo a term reset by pulling in deductions from terms that have
-- already ended. Scoping it to the current term, consistent with
-- migration 0015_academic_terms.sql, makes it safe to use for that
-- purpose without re-litigating past terms.
-- ============================================================
create or replace function public.recalc_student_marks(p_student_id uuid)
returns void
language plpgsql
set search_path = 'public', 'pg_temp'
as $$
begin
  update students
  set current_marks = greatest(
    0,
    least(40, 40 - coalesce((
      select sum(i.deduction_applied)
      from incidents i
      where i.student_id = p_student_id
        and i.is_voided = false
        and i.term = public.get_current_term()
    ), 0))
  )
  where id = p_student_id;
end;
$$;
