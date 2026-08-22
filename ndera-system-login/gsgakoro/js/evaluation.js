// ============================================================
// SDMS — Evaluation
// Insert / correct mark sheets by class, and export them to
// Excel (a single class, or every class in one workbook).
// ============================================================
import { supabase } from './supabase-client.js';
import { startInactivityLogout } from './inactivity-logout.js';
import { applyRoleNav } from './role-nav.js';

const userNameEl = document.getElementById('user-name');
const userRoleEl = document.getElementById('user-role');
const logoutBtn = document.getElementById('logout-btn');
const readonlyNotice = document.getElementById('readonly-notice');

const classSelect = document.getElementById('eval-class-select');
const termInput = document.getElementById('eval-term-input');
const emptyState = document.getElementById('eval-empty-state');
const evalSheet = document.getElementById('eval-sheet');
const sheetTitle = document.getElementById('eval-sheet-title');
const sheetBody = document.getElementById('eval-sheet-body');
const evalBanner = document.getElementById('eval-banner');

const statCount = document.getElementById('eval-stat-count');
const statAverage = document.getElementById('eval-stat-average');
const statBelow = document.getElementById('eval-stat-below');

const saveBtn = document.getElementById('save-marks-btn');
const exportClassBtn = document.getElementById('export-class-btn');
const exportAllBtn = document.getElementById('export-all-btn');

const LOW_MARKS_THRESHOLD = 28;

let canEdit = false;
let classesCache = [];
let currentClass = null;
let studentsCache = [];      // rows currently loaded for the selected class
let dirtyIds = new Set();    // student ids with an unsaved marks change

// ------------------------------------------------------------
// Session guard — any active, authenticated role can view;
// only administrators, teachers, and discipline teachers can save.
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
  applyRoleNav(profile.role);
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
// Classes dropdown
// ------------------------------------------------------------
async function loadClasses() {
  const { data, error } = await supabase
    .from('classes')
    .select('id, class_name, level, academic_year')
    .order('academic_year', { ascending: false })
    .order('class_name');

  if (error || !data) {
    showBanner('Could not load the class list.', 'error');
    return;
  }

  classesCache = data;
  classSelect.innerHTML = '<option value="">Select a class…</option>' +
    data.map((c) => `<option value="${c.id}">${escapeHtml(c.class_name)} · ${escapeHtml(c.academic_year)}</option>`).join('');
}

classSelect.addEventListener('change', async () => {
  const id = classSelect.value;
  if (!id) {
    currentClass = null;
    emptyState.hidden = false;
    evalSheet.hidden = true;
    return;
  }

  currentClass = classesCache.find((c) => c.id === id) || null;
  await loadMarkSheet(id);
});

// ------------------------------------------------------------
// Mark sheet — load students for the selected class
// ------------------------------------------------------------
async function loadMarkSheet(classId) {
  emptyState.hidden = true;
  evalSheet.hidden = false;
  evalBanner.hidden = true;
  dirtyIds.clear();
  saveBtn.disabled = true;
  sheetBody.innerHTML = `<tr><td colspan="5" class="data-table__empty">Loading…</td></tr>`;

  const { data, error } = await supabase
    .from('students')
    .select('id, student_number, first_name, last_name, status, current_marks')
    .eq('class_id', classId)
    .order('first_name')
    .order('last_name');

  if (error || !data) {
    sheetBody.innerHTML = `<tr><td colspan="5" class="data-table__empty">Could not load this class.</td></tr>`;
    return;
  }

  studentsCache = data;
  sheetTitle.textContent = currentClass ? `Mark sheet — ${currentClass.class_name}` : 'Mark sheet';
  renderSheet();
  renderSummary();
}

function renderSheet() {
  if (studentsCache.length === 0) {
    sheetBody.innerHTML = `<tr><td colspan="5" class="data-table__empty">No students in this class yet.</td></tr>`;
    return;
  }

  sheetBody.innerHTML = studentsCache.map((s, i) => `
    <tr data-id="${s.id}">
      <td class="eval-row-index">${i + 1}</td>
      <td>${escapeHtml(s.student_number)}</td>
      <td>${escapeHtml(s.first_name)} ${escapeHtml(s.last_name)}</td>
      <td><span class="status-badge${s.status !== 'active' ? ' status-badge--' + s.status : ''}">${escapeHtml(s.status)}</span></td>
      <td>
        <input
          type="number"
          class="eval-marks-input${s.current_marks < LOW_MARKS_THRESHOLD ? ' eval-marks-input--low' : ''}"
          data-id="${s.id}"
          value="${s.current_marks}"
          min="0"
          step="1"
          ${canEdit ? '' : 'disabled'}
        >
      </td>
    </tr>
  `).join('');

  sheetBody.querySelectorAll('.eval-marks-input').forEach((input) => {
    input.addEventListener('input', onMarksInputChange);
  });
}

function onMarksInputChange(e) {
  const id = e.target.dataset.id;
  const value = Number(e.target.value);
  const student = studentsCache.find((s) => s.id === id);
  if (!student) return;

  const original = student._original ?? student.current_marks;
  student._original = original;

  const row = e.target.closest('tr');
  if (Number.isFinite(value) && value !== original) {
    dirtyIds.add(id);
    row.classList.add('eval-row--dirty');
  } else {
    dirtyIds.delete(id);
    row.classList.remove('eval-row--dirty');
  }

  e.target.classList.toggle('eval-marks-input--low', Number.isFinite(value) && value < LOW_MARKS_THRESHOLD);
  student.current_marks = Number.isFinite(value) ? value : student.current_marks;

  saveBtn.disabled = dirtyIds.size === 0;
  renderSummary();
}

