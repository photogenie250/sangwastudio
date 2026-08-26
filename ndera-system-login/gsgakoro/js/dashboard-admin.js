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

// New topbar + chart elements
const searchInputEl = document.getElementById('dash-search-input');
const searchResultsEl = document.getElementById('dash-search-results');
const notifBtn = document.getElementById('dash-notif-btn');
const notifDot = document.getElementById('dash-notif-dot');
const notifDropdown = document.getElementById('dash-notif-dropdown');
const calendarBtn = document.getElementById('dash-calendar-btn');
const calendarPop = document.getElementById('dash-calendar-pop');
const calendarDateEl = document.getElementById('dash-calendar-date');
const avatarBtn = document.getElementById('dash-avatar-btn');
const avatarDropdown = document.getElementById('dash-avatar-dropdown');
const avatarInitialEl = document.getElementById('dash-avatar-initial');
const avatarNameEl = document.getElementById('dash-avatar-name');
const dropdownNameEl = document.getElementById('dash-dropdown-name');
const dropdownRoleEl = document.getElementById('dash-dropdown-role');
const dropdownSignoutBtn = document.getElementById('dash-dropdown-signout');
const overviewChartEl = document.getElementById('incidents-overview-chart');
const categoriesWrapEl = document.getElementById('incident-categories-wrap');

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

