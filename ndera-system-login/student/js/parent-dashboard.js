// Student / parent dashboard — read-only view driven by the
// parent_portal_* RPCs, authenticated by SDMS number + year of birth.
import { supabase, SESSION_KEY } from './supabase-client.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = (d) => { try { return new Date(d).toLocaleDateString('en-GB'); } catch { return ''; } };

function getSession() {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; }
}
export function logout() {
  try { sessionStorage.removeItem(SESSION_KEY); } catch (_) {}
  window.location.replace('../');
}
window.addEventListener('sdms-logout', logout);

function fail(msg) {
  $('loading-state').hidden = true;
  $('content').hidden = true;
  $('error-message').textContent = msg;
  $('error-state').hidden = false;
}

const STATUS_LABEL = { permission: 'Afite uruhushya', active: 'Ari ku ishuri', suspended: 'Yahagaritswe', graduated: 'Yarangije' };

async function init() {
  const session = getSession();
  if (!session) { window.location.replace('../'); return; }
  const { student_number: num, year_of_birth: yob } = session;

  const [lookup, likes, ann, photo, perms, term] = await Promise.all([
    supabase.rpc('parent_portal_lookup', { p_student_number: num, p_year_of_birth: yob }),
    supabase.rpc('parent_portal_likes', { p_student_number: num }),
    supabase.rpc('parent_portal_announcements', { p_student_number: num }),
    supabase.rpc('parent_portal_photo', { p_student_number: num }),
    supabase.rpc('parent_portal_permission_requests', { p_student_number: num, p_year_of_birth: yob }),
    supabase.rpc('get_current_term'),
  ]);

  if (lookup.error) return fail('Ntibishobotse guhuza na seriveri. Ongera ugerageze nyuma.');
  const data = lookup.data;
  if (!data || !data.found) {
    try { sessionStorage.removeItem(SESSION_KEY); } catch (_) {}
    return fail('Amakuru yawe ntabwo yabonetse. Subira kwinjira.');
  }

  const s = data.student;
  const initials = ((s.first_name || '')[0] || '') + ((s.last_name || '')[0] || '');
  $('student-name').textContent = `${s.first_name} ${s.last_name}`;
  $('student-meta').textContent = `SDMS: ${s.student_number}`;
  $('student-avatar-initials').textContent = initials.toUpperCase() || '—';
  $('topbar-avatar').textContent = initials.toUpperCase() || '—';
  $('student-status').textContent = STATUS_LABEL[s.status] || s.status || '—';
  $('hero-class').textContent = s.class_name;
  if (term.data) $('hero-term').textContent = String(term.data);

  const url = photo.data && photo.data.found ? photo.data.photo_url : null;
  if (url) {
    for (const id of ['student-avatar-img', 'topbar-avatar-img']) { $(id).src = url; $(id).hidden = false; }
    $('student-avatar-initials').hidden = true; $('topbar-avatar').hidden = true;
  }

  // Marks
  const marks = Number(s.current_marks ?? 0), max = s.max_marks || 40;
  const pct = Math.max(0, Math.min(100, Math.round((marks / max) * 100)));
  $('marks-value').textContent = marks;
  $('marks-pct').textContent = pct + '%';
  $('marks-bar').style.width = pct + '%';
  $('marks-fraction').textContent = `${marks} / ${max}`;
  $('behavior-title').textContent = `Amanota y'imyitwarire (${marks}/${max})`;

  // Likes
  if (likes.data && likes.data.found) $('likes-count').textContent = likes.data.likes_count;

  // Letter warning
  if (data.letter_eligible) {
    $('letter-count-text').textContent = `Umwana afite amakosa ${data.incident_count_active}.`;
    $('letter-card').hidden = false;
  }

  // Incidents
  const incidents = data.incidents || [];
  if (!incidents.length) {
    $('incidents-table').hidden = true;
    $('incidents-empty-state').hidden = false;
  } else {
    $('incidents-body').innerHTML = incidents.map((i) => `
      <tr${i.is_voided ? ' style="opacity:.55;text-decoration:line-through"' : ''}>
        <td>${fmtDate(i.incident_date)}</td>
        <td>${esc(i.offense_title || '—')}</td>
        <td>${i.is_voided ? '0' : '-' + esc(i.deduction_applied)}</td>
        <td>${esc(i.is_voided ? (i.voided_reason || 'Yakuweho') : (i.comment || ''))}</td>
      </tr>`).join('');
  }

  // Counseling
  const cs = data.counseling_sessions || [];
  $('counseling-list').innerHTML = cs.length
    ? cs.map((c) => `<p><strong>${fmtDate(c.scheduled_date)}</strong> — ${esc(c.reason || '')} <em>(${esc(c.status)})</em></p>`).join('')
    : '<p class="dash-empty-note">Nta bujyanama buriho.</p>';

  // Announcements
  const anns = (ann.data && ann.data.announcements) || [];
  $('announce-list').innerHTML = anns.length
    ? anns.map((a) => `<article class="announce-item"><h3>${esc(a.title)}</h3><p>${esc(a.body)}</p><small>${fmtDate(a.created_at)}</small></article>`).join('')
    : '<p class="dash-empty-note">Nta matangazo ahari.</p>';
  $('notif-list').innerHTML = anns.length
    ? anns.slice(0, 5).map((a) => `<p>${esc(a.title)}</p>`).join('')
    : '<p class="dash-empty-note">Nta makuru mashya.</p>';
  $('bell-dot').hidden = !anns.length;

  // Permission requests
  const reqs = (perms.data && perms.data.requests) || [];
  if (reqs.length) {
    $('permission-list').innerHTML = reqs.map((r) =>
      `<p><strong>${fmtDate(r.created_at)}</strong> — ${esc(r.reason)} <em>(${esc(r.status)})</em>${r.staff_note ? '<br><small>' + esc(r.staff_note) + '</small>' : ''}</p>`).join('');
    $('permission-card').hidden = false;
  }

  const q = new URLSearchParams({ student_name: `${s.first_name} ${s.last_name}`, student_class: s.class_name, student_number: s.student_number });
  $('contact-link').href = '../contact/?' + q;

  $('loading-state').hidden = true;
  $('content').hidden = false;
}

init().catch((e) => { console.error(e); fail('Habaye ikibazo. Ongera ugerageze nyuma.'); });
