// ============================================================
// SDMS — Users management
// ============================================================
import { supabase } from './supabase-client.js';
import { startInactivityLogout } from './inactivity-logout.js';
import { applyRoleNav } from './role-nav.js';

const userNameEl = document.getElementById('user-name');
const userRoleEl = document.getElementById('user-role');
const logoutBtn = document.getElementById('logout-btn');
const adminOnlyNotice = document.getElementById('admin-only-notice');
const pageContent = document.getElementById('page-content');
const usersBody = document.getElementById('users-body');

let currentUserId = null;

// ------------------------------------------------------------
// Guard: administrator only
// ------------------------------------------------------------
async function requireAdmin() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) { window.location.href = '../'; return null; }

  currentUserId = session.user.id;

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
// Users list
// ------------------------------------------------------------
async function loadUsers() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, first_name, last_name, email, role, status')
    .order('first_name');

  if (error || !data) {
    usersBody.innerHTML = `<tr><td colspan="4" class="data-table__empty">Could not load users.</td></tr>`;
    return;
  }

  renderUsers(data);
}

function renderUsers(users) {
  if (users.length === 0) {
    usersBody.innerHTML = `<tr><td colspan="4" class="data-table__empty">No users yet.</td></tr>`;
    return;
  }

  usersBody.innerHTML = users.map((u) => `
    <tr data-id="${u.id}">
      <td>${escapeHtml(u.first_name)} ${escapeHtml(u.last_name)}${u.id === currentUserId ? ' <span style="color: var(--charcoal-soft); font-size: 12px;">(you)</span>' : ''}</td>
      <td>${escapeHtml(u.email)}</td>
      <td>
        <select class="field__input role-select" data-action="change-role" style="padding: 6px 10px; font-size: 13px;">
          <option value="administrator" ${u.role === 'administrator' ? 'selected' : ''}>Administrator</option>
          <option value="teacher" ${u.role === 'teacher' ? 'selected' : ''}>Teacher</option>
          <option value="discipline_teacher" ${u.role === 'discipline_teacher' ? 'selected' : ''}>Discipline teacher</option>
          <option value="head_teacher" ${u.role === 'head_teacher' ? 'selected' : ''}>Head teacher</option>
        </select>
      </td>
      <td>
        <label class="toggle">
          <input type="checkbox" data-action="toggle-status" ${u.status === 'active' ? 'checked' : ''}>
          <span class="toggle__track"></span>
        </label>
        <span style="font-size: 12px; color: var(--charcoal-soft); margin-left: 6px;">${escapeHtml(u.status)}</span>
      </td>
    </tr>
  `).join('');

  usersBody.querySelectorAll('[data-action="change-role"]').forEach((select) => {
    select.addEventListener('change', (e) => handleRoleChange(e.target.closest('tr').dataset.id, e.target.value));
  });
  usersBody.querySelectorAll('[data-action="toggle-status"]').forEach((checkbox) => {
    checkbox.addEventListener('change', (e) => handleStatusChange(e.target.closest('tr').dataset.id, e.target.checked));
  });
}

async function handleRoleChange(id, newRole) {
  if (id === currentUserId) {
    const confirmed = confirm('This changes your own account role. Continue?');
    if (!confirmed) {
      await loadUsers();
      return;
    }
  }

  const { error } = await supabase.from('profiles').update({ role: newRole }).eq('id', id);

  if (error) {
    alert('Could not update this user\'s role.');
  }
  await loadUsers();
}

async function handleStatusChange(id, isActive) {
  const newStatus = isActive ? 'active' : 'inactive';

  if (id === currentUserId && !isActive) {
    const confirmed = confirm('This deactivates your own account and will sign you out. Continue?');
    if (!confirmed) {
      await loadUsers();
      return;
    }
  }

  const { error } = await supabase.from('profiles').update({ status: newStatus }).eq('id', id);

  if (error) {
    alert('Could not update this user\'s status.');
    await loadUsers();
    return;
  }

  if (id === currentUserId && !isActive) {
    await supabase.auth.signOut();
    window.location.href = '../';
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

  renderIdentity(profile);

  if (profile.role !== 'administrator' && profile.role !== 'teacher') {
    adminOnlyNotice.hidden = false;
    pageContent.hidden = true;
    return;
  }

  pageContent.hidden = false;
  await loadUsers();
})();