// Tracks the two notification inputs across their independent loads
// so updateNotifications() only fires once both are known.
const notifState = { belowCount: null, todayIncidentCount: null };
function maybeUpdateNotifications() {
  if (notifState.belowCount === null || notifState.todayIncidentCount === null) return;
  updateNotifications(notifState);
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
// Today's incident count, for the notification bell
// ------------------------------------------------------------
async function loadTodayIncidentCount() {
  const today = new Date().toISOString().slice(0, 10);
  const { count, error } = await supabase
    .from('incidents')
    .select('id', { count: 'exact', head: true })
    .eq('is_voided', false)
    .eq('incident_date', today);

  notifState.todayIncidentCount = error ? 0 : (count ?? 0);
  maybeUpdateNotifications();
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
  notifState.belowCount = data ? data.length : 0;
  maybeUpdateNotifications();

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
      `<tr><td colspan="3" class="data-table__empty">Could not load student data.</td></tr>`;
    return;
  }

  if (!eligible || eligible.length === 0) {
    topStudentsBody.innerHTML =
      `<tr><td colspan="3" class="data-table__empty">No students currently at full marks.</td></tr>`;
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
      `<tr><td colspan="3" class="data-table__empty">No likes given yet — teachers can like a well-behaved student from their profile on the Students page.</td></tr>`;
    return;
  }

  topStudentsBody.innerHTML = ranked.map((s, i) => `
    <tr class="${i === 0 ? 'top-student-row--first' : ''}">
      <td>${i === 0 ? '🏆 ' : ''}${escapeHtml(s.first_name)} ${escapeHtml(s.last_name)}<br><span class="data-table__meta" style="font-family: var(--font-mono); font-size: 11px; color: var(--charcoal-soft);">${escapeHtml(s.student_number)}</span></td>
      <td>${escapeHtml(s.classes?.class_name ?? 'Unassigned')}</td>
      <td class="data-table__marks data-table__marks--good">👍 ${s.like_count}</td>
    </tr>
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
// Topbar: avatar identity + dropdown, notifications, calendar
// ------------------------------------------------------------
function renderTopbarIdentity(profile) {
  const name = `${profile.first_name} ${profile.last_name}`.trim() || 'Administrator';
  const initial = (profile.first_name || name || '?').trim().charAt(0).toUpperCase();
  avatarInitialEl.textContent = initial || '•';
  avatarNameEl.textContent = name;
  dropdownNameEl.textContent = name;
  dropdownRoleEl.textContent = profile.role.replace('_', ' ');
}

function closeAllTopbarPopovers() {
  notifDropdown.classList.remove('is-open');
  calendarPop.classList.remove('is-open');
  avatarDropdown.classList.remove('is-open');
  searchResultsEl.classList.remove('is-open');
}

function toggleTopbarPopover(el) {
  const willOpen = !el.classList.contains('is-open');
  closeAllTopbarPopovers();
  if (willOpen) el.classList.add('is-open');
}

function wireTopbarChrome() {
  notifBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleTopbarPopover(notifDropdown); });
  calendarBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleTopbarPopover(calendarPop); });
  avatarBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleTopbarPopover(avatarDropdown); });

  document.addEventListener('click', closeAllTopbarPopovers);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeAllTopbarPopovers(); });

  dropdownSignoutBtn.addEventListener('click', async () => {
    await supabase.auth.signOut();
    window.location.href = '../';
  });

  calendarDateEl.textContent = new Date().toLocaleDateString(undefined, {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

// Notification bell surfaces the two things on this dashboard that
// actually need someone's attention — no separate query, it reuses
// whatever loadWatchlist()/loadRecentIncidents() already fetched.
function updateNotifications({ belowCount, todayIncidentCount }) {
  const items = [];
  if (belowCount > 0) {
    items.push(`<a class="topbar-dropdown__item" href="../students/">${belowCount} student${belowCount === 1 ? '' : 's'} below 28 marks</a>`);
  }
  if (todayIncidentCount > 0) {
    items.push(`<a class="topbar-dropdown__item" href="../incidents/">${todayIncidentCount} incident${todayIncidentCount === 1 ? '' : 's'} recorded today</a>`);
  }
  notifDot.hidden = items.length === 0;
  notifDropdown.innerHTML = items.length
    ? items.join('')
    : '<p style="padding:10px;font-size:12.5px;color:var(--charcoal-soft);">You\'re all caught up.</p>';
}

// ------------------------------------------------------------
// Dashboard quick search — students + offenses, live
// ------------------------------------------------------------
let searchDebounce;
searchInputEl?.addEventListener('input', () => {
  clearTimeout(searchDebounce);
  const term = searchInputEl.value.trim();
  if (term.length < 2) {
    searchResultsEl.classList.remove('is-open');
    return;
  }
  searchDebounce = setTimeout(() => runDashboardSearch(term), 260);
});
searchInputEl?.addEventListener('click', (e) => e.stopPropagation());
searchResultsEl?.addEventListener('click', (e) => e.stopPropagation());

async function runDashboardSearch(term) {
  const [{ data: students }, { data: offenses }] = await Promise.all([
    supabase
      .from('students')
      .select('id, first_name, last_name, student_number, classes ( class_name )')
      .or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%,student_number.ilike.%${term}%`)
      .limit(5),
    supabase
      .from('offenses')
      .select('id, title')
      .ilike('title', `%${term}%`)
      .eq('is_active', true)
      .limit(4),
  ]);

  const groups = [];

  if (students && students.length) {
    groups.push(`<p class="topbar-search__group-label">Students</p>` + students.map((s) => `
      <a class="topbar-search__item" href="../students/?q=${encodeURIComponent(s.student_number)}">
        ${escapeHtml(`${s.first_name} ${s.last_name}`)}
        <small>${escapeHtml(s.classes?.class_name ?? 'Unassigned')} · ${escapeHtml(s.student_number)}</small>
      </a>
    `).join(''));
  }

  if (offenses && offenses.length) {
    groups.push(`<p class="topbar-search__group-label">Offenses</p>` + offenses.map((o) => `
      <a class="topbar-search__item" href="../offenses/">${escapeHtml(o.title)}</a>
    `).join(''));
  }

  searchResultsEl.innerHTML = groups.length
    ? groups.join('')
    : `<p class="topbar-search__empty">No matches for "${escapeHtml(term)}".</p>`;
  searchResultsEl.classList.add('is-open');
}

// ------------------------------------------------------------
// Incidents overview (line chart) + Incident categories (donut)
//
// Both read from get_incidents_by_date_range for the last 35 days —
// one query, two views. Hand-rolled inline SVG rather than pulling
// in a charting library, consistent with this project's approach of
// avoiding extra third-party runtime dependencies.
// ------------------------------------------------------------
const CATEGORY_COLORS = ['#14336B', '#C1392B', '#E2711D', '#1E7A46', '#6C4FC9', '#0E7C86'];

async function loadOverviewAndCategories() {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 34);
  const fmt = (d) => d.toISOString().slice(0, 10);

  const { data, error } = await supabase.rpc('get_incidents_by_date_range', {
    p_start_date: fmt(start),
    p_end_date: fmt(end),
  });

  if (error || !data) {
    console.error('Failed to load incidents overview:', error);
    overviewChartEl.innerHTML = '<p class="data-table__empty">Could not load chart data.</p>';
    categoriesWrapEl.innerHTML = '<p class="data-table__empty">Could not load category data.</p>';
    return;
  }

  renderWeeklyChart(data, end);
  renderCategoryDonut(data);
}

