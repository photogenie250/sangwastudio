// ============================================================
// SDMS — Reports logic
// ============================================================
import { supabase } from './supabase-client.js';
import { startInactivityLogout } from './inactivity-logout.js';
import { applyRoleNav } from './role-nav.js';

const userNameEl = document.getElementById('user-name');
const userRoleEl = document.getElementById('user-role');
const logoutBtn = document.getElementById('logout-btn');

const commonOffensesBody = document.getElementById('common-offenses-body');
const repeatOffendersBody = document.getElementById('repeat-offenders-body');

const rangeForm = document.getElementById('range-form');
const rangeStart = document.getElementById('range-start');
const rangeEnd = document.getElementById('range-end');
const rangeSummary = document.getElementById('range-summary');
const rangeBody = document.getElementById('range-body');

// ------------------------------------------------------------
// Session guard
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

function renderIdentity(profile) {
  userNameEl.textContent = `${profile.first_name} ${profile.last_name}`.trim() || 'User';
  userRoleEl.textContent = profile.role.replace('_', ' ');
  return applyRoleNav(profile.role);
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
// Most common offenses
// ------------------------------------------------------------
async function loadCommonOffenses() {
  const { data, error } = await supabase.rpc('get_most_common_offenses', { p_limit: 10 });

  if (error || !data) {
    commonOffensesBody.innerHTML = `<tr><td colspan="4" class="data-table__empty">Could not load this report.</td></tr>`;
    return;
  }

  if (data.length === 0) {
    commonOffensesBody.innerHTML = `<tr><td colspan="4" class="data-table__empty">No incidents recorded yet.</td></tr>`;
    return;
  }

  commonOffensesBody.innerHTML = data.map((o) => `
    <tr>
      <td>${escapeHtml(o.offense_title)}</td>
      <td>${escapeHtml(o.category_name)}</td>
      <td>${o.times_recorded}</td>
      <td class="data-table__deduction">−${o.total_deductions}</td>
    </tr>
  `).join('');
}

// ------------------------------------------------------------
// Top repeated offenders
// ------------------------------------------------------------
async function loadRepeatOffenders() {
  const { data, error } = await supabase.rpc('get_top_repeated_offenders', { p_limit: 10 });

  if (error || !data) {
    repeatOffendersBody.innerHTML = `<tr><td colspan="4" class="data-table__empty">Could not load this report.</td></tr>`;
    return;
  }

  if (data.length === 0) {
    repeatOffendersBody.innerHTML = `<tr><td colspan="4" class="data-table__empty">No incidents recorded yet.</td></tr>`;
    return;
  }

  repeatOffendersBody.innerHTML = data.map((s) => `
    <tr>
      <td>${escapeHtml(s.full_name)}</td>
      <td>${escapeHtml(s.class_name ?? 'Unassigned')}</td>
      <td>${s.total_incidents}</td>
      <td>${s.current_marks}</td>
    </tr>
  `).join('');
}

// ------------------------------------------------------------
// Date-range report
// ------------------------------------------------------------
rangeForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const start = rangeStart.value;
  const end = rangeEnd.value;

  if (!start || !end) return;

  if (start > end) {
    rangeSummary.hidden = false;
    rangeSummary.textContent = 'The start date must be before the end date.';
    return;
  }

  rangeBody.innerHTML = `<tr><td colspan="7" class="data-table__empty">Loading…</td></tr>`;

  const { data, error } = await supabase.rpc('get_incidents_by_date_range', {
    p_start_date: start,
    p_end_date: end,
  });

  if (error) {
    console.error('Failed to load date range report:', error);
    rangeBody.innerHTML = `<tr><td colspan="7" class="data-table__empty">Could not load this report.</td></tr>`;
    rangeSummary.hidden = true;
    return;
  }

  if (!data || data.length === 0) {
    rangeBody.innerHTML = `<tr><td colspan="7" class="data-table__empty">No incidents in this date range.</td></tr>`;
    rangeSummary.hidden = false;
    rangeSummary.innerHTML = `<strong>0</strong> incidents found.`;
    return;
  }

  const totalDeductions = data.reduce((sum, row) => sum + row.deduction_applied, 0);
  rangeSummary.hidden = false;
  rangeSummary.innerHTML = `<strong>${data.length}</strong> incidents found · <strong>${totalDeductions}</strong> total points deducted.`;

  rangeBody.innerHTML = data.map((row) => `
    <tr>
      <td>${formatDate(row.incident_date)}</td>
      <td>${escapeHtml(row.student_name)}</td>
      <td>${escapeHtml(row.class_name ?? 'Unassigned')}</td>
      <td>${escapeHtml(row.offense_title)}</td>
      <td>${escapeHtml(row.category_name)}</td>
      <td class="data-table__deduction">−${row.deduction_applied}</td>
      <td>${escapeHtml(row.teacher_name)}</td>
    </tr>
  `).join('');
});

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------
function formatDate(isoDate) {
  if (!isoDate) return '—';
  return new Date(isoDate).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

function firstAndLastOfMonth() {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return [first.toISOString().slice(0, 10), last.toISOString().slice(0, 10)];
}

// ------------------------------------------------------------
// Boot
// ------------------------------------------------------------
(async function init() {
  const profile = await requireSession();
  if (!profile) return;

  if (!renderIdentity(profile)) return;

  const [firstOfMonth, lastOfMonth] = firstAndLastOfMonth();
  rangeStart.value = firstOfMonth;
  rangeEnd.value = lastOfMonth;

  await Promise.all([loadCommonOffenses(), loadRepeatOffenders()]);
})();
