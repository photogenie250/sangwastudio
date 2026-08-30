// ============================================================
// SDMS — Offenses & Categories management
// ============================================================
import { supabase } from './supabase-client.js';
import { startInactivityLogout } from './inactivity-logout.js';
import { applyRoleNav } from './role-nav.js';

const userNameEl = document.getElementById('user-name');
const userRoleEl = document.getElementById('user-role');
const logoutBtn = document.getElementById('logout-btn');
const adminOnlyNotice = document.getElementById('admin-only-notice');
const pageContent = document.getElementById('page-content');

const categoriesBody = document.getElementById('categories-body');
const categoryForm = document.getElementById('category-form');
const categoryIdInput = document.getElementById('category-id');
const categoryNameInput = document.getElementById('category-name');
const categoryDescInput = document.getElementById('category-description');
const categoryFormTitle = document.getElementById('category-form-title');
const categorySubmitBtn = document.getElementById('category-submit-btn');
const categoryCancelBtn = document.getElementById('category-cancel-btn');
const categoryFormError = document.getElementById('category-form-error');

const offensesBody = document.getElementById('offenses-body');
const offenseForm = document.getElementById('offense-form');
const offenseIdInput = document.getElementById('offense-id');
const offenseCategorySelect = document.getElementById('offense-category');
const offenseTitleInput = document.getElementById('offense-title');
const offenseDescInput = document.getElementById('offense-description');
const offenseDeductionInput = document.getElementById('offense-deduction');
const offenseSeveritySelect = document.getElementById('offense-severity');
const offenseFormTitle = document.getElementById('offense-form-title');
const offenseSubmitBtn = document.getElementById('offense-submit-btn');
const offenseCancelBtn = document.getElementById('offense-cancel-btn');
const offenseFormError = document.getElementById('offense-form-error');

let categoriesCache = [];
let currentRole = null;

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
// Categories
// ------------------------------------------------------------
async function loadCategories() {
  const { data, error } = await supabase
    .from('offense_categories')
    .select('id, name, description')
    .order('name');

  if (error || !data) {
    categoriesBody.innerHTML = `<tr><td colspan="3" class="data-table__empty">Could not load categories.</td></tr>`;
    return;
  }

  categoriesCache = data;
  renderCategories(data);
  populateCategoryDropdown(data);
}

function renderCategories(categories) {
  if (categories.length === 0) {
    categoriesBody.innerHTML = `<tr><td colspan="3" class="data-table__empty">No categories yet.</td></tr>`;
    return;
  }

  const canDelete = currentRole === 'administrator' || currentRole === 'head_teacher';

  categoriesBody.innerHTML = categories.map((c) => `
    <tr data-id="${c.id}">
      <td>${escapeHtml(c.name)}</td>
      <td>${escapeHtml(c.description ?? '—')}</td>
      <td>
        <div class="row-actions">
          <button class="row-action-btn" data-action="edit-category">Edit</button>
          ${canDelete ? '<button class="row-action-btn row-action-btn--danger" data-action="delete-category">Delete</button>' : ''}
        </div>
      </td>
    </tr>
  `).join('');

  categoriesBody.querySelectorAll('[data-action="edit-category"]').forEach((btn) => {
    btn.addEventListener('click', (e) => startEditCategory(e.target.closest('tr').dataset.id));
  });
  if (canDelete) {
    categoriesBody.querySelectorAll('[data-action="delete-category"]').forEach((btn) => {
      btn.addEventListener('click', (e) => deleteCategory(e.target.closest('tr').dataset.id));
    });
  }
}

