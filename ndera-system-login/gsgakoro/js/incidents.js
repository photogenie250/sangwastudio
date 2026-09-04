// ============================================================
// SDMS — Record Incident logic
// ============================================================
import { supabase } from './supabase-client.js';
import { startInactivityLogout } from './inactivity-logout.js';
import { applyRoleNav } from './role-nav.js';
import { sendMarksRemovedEmail } from './email-notify.js';

const userNameEl = document.getElementById('user-name');
const userRoleEl = document.getElementById('user-role');
const logoutBtn = document.getElementById('logout-btn');

const readonlyNotice = document.getElementById('readonly-notice');
const incidentLayout = document.getElementById('incident-layout');

const studentSearchInput = document.getElementById('student-search');
const studentResultsList = document.getElementById('student-results');
const studentSearchWrap = document.getElementById('student-search-wrap');
const selectedStudentBox = document.getElementById('selected-student');
const selectedStudentName = document.getElementById('selected-student-name');
const selectedStudentMeta = document.getElementById('selected-student-meta');
const changeStudentBtn = document.getElementById('change-student-btn');

const offenseSelect = document.getElementById('offense-select');
const offenseReferenceList = document.getElementById('offense-reference');
const incidentDateInput = document.getElementById('incident-date');
const commentInput = document.getElementById('comment');

const form = document.getElementById('incident-form');
const errorBox = document.getElementById('form-error');
const successBox = document.getElementById('form-success');
const submitBtn = document.getElementById('submit-btn');
const submitLabel = submitBtn.querySelector('.submit-btn__label');

let currentUserId = null;
let currentTeacherName = '';
let selectedStudent = null; // { id, first_name, last_name, student_number, class_name }
let offensesById = {};

// ------------------------------------------------------------
// Session + role guard
// ------------------------------------------------------------
async function requireAuthorizedUser() {
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

  currentUserId = session.user.id;
  currentTeacherName = `${profile.first_name} ${profile.last_name}`.trim();
  return profile;
}

function renderIdentity(profile) {
  userNameEl.textContent = `${profile.first_name} ${profile.last_name}`.trim() || 'User';
  userRoleEl.textContent = profile.role.replace('_', ' ');
  return applyRoleNav(profile.role);
}