function renderWeeklyChart(rows, end) {
  const weeks = [];
  for (let i = 4; i >= 0; i--) {
    const weekEnd = new Date(end);
    weekEnd.setDate(end.getDate() - i * 7);
    const weekStart = new Date(weekEnd);
    weekStart.setDate(weekEnd.getDate() - 6);
    weeks.push({ start: weekStart, end: weekEnd, incidents: 0, deductions: 0 });
  }

  rows.forEach((r) => {
    const d = new Date(r.incident_date);
    const bucket = weeks.find((w) => d >= w.start && d <= w.end);
    if (bucket) {
      bucket.incidents += 1;
      bucket.deductions += r.deduction_applied || 0;
    }
  });

  const W = 460, H = 190, padL = 28, padR = 10, padT = 14, padB = 26;
  const maxVal = Math.max(1, ...weeks.map((w) => Math.max(w.incidents, w.deductions)));
  const stepX = (W - padL - padR) / (weeks.length - 1);
  const yFor = (v) => H - padB - (v / maxVal) * (H - padT - padB);
  const xFor = (i) => padL + i * stepX;

  const linePath = (key) => weeks.map((w, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i)} ${yFor(w[key])}`).join(' ');
  const dots = (key, color) => weeks.map((w, i) => `<circle cx="${xFor(i)}" cy="${yFor(w[key])}" r="3" fill="${color}"/>`).join('');
  const gridLines = [0, 0.5, 1].map((f) => {
    const y = padT + f * (H - padT - padB);
    return `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="#E1E7F2" stroke-width="1"/>`;
  }).join('');
  const labels = weeks.map((w, i) => `<text x="${xFor(i)}" y="${H - 6}" text-anchor="middle">${i === weeks.length - 1 ? 'This wk' : `-${(weeks.length - 1 - i)}w`}</text>`).join('');

  overviewChartEl.innerHTML = `
    <svg class="line-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">
      ${gridLines}
      <path d="${linePath('incidents')}" fill="none" stroke="#14336B" stroke-width="2"/>
      <path d="${linePath('deductions')}" fill="none" stroke="#C1392B" stroke-width="2"/>
      ${dots('incidents', '#14336B')}
      ${dots('deductions', '#C1392B')}
      ${labels}
    </svg>
  `;
}

function renderCategoryDonut(rows) {
  const counts = {};
  rows.forEach((r) => {
    const name = r.category_name || 'Other';
    counts[name] = (counts[name] || 0) + 1;
  });

  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((sum, [, c]) => sum + c, 0);

  if (total === 0) {
    categoriesWrapEl.innerHTML = '<p class="data-table__empty">No incidents in the last 5 weeks.</p>';
    return;
  }

  const R = 46, CX = 60, CY = 60, STROKE = 18;
  const circumference = 2 * Math.PI * R;
  let offsetAcc = 0;

  const arcs = entries.map(([name, count], i) => {
    const frac = count / total;
    const dash = frac * circumference;
    const gap = circumference - dash;
    const el = `<circle cx="${CX}" cy="${CY}" r="${R}" fill="none" stroke="${CATEGORY_COLORS[i % CATEGORY_COLORS.length]}"
      stroke-width="${STROKE}" stroke-dasharray="${dash} ${gap}" stroke-dashoffset="${-offsetAcc}" transform="rotate(-90 ${CX} ${CY})"/>`;
    offsetAcc += dash;
    return el;
  }).join('');

  const legend = entries.map(([name, count], i) => `
    <div class="donut-legend__row">
      <span class="donut-legend__name">
        <span class="donut-legend__swatch" style="background:${CATEGORY_COLORS[i % CATEGORY_COLORS.length]}"></span>
        ${escapeHtml(name)}
      </span>
      <span class="donut-legend__pct">${Math.round((count / total) * 100)}%</span>
    </div>
  `).join('');

  categoriesWrapEl.innerHTML = `
    <svg class="donut-chart" width="120" height="120" viewBox="0 0 120 120">${arcs}</svg>
    <div class="donut-legend">${legend}</div>
  `;
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
  renderTopbarIdentity(profile);
  wireTopbarChrome();
  applyRoleNav(profile.role);

  await Promise.all([
    loadStats(),
    loadRecentIncidents(),
    loadWatchlist(),
    loadTopStudents(),
    loadTopClasses(),
    loadTodayIncidentCount(),
    loadOverviewAndCategories(),
  ]);
})();
