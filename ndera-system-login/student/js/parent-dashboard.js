// ============================================================
// SDMS — Parent portal dashboard
//
// Reads the student code this tab signed in with (session-scoped,
// set by parent-auth.js), fetches that one student's summary via
// the parent_portal_lookup Postgres function, and renders it.
// Read-only — parents never write to students/incidents/etc.
// ============================================================
import { supabase } from './supabase-client.js';
import { startInactivityLogout } from './inactivity-logout.js';

const CODE_KEY = 'sdms_parent_student_code';
const TIMEOUT_FLAG_KEY = 'sdms_parent_timed_out';
const INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

const loadingState = document.getElementById('loading-state');
const errorState = document.getElementById('error-state');
const errorMessage = document.getElementById('error-message');
const content = document.getElementById('content');

const studentNameEl = document.getElementById('student-name');
const studentMetaEl = document.getElementById('student-meta');
const studentStatusEl = document.getElementById('student-status');

const marksValueEl = document.getElementById('marks-value');
const marksBarEl = document.getElementById('marks-bar');

const incidentsBody = document.getElementById('incidents-body');

const counselingList = document.getElementById('counseling-list');

const letterCard = document.getElementById('letter-card');
const letterCountText = document.getElementById('letter-count-text');

const contactLink = document.getElementById('contact-link');
const logoutBtn = document.getElementById('logout-btn');

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = value ?? '';
  return div.innerHTML;
}

function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function showError(message) {
  loadingState.hidden = true;
  content.hidden = true;
  errorState.hidden = false;
  errorMessage.textContent = message;
}

function logout() {
  sessionStorage.removeItem(CODE_KEY);
  window.location.href = '../';
}

logoutBtn.addEventListener('click', logout);

startInactivityLogout({
  timeoutMs: INACTIVITY_TIMEOUT_MS,
  onTimeout: () => {
    sessionStorage.setItem(TIMEOUT_FLAG_KEY, '1');
    logout();
  },
});

function renderStudent(student) {
  const fullName = `${student.first_name} ${student.last_name}`.trim();
  studentNameEl.textContent = fullName || 'Umunyeshuri';
  studentMetaEl.textContent = `${student.student_number} · ${student.class_name}`;
  studentStatusEl.textContent = student.status;
  studentStatusEl.className = `parent-status-pill parent-status-pill--${student.status === 'active' ? 'active' : 'inactive'}`;

  const marks = student.current_marks;
  const max = student.max_marks || 40;
  marksValueEl.textContent = `${marks} / ${max}`;
  marksValueEl.className = `parent-marks__value${marks < 28 ? ' parent-marks__value--low' : ''}`;
  const pct = Math.max(0, Math.min(100, (marks / max) * 100));
  marksBarEl.style.width = `${pct}%`;
  marksBarEl.className = `parent-marks__bar-fill${marks < 28 ? ' parent-marks__bar-fill--low' : ''}`;

  // Prefill the "write to DOD" link with the student's name/class so
  // the parent doesn't have to retype what we already know.
  const params = new URLSearchParams({
    student_name: fullName,
    student_class: student.class_name || '',
  });
  contactLink.href = `../contact/?${params.toString()}`;
}

function renderIncidents(incidents) {
  if (!incidents || incidents.length === 0) {
    incidentsBody.innerHTML = '<tr><td colspan="4" class="data-table__empty">Nta manota yavanyweho muri iki gihembwe.</td></tr>';
    return;
  }

  incidentsBody.innerHTML = incidents.map((i) => `
    <tr>
      <td>${formatDate(i.incident_date)}</td>
      <td>${escapeHtml(i.offense_title ?? '—')}${i.is_voided ? '<span class="voided-badge">Yasheshwe</span>' : ''}</td>
      <td class="data-table__deduction">−${i.deduction_applied}</td>
      <td>${escapeHtml(i.comment || '—')}</td>
    </tr>
  `).join('');
}

function renderCounseling(sessions) {
  if (!sessions || sessions.length === 0) {
    counselingList.innerHTML = '<p class="parent-empty-note">Nta gahunda y\'ubujyanama yanditswe ku mwana wawe.</p>';
    return;
  }

  counselingList.innerHTML = sessions.map((s) => `
    <div class="parent-counseling-row">
      <span class="session-status-badge session-status-badge--${escapeHtml(s.status)}">${escapeHtml(s.status)}</span>
      <div>
        <p class="parent-counseling-row__reason">${escapeHtml(s.reason || s.notes || 'Nta bindi bisobanuro byanditswe.')}</p>
        <p class="parent-counseling-row__date">${formatDate(s.scheduled_date)}</p>
      </div>
    </div>
  `).join('');
}

function renderLetter(eligible, count) {
  if (!eligible) {
    letterCard.hidden = true;
    return;
  }
  letterCard.hidden = false;
  letterCountText.textContent = `Umwana wawe afite amakosa ${count} yanditswe muri iki gihembwe, bityo akwiye kwandikirwa ibaruwa ijya mu rugo.`;
}

async function init() {
  const code = sessionStorage.getItem(CODE_KEY);

  if (!code) {
    window.location.href = '../';
    return;
  }

  const { data, error } = await supabase.rpc('parent_portal_lookup', { p_student_number: code });

  if (error) {
    console.error('parent_portal_lookup failed:', error.message);
    showError('Ntibyashobotse gupakira amakuru y\'umunyeshuri ubu. Nyamuneka ongera ugerageze kwinjira vuba.');
    return;
  }

  if (!data || !data.found) {
    showError('Amakuru y\'uwo munyeshuri ntabwo abonetse. Nyamuneka ongera winjire.');
    return;
  }

  renderStudent(data.student);
  renderIncidents(data.incidents);
  renderCounseling(data.counseling_sessions);
  renderLetter(data.letter_eligible, data.incident_count_active);

  loadingState.hidden = true;
  content.hidden = false;
}

init();
