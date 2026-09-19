// ============================================================
// SDMS — Announcements (head teacher / administrator only)
//
// Lets a head teacher or administrator post an announcement that
// shows up on a student's profile (see the "Announcements" panel
// added to js/students.js) — either school-wide, to one class, or
// to one specific student.
//
// Reading announcements is open to any authenticated staff account
// (see the announcements_select_staff RLS policy) so a teacher
// opening a student's profile can see them; only this page, and the
// write policies behind it, are restricted to head_teacher /
// administrator.
// ============================================================
import { supabase } from './supabase-client.js';
import { startInactivityLogout } from './inactivity-logout.js';
import { applyRoleNav } from './role-nav.js';

const userNameEl = document.getElementById('user-name');
const userRoleEl = document.getElementById('user-role');
const logoutBtn = document.getElementById('logout-btn');
const adminOnlyNotice = document.getElementById('admin-only-notice');
const pageContent = document.getElementById('page-content');

const mobileUserAvatar = document.getElementById('mobile-user-avatar');
const mobileMenuBtn = document.getElementById('mobile-menu-btn');
const sidebarCloseBtn = document.getElementById('sidebar-close-btn');
const drawerBackdrop = document.getElementById('drawer-backdrop');
const bottomNavMoreBtn = document.getElementById('bottom-nav-more');
const sidebarEl = document.getElementById('sidebar');

const announcementsBody = document.getElementById('announcements-body');

const form = document.getElementById('announcement-form');
const titleInput = document.getElementById('announcement-title');
const bodyInput = document.getElementById('announcement-body');
const audienceSelect = document.getElementById('announcement-audience');
const classField = document.getElementById('announcement-class-field');
const classSelect = document.getElementById('announcement-class-select');
const studentField = document.getElementById('announcement-student-field');
const expiryInput = document.getElementById('announcement-expiry');
const formError = document.getElementById('announcement-form-error');
const formSuccess = document.getElementById('announcement-form-success');
const submitBtn = document.getElementById('announcement-submit-btn');

const studentSearchInput = document.getElementById('announcement-student-search');
const studentResultsList = document.getElementById('announcement-student-results');
const studentSearchWrap = document.getElementById('announcement-student-search-wrap');
const selectedStudentBox = document.getElementById('announcement-selected-student');
const selectedStudentName = document.getElementById('announcement-selected-student-name');
const selectedStudentMeta = document.getElementById('announcement-selected-student-meta');
const changeStudentBtn = document.getElementById('announcement-change-student-btn');

let currentUserId = null;
let selectedStudent = null; // { id, first_name, last_name, student_number, classes }

