// ============================================================
// SDMS — Parent letters for repeat mark-loss
//
// A student qualifies for a letter home when they have had marks
// deducted (non-voided incidents) on INCIDENT_THRESHOLD or more
// separate occasions this term. Term marks reset to 40 at the start
// of each term (see students.js), so "this term" is every non-voided
// incident currently on record.
//
// This page is read-only against `students` and `incidents` — no
// new tables are required, only a working incidents/offenses
// relationship, which already exists in the schema.
// ============================================================
import { supabase } from './supabase-client.js';
import { startInactivityLogout } from './inactivity-logout.js';
import { applyRoleNav } from './role-nav.js';
import { sendParentLetterEmail } from './email-notify.js';

const INCIDENT_THRESHOLD = 3;

const userNameEl = document.getElementById('user-name');
const userRoleEl = document.getElementById('user-role');
const logoutBtn = document.getElementById('logout-btn');

const incidentThresholdLabel = document.getElementById('incident-threshold-label');
const eligibleBody = document.getElementById('eligible-body');

const printAllBtn = document.getElementById('print-all-btn');
const emailAllBtn = document.getElementById('email-all-btn');
const letterPrintArea = document.getElementById('letter-print-area');

const singleLetterPanel = document.getElementById('single-letter-panel');
const singleLetterContent = document.getElementById('single-letter-content');
const printSingleBtn = document.getElementById('print-single-btn');
const closePreviewBtn = document.getElementById('close-preview-btn');

let eligibleCache = [];

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
// Load students with 3+ non-voided incidents this term
// ------------------------------------------------------------
async function loadEligibleStudents() {
  eligibleBody.innerHTML = `<tr><td colspan="6" class="data-table__empty">Loading…</td></tr>`;

  const { data: students, error: studentsError } = await supabase
    .from('students')
    .select('id, first_name, last_name, student_number, current_marks, parent_phone, parent_email, class_id, classes ( class_name )')
    .eq('status', 'active');

  if (studentsError || !students) {
    console.error('Failed to load students:', studentsError);
    eligibleBody.innerHTML = `<tr><td colspan="6" class="data-table__empty">Could not load students.</td></tr>`;
    return;
  }

  const { data: incidents, error: incidentsError } = await supabase
    .from('incidents')
    .select('student_id, incident_date, deduction_applied, offenses ( title )')
    .eq('is_voided', false)
    .order('incident_date', { ascending: true });

  if (incidentsError || !incidents) {
    console.error('Failed to load incidents:', incidentsError);
    eligibleBody.innerHTML = `<tr><td colspan="6" class="data-table__empty">Could not load incident history.</td></tr>`;
    return;
  }

  const byStudent = {};
  incidents.forEach((i) => {
    (byStudent[i.student_id] ??= []).push(i);
  });

  eligibleCache = students
    .map((s) => ({ ...s, incidents: byStudent[s.id] ?? [] }))
    .filter((s) => s.incidents.length >= INCIDENT_THRESHOLD)
    .sort((a, b) => b.incidents.length - a.incidents.length);

  renderEligible(eligibleCache);
}

function renderEligible(students) {
  if (students.length === 0) {
    eligibleBody.innerHTML = `<tr><td colspan="6" class="data-table__empty">No students currently have ${INCIDENT_THRESHOLD} or more incidents this term.</td></tr>`;
    printAllBtn.disabled = true;
    emailAllBtn.disabled = true;
    return;
  }

  printAllBtn.disabled = false;
  emailAllBtn.disabled = false;

  eligibleBody.innerHTML = students.map((s) => {
    const last = s.incidents[s.incidents.length - 1];
    return `
    <tr data-id="${s.id}">
      <td>${escapeHtml(s.first_name)} ${escapeHtml(s.last_name)}<br><span class="data-table__meta" style="font-family: var(--font-mono); font-size: 11px; color: var(--charcoal-soft);">${escapeHtml(s.student_number)}</span></td>
      <td>${escapeHtml(s.classes?.class_name ?? 'Unassigned')}</td>
      <td>${s.incidents.length}</td>
      <td class="data-table__marks${s.current_marks < 28 ? ' data-table__marks--low' : ''}">${s.current_marks}</td>
      <td>${formatDate(last?.incident_date)}</td>
      <td>
        <div class="row-actions">
          <button class="row-action-btn" data-action="preview">Preview &amp; print</button>
          ${s.parent_email ? '<button class="row-action-btn" data-action="email">Email</button>' : ''}
        </div>
      </td>
    </tr>
  `;
  }).join('');

  eligibleBody.querySelectorAll('[data-action="preview"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const id = e.target.closest('tr').dataset.id;
      const student = eligibleCache.find((s) => s.id === id);
      if (student) previewSingle(student);
    });
  });

  eligibleBody.querySelectorAll('[data-action="email"]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      const id = e.target.closest('tr').dataset.id;
      const student = eligibleCache.find((s) => s.id === id);
      if (student) await emailSingle(student, e.target);
    });
  });
}

