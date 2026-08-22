// ============================================================
// SDMS — Admin dashboard logic
// ============================================================
import { supabase } from './supabase-client.js';
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
  userNameEl.textContent = `${profile.first_name} ${profile.last_name}`.trim() || 'Administrator';
  userRoleEl.textContent = profile.role.replace('_', ' ');
}

logoutBtn.addEventListener('click', async () => {
  await supabase.auth.signOut();
  window.location.href = '../';
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
      `<tr><td colspan="4" class="data-table__empty">Could not load incidents.</td></tr>`;
    return;
  }

  if (!data || data.length === 0) {
    recentIncidentsBody.innerHTML =
      `<tr><td colspan="4" class="data-table__empty">No incidents recorded yet.</td></tr>`;
    return;
  }

  recentIncidentsBody.innerHTML = data.map((row) => `
    <tr>
      <td>${escapeHtml(`${row.students?.first_name ?? ''} ${row.students?.last_name ?? ''}`.trim())}</td>
      <td>${escapeHtml(row.offenses?.title ?? '—')}</td>
      <td class="data-table__deduction">−${row.deduction_applied}</td>
      <td>${formatDate(row.incident_date)}</td>
    </tr>
  `).join('');
}

// ------------------------------------------------------------
// Watchlist — students below 28 (Step 5: get_students_below_threshold)
// ------------------------------------------------------------
async function loadWatchlist() {
  const { data, error } = await supabase.rpc('get_students_below_threshold', { p_threshold: 28 });

  if (error) {
    console.error('Failed to load watchlist:', error);
    watchlistEl.innerHTML = `<li class="watch-list__empty">Could not load the watchlist.</li>`;
    return;
  }

  // Drives the "Below 28 marks" stat card too — same RPC call the
  // watchlist panel below already relies on, so the count on top
  // always matches the names listed underneath it.
  statBelow28.textContent = data ? data.length : 0;

  if (!data || data.length === 0) {
    watchlistEl.innerHTML = `<li class="watch-list__empty">No students below 28 marks.</li>`;
    return;
  }

  watchlistEl.innerHTML = data.map((s) => `
    <li class="watch-list__item">
      <div>
        <p class="watch-list__name">${escapeHtml(s.full_name)}</p>
        <p class="watch-list__meta">${escapeHtml(s.class_name ?? 'Unassigned')} · ${escapeHtml(s.student_number)}</p>
      </div>
      <span class="watch-list__marks">${s.current_marks}</span>
    </li>
  `).join('');
}

// ------------------------------------------------------------
// Top disciplined classes (Step 5: get_top_disciplined_classes)
// ------------------------------------------------------------
async function loadTopClasses() {
  const { data, error } = await supabase.rpc('get_top_disciplined_classes', { p_limit: 5 });

  if (error) {
    console.error('Failed to load top classes:', error);
    topClassesBody.innerHTML =
      `<tr><td colspan="3" class="data-table__empty">Could not load class data.</td></tr>`;
    return;
  }

  if (!data || data.length === 0) {
    topClassesBody.innerHTML =
      `<tr><td colspan="3" class="data-table__empty">No incidents recorded yet.</td></tr>`;
    return;
  }

  topClassesBody.innerHTML = data.map((c) => `
    <tr>
      <td>${escapeHtml(c.class_name)}</td>
      <td>${c.total_incidents}</td>
      <td>${c.average_marks ?? '—'}</td>
    </tr>
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

// ------------------------------------------------------------
// Boot
// ------------------------------------------------------------
(async function init() {
  const profile = await requireSession();
  if (!profile) return;

  renderIdentity(profile);
  applyRoleNav(profile.role);

  await Promise.all([
    loadStats(),
    loadRecentIncidents(),
    loadWatchlist(),
    loadTopClasses(),
  ]);
})();
