// ============================================================
// SDMS — Reports logic
// ============================================================
import { supabase } from './supabase-client.js';
import { startInactivityLogout } from './inactivity-logout.js';
import { applyRoleNav } from './role-nav.js';
import { getCurrentTerm, TERM_LABELS } from './term.js';

const userNameEl = document.getElementById('user-name');
const userRoleEl = document.getElementById('user-role');
const logoutBtn = document.getElementById('logout-btn');

const commonOffensesBody = document.getElementById('common-offenses-body');
const repeatOffendersBody = document.getElementById('repeat-offenders-body');
const reportTermSelect = document.getElementById('report-term-select');
const reportTermNote = document.getElementById('report-term-note');

const rangeForm = document.getElementById('range-form');
const rangeStart = document.getElementById('range-start');
const rangeEnd = document.getElementById('range-end');
const rangeSummary = document.getElementById('range-summary');
const rangeBody = document.getElementById('range-body');

const permissionRangeForm = document.getElementById('permission-range-form');
const permissionRangeStart = document.getElementById('permission-range-start');
const permissionRangeEnd = document.getElementById('permission-range-end');
const permissionRangeSummary = document.getElementById('permission-range-summary');
const permissionRangeBody = document.getElementById('permission-range-body');

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
//
// p_term is null (→ "Current term" in the dropdown) by default,
// which the RPC treats as "use whatever term is active right now"
// — see get_current_term() / migration 0018_term_history_reports.
// Picking a specific term looks back at that term's data instead;
// nothing is ever deleted when a new term starts (migration
// 0015_academic_terms.sql), so past terms stay fully queryable.
// ------------------------------------------------------------
async function loadCommonOffenses(term) {
  commonOffensesBody.innerHTML = `<tr><td colspan="4" class="data-table__empty">Loading…</td></tr>`;
  const { data, error } = await supabase.rpc('get_most_common_offenses', { p_limit: 10, p_term: term || null });

  if (error || !data) {
    console.error('Failed to load common offenses:', error);
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
async function loadRepeatOffenders(term) {
  repeatOffendersBody.innerHTML = `<tr><td colspan="4" class="data-table__empty">Loading…</td></tr>`;
  const { data, error } = await supabase.rpc('get_top_repeated_offenders', { p_limit: 10, p_term: term || null });

  if (error || !data) {
    console.error('Failed to load repeat offenders:', error);
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

reportTermSelect.addEventListener('change', async () => {
  const term = reportTermSelect.value;
  const label = term ? TERM_LABELS[term] : TERM_LABELS[await getCurrentTerm()] + ' (current)';
  reportTermNote.textContent = `Showing the offense and repeat-offender reports below for ${label}. Old terms' data isn't deleted when a new term starts — pick a term above to look back.`;
  await Promise.all([loadCommonOffenses(term), loadRepeatOffenders(term)]);
});

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
// Permission requests by date range — e.g. set From/To to the
// term's start/end for a full-term list of students who got
// permission (or a single day for a daily check).
// ------------------------------------------------------------
permissionRangeForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const start = permissionRangeStart.value;
  const end = permissionRangeEnd.value;

  if (!start || !end) return;

  if (start > end) {
    permissionRangeSummary.hidden = false;
    permissionRangeSummary.textContent = 'The start date must be before the end date.';
    return;
  }

  permissionRangeBody.innerHTML = `<tr><td colspan="6" class="data-table__empty">Loading…</td></tr>`;

  const { data, error } = await supabase.rpc('get_permission_requests_by_date_range', {
    p_start_date: start,
    p_end_date: end,
  });

  if (error) {
    console.error('Failed to load permission requests range report:', error);
    permissionRangeBody.innerHTML = `<tr><td colspan="6" class="data-table__empty">Could not load this report.</td></tr>`;
    permissionRangeSummary.hidden = true;
    return;
  }

  if (!data || data.length === 0) {
    permissionRangeBody.innerHTML = `<tr><td colspan="6" class="data-table__empty">No permission requests in this date range.</td></tr>`;
    permissionRangeSummary.hidden = false;
    permissionRangeSummary.innerHTML = `<strong>0</strong> requests found.`;
    return;
  }

  const approvedCount = data.filter((row) => row.status === 'approved').length;
  permissionRangeSummary.hidden = false;
  permissionRangeSummary.innerHTML = `<strong>${data.length}</strong> requests found · <strong>${approvedCount}</strong> approved.`;

  permissionRangeBody.innerHTML = data.map((row) => `
    <tr>
      <td>${formatDate(row.request_date)}</td>
      <td>${escapeHtml(row.student_name)}</td>
      <td>${escapeHtml(row.class_name ?? 'Unassigned')}</td>
      <td><span class="status-badge status-badge--${escapeHtml(row.status)}">${escapeHtml(row.status)}</span></td>
      <td>${escapeHtml(row.reason ?? '—')}</td>
      <td>${escapeHtml(row.staff_note ?? '—')}</td>
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
