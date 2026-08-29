// ============================================================
// SDMS — Parent portal dashboard
//
// Reads the student code this tab signed in with (session-scoped,
// set by parent-auth.js), fetches that one student's summary via
// the parent_portal_lookup Postgres function, and renders it.
// Read-only — parents never write to students/incidents/etc.
// ============================================================
import { supabase } from './supabase-client.js';
import { startInactivityLogout } from './inactivity-logout.js';

const CODE_KEY = 'sdms_parent_student_code';
const TIMEOUT_FLAG_KEY = 'sdms_parent_timed_out';
const INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

const loadingState = document.getElementById('loading-state');
const errorState = document.getElementById('error-state');
const errorMessage = document.getElementById('error-message');
const content = document.getElementById('content');

const studentAvatarEl = document.getElementById('student-avatar');
const topbarAvatarEl = document.getElementById('topbar-avatar');
const studentNameEl = document.getElementById('student-name');
const studentMetaEl = document.getElementById('student-meta');
const studentStatusEl = document.getElementById('student-status');
const attentionBadgeEl = document.getElementById('attention-badge');
const heroClassEl = document.getElementById('hero-class');

const likesCountEl = document.getElementById('likes-count');
const likesCardEl = document.getElementById('likes-card');

const marksValueEl = document.getElementById('marks-value');
const marksBarEl = document.getElementById('marks-bar');
const marksPctEl = document.getElementById('marks-pct');
const marksFractionEl = document.getElementById('marks-fraction');
const behaviorTitleEl = document.getElementById('behavior-title');

const incidentsBody = document.getElementById('incidents-body');
const incidentsTableWrap = document.querySelector('.behavior-card .parent-table-wrap');
const incidentsEmptyState = document.getElementById('incidents-empty-state');
const incidentsEmptyTitle = document.getElementById('incidents-empty-title');

const counselingList = document.getElementById('counseling-list');

const letterCard = document.getElementById('letter-card');
const letterCountText = document.getElementById('letter-count-text');

const contactLink = document.getElementById('contact-link');
const logoutBtn = document.getElementById('logout-btn');

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = value ?? '';
  return div.innerHTML;
}

function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function showError(message) {
  loadingState.hidden = true;
  content.hidden = true;
  errorState.hidden = false;
  errorMessage.textContent = message;
}

function logout() {
  sessionStorage.removeItem(CODE_KEY);
  window.location.href = '../';
}

// The redesigned header no longer has a standalone logout button —
// logout now lives in the hamburger drawer (see dashboard-ui.js) and
// calls the same sessionStorage-clear + redirect, but this listener
// stays guarded in case a future layout re-adds #logout-btn directly.
logoutBtn?.addEventListener('click', logout);

startInactivityLogout({
  timeoutMs: INACTIVITY_TIMEOUT_MS,
  onTimeout: () => {
    sessionStorage.setItem(TIMEOUT_FLAG_KEY, '1');
    logout();
  },
});

function renderStudent(student, underCounseling) {
  const fullName = `${student.first_name} ${student.last_name}`.trim();
  studentNameEl.textContent = fullName || 'Umunyeshuri';
  studentMetaEl.textContent = `${student.student_number} · ${student.class_name}`;
  heroClassEl.textContent = student.class_name || '—';

  const initials = `${(student.first_name || '?')[0] ?? ''}${(student.last_name || '')[0] ?? ''}`.toUpperCase();
  studentAvatarEl.textContent = initials || '🙂';
  topbarAvatarEl.textContent = initials || '🙂';
  studentStatusEl.textContent = (student.status || '').toUpperCase();
  studentStatusEl.className = `hero-status-pill hero-status-pill--${student.status === 'active' ? 'active' : 'inactive'}`;

  // Attention mark — shown whenever the child has an active (scheduled)
  // counseling session, so parents see it right away alongside status.
  attentionBadgeEl.hidden = !underCounseling;

  const marks = student.current_marks;
  const max = student.max_marks || 40;
  const low = marks < 28;
  const pct = Math.max(0, Math.min(100, (marks / max) * 100));

  // Second stat card — "Amanota yuzuye" (tight, no spaces around the slash).
  marksValueEl.textContent = `${marks}/${max}`;
  marksValueEl.className = `stat-card__value${low ? ' stat-card__value--low' : ''}`;

  // Behavior score card — heading, percentage, bar + spaced fraction.
  behaviorTitleEl.textContent = `Amanota y'imyitwarire (${marks}/${max})`;
  marksPctEl.textContent = `${Math.round(pct)}%`;
  marksPctEl.className = `behavior-card__pct${low ? ' behavior-card__pct--low' : ''}`;
  marksFractionEl.textContent = `${marks} / ${max}`;
  marksBarEl.style.width = `${pct}%`;
  marksBarEl.className = `parent-marks__bar-fill${low ? ' parent-marks__bar-fill--low' : ''}`;

  // Prefill the "write to DOD" link with the student's name/class so
  // the parent doesn't have to retype what we already know.
  const params = new URLSearchParams({
    student_name: fullName,
    student_class: student.class_name || '',
  });
  contactLink.href = `../contact/?${params.toString()}`;
}

