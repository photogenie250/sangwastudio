// ============================================================
// SDMS — Shared sidebar role visibility
//
// Head teachers and discipline teachers are allowed to load
// several pages (they get a working session), but a few pages
// are administrator-only. Rather than let them click into a
// page and hit an "admin only" notice, hide those sidebar
// links up front so the nav only shows what the signed-in
// role can actually use.
//
// Teachers have the same full access as administrators (they
// can do everything except delete records), so they see every
// sidebar link too — the per-page delete controls are what
// stay hidden for them, not whole pages.
//
// This does NOT replace access control — every page still
// guards itself (and RLS is the real security boundary). This
// is UX only.
// ============================================================

const ADMIN_ONLY_HREFS = ['../classes/', '../offenses/', '../users/'];
const FULL_ACCESS_ROLES = ['administrator', 'teacher'];

export function applyRoleNav(role) {
  if (FULL_ACCESS_ROLES.includes(role)) return; // nothing to hide

  document.querySelectorAll('.sidebar__link').forEach((link) => {
    const href = link.getAttribute('href');
    if (ADMIN_ONLY_HREFS.includes(href)) {
      link.remove();
    }
  });
}
