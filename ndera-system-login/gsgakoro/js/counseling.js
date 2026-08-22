// ============================================================
// SDMS — Counseling logic
//
// A student becomes eligible for counseling this term when either:
//   - their term marks (out of 40) drop below MARKS_THRESHOLD, or
//   - they have INCIDENT_THRESHOLD or more non-voided incidents
//     recorded this term.
// Term marks reset to 40 at the start of each term (see students.js),
// so "this term" is simply every non-voided incident currently on
// record — there is no separate date-boundary to filter by.
//
// Expects a `counseling_sessions` table:
//   id, student_id, reason, scheduled_date, status, notes, created_at
// with status in ('scheduled', 'completed', 'cancelled').
// ============================================================
import { supabase } from './supabase-client.js';
import { startInactivityLogout } from './inactivity-logout.js';
import { applyRoleNav } from './role-nav.js';

const MARKS_THRESHOLD = 28;
const INCIDENT_THRESHOLD = 3;

const userNameEl = document.getElementById('user-name');
const userRoleEl = document.getElementById('user-role');
const logoutBtn = document.getElementById('logout-btn');

const marksThresholdLabel = document.getElementById('marks-threshold-label');
const counselingLayout = document.getElementById('counseling-layout');

const eligibleBody = document.getElementById('eligible-body');
const sessionsBody = document.getElementById('sessions-body');

const sessionFormPanel = document.getElementById('session-form-panel');
const sessionForm = document.getElementById('session-form');
const sessionFormTitle = document.getElementById('session-form-title');
const sessionFormStudent = document.getElementById('session-form-student');
const sessionFormError = document.getElementById('session-form-error');
const sessionStudentIdInput = document.getElementById('session-student-id');
const sessionIdInput = document.getElementById('session-id');
const sessionReasonInput = document.getElementById('session-reason');
const sessionDateInput = document.getElementById('session-date');
const sessionStatusSelect = document.getElementById('session-status');
const sessionNotesInput = document.getElementById('session-notes');
const sessionSubmitBtn = document.getElementById('session-submit-btn');
const sessionCancelBtn = document.getElementById('session-cancel-btn');

const printAllReportsBtn = document.getElementById('print-all-reports-btn');
const reportPanel = document.getElementById('report-panel');
const reportContent = document.getElementById('report-content');
const reportPrintArea = document.getElementById('report-print-area');
const printReportBtn = document.getElementById('print-report-btn');
const closeReportBtn = document.getElementById('close-report-btn');

let currentRole = null;
let currentUserName = '';
let eligibleCache = [];
let sessionsCache = [];

// ------------------------------------------------------------
// Session guard — any active, authenticated role can view
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
  currentUserName = `${profile.first_name} ${profile.last_name}`.trim() || 'User';
  userNameEl.textContent = currentUserName;
  userRoleEl.textContent = profile.role.replace('_', ' ');
  applyRoleNav(profile.role);
  currentRole = profile.role;
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
// Eligible students
// ------------------------------------------------------------
async function loadEligibleStudents() {
  eligibleBody.innerHTML = `<tr><td colspan="6" class="data-table__empty">Loading…</td></tr>`;

  const { data: students, error: studentsError } = await supabase
    .from('students')
    .select('id, first_name, last_name, student_number, current_marks, parent_phone, class_id, classes ( class_name )')
    .eq('status', 'active');

  if (studentsError || !students) {
    console.error('Failed to load students:', studentsError);
    eligibleBody.innerHTML = `<tr><td colspan="6" class="data-table__empty">Could not load students.</td></tr>`;
    return;
  }

  const { data: incidents, error: incidentsError } = await supabase
    .from('incidents')
    .select('student_id')
    .eq('is_voided', false);

  if (incidentsError) {
    console.error('Failed to load incidents:', incidentsError);
  }

  const incidentCounts = {};
  (incidents ?? []).forEach((i) => {
    incidentCounts[i.student_id] = (incidentCounts[i.student_id] ?? 0) + 1;
  });

  eligibleCache = students
    .map((s) => ({ ...s, incident_count: incidentCounts[s.id] ?? 0 }))
    .filter((s) => s.current_marks < MARKS_THRESHOLD || s.incident_count >= INCIDENT_THRESHOLD)
    .sort((a, b) => a.current_marks - b.current_marks);

  renderEligible(eligibleCache);
}

function reasonFor(s) {
  const reasons = [];
  if (s.current_marks < MARKS_THRESHOLD) reasons.push(`Low term marks (${s.current_marks}/40)`);
  if (s.incident_count >= INCIDENT_THRESHOLD) reasons.push(`${s.incident_count} incidents this term`);
  return reasons.join(' · ');
}

