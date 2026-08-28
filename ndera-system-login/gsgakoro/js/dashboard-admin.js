// ============================================================
// SDMS — Admin dashboard logic
// ============================================================
import { supabase } from './supabase-client.js';
import { startInactivityLogout } from './inactivity-logout.js';
import { applyRoleNav } from './role-nav.js';

const userNameEl = document.getElementById('user-name');
const userRoleEl = document.getElementById('user-role');
const logoutBtn = document.getElementById('logout-btn');

const statActiveStudents = document.getElementById('stat-active-students');
const statClasses = document.getElementById('stat-classes');
const statIncidentsMonth = document.getElementById('stat-incidents-month');
const statIncidentsTotal = document.getElementById('stat-incidents-total');
const statBelow28 = document.getElementById('stat-below-28');
const statAverageMarks = document.getElementById('stat-average-marks');

const recentIncidentsBody = document.getElementById('recent-incidents-body');
const watchlistEl = document.getElementById('watchlist');
const topClassesBody = document.getElementById('top-classes-body');
const topStudentsBody = document.getElementById('top-students-body');

const mobileUserAvatar = document.getElementById('mobile-user-avatar');
const mobileMenuBtn = document.getElementById('mobile-menu-btn');
const sidebarCloseBtn = document.getElementById('sidebar-close-btn');
const drawerBackdrop = document.getElementById('drawer-backdrop');
const bottomNavMoreBtn = document.getElementById('bottom-nav-more');
const sidebarEl = document.getElementById('sidebar');

// ------------------------------------------------------------
// Guard: require an active session. This is the landing page
// for every role (see auth.js ROLE_REDIRECTS) — administrator,
// head_teacher, and discipline_teacher all land here after
// login, so it must not turn non-admins away. Role-specific
// UI (e.g. admin-only sidebar links) is handled separately via
// applyRoleNav(). RLS is still the real security boundary; this
// is just UX.
// ------------------------------------------------------------
async function requireSession() {
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    window.location.href = '../';
    return null;
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('role, status, first_name, last_name')
    .eq('id', session.user.id)
    .single();

  if (error || !profile || profile.status !== 'active') {
    await supabase.auth.signOut();
    window.location.href = '../';
    return null;
  }

  return profile;
}

// ------------------------------------------------------------
// Sidebar identity + logout
// ------------------------------------------------------------
function renderIdentity(profile) {
  const fullName = `${profile.first_name} ${profile.last_name}`.trim() || 'Administrator';
  userNameEl.textContent = fullName;
  userRoleEl.textContent = profile.role.replace('_', ' ');
  if (mobileUserAvatar) mobileUserAvatar.textContent = getInitials(fullName);
}

// ------------------------------------------------------------
// Mobile drawer nav (hamburger + bottom-nav "More" both open the
// same sidebar as a slide-in drawer on small screens)
// ------------------------------------------------------------
function openDrawer() {
  if (!sidebarEl) return;
  sidebarEl.classList.add('is-open');
  drawerBackdrop?.removeAttribute('hidden');
  requestAnimationFrame(() => drawerBackdrop?.classList.add('is-visible'));
  mobileMenuBtn?.setAttribute('aria-expanded', 'true');
}

function closeDrawer() {
  if (!sidebarEl) return;
  sidebarEl.classList.remove('is-open');
  drawerBackdrop?.classList.remove('is-visible');
  mobileMenuBtn?.setAttribute('aria-expanded', 'false');
  setTimeout(() => drawerBackdrop?.setAttribute('hidden', ''), 200);
}

mobileMenuBtn?.addEventListener('click', openDrawer);
bottomNavMoreBtn?.addEventListener('click', openDrawer);
sidebarCloseBtn?.addEventListener('click', closeDrawer);
drawerBackdrop?.addEventListener('click', closeDrawer);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeDrawer();
});
sidebarEl?.querySelectorAll('.sidebar__link').forEach((link) => {
  link.addEventListener('click', closeDrawer);
});

logoutBtn.addEventListener('click', async () => {
  await supabase.auth.signOut();
  window.location.href = '../';
});

// Auto sign-out after 5 minutes of inactivity, same protection as
// the parent portal — guards against a shared/office computer being
// left signed in and unattended.
startInactivityLogout({
  timeoutMs: 5 * 60 * 1000,
  onTimeout: async () => {
    await supabase.auth.signOut();
    window.location.href = '../';
  },
});

