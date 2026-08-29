// ============================================================
// SDMS — Shared sidebar role visibility
//
// The two roles actually in use on this account are teacher and
// head_teacher (administrator still exists for setup/support).
//
// - head_teacher: full access, same as administrator — sees
//   every sidebar link and every page's edit/delete controls.
// - teacher: scoped to just the Students page. The only things a
//   teacher account can do are remove marks (record an incident)
//   and like a student for good behavior, and both of those now
//   live right on the Students page (open a student's profile,
//   then use the panels there) — so a teacher has no reason to
//   see any other page. Their sidebar shows only "Students", and
//   if they load (or link-hop, or type in the address bar)
//   anything else, applyRoleNav sends them straight back to it.
//
// discipline_teacher keeps its narrower existing scope (every
// page except Classes/Offenses/Users).
//
// This does NOT replace access control — every page still
// guards itself (and RLS is the real security boundary). This
// is UX only: it keeps a teacher from wandering into pages that
// aren't meant for their role, it isn't what actually stops them
// from reading or writing anything there.
// ============================================================

const ADMIN_ONLY_HREFS = ['../classes/', '../offenses/', '../users/'];
const FULL_ACCESS_ROLES = ['administrator', 'head_teacher'];
const TEACHER_ALLOWED_HREFS = ['../students/'];

// Returns true if the current page is one this role is allowed to
// be on (after hiding/trimming the sidebar to match); false if the
// caller has already been redirected away and should stop loading
// page data.
export function applyRoleNav(role) {
  const activeLink = document.querySelector('.sidebar__link--active');
  const currentHref = activeLink?.getAttribute('href') ?? null;

  if (role === 'teacher') {
    document.querySelectorAll('.sidebar__link').forEach((link) => {
      const href = link.getAttribute('href');
      if (!TEACHER_ALLOWED_HREFS.includes(href)) link.remove();
    });

    if (currentHref && !TEACHER_ALLOWED_HREFS.includes(currentHref)) {
      window.location.href = '../students/';
      return false;
    }
    return true;
  }

  if (FULL_ACCESS_ROLES.includes(role)) return true; // nothing to hide

  document.querySelectorAll('.sidebar__link').forEach((link) => {
    const href = link.getAttribute('href');
    if (ADMIN_ONLY_HREFS.includes(href)) {
      link.remove();
    }
  });
  return true;
}