// ------------------------------------------------------------
// Amashimwe — likes given by teachers for good behavior.
//
// Same rule the staff app enforces: a student only keeps piling up
// likes while they still have every one of their 40 starting marks
// this term. The instant one incident is logged, the staff side
// wipes their likes and locks the Like button until marks reset
// for a new term — so here we don't just show a number, we show
// *why* it's frozen when it is, since that's the part a student/
// parent can't see anywhere else in the portal.
// ------------------------------------------------------------
function renderLikes(likesData) {
  if (!likesData || !likesData.found) {
    likesCardEl.hidden = true;
    return;
  }

  const count = likesData.likes_count ?? 0;
  const eligible = !!likesData.eligible;

  likesCountEl.textContent = String(count);

  // The badge/note detail (why likes might be paused) now surfaces in the
  // bell notifications popover instead of cluttering the stat card — see
  // dashboard-ui.js, which listens for this event.
  document.dispatchEvent(new CustomEvent('sdms:likes', {
    detail: { count, eligible },
  }));
}

function renderIncidents(incidents) {
  if (!incidents || incidents.length === 0) {
    incidentsTableWrap.hidden = true;
    incidentsEmptyState.hidden = false;
    incidentsEmptyTitle.textContent = 'Nta manota yavanyweho muri iki gihembwe.';
    return;
  }

  incidentsTableWrap.hidden = false;
  incidentsEmptyState.hidden = true;

  incidentsBody.innerHTML = incidents.map((i) => `
    <tr>
      <td>${formatDate(i.incident_date)}</td>
      <td>${escapeHtml(i.offense_title ?? '—')}${i.is_voided ? '<span class="voided-badge">Yasheshwe</span>' : ''}</td>
      <td class="data-table__deduction">−${i.deduction_applied}</td>
      <td>${escapeHtml(i.comment || '—')}</td>
    </tr>
  `).join('');
}

function renderCounseling(sessions) {
  if (!sessions || sessions.length === 0) {
    counselingList.innerHTML = '<p class="parent-empty-note">Nta gahunda y\'ubujyanama yanditswe ku mwana wawe.</p>';
    return;
  }

  counselingList.innerHTML = sessions.map((s) => `
    <div class="parent-counseling-row">
      <span class="session-status-badge session-status-badge--${escapeHtml(s.status)}">${escapeHtml(s.status)}</span>
      <div>
        <p class="parent-counseling-row__reason">${escapeHtml(s.reason || s.notes || 'Nta bindi bisobanuro byanditswe.')}</p>
        <p class="parent-counseling-row__date">${formatDate(s.scheduled_date)}</p>
      </div>
    </div>
  `).join('');
}

function renderLetter(eligible, count) {
  if (!eligible) {
    letterCard.hidden = true;
    return;
  }
  letterCard.hidden = false;
  letterCountText.textContent = `Umwana wawe afite amakosa ${count} yanditswe muri iki gihembwe, bityo akwiye kwandikirwa ibaruwa ijya mu rugo.`;
}

async function init() {
  const code = sessionStorage.getItem(CODE_KEY);

  if (!code) {
    window.location.href = '../';
    return;
  }

  const { data, error } = await supabase.rpc('parent_portal_lookup', { p_student_number: code });

  if (error) {
    console.error('parent_portal_lookup failed:', error.message);
    showError('Ntibyashobotse gupakira amakuru y\'umunyeshuri ubu. Nyamuneka ongera ugerageze kwinjira vuba.');
    return;
  }

  if (!data || !data.found) {
    showError('Amakuru y\'uwo munyeshuri ntabwo abonetse. Nyamuneka ongera winjire.');
    return;
  }

  const underCounseling = (data.counseling_sessions ?? []).some((s) => s.status === 'scheduled');

  renderStudent(data.student, underCounseling);
  renderIncidents(data.incidents);
  renderCounseling(data.counseling_sessions);
  renderLetter(data.letter_eligible, data.incident_count_active);

  // Feed the bell notifications popover (dashboard-ui.js) with the two
  // "needs attention" signals this portal already tracks.
  document.dispatchEvent(new CustomEvent('sdms:alerts', {
    detail: {
      underCounseling,
      letterEligible: !!data.letter_eligible,
      incidentCount: data.incident_count_active ?? 0,
    },
  }));

  // Likes come from a separate RPC (see supabase/migrations/0005_parent_portal_likes.sql).
  // Fetched after the main lookup succeeds, on its own — if it fails
  // for any reason we simply hide the card rather than blocking the
  // rest of an otherwise-working dashboard.
  supabase.rpc('parent_portal_likes', { p_student_number: code })
    .then(({ data: likesData, error: likesError }) => {
      if (likesError) {
        console.error('parent_portal_likes failed:', likesError.message);
        likesCardEl.hidden = true;
        return;
      }
      renderLikes(likesData);
    });

  // Announcements — active, non-expired notices targeted at this
  // student (school-wide, their class, or them individually). See
  // supabase/migrations/0007_announcements.sql. Fetched alongside
  // likes, on its own — dashboard-ui.js owns the actual rendering
  // and just listens for this event, same pattern as sdms:likes.
  supabase.rpc('parent_portal_announcements', { p_student_number: code })
    .then(({ data: announceData, error: announceError }) => {
      if (announceError) {
        console.error('parent_portal_announcements failed:', announceError.message);
        document.dispatchEvent(new CustomEvent('sdms:announcements', { detail: [] }));
        return;
      }
      document.dispatchEvent(new CustomEvent('sdms:announcements', {
        detail: (announceData && announceData.found) ? (announceData.announcements ?? []) : [],
      }));
    });

  loadingState.hidden = true;
  content.hidden = false;
}

init();