// ------------------------------------------------------------
// Dashboard stats (Step 5: get_dashboard_stats)
// ------------------------------------------------------------
async function loadStats() {
  const { data, error } = await supabase.rpc('get_dashboard_stats');

  if (error || !data || data.length === 0) {
    console.error('Failed to load dashboard stats:', error);
    return;
  }

  const stats = data[0];
  statActiveStudents.textContent = stats.total_active_students;
  statClasses.textContent = stats.total_classes;
  statIncidentsMonth.textContent = stats.incidents_this_month;
  statIncidentsTotal.textContent = stats.total_incidents_all_time;
  // "Below 28" isn't set from here — get_dashboard_stats' row doesn't
  // reliably carry that field. loadWatchlist() below sets it instead,
  // straight from get_students_below_threshold, which is the same
  // source the watchlist panel uses and is known to work.
  statAverageMarks.textContent = stats.average_marks_schoolwide ?? '—';
}

// ------------------------------------------------------------
// Recent incidents feed
// ------------------------------------------------------------
async function loadRecentIncidents() {
  const { data, error } = await supabase
    .from('incidents')
    .select(`
      id,
      deduction_applied,
      incident_date,
      students ( first_name, last_name ),
      offenses ( title )
    `)
    .eq('is_voided', false)
    .order('incident_date', { ascending: false })
    .limit(8);

  if (error) {
    console.error('Failed to load recent incidents:', error);
    recentIncidentsBody.innerHTML =
      `<p class="row-list__empty">Could not load incidents.</p>`;
    return;
  }

  if (!data || data.length === 0) {
    recentIncidentsBody.innerHTML =
      `<p class="row-list__empty">No incidents recorded yet.</p>`;
    return;
  }

  recentIncidentsBody.innerHTML = data.map((row) => {
    const name = `${row.students?.first_name ?? ''} ${row.students?.last_name ?? ''}`.trim() || 'Unknown student';
    const pal = paletteFor(name);
    return `
    <div class="row-item">
      <div class="row-item__avatar" style="background:${pal.bg};color:${pal.fg}">${escapeHtml(getInitials(name))}</div>
      <div class="row-item__body">
        <p class="row-item__title">${escapeHtml(name)}</p>
        <p class="row-item__subtitle">${escapeHtml(row.offenses?.title ?? '—')}</p>
      </div>
      <div class="row-item__meta-col">
        <p class="row-item__value">−${row.deduction_applied}</p>
        <p class="row-item__date">${formatDate(row.incident_date)}</p>
      </div>
    </div>`;
  }).join('');
}

// ------------------------------------------------------------
// Watchlist — students below 28 (Step 5: get_students_below_threshold)
// ------------------------------------------------------------
async function loadWatchlist() {
  const { data, error } = await supabase.rpc('get_students_below_threshold', { p_threshold: 28 });

  if (error) {
    console.error('Failed to load watchlist:', error);
    watchlistEl.innerHTML = `<li class="row-list__empty">Could not load the watchlist.</li>`;
    return;
  }

  // Drives the "Below 28 marks" stat card too — same RPC call the
  // watchlist panel below already relies on, so the count on top
  // always matches the names listed underneath it.
  statBelow28.textContent = data ? data.length : 0;

  if (!data || data.length === 0) {
    watchlistEl.innerHTML = `<li class="row-list__empty">No students below 28 marks.</li>`;
    return;
  }

  watchlistEl.innerHTML = data.map((s) => {
    const pal = paletteFor(s.full_name);
    return `
    <li class="row-item">
      <div class="row-item__avatar" style="background:${pal.bg};color:${pal.fg}">${escapeHtml(getInitials(s.full_name))}</div>
      <div class="row-item__body">
        <p class="row-item__title">${escapeHtml(s.full_name)}</p>
        <p class="row-item__subtitle">${escapeHtml(s.class_name ?? 'Unassigned')} · ${escapeHtml(s.student_number)}</p>
      </div>
      <div class="row-item__meta-col">
        <p class="row-item__value row-item__value--warn">${s.current_marks}</p>
      </div>
    </li>`;
  }).join('');
}