function renderSummary() {
  const count = studentsCache.length;
  statCount.textContent = count;

  if (count === 0) {
    statAverage.textContent = '—';
    statBelow.textContent = '—';
    return;
  }

  const total = studentsCache.reduce((sum, s) => sum + (Number(s.current_marks) || 0), 0);
  statAverage.textContent = (total / count).toFixed(1);
  statBelow.textContent = studentsCache.filter((s) => Number(s.current_marks) < LOW_MARKS_THRESHOLD).length;
}

// ------------------------------------------------------------
// Save changes — insert/update the marks that were edited
// ------------------------------------------------------------
saveBtn.addEventListener('click', async () => {
  if (dirtyIds.size === 0) return;

  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving…';

  const updates = [...dirtyIds].map((id) => {
    const student = studentsCache.find((s) => s.id === id);
    return supabase.from('students').update({ current_marks: student.current_marks }).eq('id', id);
  });

  const results = await Promise.all(updates);
  const failed = results.filter((r) => r.error);

  saveBtn.textContent = 'Save changes';

  if (failed.length > 0) {
    showBanner(`Saved most rows, but ${failed.length} failed to update. Please retry.`, 'error');
  } else {
    showBanner(`Saved marks for ${dirtyIds.size} student${dirtyIds.size === 1 ? '' : 's'}.`, 'success');
  }

  dirtyIds.clear();
  sheetBody.querySelectorAll('.eval-row--dirty').forEach((row) => row.classList.remove('eval-row--dirty'));
  studentsCache.forEach((s) => { s._original = s.current_marks; });
  saveBtn.disabled = true;
});

function showBanner(message, kind) {
  evalBanner.textContent = message;
  evalBanner.className = `inline-banner inline-banner--${kind}`;
  evalBanner.hidden = false;
}

// ------------------------------------------------------------
// Export — current class mark sheet to Excel
// ------------------------------------------------------------
exportClassBtn.addEventListener('click', () => {
  if (!currentClass || studentsCache.length === 0) return;
  const workbook = buildWorkbookForClasses([{ cls: currentClass, students: studentsCache }]);
  const label = termInput.value.trim();
  const filename = `mark-sheet-${slugify(currentClass.class_name)}${label ? '-' + slugify(label) : ''}-${todayStamp()}.xlsx`;
  XLSX.writeFile(workbook, filename);
});

// ------------------------------------------------------------
// Export — every class, one sheet per class, in one workbook
// ------------------------------------------------------------
exportAllBtn.addEventListener('click', async () => {
  exportAllBtn.disabled = true;
  exportAllBtn.textContent = 'Preparing…';

  try {
    if (classesCache.length === 0) await loadClasses();

    const { data: allStudents, error } = await supabase
      .from('students')
      .select('id, student_number, first_name, last_name, status, current_marks, class_id')
      .order('first_name')
      .order('last_name');

    if (error || !allStudents) {
      showBanner('Could not load students for export.', 'error');
      return;
    }

    const groups = classesCache
      .map((cls) => ({ cls, students: allStudents.filter((s) => s.class_id === cls.id) }))
      .filter((g) => g.students.length > 0);

    if (groups.length === 0) {
      showBanner('No students found to export.', 'error');
      return;
    }

    const workbook = buildWorkbookForClasses(groups);
    const label = termInput.value.trim();
    const filename = `mark-sheets-all-classes${label ? '-' + slugify(label) : ''}-${todayStamp()}.xlsx`;
    XLSX.writeFile(workbook, filename);
  } finally {
    exportAllBtn.disabled = false;
    exportAllBtn.textContent = 'Export all classes';
  }
});

function buildWorkbookForClasses(groups) {
  const workbook = XLSX.utils.book_new();
  const usedNames = new Set();

  groups.forEach(({ cls, students }) => {
    const headers = ['#', 'Student number', 'First name', 'Last name', 'Status', 'Marks'];
    const rows = students.map((s, i) => [
      i + 1,
      s.student_number,
      s.first_name,
      s.last_name,
      s.status,
      s.current_marks,
    ]);

    const sheet = XLSX.utils.aoa_to_sheet([
      [`Mark sheet — ${cls.class_name} (${cls.academic_year})`],
      [],
      headers,
      ...rows,
    ]);
    sheet['!cols'] = [{ wch: 4 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 12 }, { wch: 8 }];

    const sheetName = uniqueSheetName(cls.class_name, usedNames);
    XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
  });

  return workbook;
}

function uniqueSheetName(name, usedNames) {
  // Excel sheet names: max 31 chars, no : \ / ? * [ ]
  let base = (name || 'Class').replace(/[:\\/?*[\]]/g, ' ').trim().slice(0, 31) || 'Class';
  let candidate = base;
  let suffix = 2;
  while (usedNames.has(candidate)) {
    candidate = `${base.slice(0, 28)} ${suffix}`;
    suffix += 1;
  }
  usedNames.add(candidate);
  return candidate;
}

function slugify(str) {
  return str.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function todayStamp() {
  return new Date().toISOString().slice(0, 10);
}

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
  const profile = await requireSession();
  if (!profile) return;

  renderIdentity(profile);

  canEdit = profile.role === 'administrator' || profile.role === 'discipline_teacher' || profile.role === 'teacher';
  if (!canEdit) {
    readonlyNotice.hidden = false;
  }

  await loadClasses();
})();