// ------------------------------------------------------------
// Session guard (role is checked separately, after identity loads,
// same two-step pattern as js/classes.js and js/users.js)
// ------------------------------------------------------------
async function requireSession() {
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

  currentUserId = session.user.id;
  return profile;
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
// Mobile drawer nav — same pattern as js/dashboard-admin.js
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

function getInitials(name) {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '—';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ------------------------------------------------------------
// Audience: class dropdown
// ------------------------------------------------------------
async function loadClasses() {
  const { data, error } = await supabase
    .from('classes')
    .select('id, class_name')
    .order('class_name');

  if (error) {
    console.error('Failed to load classes:', error);
    return;
  }

  classSelect.innerHTML = `<option value="" disabled selected>Select a class…</option>` +
    (data ?? []).map((c) => `<option value="${c.id}">${escapeHtml(c.class_name)}</option>`).join('');
}

// ------------------------------------------------------------
// Audience: student search (debounced), same combobox pattern as
// js/incidents.js
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
    .select('id, first_name, last_name, student_number, classes ( class_name )')
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
      <p class="combobox__item-meta">${escapeHtml(s.classes?.class_name ?? 'Unassigned')} · ${escapeHtml(s.student_number)}</p>
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
  selectedStudentMeta.textContent = `${student.classes?.class_name ?? 'Unassigned'} · ${student.student_number}`;
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
// Audience type toggling
// ------------------------------------------------------------
function updateAudienceFields() {
  const value = audienceSelect.value;
  classField.hidden = value !== 'class';
  studentField.hidden = value !== 'student';
}
audienceSelect.addEventListener('change', updateAudienceFields);

// ------------------------------------------------------------
// List
// ------------------------------------------------------------
async function loadAnnouncements() {
  const { data, error } = await supabase
    .from('announcements')
    .select(`
      id, title, body, audience_type, is_active, created_at, expires_at,
      classes ( class_name ),
      students ( first_name, last_name, student_number ),
      profiles ( first_name, last_name )
    `)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to load announcements:', error);
    announcementsBody.innerHTML = `<p class="row-list__empty">Could not load announcements.</p>`;
    return;
  }

  if (!data || data.length === 0) {
    announcementsBody.innerHTML = `<p class="row-list__empty">No announcements posted yet.</p>`;
    return;
  }

  announcementsBody.innerHTML = data.map(renderAnnouncementRow).join('');

  announcementsBody.querySelectorAll('[data-action="toggle-active"]').forEach((checkbox) => {
    checkbox.addEventListener('change', (e) =>
      toggleAnnouncementActive(e.target.closest('.announcement-row').dataset.id, e.target.checked));
  });

  announcementsBody.querySelectorAll('[data-action="delete-announcement"]').forEach((btn) => {
    btn.addEventListener('click', (e) =>
      deleteAnnouncement(e.target.closest('.announcement-row').dataset.id));
  });
}

function audienceLabel(a) {
  if (a.audience_type === 'class') {
    return { text: `Class: ${a.classes?.class_name ?? 'Unknown'}`, cls: 'audience-badge--class' };
  }
  if (a.audience_type === 'student') {
    const name = a.students ? `${a.students.first_name} ${a.students.last_name}` : 'Unknown student';
    return { text: `Student: ${name}`, cls: 'audience-badge--student' };
  }
  return { text: 'All students', cls: '' };
}

function renderAnnouncementRow(a) {
  const audience = audienceLabel(a);
  const isExpired = a.expires_at && new Date(a.expires_at) < new Date();
  const authorName = a.profiles ? `${a.profiles.first_name} ${a.profiles.last_name}`.trim() : 'Unknown';
  const postedDate = formatDate(a.created_at);
  const expiryText = a.expires_at
    ? `${isExpired ? 'Expired' : 'Expires'} ${formatDate(a.expires_at)}`
    : 'No expiry';

  return `
    <div class="announcement-row" data-id="${a.id}">
      <div class="announcement-row__body">
        <div class="announcement-row__title-line">
          <p class="announcement-row__title">${escapeHtml(a.title)}</p>
          <span class="audience-badge ${audience.cls}">${escapeHtml(audience.text)}</span>
          ${!a.is_active ? '<span class="audience-badge audience-badge--inactive">Inactive</span>' : ''}
        </div>
        <p class="announcement-row__text">${escapeHtml(a.body)}</p>
        <p class="announcement-row__meta ${isExpired ? 'announcement-row__meta--expired' : ''}">
          Posted ${postedDate} by ${escapeHtml(authorName)} · ${expiryText}
        </p>
      </div>
      <div class="announcement-row__actions">
        <label class="toggle" title="${a.is_active ? 'Deactivate' : 'Reactivate'}">
          <input type="checkbox" data-action="toggle-active" ${a.is_active ? 'checked' : ''}>
          <span class="toggle__track"></span>
        </label>
        <button type="button" class="row-action-btn row-action-btn--danger" data-action="delete-announcement">Delete</button>
      </div>
    </div>
  `;
}

async function toggleAnnouncementActive(id, isActive) {
  const { error } = await supabase
    .from('announcements')
    .update({ is_active: isActive })
    .eq('id', id);

  if (error) {
    console.error('Failed to update announcement:', error);
    alert('Could not update this announcement.');
    await loadAnnouncements();
    return;
  }

  await loadAnnouncements();
}

async function deleteAnnouncement(id) {
  if (!confirm('Delete this announcement? This cannot be undone — consider deactivating it instead if you might want it back.')) return;

  const { error } = await supabase.from('announcements').delete().eq('id', id);

  if (error) {
    console.error('Failed to delete announcement:', error);
    alert('Could not delete this announcement.');
    return;
  }

  await loadAnnouncements();
}

// ------------------------------------------------------------
// Compose form
// ------------------------------------------------------------
function resetForm() {
  form.reset();
  updateAudienceFields();
  selectedStudent = null;
  selectedStudentBox.hidden = true;
  studentSearchWrap.hidden = false;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  formError.hidden = true;
  formSuccess.hidden = true;

  const audienceType = audienceSelect.value;

  if (audienceType === 'class' && !classSelect.value) {
    formError.textContent = 'Choose which class this announcement is for.';
    formError.hidden = false;
    return;
  }
  if (audienceType === 'student' && !selectedStudent) {
    formError.textContent = 'Choose which student this announcement is for.';
    formError.hidden = false;
    return;
  }

  const payload = {
    title: titleInput.value.trim(),
    body: bodyInput.value.trim(),
    audience_type: audienceType,
    audience_class_id: audienceType === 'class' ? classSelect.value : null,
    audience_student_id: audienceType === 'student' ? selectedStudent.id : null,
    created_by: currentUserId,
    expires_at: expiryInput.value ? `${expiryInput.value}T23:59:59` : null,
  };

  submitBtn.disabled = true;

  const { error } = await supabase.from('announcements').insert(payload);

  submitBtn.disabled = false;

  if (error) {
    console.error('Failed to post announcement:', error);
    formError.textContent = 'Could not post this announcement — please try again.';
    formError.hidden = false;
    return;
  }

  formSuccess.textContent = 'Announcement posted.';
  formSuccess.hidden = false;
  resetForm();
  await loadAnnouncements();
});

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

// ------------------------------------------------------------
// Boot
// ------------------------------------------------------------
(async function init() {
  const profile = await requireSession();
  if (!profile) return;

  if (!renderIdentity(profile)) return;

  if (profile.role !== 'administrator' && profile.role !== 'head_teacher') {
    adminOnlyNotice.hidden = false;
    pageContent.hidden = true;
    return;
  }

  pageContent.hidden = false;
  updateAudienceFields();
  await loadClasses();
  await loadAnnouncements();
})();
