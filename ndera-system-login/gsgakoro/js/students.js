// ============================================================
// SDMS — Students list & profile logic
// ============================================================
import { supabase } from './supabase-client.js';
import { startInactivityLogout } from './inactivity-logout.js';
import { applyRoleNav } from './role-nav.js';
import { sendMarksRemovedEmail } from './email-notify.js';

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
const profileAnnouncementsBody = document.getElementById('profile-announcements-body');
const likeCountEl = document.getElementById('like-count');
const likeBtn = document.getElementById('like-btn');
const likeIneligibleNote = document.getElementById('like-ineligible-note');
const likeCooldownNote = document.getElementById('like-cooldown-note');

const profileIncidentForm = document.getElementById('profile-incident-form');
const profileOffenseSelect = document.getElementById('profile-offense-select');
const profileIncidentDateInput = document.getElementById('profile-incident-date');
const profileIncidentCommentInput = document.getElementById('profile-incident-comment');
const profileIncidentError = document.getElementById('profile-incident-error');
const profileIncidentSuccess = document.getElementById('profile-incident-success');
const profileIncidentSubmitBtn = document.getElementById('profile-incident-submit-btn');

let currentPage = 0;
let totalCount = 0;
let currentRole = null;
let currentUserId = null;
let currentTeacherName = '';
let studentsCache = [];
let classesCacheForForm = [];
let parsedImportRows = [];
let currentProfileStudentId = null;
let currentProfileHasFullMarks = false;
let offensesById = {};

// Rate-limit state for the currently open student's Good behavior
// panel — how many times *this* teacher has liked *this* student
// today, and when their last like landed, so the button can show a
// live countdown instead of just "disabled".
const LIKE_DAILY_LIMIT = 3;
const LIKE_COOLDOWN_MS = 10 * 60 * 1000;
let currentProfileLikesToday = 0;
let currentProfileLastLikedAt = null;
let likeCooldownTimer = null;

// Like counts per student, keyed by student id — refreshed alongside
// the student list so the list view can show a small like badge too.
let likeCountsById = {};