function populateCategoryDropdown(categories) {
  offenseCategorySelect.innerHTML = categories
    .map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`)
    .join('');
}

function startEditCategory(id) {
  const category = categoriesCache.find((c) => c.id === id);
  if (!category) return;

  categoryIdInput.value = category.id;
  categoryNameInput.value = category.name;
  categoryDescInput.value = category.description ?? '';
  categoryFormTitle.textContent = 'Edit category';
  categorySubmitBtn.textContent = 'Save changes';
  categoryCancelBtn.hidden = false;
  categoryFormError.hidden = true;
}

function resetCategoryForm() {
  categoryForm.reset();
  categoryIdInput.value = '';
  categoryFormTitle.textContent = 'Add category';
  categorySubmitBtn.textContent = 'Add category';
  categoryCancelBtn.hidden = true;
  categoryFormError.hidden = true;
}

categoryCancelBtn.addEventListener('click', resetCategoryForm);

categoryForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  categoryFormError.hidden = true;

  const id = categoryIdInput.value;
  const payload = {
    name: categoryNameInput.value.trim(),
    description: categoryDescInput.value.trim() || null,
  };

  const { error } = id
    ? await supabase.from('offense_categories').update(payload).eq('id', id)
    : await supabase.from('offense_categories').insert(payload);

  if (error) {
    categoryFormError.textContent = error.code === '23505'
      ? 'A category with this name already exists.'
      : 'Could not save this category.';
    categoryFormError.hidden = false;
    return;
  }

  resetCategoryForm();
  await loadCategories();
});

async function deleteCategory(id) {
  if (currentRole !== 'administrator' && currentRole !== 'head_teacher') return;
  if (!confirm('Delete this category? This only works if no offenses use it.')) return;

  const { error } = await supabase.from('offense_categories').delete().eq('id', id);

  if (error) {
    alert(
      error.code === '23503'
        ? 'This category cannot be deleted — one or more offenses still use it. Reassign or remove those offenses first.'
        : 'Could not delete this category.'
    );
    return;
  }

  await loadCategories();
}

// ------------------------------------------------------------
// Offenses
// ------------------------------------------------------------
async function loadOffenses() {
  const { data, error } = await supabase
    .from('offenses')
    .select('id, title, description, deduction, severity, is_active, category_id, offense_categories ( name )')
    .order('title');

  if (error || !data) {
    offensesBody.innerHTML = `<tr><td colspan="6" class="data-table__empty">Could not load offenses.</td></tr>`;
    return;
  }

  window.__offensesCache = data;
  renderOffenses(data);
}

function renderOffenses(offenses) {
  if (offenses.length === 0) {
    offensesBody.innerHTML = `<tr><td colspan="6" class="data-table__empty">No offenses yet.</td></tr>`;
    return;
  }

  offensesBody.innerHTML = offenses.map((o) => `
    <tr data-id="${o.id}">
      <td>${escapeHtml(o.title)}</td>
      <td>${escapeHtml(o.offense_categories?.name ?? '—')}</td>
      <td class="data-table__deduction">−${o.deduction}</td>
      <td>${escapeHtml(o.severity)}</td>
      <td>
        <label class="toggle">
          <input type="checkbox" data-action="toggle-active" ${o.is_active ? 'checked' : ''}>
          <span class="toggle__track"></span>
        </label>
      </td>
      <td>
        <div class="row-actions">
          <button class="row-action-btn" data-action="edit-offense">Edit</button>
        </div>
      </td>
    </tr>
  `).join('');

  offensesBody.querySelectorAll('[data-action="edit-offense"]').forEach((btn) => {
    btn.addEventListener('click', (e) => startEditOffense(e.target.closest('tr').dataset.id));
  });
  offensesBody.querySelectorAll('[data-action="toggle-active"]').forEach((checkbox) => {
    checkbox.addEventListener('change', (e) => toggleOffenseActive(
      e.target.closest('tr').dataset.id,
      e.target.checked
    ));
  });
}

function startEditOffense(id) {
  const offense = (window.__offensesCache ?? []).find((o) => o.id === id);
  if (!offense) return;

  offenseIdInput.value = offense.id;
  offenseCategorySelect.value = offense.category_id;
  offenseTitleInput.value = offense.title;
  offenseDescInput.value = offense.description ?? '';
  offenseDeductionInput.value = offense.deduction;
  offenseSeveritySelect.value = offense.severity;
  offenseFormTitle.textContent = 'Edit offense';
  offenseSubmitBtn.textContent = 'Save changes';
  offenseCancelBtn.hidden = false;
  offenseFormError.hidden = true;
}

function resetOffenseForm() {
  offenseForm.reset();
  offenseIdInput.value = '';
  offenseFormTitle.textContent = 'Add offense';
  offenseSubmitBtn.textContent = 'Add offense';
  offenseCancelBtn.hidden = true;
  offenseFormError.hidden = true;
}

offenseCancelBtn.addEventListener('click', resetOffenseForm);

offenseForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  offenseFormError.hidden = true;

  const id = offenseIdInput.value;
  const payload = {
    category_id: offenseCategorySelect.value,
    title: offenseTitleInput.value.trim(),
    description: offenseDescInput.value.trim() || null,
    deduction: parseInt(offenseDeductionInput.value, 10),
    severity: offenseSeveritySelect.value,
  };

  const { error } = id
    ? await supabase.from('offenses').update(payload).eq('id', id)
    : await supabase.from('offenses').insert(payload);

  if (error) {
    offenseFormError.textContent = error.code === '23505'
      ? 'An offense with this title already exists in that category.'
      : 'Could not save this offense.';
    offenseFormError.hidden = false;
    return;
  }

  resetOffenseForm();
  await loadOffenses();
});

async function toggleOffenseActive(id, isActive) {
  const { error } = await supabase
    .from('offenses')
    .update({ is_active: isActive })
    .eq('id', id);

  if (error) {
    alert('Could not update this offense.');
    await loadOffenses();
  }
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
  await loadCategories();
  await loadOffenses();
})();
