// ============================================================
// SDMS — Students list & profile logic
// ============================================================
import { supabase } from './supabase-client.js';
import { startInactivityLogout } from './inactivity-logout.js';
import { applyRoleNav } from './role-nav.js';

const PAGE_SIZE = 20;

const userNameEl = document.getElementById('user-name');
const userRoleEl = document.getElementById('user-role');
const logoutBtn = document.getElementById('logout-btn');

const listView = document.getElementById('list-view');
const profileView = document.getElementById('profile-view');

const searchInput = document.getElementById('search-input');
const classFilter = document.getElementById('class-filter');
const statusFilter = document.getElementById('status-filter');
const studentsBody = document.getElementById('students-body');

const prevPageBtn = document.getElementById('prev-page');
const nextPageBtn = document.getElementById('next-page');
const pageLabel = document.getElementById('page-label');

const studentsLayout = document.getElementById('students-layout');
const backToListBtn = document.getElementById('back-to-list');
const topbarActions = document.getElementById('topbar-actions');
const downloadTemplateBtn = document.getElementById('download-template-btn');
const importExcelBtn = document.getElementById('import-excel-btn');
const excelFileInput = document.getElementById('excel-file-input');
const importPanel = document.getElementById('import-panel');
const importSummary = document.getElementById('import-summary');
const importResult = document.getElementById('import-result');
const importPreviewBody = document.getElementById('import-preview-body');
const confirmImportBtn = document.getElementById('confirm-import-btn');
const cancelImportBtn = document.getElementById('cancel-import-btn');

const addStudentBtn = document.getElementById('add-student-btn');
const studentFormPanel = document.getElementById('student-form-panel');
const studentForm = document.getElementById('student-form');
const studentIdInput = document.getElementById('student-id');
const studentFirstNameInput = document.getElementById('student-first-name');
const studentLastNameInput = document.getElementById('student-last-name');
const studentNumberInput = document.getElementById('student-number-input');
const studentGenderSelect = document.getElementById('student-gender');
const studentDobInput = document.getElementById('student-dob');
const studentClassSelect = document.getElementById('student-class');
const studentPhoneInput = document.getElementById('student-phone');
const studentEmailInput = document.getElementById('student-email');
const studentStatusField = document.getElementById('student-status-field');
const studentStatusSelect = document.getElementById('student-status');
const studentFormTitle = document.getElementById('student-form-title');
const studentSubmitBtn = document.getElementById('student-submit-btn');
const studentCancelBtn = document.getElementById('student-cancel-btn');
const studentFormError = document.getElementById('student-form-error');
const profileName = document.getElementById('profile-name');
const profileMeta = document.getElementById('profile-meta');
const profileStatus = document.getElementById('profile-status');
const profileMarks = document.getElementById('profile-marks');
const profileTotalIncidents = document.getElementById('profile-total-incidents');
const profileTotalDeductions = document.getElementById('profile-total-deductions');
const profileLastIncident = document.getElementById('profile-last-incident');
const profileAttention = document.getElementById('profile-attention');
const historyBody = document.getElementById('history-body');
const likeCountEl = document.getElementById('like-count');
const likeBtn = document.getElementById('like-btn');
const likeIneligibleNote = document.getElementById('like-ineligible-note');

let currentPage = 0;
let totalCount = 0;
let currentRole = null;
let currentUserId = null;
let studentsCache = [];
let classesCacheForForm = [];
let parsedImportRows = [];
let currentProfileStudentId = null;
let currentProfileHasFullMarks = false;
let currentProfileLikedByMe = false;

// Like counts per student, keyed by student id — refreshed alongside
// the student list so the list view can show a small like badge too.
let likeCountsById = {};

async function loadLikeCounts() {
  const { data, error } = await supabase
    .from('student_likes')
    .select('student_id');

  if (error) {
    console.error('Failed to load like counts:', error);
    return;
  }

  const counts = {};
  (data ?? []).forEach((row) => {
    counts[row.student_id] = (counts[row.student_id] ?? 0) + 1;
  });
  likeCountsById = counts;
}

