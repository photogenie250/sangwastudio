// ============================================================
// SDMS — Class management
// ============================================================
import { supabase } from './supabase-client.js';
import { startInactivityLogout } from './inactivity-logout.js';
import { applyRoleNav } from './role-nav.js';

const userNameEl = document.getElementById('user-name');
const userRoleEl = document.getElementById('user-role');
const logoutBtn = document.getElementById('logout-btn');
const adminOnlyNotice = document.getElementById('admin-only-notice');
const pageContent = document.getElementById('page-content');

const classesBody = document.getElementById('classes-body');
const classForm = document.getElementById('class-form');
const classIdInput = document.getElementById('class-id');
const classNameInput = document.getElementById('class-name');
const classLevelInput = document.getElementById('class-level');
const classYearInput = document.getElementById('class-year');
const classTeacherSelect = document.getElementById('class-teacher');
const classFormTitle = document.getElementById('class-form-title');
const classSubmitBtn = document.getElementById('class-submit-btn');
const classCancelBtn = document.getElementById('class-cancel-btn');
const classFormError = document.getElementById('class-form-error');

const selectAllCheckbox = document.getElementById('classes-select-all');
const bulkEnableBtn = document.getElementById('photo-bulk-enable-btn');
const bulkDisableBtn = document.getElementById('photo-bulk-disable-btn');
const bulkCountEl = document.getElementById('photo-bulk-count');

let classesCache = [];
let currentRole = null;
const selectedClassIds = new Set();

// ------------------------------------------------------------
// Guard: administrator only
// ------------------------------------------------------------
async function requireAdmin() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) { window.location.href = '../'; return null; }

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
  currentRole = profile.role;
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
// Teacher dropdown — administrators, teachers, and discipline
// teachers can all be assigned as a class's teacher
// ------------------------------------------------------------
async function loadTeacherOptions() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, first_name, last_name, role')
    .in('role', ['administrator', 'teacher', 'discipline_teacher'])
    .eq('status', 'active')
    .order('first_name');

  if (error || !data) return;

  classTeacherSelect.innerHTML = '<option value="">Unassigned</option>' +
    data.map((p) => `<option value="${p.id}">${escapeHtml(p.first_name)} ${escapeHtml(p.last_name)}</option>`).join('');
}

// ------------------------------------------------------------
// Classes list
// ------------------------------------------------------------
async function loadClasses() {
  const { data, error } = await supabase
    .from('classes')
    .select('id, class_name, level, academic_year, teacher_id, photo_upload_enabled, profiles ( first_name, last_name )')
    .order('academic_year', { ascending: false })
    .order('class_name');

  if (error || !data) {
    classesBody.innerHTML = `<tr><td colspan="7" class="data-table__empty">Could not load classes.</td></tr>`;
    return;
  }

  classesCache = data;
  renderClasses(data);
}

function renderClasses(classes) {
  if (classes.length === 0) {
    classesBody.innerHTML = `<tr><td colspan="7" class="data-table__empty">No classes yet.</td></tr>`;
    updateBulkControls();
    return;
  }

  // Drop any selected ids that no longer exist (e.g. class deleted).
  const liveIds = new Set(classes.map((c) => c.id));
  [...selectedClassIds].forEach((id) => { if (!liveIds.has(id)) selectedClassIds.delete(id); });

  const canDelete = currentRole === 'administrator' || currentRole === 'head_teacher';

  classesBody.innerHTML = classes.map((c) => `
    <tr data-id="${c.id}">
      <td><input type="checkbox" class="class-row-select" data-action="select-class" ${selectedClassIds.has(c.id) ? 'checked' : ''} aria-label="Select ${escapeHtml(c.class_name)}"></td>
      <td>${escapeHtml(c.class_name)}</td>
      <td>${escapeHtml(c.level)}</td>
      <td>${escapeHtml(c.academic_year)}</td>
      <td>${c.profiles ? escapeHtml(c.profiles.first_name) + ' ' + escapeHtml(c.profiles.last_name) : '—'}</td>
      <td>
        <label class="toggle">
          <input type="checkbox" data-action="toggle-photo-upload" ${c.photo_upload_enabled ? 'checked' : ''}>
          <span class="toggle__track"></span>
        </label>
      </td>
      <td>
        <div class="row-actions">
          <button class="row-action-btn" data-action="edit-class">Edit</button>
          ${canDelete ? '<button class="row-action-btn row-action-btn--danger" data-action="delete-class">Delete</button>' : ''}
        </div>
      </td>
    </tr>
  `).join('');

  classesBody.querySelectorAll('[data-action="edit-class"]').forEach((btn) => {
    btn.addEventListener('click', (e) => startEditClass(e.target.closest('tr').dataset.id));
  });
  if (canDelete) {
    classesBody.querySelectorAll('[data-action="delete-class"]').forEach((btn) => {
      btn.addEventListener('click', (e) => deleteClass(e.target.closest('tr').dataset.id));
    });
  }
  classesBody.querySelectorAll('[data-action="toggle-photo-upload"]').forEach((checkbox) => {
    checkbox.addEventListener('change', (e) => {
      const id = e.target.closest('tr').dataset.id;
      setPhotoUploadForClasses([id], e.target.checked);
    });
  });
  classesBody.querySelectorAll('[data-action="select-class"]').forEach((checkbox) => {
    checkbox.addEventListener('change', (e) => {
      const id = e.target.closest('tr').dataset.id;
      if (e.target.checked) selectedClassIds.add(id);
      else selectedClassIds.delete(id);
      updateBulkControls();
    });
  });

  updateBulkControls();
}

