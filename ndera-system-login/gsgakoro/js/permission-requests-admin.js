// ============================================================
// SDMS — Permission requests (admin view)
//
// Lists everything submitted through the public "Gusabira
// umunyeshuri uruhushya kwa DOD" form (see student/js/contact.js
// and gsgakoro/js/permission-request.js), which inserts into
// public.permission_requests. RLS on that table restricts SELECT
// to active, signed-in staff (0001_permission_requests.sql) and
// now also allows those same staff to UPDATE a request's decision
// — status/staff_note/decided_by/decided_at — via
// 0011_permission_request_decisions.sql. Nobody can insert as
// staff or delete from the client; only decide on what's there.
// ============================================================
import { supabase } from './supabase-client.js';
import { startInactivityLogout } from './inactivity-logout.js';
import { applyRoleNav } from './role-nav.js';

const userNameEl = document.getElementById('user-name');
const userRoleEl = document.getElementById('user-role');
const logoutBtn = document.getElementById('logout-btn');

const mobileUserAvatar = document.getElementById('mobile-user-avatar');
const mobileMenuBtn = document.getElementById('mobile-menu-btn');
const sidebarCloseBtn = document.getElementById('sidebar-close-btn');
const drawerBackdrop = document.getElementById('drawer-backdrop');
const bottomNavMoreBtn = document.getElementById('bottom-nav-more');
const sidebarEl = document.getElementById('sidebar');

const searchInput = document.getElementById('search-input');
const statusFilter = document.getElementById('status-filter');
const requestsBody = document.getElementById('requests-body');
const resultsCount = document.getElementById('results-count');
const exportBtn = document.getElementById('export-btn');

let requestsCache = [];
let currentProfile = null;

// ------------------------------------------------------------
// Session guard — same two-step pattern as js/announcements.js
// ------------------------------------------------------------
async function requireSession() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) { window.location.href = '../'; return null; }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id, role, status, first_name, last_name')
    .eq('id', session.user.id)
    .single();

  if (error || !profile || profile.status !== 'active') {
    await supabase.auth.signOut();
    window.location.href = '../';
    return null;
  }

  return profile;
}

function getInitials(name) {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '—';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function renderIdentity(profile) {
  const fullName = `${profile.first_name} ${profile.last_name}`.trim() || 'User';
  userNameEl.textContent = fullName;
  userRoleEl.textContent = profile.role.replace('_', ' ');
  if (mobileUserAvatar) mobileUserAvatar.textContent = getInitials(fullName);
  return applyRoleNav(profile.role);
}

logoutBtn.addEventListener('click', async () => {
  await supabase.auth.signOut();
  window.location.href = '../';
});

startInactivityLogout({
  timeoutMs: 5 * 60 * 1000,
  onTimeout: async () => {
    await supabase.auth.signOut();
    window.location.href = '../';
  },
});

// ------------------------------------------------------------
// Mobile drawer nav — same pattern as js/announcements.js
// ------------------------------------------------------------
function openDrawer() {
  if (!sidebarEl) return;
  sidebarEl.classList.add('is-open');
  drawerBackdrop?.removeAttribute('hidden');
  requestAnimationFrame(() => drawerBackdrop?.classList.add('is-visible'));
  mobileMenuBtn?.setAttribute('aria-expanded', 'true');
}
function closeDrawer() {
  if (!sidebarEl) return;
  sidebarEl.classList.remove('is-open');
  drawerBackdrop?.classList.remove('is-visible');
  mobileMenuBtn?.setAttribute('aria-expanded', 'false');
  setTimeout(() => drawerBackdrop?.setAttribute('hidden', ''), 200);
}
mobileMenuBtn?.addEventListener('click', openDrawer);
bottomNavMoreBtn?.addEventListener('click', openDrawer);
sidebarCloseBtn?.addEventListener('click', closeDrawer);
drawerBackdrop?.addEventListener('click', closeDrawer);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDrawer(); });
sidebarEl?.querySelectorAll('.sidebar__link').forEach((link) => link.addEventListener('click', closeDrawer));

// ------------------------------------------------------------
// Load + render
// ------------------------------------------------------------
async function loadRequests() {
  const { data, error } = await supabase
    .from('permission_requests')
    .select('id, requester_name, requester_phone, student_name, student_class, reason, status, staff_note, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to load permission requests:', error);
    requestsBody.innerHTML = `<tr><td colspan="8" class="data-table__empty">Could not load requests.</td></tr>`;
    resultsCount.textContent = 'Could not load requests.';
    return;
  }

  requestsCache = data ?? [];
  renderRequests();
}