// ------------------------------------------------------------
// Letter template
// ------------------------------------------------------------
function buildLetterHtml(s) {
  const today = new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
  const fullName = `${s.first_name} ${s.last_name}`.trim();
  const className = s.classes?.class_name ?? 'Unassigned';

  const incidentRows = s.incidents.map((i) => `
    <tr>
      <td>${formatDate(i.incident_date)}</td>
      <td>${escapeHtml(i.offenses?.title ?? '—')}</td>
      <td>−${i.deduction_applied}</td>
    </tr>
  `).join('');

  const phoneNote = s.parent_phone
    ? ` We have ${escapeHtml(s.parent_phone)} on file and will try to reach you there as well.`
    : '';

  return `
    <div class="letter-paper">
      <div class="letter-letterhead">
        <img src="${window.location.origin}/assets/img/ndera-logo.svg" alt="" class="letter-logo">
        <div>
          <p class="letter-school">GS GAKORO</p>
          <p class="letter-school-sub">Student Discipline Management System</p>
        </div>
      </div>

      <p class="letter-date">${today}</p>
      <p class="letter-salutation">Dear Parent / Guardian of ${escapeHtml(fullName)},</p>

      <p>
        We are writing to inform you that <strong>${escapeHtml(fullName)}</strong>
        (${escapeHtml(s.student_number)}, ${escapeHtml(className)}) has had disciplinary
        marks deducted on <strong>${s.incidents.length}</strong> separate occasions this term,
        and currently stands at <strong>${s.current_marks}/40</strong> term marks.
      </p>

      <p>A record of these incidents is set out below:</p>

      <table class="letter-incident-table">
        <thead><tr><th>Date</th><th>Offense</th><th>Points</th></tr></thead>
        <tbody>${incidentRows}</tbody>
      </table>

      <p>
        We would appreciate the opportunity to discuss this with you directly and kindly
        request that you contact the school to arrange a meeting at your earliest
        convenience.${phoneNote}
      </p>

      <p>Thank you for your continued partnership in supporting ${escapeHtml(s.first_name)}'s conduct and progress at school.</p>

      <p class="letter-signoff">Yours sincerely,<br>Discipline Office<br>GS GAKORO</p>
    </div>
  `;
}

// ------------------------------------------------------------
// Single preview + print
// ------------------------------------------------------------
function previewSingle(student) {
  singleLetterContent.innerHTML = buildLetterHtml(student);
  singleLetterPanel.hidden = false;
  singleLetterPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

closePreviewBtn.addEventListener('click', () => {
  singleLetterPanel.hidden = true;
  singleLetterContent.innerHTML = '';
});

printSingleBtn.addEventListener('click', () => {
  singleLetterPanel.classList.add('printing');
  window.print();
});

window.addEventListener('afterprint', () => {
  singleLetterPanel.classList.remove('printing');
  letterPrintArea.classList.remove('printing');
  letterPrintArea.innerHTML = '';
});

// ------------------------------------------------------------
// Print all
// ------------------------------------------------------------
printAllBtn.addEventListener('click', () => {
  if (eligibleCache.length === 0) return;
  letterPrintArea.innerHTML = eligibleCache.map(buildLetterHtml).join('');
  letterPrintArea.classList.add('printing');
  window.print();
});

// ------------------------------------------------------------
// Email delivery
// ------------------------------------------------------------
async function emailSingle(student, triggerBtn) {
  const originalLabel = triggerBtn.textContent;
  triggerBtn.disabled = true;
  triggerBtn.textContent = 'Sending…';

  const result = await sendParentLetterEmail({
    parentEmail: student.parent_email,
    studentName: `${student.first_name} ${student.last_name}`,
    letterHtml: buildLetterHtml(student),
  });

  if (result.sent) {
    triggerBtn.textContent = 'Sent ✓';
  } else if (result.reason === 'not-configured') {
    triggerBtn.textContent = 'Not set up';
    alert('Email notifications are not set up yet. See js/email-config.js for setup steps.');
  } else {
    triggerBtn.textContent = 'Failed';
    alert(`Could not email this letter to ${student.parent_email}.`);
  }

  setTimeout(() => {
    triggerBtn.disabled = false;
    triggerBtn.textContent = originalLabel;
  }, 2500);
}

async function emailAll() {
  const withEmail = eligibleCache.filter((s) => s.parent_email);
  if (withEmail.length === 0) {
    alert('None of the eligible students have a parent email on file yet.');
    return;
  }

  emailAllBtn.disabled = true;
  let sent = 0;
  let failed = 0;
  let notConfigured = false;

  for (const student of withEmail) {
    const result = await sendParentLetterEmail({
      parentEmail: student.parent_email,
      studentName: `${student.first_name} ${student.last_name}`,
      letterHtml: buildLetterHtml(student),
    });
    if (result.sent) sent += 1;
    else if (result.reason === 'not-configured') notConfigured = true;
    else failed += 1;
  }

  emailAllBtn.disabled = false;

  if (notConfigured) {
    alert('Email notifications are not set up yet. See js/email-config.js for setup steps.');
    return;
  }

  alert(`Sent ${sent} letter${sent === 1 ? '' : 's'} by email.` + (failed > 0 ? ` ${failed} failed to send.` : ''));
}

emailAllBtn.addEventListener('click', emailAll);

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

  if (!renderIdentity(profile)) return;
  incidentThresholdLabel.textContent = String(INCIDENT_THRESHOLD);

  await loadEligibleStudents();
})();