// ------------------------------------------------------------
// Marks-removal confirmation — a teacher must type their own name,
// exactly as it appears in the system, before an incident (which
// deducts marks) is recorded. This is a deliberate extra step so
// marks are never removed by accident or by someone at an
// unattended, still-signed-in computer.
// ------------------------------------------------------------
function normalizeName(name) {
  return (name ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

// Returns true if confirmed, false if the teacher cancelled (no
// further message needed) — a name mismatch is signalled by throwing
// so the caller can show "Saba DoD uburenganzira".
function confirmMarksRemoval(studentFullName, deduction) {
  const prompted = window.prompt(
    `${studentFullName} akuweho amanota ${deduction}, byemeze wandika izina ryawe:`
  );
  if (prompted === null) return null; // cancelled — abort silently
  return normalizeName(prompted) === normalizeName(currentTeacherName);
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
// Student search (debounced)
// ------------------------------------------------------------
function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

async function searchStudents(query) {
  if (!query || query.trim().length < 2) {
    studentResultsList.hidden = true;
    studentResultsList.innerHTML = '';
    return;
  }

  const { data, error } = await supabase
    .from('students')
    .select('id, first_name, last_name, student_number, current_marks, parent_email, classes ( class_name )')
    .eq('status', 'active')
    .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%,student_number.ilike.%${query}%`)
    .order('last_name')
    .limit(8);

  if (error) {
    console.error('Student search failed:', error);
    return;
  }

  renderStudentResults(data ?? []);
}

function renderStudentResults(students) {
  if (students.length === 0) {
    studentResultsList.innerHTML = `<li class="combobox__empty">No matching students.</li>`;
    studentResultsList.hidden = false;
    return;
  }

  studentResultsList.innerHTML = students.map((s) => `
    <li class="combobox__item" data-id="${s.id}">
      <p class="combobox__item-name">${escapeHtml(s.first_name)} ${escapeHtml(s.last_name)}</p>
      <p class="combobox__item-meta">${escapeHtml(s.classes?.class_name ?? 'Unassigned')} · ${escapeHtml(s.student_number)} · ${s.current_marks} marks</p>
    </li>
  `).join('');

  studentResultsList.hidden = false;

  studentResultsList.querySelectorAll('.combobox__item').forEach((item, i) => {
    item.addEventListener('click', () => selectStudent(students[i]));
  });
}

function selectStudent(student) {
  selectedStudent = student;
  selectedStudentName.textContent = `${student.first_name} ${student.last_name}`;
  selectedStudentMeta.textContent = `${student.classes?.class_name ?? 'Unassigned'} · ${student.student_number} · ${student.current_marks} marks`;
  selectedStudentBox.hidden = false;
  studentSearchWrap.hidden = true;
  studentSearchInput.value = '';
  studentResultsList.hidden = true;
}

changeStudentBtn.addEventListener('click', () => {
  selectedStudent = null;
  selectedStudentBox.hidden = true;
  studentSearchWrap.hidden = false;
  studentSearchInput.focus();
});

studentSearchInput.addEventListener('input', debounce((e) => searchStudents(e.target.value), 250));

document.addEventListener('click', (e) => {
  if (!studentSearchWrap.contains(e.target)) {
    studentResultsList.hidden = true;
  }
});

// ------------------------------------------------------------
// Offense list — populates both the <select> and the reference panel
// ------------------------------------------------------------
// How many (non-voided) times each offense has actually been logged,
// so the dropdown/reference panel below can surface the most common
// ones first instead of forcing a scroll through the alphabet every
// time. A voided incident was a correction, not a real occurrence,
// so it's excluded — it shouldn't count toward "frequent".
async function loadOffenseFrequency() {
  const { data, error } = await supabase
    .from('incidents')
    .select('offense_id')
    .eq('is_voided', false)
    .limit(20000);

  if (error || !data) {
    console.error('Failed to load offense frequency:', error);
    return {};
  }

  return data.reduce((counts, row) => {
    counts[row.offense_id] = (counts[row.offense_id] || 0) + 1;
    return counts;
  }, {});
}

async function loadOffenses() {
  const [{ data, error }, frequency] = await Promise.all([
    supabase
      .from('offenses')
      .select('id, title, deduction, offense_categories ( name )')
      .eq('is_active', true)
      .order('title'),
    loadOffenseFrequency(),
  ]);

  if (error || !data) {
    console.error('Failed to load offenses:', error);
    offenseReferenceList.innerHTML = `<li class="offense-reference__empty">Could not load offenses.</li>`;
    return;
  }

  // Group by category name for both the dropdown and the reference panel
  offensesById = Object.fromEntries(data.map((o) => [o.id, o]));

  const grouped = data.reduce((acc, o) => {
    const category = o.offense_categories?.name ?? 'Other';
    (acc[category] ||= []).push(o);
    return acc;
  }, {});

  // Within each category, most-frequently-logged offense first; ties
  // (including offenses never yet logged) fall back to alphabetical.
  Object.values(grouped).forEach((list) => {
    list.sort((a, b) => (frequency[b.id] || 0) - (frequency[a.id] || 0) || a.title.localeCompare(b.title));
  });

  // Categories are ordered the same way, by their single most frequent
  // offense, so the group a teacher needs most often floats to the top.
  const orderedGroups = Object.entries(grouped).sort(
    ([, listA], [, listB]) => (frequency[listB[0].id] || 0) - (frequency[listA[0].id] || 0)
  );

  offenseSelect.innerHTML = '<option value="" disabled selected>Select an offense…</option>' +
    orderedGroups.map(([category, offenses]) => `
      <optgroup label="${escapeHtml(category)}">
        ${offenses.map((o) => `<option value="${o.id}">${escapeHtml(o.title)} (−${o.deduction})</option>`).join('')}
      </optgroup>
    `).join('');

  offenseReferenceList.innerHTML = orderedGroups.map(([category, offenses]) => `
    <li class="offense-reference__group-label">${escapeHtml(category)}</li>
    ${offenses.map((o) => `
      <li class="offense-reference__item">
        <span class="offense-reference__title">${escapeHtml(o.title)}</span>
        <span class="offense-reference__deduction">−${o.deduction}</span>
      </li>
    `).join('')}
  `).join('');
}

// ------------------------------------------------------------
// Form submit
// ------------------------------------------------------------
function showError(message) {
  errorBox.textContent = message;
  errorBox.hidden = false;
  successBox.hidden = true;
}

function showSuccess(message) {
  successBox.textContent = message;
  successBox.hidden = false;
  errorBox.hidden = true;
}

function setLoading(isLoading) {
  submitBtn.disabled = isLoading;
  submitLabel.textContent = isLoading ? 'Recording…' : 'Record incident';
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorBox.hidden = true;
  successBox.hidden = true;

  if (!selectedStudent) {
    showError('Select a student before recording an incident.');
    return;
  }

  const offenseId = offenseSelect.value;
  const incidentDate = incidentDateInput.value;
  const comment = commentInput.value.trim();

  if (!offenseId) {
    showError('Select an offense.');
    return;
  }
  if (!comment) {
    showError('Add a brief comment describing what happened.');
    return;
  }

  const offenseForConfirm = offensesById[offenseId];
  const studentFullNameForConfirm = `${selectedStudent.first_name} ${selectedStudent.last_name}`;
  const confirmation = confirmMarksRemoval(studentFullNameForConfirm, offenseForConfirm?.deduction ?? '');

  if (confirmation === null) {
    return; // teacher cancelled the confirmation prompt
  }
  if (confirmation === false) {
    showError('Saba DoD uburenganzira');
    return;
  }

  setLoading(true);

  const { error: insertError } = await supabase.from('incidents').insert({
    student_id: selectedStudent.id,
    teacher_id: currentUserId,
    offense_id: offenseId,
    comment,
    incident_date: incidentDate,
  });

  if (insertError) {
    console.error('Incident insert failed:', insertError);
    showError('Could not record the incident. Check your connection and try again.');
    setLoading(false);
    return;
  }

  // Losing marks dismisses a student from the "good behavior" likes
  // rating entirely (see students.js / student_likes table) — clear
  // any existing likes now that this student has an incident on
  // record for the term.
  const { error: clearLikesError } = await supabase
    .from('student_likes')
    .delete()
    .eq('student_id', selectedStudent.id);

  if (clearLikesError) {
    console.error('Failed to clear likes after incident:', clearLikesError);
    // Not fatal to the incident itself — the incident is already
    // recorded, so keep going rather than blocking the confirmation.
  }

  const { data: updatedStudent } = await supabase
    .from('students')
    .select('current_marks')
    .eq('id', selectedStudent.id)
    .single();

  const newMarks = updatedStudent?.current_marks;
  const offense = offensesById[offenseId];

  // DOD is notified automatically for every incident by a Database
  // Webhook + Edge Function (notify-incident) that fires server-side
  // on the insert above — that Telegram alert doesn't depend on the
  // browser, the parent's email, or EmailJS being configured, so it
  // always goes out. The parent email below is a separate, optional
  // channel — its success or failure never blocks or muddies the
  // "incident recorded" confirmation.
  let notifyNote = ' DOD notified.';
  if (selectedStudent.parent_email) {
    const result = await sendMarksRemovedEmail({
      parentEmail: selectedStudent.parent_email,
      studentName: `${selectedStudent.first_name} ${selectedStudent.last_name}`,
      offenseTitle: offense?.title ?? 'Offense',
      deduction: offense?.deduction ?? '',
      newMarks,
      incidentDate,
    });
    if (result.sent) notifyNote += ' Parent notified by email.';
    // Parent email being unconfigured or failing is expected/optional —
    // don't surface it as if something went wrong with the incident.
  } else {
    notifyNote += ' No parent email on file.';
  }

  showSuccess(
    `Incident recorded for ${selectedStudent.first_name} ${selectedStudent.last_name}.` +
    (newMarks !== undefined ? ` Current marks: ${newMarks}.` : '') +
    notifyNote
  );

  // Reset for the next entry, but keep the same student selected
  // in case several incidents need logging for one student in a row.
  offenseSelect.value = '';
  commentInput.value = '';
  setLoading(false);

  if (selectedStudent && newMarks !== undefined) {
    selectedStudent.current_marks = newMarks;
    selectedStudentMeta.textContent = `${selectedStudent.classes?.class_name ?? 'Unassigned'} · ${selectedStudent.student_number} · ${newMarks} marks`;
  }
});

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

// ------------------------------------------------------------
// Boot
// ------------------------------------------------------------
(async function init() {
  const profile = await requireAuthorizedUser();
  if (!profile) return;

  if (!renderIdentity(profile)) return;
  incidentDateInput.value = new Date().toISOString().slice(0, 10);
  incidentDateInput.max = new Date().toISOString().slice(0, 10);

  await loadOffenses();
})();