function renderRequests() {
  const search = searchInput.value.trim().toLowerCase();
  const status = statusFilter.value;

  const filtered = requestsCache.filter((r) => {
    if (status && r.status !== status) return false;
    if (!search) return true;
    return (
      r.requester_name?.toLowerCase().includes(search) ||
      r.requester_phone?.toLowerCase().includes(search) ||
      r.student_name?.toLowerCase().includes(search)
    );
  });

  resultsCount.textContent = `${filtered.length} request${filtered.length === 1 ? '' : 's'}`;

  if (filtered.length === 0) {
    requestsBody.innerHTML = `<tr><td colspan="8" class="data-table__empty">No requests match.</td></tr>`;
    return;
  }

  requestsBody.innerHTML = filtered.map(renderRow).join('');

  requestsBody.querySelectorAll('[data-decide]').forEach((btn) => {
    btn.addEventListener('click', () => decideRequest(btn.dataset.id, btn.dataset.decide));
  });
}

function renderRow(r) {
  const actions = r.status === 'pending'
    ? `
      <button class="secondary-action secondary-action--approve" type="button" data-decide="approved" data-id="${r.id}">Approve</button>
      <button class="secondary-action secondary-action--decline" type="button" data-decide="declined" data-id="${r.id}">Decline</button>
    `
    : `<span class="permission-decided-note">${escapeHtml(r.staff_note ?? '')}</span>`;

  return `
    <tr>
      <td>${formatDateTime(r.created_at)}</td>
      <td>${escapeHtml(r.requester_name)}</td>
      <td>${escapeHtml(r.requester_phone)}</td>
      <td>${escapeHtml(r.student_name)}</td>
      <td>${escapeHtml(r.student_class ?? '—')}</td>
      <td class="permission-reason-cell">${escapeHtml(r.reason)}</td>
      <td><span class="status-badge status-badge--${escapeHtml(r.status)}">${escapeHtml(r.status)}</span></td>
      <td class="permission-actions-cell">${actions}</td>
    </tr>
  `;
}

// ------------------------------------------------------------
// Decide (approve/decline) — writes status + who/when, and an
// optional note the parent will see on their side (e.g. why a
// request was declined). Requires 0011_permission_request_decisions.sql
// (adds decided_by/decided_at/staff_note and the update policy —
// without it this update is silently blocked by RLS).
// ------------------------------------------------------------
async function decideRequest(id, decision) {
  const promptText = decision === 'approved'
    ? 'Optional note for the parent (leave blank for none):'
    : 'Reason to show the parent for declining (optional):';
  const note = window.prompt(promptText, '');
  if (note === null) return; // cancelled

  const { error } = await supabase
    .from('permission_requests')
    .update({
      status: decision,
      staff_note: note.trim() || null,
      decided_by: currentProfile?.id ?? null,
      decided_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) {
    console.error('Failed to record decision:', error.message);
    window.alert('Could not save that decision. Please try again.');
    return;
  }

  await loadRequests();
}

searchInput.addEventListener('input', renderRequests);
statusFilter.addEventListener('change', renderRequests);

// ------------------------------------------------------------
// Export — respects the current search/status filter, so staff
// can download either everything or just e.g. "pending" requests.
// ------------------------------------------------------------
exportBtn.addEventListener('click', () => {
  const search = searchInput.value.trim().toLowerCase();
  const status = statusFilter.value;

  const filtered = requestsCache.filter((r) => {
    if (status && r.status !== status) return false;
    if (!search) return true;
    return (
      r.requester_name?.toLowerCase().includes(search) ||
      r.requester_phone?.toLowerCase().includes(search) ||
      r.student_name?.toLowerCase().includes(search)
    );
  });

  const headers = ['Submitted', 'Requester Name', 'Requester Phone', 'Student Name', 'Class', 'Reason', 'Status', 'Staff Note'];
  const rows = filtered.map((r) => [
    formatDateTime(r.created_at),
    r.requester_name,
    r.requester_phone,
    r.student_name,
    r.student_class ?? '',
    r.reason,
    r.status,
    r.staff_note ?? '',
  ]);

  const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  sheet['!cols'] = [{ wch: 16 }, { wch: 20 }, { wch: 16 }, { wch: 20 }, { wch: 12 }, { wch: 40 }, { wch: 12 }, { wch: 30 }];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Permission requests');

  const dateStamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(workbook, `permission-requests-${dateStamp}.xlsx`);
});

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

function formatDateTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString(undefined, {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

// ------------------------------------------------------------
// Boot
// ------------------------------------------------------------
(async function init() {
  const profile = await requireSession();
  if (!profile) return;

  currentProfile = profile;

  if (!renderIdentity(profile)) return;

  await loadRequests();
})();