// ------------------------------------------------------------
// Best disciplined students
//
// Marks (students.current_marks) only ever go down — they exist to
// record offenses, not to recognize good behavior, and every
// student starts a term at the same 40. So "who still has full
// marks" only tells us who hasn't been caught doing something
// wrong yet, not who's actually behaving best. To surface real
// recognition, teachers can "like" a student for good behavior
// (see js/students.js and the student_likes table) — this panel
// ranks active students by how many teacher likes they've earned.
//
// Eligibility: only students still at full marks (current_marks =
// 40, i.e. no incident recorded against them this term) are ever
// shown here. The moment an incident is recorded for a student,
// js/incidents.js deletes their existing likes — losing marks
// dismisses a student from this rating entirely, so a student
// can't appear here on the strength of likes earned before an
// incident put them in the wrong.
// ------------------------------------------------------------
async function loadTopStudents() {
  const { data: eligible, error } = await supabase
    .from('students')
    .select('id, first_name, last_name, student_number, classes ( class_name )')
    .eq('status', 'active')
    .eq('current_marks', 40);

  if (error) {
    console.error('Failed to load eligible students:', error);
    topStudentsBody.innerHTML =
      `<p class="row-list__empty">Could not load student data.</p>`;
    return;
  }

  if (!eligible || eligible.length === 0) {
    topStudentsBody.innerHTML =
      `<p class="row-list__empty">No students currently at full marks.</p>`;
    return;
  }

  const eligibleIds = eligible.map((s) => s.id);
  const { data: likes, error: likesError } = await supabase
    .from('student_likes')
    .select('student_id')
    .in('student_id', eligibleIds);

  if (likesError) {
    console.error('Failed to load likes for top students:', likesError);
  }

  const likeCounts = {};
  (likes ?? []).forEach((l) => {
    likeCounts[l.student_id] = (likeCounts[l.student_id] ?? 0) + 1;
  });

  const ranked = eligible
    .map((s) => ({ ...s, like_count: likeCounts[s.id] ?? 0 }))
    .filter((s) => s.like_count > 0)
    .sort((a, b) => {
      if (b.like_count !== a.like_count) return b.like_count - a.like_count;
      return a.last_name.localeCompare(b.last_name);
    })
    .slice(0, 5);

  if (ranked.length === 0) {
    topStudentsBody.innerHTML =
      `<p class="row-list__empty">No likes given yet — teachers can like a well-behaved student from their profile on the Students page.</p>`;
    return;
  }

  topStudentsBody.innerHTML = ranked.map((s, i) => {
    const rank = i + 1;
    const rankClass = rank <= 3 ? `rank-badge--${rank}` : 'rank-badge--other';
    return `
    <div class="row-item">
      <div class="rank-badge ${rankClass}">${rank}</div>
      <div class="row-item__body">
        <p class="row-item__title">${escapeHtml(s.first_name)} ${escapeHtml(s.last_name)}</p>
        <p class="row-item__subtitle">${escapeHtml(s.student_number)}</p>
      </div>
      <div class="row-item__meta-col row-item__meta-col--inline">
        <span class="row-item__class">${escapeHtml(s.classes?.class_name ?? 'Unassigned')}</span>
        <span class="like-pill">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M2 21h4V9H2v12zm19.83-10.5c.11-.25.17-.53.17-.83v-1.5C22 7.17 20.83 6 19.5 6H14l1.13-4.03c.02-.09.03-.19.03-.28 0-.35-.14-.67-.38-.9L13.9 0 7.44 6.47C7.16 6.75 7 7.13 7 7.54V19a2 2 0 0 0 2 2h9.09c.61 0 1.16-.35 1.42-.9l3.29-7.68c.13-.28.2-.6.2-.92z"/></svg>
          ${s.like_count}
        </span>
      </div>
    </div>`;
  }).join('');
}

// ------------------------------------------------------------
// Top disciplined classes (Step 5: get_top_disciplined_classes)
// ------------------------------------------------------------
async function loadTopClasses() {
  const { data, error } = await supabase.rpc('get_top_disciplined_classes', { p_limit: 5 });

  if (error) {
    console.error('Failed to load top classes:', error);
    topClassesBody.innerHTML =
      `<p class="row-list__empty">Could not load class data.</p>`;
    return;
  }

  if (!data || data.length === 0) {
    topClassesBody.innerHTML =
      `<p class="row-list__empty">No incidents recorded yet.</p>`;
    return;
  }

  topClassesBody.innerHTML = data.map((c) => `
    <a class="class-row" href="../classes/">
      <span class="class-row__name">${escapeHtml(c.class_name)}</span>
      <span class="class-row__stat">${c.total_incidents} incidents</span>
      <span class="class-row__stat">${c.average_marks ?? '—'} avg. marks</span>
      <svg class="class-row__chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
    </a>
  `).join('');
}

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------
function formatDate(isoDate) {
  if (!isoDate) return '—';
  const d = new Date(isoDate);
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

// Initials + a stable pastel color for a name — used by the avatar
// circles in the Recent incidents, Watchlist and Best disciplined
// students rows.
const AVATAR_PALETTE = [
  { bg: '#FBE4D5', fg: '#C1611B' },
  { bg: '#E6DFF7', fg: '#6B46C1' },
  { bg: '#DCE8FB', fg: '#1D4ED8' },
  { bg: '#FDE0E0', fg: '#C1392B' },
  { bg: '#DFF3E4', fg: '#1E7A46' },
  { bg: '#FEF3C7', fg: '#B45309' },
];

function getInitials(name) {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '—';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function paletteFor(name) {
  const seed = name ?? '';
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}

// ------------------------------------------------------------
// Boot
// ------------------------------------------------------------
(async function init() {
  const profile = await requireSession();
  if (!profile) return;

  renderIdentity(profile);
  if (!applyRoleNav(profile.role)) return;

  await Promise.all([
    loadStats(),
    loadRecentIncidents(),
    loadWatchlist(),
    loadTopStudents(),
    loadTopClasses(),
  ]);
})();