// ------------------------------------------------------------
// Photo upload toggle — single class (row switch) or several at
// once (bulk buttons below the table, after multi-selecting rows).
// ------------------------------------------------------------
async function setPhotoUploadForClasses(ids, enabled) {
  if (ids.length === 0) return;

  let targetIds = ids;

  // A class must have a teacher assigned before photo upload can be
  // turned on for it — enabling is only allowed once the "Teacher"
  // column is filled in. Disabling is never blocked.
  if (enabled) {
    const missingTeacherIds = ids.filter((id) => {
      const cls = classesCache.find((c) => c.id === id);
      return !cls || !cls.teacher_id;
    });

    if (missingTeacherIds.length > 0) {
      const names = missingTeacherIds
        .map((id) => classesCache.find((c) => c.id === id)?.class_name)
        .filter(Boolean)
        .join(', ');
      alert(
        `Assign a teacher to the class first — photo upload was not enabled for: ${names || 'the selected class(es)'}.`
      );
      targetIds = ids.filter((id) => !missingTeacherIds.includes(id));
    }

    if (targetIds.length === 0) {
      await loadClasses();
      return;
    }
  }

  const { error } = await supabase
    .from('classes')
    .update({ photo_upload_enabled: enabled })
    .in('id', targetIds);

  if (error) {
    alert('Could not update photo upload setting.');
    await loadClasses();
    return;
  }

  await loadClasses();
}

function updateBulkControls() {
  const count = selectedClassIds.size;
  bulkEnableBtn.disabled = count === 0;
  bulkDisableBtn.disabled = count === 0;
  bulkCountEl.textContent = count > 0
    ? `${count} class${count === 1 ? '' : 'es'} selected`
    : '';

  if (classesCache.length > 0) {
    selectAllCheckbox.checked = selectedClassIds.size === classesCache.length;
    selectAllCheckbox.indeterminate = selectedClassIds.size > 0 && selectedClassIds.size < classesCache.length;
  } else {
    selectAllCheckbox.checked = false;
    selectAllCheckbox.indeterminate = false;
  }
}

selectAllCheckbox.addEventListener('change', (e) => {
  selectedClassIds.clear();
  if (e.target.checked) {
    classesCache.forEach((c) => selectedClassIds.add(c.id));
  }
  renderClasses(classesCache);
});

bulkEnableBtn.addEventListener('click', () => {
  setPhotoUploadForClasses([...selectedClassIds], true);
});

bulkDisableBtn.addEventListener('click', () => {
  setPhotoUploadForClasses([...selectedClassIds], false);
});

function startEditClass(id) {
  const cls = classesCache.find((c) => c.id === id);
  if (!cls) return;

  classIdInput.value = cls.id;
  classNameInput.value = cls.class_name;
  classLevelInput.value = cls.level;
  classYearInput.value = cls.academic_year;
  classTeacherSelect.value = cls.teacher_id ?? '';
  classFormTitle.textContent = 'Edit class';
  classSubmitBtn.textContent = 'Save changes';
  classCancelBtn.hidden = false;
  classFormError.hidden = true;
}

function resetClassForm() {
  classForm.reset();
  classIdInput.value = '';
  classFormTitle.textContent = 'Add class';
  classSubmitBtn.textContent = 'Add class';
  classCancelBtn.hidden = true;
  classFormError.hidden = true;
}

classCancelBtn.addEventListener('click', resetClassForm);

classForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  classFormError.hidden = true;

  const id = classIdInput.value;
  const payload = {
    class_name: classNameInput.value.trim(),
    level: classLevelInput.value.trim(),
    academic_year: classYearInput.value.trim(),
    teacher_id: classTeacherSelect.value || null,
  };

  const { error } = id
    ? await supabase.from('classes').update(payload).eq('id', id)
    : await supabase.from('classes').insert(payload);

  if (error) {
    classFormError.textContent = error.code === '23505'
      ? 'A class with this name already exists for that academic year.'
      : 'Could not save this class.';
    classFormError.hidden = false;
    return;
  }

  resetClassForm();
  await loadClasses();
});

async function deleteClass(id) {
  if (currentRole !== 'administrator' && currentRole !== 'head_teacher') return;
  if (!confirm('Delete this class? Students in it will become unassigned, not deleted.')) return;

  const { error } = await supabase.from('classes').delete().eq('id', id);

  if (error) {
    alert('Could not delete this class.');
    return;
  }

  await loadClasses();
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
  const profile = await requireAdmin();
  if (!profile) return;

  if (!renderIdentity(profile)) return;

  if (profile.role !== 'administrator' && profile.role !== 'head_teacher') {
    adminOnlyNotice.hidden = false;
    pageContent.hidden = true;
    return;
  }

  pageContent.hidden = false;
  await loadTeacherOptions();
  await loadClasses();
})();