async function loadLikeCounts() {
  // Counted in Postgres (get_like_counts RPC) instead of pulling every
  // row of student_likes down to the client just to tally counts per
  // student — same result, one row per student instead of one row per
  // like ever given.
  const { data, error } = await supabase.rpc('get_like_counts');

  if (error) {
    console.error('Failed to load like counts:', error);
    return;
  }

  const counts = {};
  (data ?? []).forEach((row) => {
    counts[row.student_id] = Number(row.like_count) || 0;
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
  currentTeacherName = `${profile.first_name} ${profile.last_name}`.trim();
  return profile;
}

function renderIdentity(profile) {
  userNameEl.textContent = `${profile.first_name} ${profile.last_name}`.trim() || 'User';
  userRoleEl.textContent = profile.role.replace('_', ' ');
  currentRole = profile.role;
  return applyRoleNav(profile.role);
}

// ------------------------------------------------------------
// Marks-removal confirmation — a teacher must type their own name,
// exactly as it appears in the system, before an incident (which
// deducts marks) is recorded here on the student profile.
// ------------------------------------------------------------
function normalizeName(name) {
  return (name ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

// Returns true if confirmed, false on a name mismatch ("Saba DoD
// uburenganzira"), or null if the teacher cancelled the prompt.
function confirmMarksRemoval(studentFullName, deduction) {
  const prompted = window.prompt(
    `${studentFullName} akuweho amanota ${deduction}, byemeze wandika izina ryawe:`
  );
  if (prompted === null) return null;
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
// Class filter dropdown
// ------------------------------------------------------------
async function loadClassFilter() {
  const { data, error } = await supabase
    .from('classes')
    .select('id, class_name, teacher_id')
    .order('class_name');

  if (error || !data) return;

  classesCacheForForm = data;

  classFilter.innerHTML = '<option value="">All classes</option>' +
    data.map((c) => `<option value="${c.id}">${escapeHtml(c.class_name)}</option>`).join('');

  // A student can only be registered against a class that already has
  // a teacher assigned — classes without one are shown but disabled so
  // it's clear why they can't be picked yet.
  studentClassSelect.innerHTML = '<option value="">Select a class…</option>' +
    data.map((c) => `<option value="${c.id}" ${c.teacher_id ? '' : 'disabled'}>${escapeHtml(c.class_name)}${c.teacher_id ? '' : ' (no teacher assigned)'}</option>`).join('');
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

  const isAdmin = currentRole === 'administrator' || currentRole === 'head_teacher';

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
  if (likeCooldownTimer) { clearInterval(likeCooldownTimer); likeCooldownTimer = null; }
  currentProfileLikesToday = 0;
  currentProfileLastLikedAt = null;
  likeCountEl.textContent = '— likes';
  likeBtn.disabled = true;
  likeBtn.textContent = '👍 Like';
  likeIneligibleNote.hidden = true;
  likeCooldownNote.hidden = true;
  historyBody.innerHTML = `<tr><td colspan="6" class="data-table__empty">Loading…</td></tr>`;
  profileAnnouncementsBody.innerHTML = `<p class="row-list__empty">Loading…</p>`;

  profileOffenseSelect.value = '';
  profileIncidentCommentInput.value = '';
  profileIncidentDateInput.value = new Date().toISOString().slice(0, 10);
  profileIncidentDateInput.max = new Date().toISOString().slice(0, 10);
  profileIncidentError.hidden = true;
  profileIncidentSuccess.hidden = true;

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
  await loadProfileAnnouncements(studentId);

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
// entirely: recording an incident (below) deletes any existing
// likes for a student the moment it happens, and
// the like button here stays disabled until the student is back
// to full marks (a new term, since marks reset to 40 then).
//
// A like is no longer a single forever-toggle: a teacher can like
// the same student repeatedly to reflect repeated good behavior,
// up to LIKE_DAILY_LIMIT times a day, with at least
// LIKE_COOLDOWN_MS between two likes from the same teacher for the
// same student. Both limits are also enforced server-side (see
// migration 0006_student_likes_rate_limit.sql) — the UI state here
// just mirrors that so the button can show a live countdown instead
// of failing silently.
// ------------------------------------------------------------
// ------------------------------------------------------------
// Announcements — read-only summary of what's been posted for this
// student (school-wide, their class, or targeted at them
// individually). Composed on the separate Announcements page,
// head_teacher/administrator only (see js/announcements.js) — this
// just displays them; any staff role can read announcements (see
// the announcements_select_staff RLS policy in
// supabase/migrations/0007_announcements.sql).
// ------------------------------------------------------------
async function loadProfileAnnouncements(studentId) {
  // Need the student's class_id (not exposed by the report RPC/
  // fallback above, which only carry class_name) to match
  // class-targeted announcements.
  const { data: student, error: studentError } = await supabase
    .from('students')
    .select('class_id')
    .eq('id', studentId)
    .single();

  if (studentError) {
    console.error('Failed to load student class for announcements:', studentError);
    profileAnnouncementsBody.innerHTML = `<p class="row-list__empty">Could not load announcements.</p>`;
    return;
  }

  const classId = student?.class_id ?? null;

  let query = supabase
    .from('announcements')
    .select('id, title, body, audience_type, created_at, expires_at')
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  query = classId
    ? query.or(`audience_type.eq.all,and(audience_type.eq.class,audience_class_id.eq.${classId}),and(audience_type.eq.student,audience_student_id.eq.${studentId})`)
    : query.or(`audience_type.eq.all,and(audience_type.eq.student,audience_student_id.eq.${studentId})`);

  const { data, error } = await query;

  if (error) {
    console.error('Failed to load announcements:', error);
    profileAnnouncementsBody.innerHTML = `<p class="row-list__empty">Could not load announcements.</p>`;
    return;
  }

  const now = new Date();
  const active = (data ?? []).filter((a) => !a.expires_at || new Date(a.expires_at) > now);

  if (active.length === 0) {
    profileAnnouncementsBody.innerHTML = `<p class="row-list__empty">No announcements for this student.</p>`;
    return;
  }

  profileAnnouncementsBody.innerHTML = active.map((a) => {
    const badge = a.audience_type === 'all' ? 'All students' : a.audience_type === 'class' ? 'Class' : 'Just them';
    return `
    <div class="mini-announcement">
      <div class="mini-announcement__title-line">
        <p class="mini-announcement__title">${escapeHtml(a.title)}</p>
        <span class="mini-announcement__badge">${badge}</span>
      </div>
      <p class="mini-announcement__body">${escapeHtml(a.body)}</p>
      <p class="mini-announcement__meta">Posted ${formatDate(a.created_at)}</p>
    </div>`;
  }).join('');
}

async function loadLikeState(studentId) {
  const { count, error: countError } = await supabase
    .from('student_likes')
    .select('id', { count: 'exact', head: true })
    .eq('student_id', studentId);

  if (countError) {
    console.error('Failed to load like count:', countError);
  }

  currentProfileLikesToday = 0;
  currentProfileLastLikedAt = null;

  if (currentUserId) {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const { data, error } = await supabase
      .from('student_likes')
      .select('created_at')
      .eq('student_id', studentId)
      .eq('teacher_id', currentUserId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Failed to load own like history:', error);
    } else if (data) {
      currentProfileLastLikedAt = data[0] ? new Date(data[0].created_at) : null;
      currentProfileLikesToday = data.filter((row) => new Date(row.created_at) >= startOfToday).length;
    }
  }

  renderLikeUI(count ?? 0);
  startLikeCooldownTimer();
}

function msUntilNextLikeAllowed() {
  if (!currentProfileLastLikedAt) return 0;
  const elapsed = Date.now() - currentProfileLastLikedAt.getTime();
  return Math.max(0, LIKE_COOLDOWN_MS - elapsed);
}

function renderLikeUI(count) {
  likeCountEl.textContent = `${count} like${count === 1 ? '' : 's'}`;

  if (!currentProfileHasFullMarks) {
    likeBtn.disabled = true;
    likeBtn.textContent = '👍 Like';
    likeIneligibleNote.hidden = false;
    likeCooldownNote.hidden = true;
    return;
  }
  likeIneligibleNote.hidden = true;

  const remainingToday = LIKE_DAILY_LIMIT - currentProfileLikesToday;
  const cooldownMs = msUntilNextLikeAllowed();

  if (remainingToday <= 0) {
    likeBtn.disabled = true;
    likeBtn.textContent = '👍 Like';
    likeCooldownNote.hidden = false;
    likeCooldownNote.textContent = `Daily limit reached (${LIKE_DAILY_LIMIT}/${LIKE_DAILY_LIMIT} today) — resets tomorrow.`;
  } else if (cooldownMs > 0) {
    likeBtn.disabled = true;
    likeBtn.textContent = '👍 Like';
    likeCooldownNote.hidden = false;
    const mins = Math.floor(cooldownMs / 60000);
    const secs = Math.floor((cooldownMs % 60000) / 1000);
    likeCooldownNote.textContent = `Can like again in ${mins}:${String(secs).padStart(2, '0')} — ${remainingToday} left today.`;
  } else {
    likeBtn.disabled = false;
    likeBtn.textContent = `👍 Like (${remainingToday} left today)`;
    likeCooldownNote.hidden = true;
  }
}

// Keeps the countdown text (and the button's disabled state) live
// without needing a page refresh, and stops itself once nothing is
// left to count down.
function startLikeCooldownTimer() {
  if (likeCooldownTimer) clearInterval(likeCooldownTimer);
  likeCooldownTimer = setInterval(() => {
    if (msUntilNextLikeAllowed() <= 0) {
      clearInterval(likeCooldownTimer);
      likeCooldownTimer = null;
    }
    renderLikeUI(Number((likeCountEl.textContent.match(/\d+/) || ['0'])[0]));
  }, 1000);
}

// Translates the structured errors raised by the trg_enforce_like_rules
// trigger (see supabase/migrations/0006_student_likes_rate_limit.sql)
// into the same friendly copy the client already shows proactively —
// this only fires if a race with another tab/device slips past the
// client-side checks above.
function friendlyLikeError(message) {
  if (!message) return 'Could not record that like — please try again.';
  if (message.startsWith('like_rate_limited')) {
    const seconds = Number((message.match(/wait (\d+) seconds/) || [])[1] || 0);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `Can like again in ${mins}:${String(secs).padStart(2, '0')}.`;
  }
  if (message.startsWith('like_daily_limit_reached')) {
    return `Daily limit reached (${LIKE_DAILY_LIMIT}/${LIKE_DAILY_LIMIT} today) — resets tomorrow.`;
  }
  if (message.startsWith('like_not_eligible')) {
    return `This student has lost marks this term, so they're not eligible to be liked right now.`;
  }
  return 'Could not record that like — please try again.';
}

likeBtn.addEventListener('click', async () => {
  if (!currentProfileStudentId || !currentUserId || !currentProfileHasFullMarks) return;
  if (currentProfileLikesToday >= LIKE_DAILY_LIMIT || msUntilNextLikeAllowed() > 0) return;

  likeBtn.disabled = true;

  const { error } = await supabase
    .from('student_likes')
    .insert({ student_id: currentProfileStudentId, teacher_id: currentUserId });

  if (error) {
    console.error('Failed to add like:', error);
    // The daily-limit / 10-minute-cooldown / full-marks rules are
    // also enforced server-side by the trg_enforce_like_rules
    // trigger — if this insert lost a race with another tab/device,
    // refresh state first, then surface a friendly version of the
    // server's message (loadLikeState's own render would otherwise
    // immediately overwrite it with its own note).
    await loadLikeState(currentProfileStudentId);
    likeCooldownNote.hidden = false;
    likeCooldownNote.textContent = friendlyLikeError(error.message);
    return;
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
  if (likeCooldownTimer) { clearInterval(likeCooldownTimer); likeCooldownTimer = null; }
});

// ------------------------------------------------------------
// Record incident (remove marks) — lives right on the student's
// profile so a teacher doesn't have to leave this view to log an
// offense. This is the only place an incident can be recorded
// anywhere in the system.
// ------------------------------------------------------------
// How many (non-voided) times each offense has actually been logged,
// so the dropdown below can surface the ones a teacher reaches for
// most often first, instead of forcing a scroll through the alphabet
// every time. A voided incident was a correction, not a real
// occurrence, so it's excluded — it shouldn't count toward "frequent".
async function loadOffenseFrequency() {
  // Counted in Postgres (get_offense_frequency RPC) instead of pulling
  // every non-voided incident row down to the client and counting in
  // JS — same result, but the payload is one row per offense instead
  // of one row per incident ever logged.
  const { data, error } = await supabase.rpc('get_offense_frequency');

  if (error || !data) {
    console.error('Failed to load offense frequency:', error);
    return {};
  }

  return data.reduce((counts, row) => {
    counts[row.offense_id] = Number(row.occurrences) || 0;
    return counts;
  }, {});
}

async function loadOffensesForProfile() {
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
    return;
  }

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

  profileOffenseSelect.innerHTML = '<option value="" disabled selected>Select an offense…</option>' +
    orderedGroups.map(([category, offenses]) => `
      <optgroup label="${escapeHtml(category)}">
        ${offenses.map((o) => `<option value="${o.id}">${escapeHtml(o.title)} (−${o.deduction})</option>`).join('')}
      </optgroup>
    `).join('');
}

function showProfileIncidentError(message) {
  profileIncidentError.textContent = message;
  profileIncidentError.hidden = false;
  profileIncidentSuccess.hidden = true;
}

function showProfileIncidentSuccess(message) {
  profileIncidentSuccess.textContent = message;
  profileIncidentSuccess.hidden = false;
  profileIncidentError.hidden = true;
}

profileIncidentForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  profileIncidentError.hidden = true;
  profileIncidentSuccess.hidden = true;

  if (!currentProfileStudentId) return;

  const offenseId = profileOffenseSelect.value;
  const incidentDate = profileIncidentDateInput.value;
  const comment = profileIncidentCommentInput.value.trim();

  if (!offenseId) {
    showProfileIncidentError('Select an offense.');
    return;
  }
  if (!comment) {
    showProfileIncidentError('Add a brief comment describing what happened.');
    return;
  }

  const { data: studentRow } = await supabase
    .from('students')
    .select('first_name, last_name, parent_email')
    .eq('id', currentProfileStudentId)
    .single();

  const offenseForConfirm = offensesById[offenseId];
  const studentFullNameForConfirm = `${studentRow?.first_name ?? ''} ${studentRow?.last_name ?? ''}`.trim();
  const confirmation = confirmMarksRemoval(studentFullNameForConfirm, offenseForConfirm?.deduction ?? '');

  if (confirmation === null) {
    return; // teacher cancelled the confirmation prompt
  }
  if (confirmation === false) {
    showProfileIncidentError('Saba DoD uburenganzira');
    return;
  }

  profileIncidentSubmitBtn.disabled = true;

  const { error: insertError } = await supabase.from('incidents').insert({
    student_id: currentProfileStudentId,
    teacher_id: currentUserId,
    offense_id: offenseId,
    comment,
    incident_date: incidentDate,
  });

  if (insertError) {
    console.error('Incident insert failed:', insertError);
    showProfileIncidentError('Could not record the incident. Check your connection and try again.');
    profileIncidentSubmitBtn.disabled = false;
    return;
  }

  // Losing marks dismisses a student from the "good behavior" likes
  // rating entirely — clear any existing likes now that this student
  // has an incident on record for the term.
  const { error: clearLikesError } = await supabase
    .from('student_likes')
    .delete()
    .eq('student_id', currentProfileStudentId);

  if (clearLikesError) {
    console.error('Failed to clear likes after incident:', clearLikesError);
  }

  const { data: updatedStudent } = await supabase
    .from('students')
    .select('current_marks')
    .eq('id', currentProfileStudentId)
    .single();

  const newMarks = updatedStudent?.current_marks;
  const offense = offensesById[offenseId];

  // DOD is notified automatically for every incident by a Database
  // Webhook + Edge Function that fires server-side on the insert
  // above. The parent email below is a separate, optional channel.
  let notifyNote = ' DOD notified.';
  if (studentRow?.parent_email) {
    const result = await sendMarksRemovedEmail({
      parentEmail: studentRow.parent_email,
      studentName: `${studentRow?.first_name ?? ''} ${studentRow?.last_name ?? ''}`.trim(),
      offenseTitle: offense?.title ?? 'Offense',
      deduction: offense?.deduction ?? '',
      newMarks,
      incidentDate,
    });
    if (result.sent) notifyNote += ' Parent notified by email.';
  } else {
    notifyNote += ' No parent email on file.';
  }

  showProfileIncidentSuccess(
    `Incident recorded.${newMarks !== undefined ? ` Current marks: ${newMarks}.` : ''}${notifyNote}`
  );

  profileOffenseSelect.value = '';
  profileIncidentCommentInput.value = '';
  profileIncidentSubmitBtn.disabled = false;

  // Refresh marks, like eligibility, and incident history in place —
  // no need to leave the profile to see the update take effect.
  const successMessage = profileIncidentSuccess.textContent;
  await openProfile(currentProfileStudentId);
  showProfileIncidentSuccess(successMessage);
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

  const classId = studentClassSelect.value;

  // A student must be registered against a class, and that class must
  // already have a teacher assigned — no unassigned/teacherless
  // registrations allowed.
  if (!classId) {
    studentFormError.textContent = 'Assign a class before registering this student.';
    studentFormError.hidden = false;
    return;
  }

  const selectedClass = classesCacheForForm.find((c) => c.id === classId);
  if (!selectedClass || !selectedClass.teacher_id) {
    studentFormError.textContent = 'That class has no teacher assigned yet — assign a teacher to the class first (Classes page).';
    studentFormError.hidden = false;
    return;
  }

  const id = studentIdInput.value;
  const payload = {
    first_name: studentFirstNameInput.value.trim(),
    last_name: studentLastNameInput.value.trim(),
    student_number: studentNumberInput.value.trim(),
    gender: studentGenderSelect.value || null,
    date_of_birth: studentDobInput.value || null,
    class_id: classId,
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
    } else if (!className) {
      status = 'error';
      note = 'A class is required — every student must be registered into a class with a teacher assigned.';
    } else if (!matchedClass) {
      status = 'error';
      note = `Class "${className}" not found.`;
    } else if (!matchedClass.teacher_id) {
      status = 'error';
      note = `Class "${className}" has no teacher assigned yet — assign one on the Classes page first.`;
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

  if (!renderIdentity(profile)) return;

  // These two don't depend on each other — loadClassFilter() fills the
  // class dropdown, loadOffensesForProfile() preloads the offense list
  // for the incident-recording panel. Running them together instead of
  // one after another saves a full round trip on every page load.
  await Promise.all([loadClassFilter(), loadOffensesForProfile()]);

  if (profile.role === 'administrator' || profile.role === 'head_teacher') {
    topbarActions.hidden = false;
  }

  // Deep link from Classes page: students/?class=<id>
  const params = new URLSearchParams(window.location.search);
  const classParam = params.get('class');
  if (classParam) {
    classFilter.value = classParam;
  }

  await loadStudents();
})();