function renderEligible(students) {
  if (students.length === 0) {
    eligibleBody.innerHTML = `<tr><td colspan="6" class="data-table__empty">No students currently meet the counseling criteria.</td></tr>`;
    return;
  }

  const canSchedule = currentRole === 'administrator' || currentRole === 'teacher';

  eligibleBody.innerHTML = students.map((s) => `
    <tr data-id="${s.id}">
      <td>${escapeHtml(s.first_name)} ${escapeHtml(s.last_name)}<br><span class="data-table__meta" style="font-family: var(--font-mono); font-size: 11px; color: var(--charcoal-soft);">${escapeHtml(s.student_number)}</span></td>
      <td>${escapeHtml(s.classes?.class_name ?? 'Unassigned')}</td>
      <td class="data-table__marks${s.current_marks < MARKS_THRESHOLD ? ' data-table__marks--low' : ''}">${s.current_marks}</td>
      <td>${s.incident_count}</td>
      <td><span class="reason-badge">${escapeHtml(reasonFor(s))}</span></td>
      <td>
        <div class="row-actions">
          ${canSchedule ? '<button class="row-action-btn" data-action="schedule">Schedule</button>' : ''}
        </div>
      </td>
    </tr>
  `).join('');

  if (canSchedule) {
    eligibleBody.querySelectorAll('[data-action="schedule"]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = e.target.closest('tr').dataset.id;
        const student = eligibleCache.find((s) => s.id === id);
        if (student) openSessionForm(student);
      });
    });
  }
}

// ------------------------------------------------------------
// Session log
// ------------------------------------------------------------
async function loadSessions() {
  sessionsBody.innerHTML = `<tr><td colspan="5" class="data-table__empty">Loading…</td></tr>`;

  const { data, error } = await supabase
    .from('counseling_sessions')
    .select('id, student_id, reason, scheduled_date, status, notes, students ( first_name, last_name, student_number )')
    .order('scheduled_date', { ascending: false });

  if (error) {
    console.error('Failed to load counseling sessions:', error);
    sessionsBody.innerHTML = `<tr><td colspan="5" class="data-table__empty">Could not load counseling sessions.</td></tr>`;
    return;
  }

  sessionsCache = data ?? [];
  renderSessions(sessionsCache);
}

function renderSessions(sessions) {
  if (sessions.length === 0) {
    sessionsBody.innerHTML = `<tr><td colspan="5" class="data-table__empty">No counseling sessions logged yet.</td></tr>`;
    printAllReportsBtn.disabled = true;
    return;
  }

  printAllReportsBtn.disabled = false;

  const isAdmin = currentRole === 'administrator' || currentRole === 'teacher';

  sessionsBody.innerHTML = sessions.map((s) => `
    <tr data-id="${s.id}">
      <td>${escapeHtml(`${s.students?.first_name ?? ''} ${s.students?.last_name ?? ''}`.trim())}<br><span class="data-table__meta" style="font-family: var(--font-mono); font-size: 11px; color: var(--charcoal-soft);">${escapeHtml(s.students?.student_number ?? '')}</span></td>
      <td>${formatDate(s.scheduled_date)}</td>
      <td><span class="session-status-badge session-status-badge--${s.status}">${escapeHtml(s.status)}</span></td>
      <td>${escapeHtml(s.notes || s.reason || '—')}</td>
      <td>
        <div class="row-actions">
          <button class="row-action-btn" data-action="print-report">Print report</button>
          ${isAdmin ? '<button class="row-action-btn" data-action="edit-session">Edit</button>' : ''}
        </div>
      </td>
    </tr>
  `).join('');

  if (isAdmin) {
    sessionsBody.querySelectorAll('[data-action="edit-session"]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = e.target.closest('tr').dataset.id;
        const record = sessionsCache.find((s) => s.id === id);
        if (record) startEditSession(record);
      });
    });
  }

  sessionsBody.querySelectorAll('[data-action="print-report"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const id = e.target.closest('tr').dataset.id;
      const record = sessionsCache.find((s) => s.id === id);
      if (record) previewReport(record);
    });
  });
}