// Student ids with an active (scheduled, not yet completed/cancelled)
// counseling session — drives the attention mark shown in the list
// and on the profile view. Refreshed alongside the student list so
// it never drifts out of sync with what the Counseling page shows.
let counselingAttentionIds = new Set();

async function loadCounselingAttention() {
  const { data, error } = await supabase
    .from('counseling_sessions')
    .select('student_id')
    .eq('status', 'scheduled');

  if (error) {
    console.error('Failed to load counseling attention flags:', error);
    return;
  }

  counselingAttentionIds = new Set((data ?? []).map((row) => row.student_id));
}

// ------------------------------------------------------------
// Session guard — any active, authenticated role can view students
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

  currentUserId = session.user.id;
  return profile;
}

function renderIdentity(profile) {
  userNameEl.textContent = `${profile.first_name} ${profile.last_name}`.trim() || 'User';
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
// Class filter dropdown
// ------------------------------------------------------------
async function loadClassFilter() {
  const { data, error } = await supabase
    .from('classes')
    .select('id, class_name')
    .order('class_name');

  if (error || !data) return;

  classesCacheForForm = data;

  classFilter.innerHTML = '<option value="">All classes</option>' +
    data.map((c) => `<option value="${c.id}">${escapeHtml(c.class_name)}</option>`).join('');

  studentClassSelect.innerHTML = '<option value="">Unassigned</option>' +
    data.map((c) => `<option value="${c.id}">${escapeHtml(c.class_name)}</option>`).join('');
}

// ------------------------------------------------------------
// Student list — filtered, searched, paginated
// ------------------------------------------------------------
async function loadStudents() {
  const search = searchInput.value.trim();
  const classId = classFilter.value;
  const statusMode = statusFilter.value;

  let query = supabase
    .from('students')
    .select('id, student_number, first_name, last_name, gender, date_of_birth, parent_phone, parent_email, class_id, current_marks, status, classes ( class_name )', { count: 'exact' });

  if (statusMode === 'active') {
    query = query.eq('status', 'active');
  }
  if (classId) {
    query = query.eq('class_id', classId);
  }
  if (search) {
    query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,student_number.ilike.%${search}%`);
  }

  const from = currentPage * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { data, error, count } = await query
    .order('last_name')
    .range(from, to);

  if (error) {
    console.error('Failed to load students:', error);
    studentsBody.innerHTML = `<tr><td colspan="5" class="data-table__empty">Could not load students.</td></tr>`;
    return;
  }

  totalCount = count ?? 0;
  studentsCache = data ?? [];
  await Promise.all([loadCounselingAttention(), loadLikeCounts()]);
  renderStudentRows(studentsCache);
  renderPagination();
}

function renderStudentRows(students) {
  if (students.length === 0) {
    studentsBody.innerHTML = `<tr><td colspan="5" class="data-table__empty">No students match these filters.</td></tr>`;
    return;
  }

  const isAdmin = currentRole === 'administrator' || currentRole === 'teacher';

  studentsBody.innerHTML = students.map((s) => `
    <tr data-id="${s.id}">
      <td>${escapeHtml(s.first_name)} ${escapeHtml(s.last_name)}${counselingAttentionIds.has(s.id) ? ' <span class="attention-badge">Under counseling</span>' : ''}${likeCountsById[s.id] ? ` <span class="like-badge">👍 ${likeCountsById[s.id]}</span>` : ''}<br><span class="data-table__meta" style="font-family: var(--font-mono); font-size: 11px; color: var(--charcoal-soft);">${escapeHtml(s.student_number)}</span></td>
      <td>${escapeHtml(s.classes?.class_name ?? 'Unassigned')}</td>
      <td class="data-table__marks${s.current_marks < 28 ? ' data-table__marks--low' : ''}">${s.current_marks}</td>
      <td><span class="status-badge${s.status !== 'active' ? ' status-badge--' + s.status : ''}">${escapeHtml(s.status)}</span></td>
      <td>
        <div class="row-actions">
          ${isAdmin ? '<button class="row-action-btn" data-action="edit-student">Edit</button>' : ''}
          <span class="view-link">View →</span>
        </div>
      </td>
    </tr>
  `).join('');

  studentsBody.querySelectorAll('tr[data-id]').forEach((row) => {
    row.addEventListener('click', () => openProfile(row.dataset.id));
  });

  if (isAdmin) {
    studentsBody.querySelectorAll('[data-action="edit-student"]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        startEditStudent(e.target.closest('tr').dataset.id);
      });
    });
  }
}

function renderPagination() {
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  pageLabel.textContent = `Page ${currentPage + 1} of ${totalPages}`;
  prevPageBtn.disabled = currentPage === 0;
  nextPageBtn.disabled = currentPage + 1 >= totalPages;
}

prevPageBtn.addEventListener('click', () => {
  if (currentPage > 0) {
    currentPage -= 1;
    loadStudents();
  }
});

nextPageBtn.addEventListener('click', () => {
  currentPage += 1;
  loadStudents();
});

function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

searchInput.addEventListener('input', debounce(() => { currentPage = 0; loadStudents(); }, 300));
classFilter.addEventListener('change', () => { currentPage = 0; loadStudents(); });
statusFilter.addEventListener('change', () => { currentPage = 0; loadStudents(); });

// ------------------------------------------------------------
// Profile view
// ------------------------------------------------------------

// Direct-query fallback for the student summary, used if the
// get_student_report RPC is unavailable, errors, or returns nothing.
async function loadStudentSummaryFallback(studentId) {
  const { data: student, error: studentError } = await supabase
    .from('students')
    .select(`
      id, first_name, last_name, student_number, current_marks, status,
      classes ( class_name )
    `)
    .eq('id', studentId)
    .single();

  if (studentError || !student) {
    console.error('Fallback: failed to load student record:', studentError);
    return null;
  }

  const { data: incidents, error: incidentsError } = await supabase
    .from('incidents')
    .select('deduction_applied, incident_date')
    .eq('student_id', studentId)
    .eq('is_voided', false);

  if (incidentsError) {
    console.error('Fallback: failed to load incidents for summary:', incidentsError);
  }

  const rows = incidents ?? [];
  const totalIncidents = rows.length;
  const totalDeductions = rows.reduce((sum, row) => sum + (row.deduction_applied ?? 0), 0);
  const lastIncidentDate = rows.reduce((latest, row) => {
    if (!row.incident_date) return latest;
    return !latest || row.incident_date > latest ? row.incident_date : latest;
  }, null);

  return {
    full_name: `${student.first_name} ${student.last_name}`,
    student_number: student.student_number,
    class_name: student.classes?.class_name ?? null,
    status: student.status,
    current_marks: student.current_marks,
    total_incidents: totalIncidents,
    total_deductions: totalDeductions,
    last_incident_date: lastIncidentDate,
  };
}

async function openProfile(studentId) {
  listView.hidden = true;
  profileView.hidden = false;

  profileName.textContent = 'Loading…';
  profileMeta.textContent = '';
  profileStatus.textContent = '';
  profileMarks.textContent = '—';
  profileTotalIncidents.textContent = '—';
  profileTotalDeductions.textContent = '—';
  profileLastIncident.textContent = '—';
  profileAttention.hidden = true;
  likeCountEl.textContent = '— likes';
  likeBtn.disabled = true;
  likeBtn.classList.remove('is-liked');
  likeBtn.textContent = '👍 Like';
  likeIneligibleNote.hidden = true;
  historyBody.innerHTML = `<tr><td colspan="6" class="data-table__empty">Loading…</td></tr>`;

  // Check this student's counseling status directly rather than relying
  // on the list-page cache — the profile can reflect a session scheduled
  // moments ago without needing a full list reload.
  supabase
    .from('counseling_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('student_id', studentId)
    .eq('status', 'scheduled')
    .then(({ count, error }) => {
      if (error) {
        console.error('Failed to check counseling status:', error);
        return;
      }
      profileAttention.hidden = !count;
    });

  // Summary via the Step 5 reporting function, with a direct-query
  // fallback in case the RPC is missing/broken/blocked by RLS — this
  // keeps the profile view working even if that function has an issue.
  let r = null;

  const { data: reportRows, error: reportError } = await supabase
    .rpc('get_student_report', { p_student_id: studentId });

  if (reportError) {
    console.error('get_student_report RPC failed, falling back to direct query:', reportError);
  }

  if (!reportError && reportRows && reportRows.length > 0) {
    r = reportRows[0];
  } else {
    r = await loadStudentSummaryFallback(studentId);
  }

  if (!r) {
    profileName.textContent = 'Could not load this student.';
    return;
  }

  profileName.textContent = r.full_name;
  profileMeta.textContent = `${r.student_number} · ${r.class_name ?? 'Unassigned'}`;
  profileStatus.textContent = r.status;
  profileStatus.className = `status-badge${r.status !== 'active' ? ' status-badge--' + r.status : ''}`;
  profileMarks.textContent = r.current_marks;
  profileMarks.className = `profile-summary__marks-value${r.current_marks < 28 ? ' profile-summary__marks-value--low' : ''}`;
  profileTotalIncidents.textContent = r.total_incidents;
  profileTotalDeductions.textContent = r.total_deductions;
  profileLastIncident.textContent = r.last_incident_date ? formatDate(r.last_incident_date) : '—';

  currentProfileStudentId = studentId;
  currentProfileHasFullMarks = Number(r.current_marks) === 40;
  await loadLikeState(studentId);

  // Full history via a direct query — includes is_voided, which the
  // reporting RPC deliberately excludes (Step 5 keeps that function
  // report-focused; the profile view needs the raw voided state too).
  const { data: history, error: historyError } = await supabase
    .from('incidents')
    .select(`
      id, deduction_applied, incident_date, comment, is_voided, voided_reason,
      offenses ( title ),
      offense_categories ( name ),
      profiles!incidents_teacher_id_fkey ( first_name, last_name )
    `)
    .eq('student_id', studentId)
    .order('incident_date', { ascending: false });

  if (historyError) {
    console.error('Failed to load incident history:', historyError);
    historyBody.innerHTML = `<tr><td colspan="6" class="data-table__empty">Could not load incident history.</td></tr>`;
    return;
  }

  renderHistory(history ?? []);
}

// ------------------------------------------------------------
// Good behavior — likes
//
// A student can only be liked while they still have full marks
// (current_marks === 40, i.e. no incident recorded against them
// this term). Losing marks dismisses a student from this rating
// entirely: js/incidents.js deletes any existing likes for a
// student the moment an incident is recorded against them, and
// the like button here stays disabled until the student is back
// to full marks (a new term, since marks reset to 40 then).
// ------------------------------------------------------------
async function loadLikeState(studentId) {
  const { count, error: countError } = await supabase
    .from('student_likes')
    .select('id', { count: 'exact', head: true })
    .eq('student_id', studentId);

  if (countError) {
    console.error('Failed to load like count:', countError);
  }

  let likedByMe = false;
  if (currentUserId) {
    const { data, error } = await supabase
      .from('student_likes')
      .select('id')
      .eq('student_id', studentId)
      .eq('teacher_id', currentUserId)
      .maybeSingle();

    if (error) {
      console.error('Failed to check own like:', error);
    }
    likedByMe = !!data;
  }

  currentProfileLikedByMe = likedByMe;
  renderLikeUI(count ?? 0);
}

function renderLikeUI(count) {
  likeCountEl.textContent = `${count} like${count === 1 ? '' : 's'}`;
  likeBtn.classList.toggle('is-liked', currentProfileLikedByMe);
  likeBtn.textContent = currentProfileLikedByMe ? '👍 Liked' : '👍 Like';
  likeBtn.disabled = !currentProfileHasFullMarks;
  likeIneligibleNote.hidden = currentProfileHasFullMarks;
}

likeBtn.addEventListener('click', async () => {
  if (!currentProfileStudentId || !currentUserId || !currentProfileHasFullMarks) return;

  likeBtn.disabled = true;

  if (currentProfileLikedByMe) {
    const { error } = await supabase
      .from('student_likes')
      .delete()
      .eq('student_id', currentProfileStudentId)
      .eq('teacher_id', currentUserId);

    if (error) {
      console.error('Failed to remove like:', error);
      likeBtn.disabled = false;
      return;
    }
  } else {
    const { error } = await supabase
      .from('student_likes')
      .insert({ student_id: currentProfileStudentId, teacher_id: currentUserId });

    if (error) {
      console.error('Failed to add like:', error);
      likeBtn.disabled = false;
      return;
    }
  }

  await loadLikeState(currentProfileStudentId);
});

function renderHistory(history) {
  if (history.length === 0) {
    historyBody.innerHTML = `<tr><td colspan="6" class="data-table__empty">No incidents recorded.</td></tr>`;
    return;
  }

  historyBody.innerHTML = history.map((h) => `
    <tr class="${h.is_voided ? 'history-row--voided' : ''}">
      <td>${formatDate(h.incident_date)}</td>
      <td>${escapeHtml(h.offenses?.title ?? '—')}${h.is_voided ? '<span class="voided-badge">Voided</span>' : ''}</td>
      <td>${escapeHtml(h.offense_categories?.name ?? '—')}</td>
      <td class="data-table__deduction">−${h.deduction_applied}</td>
      <td>${escapeHtml(`${h.profiles?.first_name ?? ''} ${h.profiles?.last_name ?? ''}`.trim())}</td>
      <td>${escapeHtml(h.is_voided ? (h.voided_reason ?? h.comment ?? '—') : (h.comment ?? '—'))}</td>
    </tr>
  `).join('');
}

backToListBtn.addEventListener('click', () => {
  profileView.hidden = true;
  listView.hidden = false;
});

// ------------------------------------------------------------
// Add / edit student form (administrator only)
// ------------------------------------------------------------
function openStudentForm() {
  studentFormPanel.hidden = false;
  addStudentBtn.hidden = true;
  studentsLayout.classList.add('form-open');
}

function closeStudentForm() {
  studentFormPanel.hidden = true;
  addStudentBtn.hidden = false;
  studentsLayout.classList.remove('form-open');
  resetStudentForm();
}

function resetStudentForm() {
  studentForm.reset();
  studentIdInput.value = '';
  studentNumberInput.disabled = false;
  studentFormTitle.textContent = 'Add student';
  studentSubmitBtn.textContent = 'Add student';
  studentStatusField.hidden = true;
  studentFormError.hidden = true;
}

function startEditStudent(id) {
  const student = studentsCache.find((s) => s.id === id);
  if (!student) return;

  openStudentForm();
  studentIdInput.value = student.id;
  studentFirstNameInput.value = student.first_name;
  studentLastNameInput.value = student.last_name;
  studentNumberInput.value = student.student_number;
  studentNumberInput.disabled = true;
  studentGenderSelect.value = student.gender ?? '';
  studentDobInput.value = student.date_of_birth ?? '';
  studentClassSelect.value = student.class_id ?? '';
  studentPhoneInput.value = student.parent_phone ?? '';
  studentEmailInput.value = student.parent_email ?? '';
  studentStatusField.hidden = false;
  studentStatusSelect.value = student.status;
  studentFormTitle.textContent = 'Edit student';
  studentSubmitBtn.textContent = 'Save changes';
  studentFormError.hidden = true;
}

addStudentBtn.addEventListener('click', openStudentForm);
studentCancelBtn.addEventListener('click', closeStudentForm);

studentForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  studentFormError.hidden = true;

  const id = studentIdInput.value;
  const payload = {
    first_name: studentFirstNameInput.value.trim(),
    last_name: studentLastNameInput.value.trim(),
    student_number: studentNumberInput.value.trim(),
    gender: studentGenderSelect.value || null,
    date_of_birth: studentDobInput.value || null,
    class_id: studentClassSelect.value || null,
    parent_phone: studentPhoneInput.value.trim() || null,
    parent_email: studentEmailInput.value.trim() || null,
  };

  // Status is only editable when editing an existing student —
  // new students always start active, matching the backend default.
  if (id) {
    payload.status = studentStatusSelect.value;
  }

  const { error } = id
    ? await supabase.from('students').update(payload).eq('id', id)
    : await supabase.from('students').insert(payload);

  if (error) {
    studentFormError.textContent = error.code === '23505'
      ? 'A student with this student number already exists.'
      : 'Could not save this student.';
    studentFormError.hidden = false;
    return;
  }

  closeStudentForm();
  await loadStudents();
});

// ------------------------------------------------------------
// Excel import — template download
// ------------------------------------------------------------
downloadTemplateBtn.addEventListener('click', () => {
  const headers = ['First Name', 'Last Name', 'Student Number', 'Gender', 'Date of Birth', 'Class', 'Parent Phone'];
  const example = ['Alice', 'Uwimana', 'STU-0001', 'F', '2014-03-12', 'P6 A', '0788000000'];

  const sheet = XLSX.utils.aoa_to_sheet([headers, example]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Students');
  XLSX.writeFile(workbook, 'sdms-student-template.xlsx');
});

// ------------------------------------------------------------
// Excel import — file selection & parsing
// ------------------------------------------------------------
importExcelBtn.addEventListener('click', () => excelFileInput.click());

excelFileInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const firstSheetName = workbook.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheetName], { defval: '' });

  excelFileInput.value = ''; // allow re-selecting the same file later
  processImportRows(rows);
});

function normalizeKey(key) {
  return key.toString().trim().toLowerCase().replace(/[\s_]+/g, '');
}

function getField(row, ...candidates) {
  const normalizedRow = {};
  Object.keys(row).forEach((k) => { normalizedRow[normalizeKey(k)] = row[k]; });
  for (const candidate of candidates) {
    const value = normalizedRow[normalizeKey(candidate)];
    if (value !== undefined && value !== '') return value;
  }
  return '';
}

function formatDateValue(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const parsed = new Date(value);
  return isNaN(parsed) ? null : parsed.toISOString().slice(0, 10);
}

function processImportRows(rawRows) {
  const existingNumbers = new Set(studentsCache.map((s) => s.student_number.toLowerCase()));
  const seenInFile = new Set();

  parsedImportRows = rawRows.map((row, index) => {
    const firstName = getField(row, 'first name', 'firstname').toString().trim();
    const lastName = getField(row, 'last name', 'lastname').toString().trim();
    const studentNumber = getField(row, 'student number', 'studentnumber').toString().trim();
    const genderRaw = getField(row, 'gender').toString().trim().toUpperCase();
    const dob = formatDateValue(getField(row, 'date of birth', 'dob'));
    const className = getField(row, 'class').toString().trim();
    const phone = getField(row, 'parent phone', 'phone').toString().trim();
    const email = getField(row, 'parent email', 'email').toString().trim();

    const matchedClass = classesCacheForForm.find(
      (c) => c.class_name.toLowerCase() === className.toLowerCase()
    );

    let status = 'valid';
    let note = 'Ready to import.';

    if (!firstName || !lastName || !studentNumber) {
      status = 'error';
      note = 'Missing first name, last name, or student number.';
    } else if (existingNumbers.has(studentNumber.toLowerCase())) {
      status = 'error';
      note = 'Student number already exists in the system.';
    } else if (seenInFile.has(studentNumber.toLowerCase())) {
      status = 'error';
      note = 'Duplicate student number within this file.';
    } else if (className && !matchedClass) {
      status = 'warning';
      note = `Class "${className}" not found — will import unassigned.`;
    }

    if (status !== 'error') seenInFile.add(studentNumber.toLowerCase());

    return {
      rowNumber: index + 2, // +2 accounts for the header row and 1-based spreadsheet rows
      status,
      note,
      payload: {
        first_name: firstName,
        last_name: lastName,
        student_number: studentNumber,
        gender: ['M', 'F'].includes(genderRaw) ? genderRaw : null,
        date_of_birth: dob,
        class_id: matchedClass ? matchedClass.id : null,
        parent_phone: phone || null,
        parent_email: email || null,
      },
    };
  });

  renderImportPreview();
}

function renderImportPreview() {
  const validCount = parsedImportRows.filter((r) => r.status !== 'error').length;
  const errorCount = parsedImportRows.length - validCount;

  importSummary.textContent =
    `${parsedImportRows.length} rows found — ${validCount} ready to import` +
    (errorCount > 0 ? `, ${errorCount} will be skipped.` : '.');

  importResult.hidden = true;

  importPreviewBody.innerHTML = parsedImportRows.map((r) => `
    <tr class="${r.status === 'error' ? 'import-preview-row--error' : ''}">
      <td>${r.rowNumber}</td>
      <td>${escapeHtml(r.payload.first_name)} ${escapeHtml(r.payload.last_name)}</td>
      <td>${escapeHtml(r.payload.student_number)}</td>
      <td>${escapeHtml(classesCacheForForm.find((c) => c.id === r.payload.class_id)?.class_name ?? '—')}</td>
      <td>
        <span class="import-status import-status--${r.status}">${r.status}</span>
        <div style="font-size: 12px; color: var(--charcoal-soft); margin-top: 3px;">${escapeHtml(r.note)}</div>
      </td>
    </tr>
  `).join('');

  importPanel.hidden = false;
}

cancelImportBtn.addEventListener('click', () => {
  parsedImportRows = [];
  importPanel.hidden = true;
});

confirmImportBtn.addEventListener('click', async () => {
  const validRows = parsedImportRows.filter((r) => r.status !== 'error');

  if (validRows.length === 0) {
    importResult.hidden = false;
    importResult.className = 'inline-banner inline-banner--error';
    importResult.textContent = 'No valid rows to import.';
    return;
  }

  confirmImportBtn.disabled = true;
  confirmImportBtn.textContent = 'Importing…';

  const { error, data } = await supabase
    .from('students')
    .insert(validRows.map((r) => r.payload))
    .select('id');

  confirmImportBtn.disabled = false;
  confirmImportBtn.textContent = 'Import valid rows';

  if (error) {
    console.error('Bulk import failed:', error);
    importResult.hidden = false;
    importResult.className = 'inline-banner inline-banner--error';
    importResult.textContent = 'Import failed — no students were added. Check for duplicate student numbers and try again.';
    return;
  }

  importResult.hidden = false;
  importResult.className = 'inline-banner inline-banner--success';
  importResult.textContent = `Imported ${data.length} student${data.length === 1 ? '' : 's'} successfully.`;

  parsedImportRows = [];
  importPreviewBody.innerHTML = '';
  await loadStudents();
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
  await loadClassFilter();

  if (profile.role === 'administrator' || profile.role === 'teacher') {
    topbarActions.hidden = false;
  }

  // Deep link from Classes page: students/?class=<id>
  const params = new URLSearchParams(window.location.search);
  const classParam = params.get('class');
  if (classParam) {
    classFilter.value = classParam;
  }

  // Deep link from the Dashboard's quick search: students/?q=<term>
  const qParam = params.get('q');
  if (qParam) {
    searchInput.value = qParam;
  }

  await loadStudents();
})();