// ------------------------------------------------------------
// Session form
// ------------------------------------------------------------
function openSessionForm(student) {
  sessionFormPanel.hidden = false;
  counselingLayout.classList.add('form-open');
  sessionFormStudent.textContent =
    `${student.first_name} ${student.last_name} · ${student.student_number} · ${student.classes?.class_name ?? 'Unassigned'}`;
  sessionStudentIdInput.value = student.id;
  sessionReasonInput.value = reasonFor(student);
  sessionFormPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function startEditSession(record) {
  sessionFormPanel.hidden = false;
  counselingLayout.classList.add('form-open');
  sessionFormTitle.textContent = 'Edit counseling session';
  sessionFormStudent.textContent =
    `${record.students?.first_name ?? ''} ${record.students?.last_name ?? ''} · ${record.students?.student_number ?? ''}`.trim();
  sessionIdInput.value = record.id;
  sessionStudentIdInput.value = record.student_id;
  sessionReasonInput.value = record.reason ?? '';
  sessionDateInput.value = record.scheduled_date ?? '';
  sessionStatusSelect.value = record.status ?? 'scheduled';
  sessionNotesInput.value = record.notes ?? '';
  sessionSubmitBtn.textContent = 'Save changes';
  sessionFormError.hidden = true;
}

function resetSessionForm() {
  sessionForm.reset();
  sessionIdInput.value = '';
  sessionStudentIdInput.value = '';
  sessionFormTitle.textContent = 'Schedule counseling';
  sessionFormStudent.textContent = '—';
  sessionSubmitBtn.textContent = 'Save session';
  sessionFormError.hidden = true;
  sessionFormPanel.hidden = true;
  counselingLayout.classList.remove('form-open');
}

sessionCancelBtn.addEventListener('click', resetSessionForm);

sessionForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  sessionFormError.hidden = true;

  const id = sessionIdInput.value;
  const payload = {
    student_id: sessionStudentIdInput.value,
    reason: sessionReasonInput.value.trim(),
    scheduled_date: sessionDateInput.value,
    status: sessionStatusSelect.value,
    notes: sessionNotesInput.value.trim() || null,
  };

  if (!payload.student_id) {
    sessionFormError.textContent = 'No student selected — open this form from the eligible students list.';
    sessionFormError.hidden = false;
    return;
  }

  const { error } = id
    ? await supabase.from('counseling_sessions').update(payload).eq('id', id)
    : await supabase.from('counseling_sessions').insert(payload);

  if (error) {
    console.error('Could not save counseling session:', error);
    sessionFormError.textContent = 'Could not save this session.';
    sessionFormError.hidden = false;
    return;
  }

  resetSessionForm();
  await loadSessions();
});

// ------------------------------------------------------------
// Counseling report — addressed to the Headteacher, GS GAKORO
// ------------------------------------------------------------
function buildReportHtml(session) {
  const today = new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
  const fullName = `${session.students?.first_name ?? ''} ${session.students?.last_name ?? ''}`.trim() || '—';
  const studentNumber = session.students?.student_number ?? '—';

  return `
    <div class="report-paper">
      <div class="report-letterhead">
        <img src="assets/img/ndera-logo.svg" alt="" class="report-logo">
        <div>
          <p class="report-school">GS GAKORO</p>
          <p class="report-school-sub">Student Discipline Management System</p>
        </div>
      </div>

      <p class="report-title">Counseling Report</p>
      <p class="report-date">${today}</p>

      <p class="report-addressee">
        To: The Headteacher
        <span>GS GAKORO</span>
      </p>

      <p>
        Please find below a summary of the counseling session recorded for the
        student named below, submitted for your information and records.
      </p>

      <table class="report-details">
        <tbody>
          <tr><th>Student</th><td>${escapeHtml(fullName)}</td></tr>
          <tr><th>Student number</th><td>${escapeHtml(studentNumber)}</td></tr>
          <tr><th>Reason</th><td>${escapeHtml(session.reason || '—')}</td></tr>
          <tr><th>Scheduled date</th><td>${formatDate(session.scheduled_date)}</td></tr>
          <tr><th>Status</th><td>${escapeHtml(session.status || '—')}</td></tr>
          <tr><th>Session notes</th><td>${escapeHtml(session.notes || '—')}</td></tr>
        </tbody>
      </table>

      <p>
        Kindly let us know if any further action or follow-up from your office
        is required regarding this case.
      </p>

      <p class="report-signoff">Respectfully submitted,<br>${escapeHtml(currentUserName || 'Discipline Office')}<br>Discipline Office, GS GAKORO</p>
    </div>
  `;
}

function previewReport(session) {
  reportContent.innerHTML = buildReportHtml(session);
  reportPanel.hidden = false;
  reportPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

closeReportBtn.addEventListener('click', () => {
  reportPanel.hidden = true;
  reportContent.innerHTML = '';
});

printReportBtn.addEventListener('click', () => {
  reportPanel.classList.add('printing');
  window.print();
});

printAllReportsBtn.addEventListener('click', () => {
  if (sessionsCache.length === 0) return;
  reportPrintArea.innerHTML = sessionsCache.map(buildReportHtml).join('');
  reportPrintArea.classList.add('printing');
  window.print();
});

window.addEventListener('afterprint', () => {
  reportPanel.classList.remove('printing');
  reportPrintArea.classList.remove('printing');
  reportPrintArea.innerHTML = '';
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

// ------------------------------------------------------------
// Boot
// ------------------------------------------------------------
(async function init() {
  const profile = await requireSession();
  if (!profile) return;

  renderIdentity(profile);
  marksThresholdLabel.textContent = String(MARKS_THRESHOLD);

  await Promise.all([loadEligibleStudents(), loadSessions()]);
})();
