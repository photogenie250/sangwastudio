// ------------------------------------------------------------
// Student discipline file — printable A4 sheet
//
// Built from the student's profile data — ALL of the student's incidents
// (every term, voided ones excluded), flowing onto extra pages if needed.
// A whole class can be printed at once: one file per student, each on
// its own page.
//
// Built from the student's profile data. Only head_teacher and
// administrator can print it (button hidden + re-checked at print
// time + print CSS only shows the sheet while body.printing-file is
// set by this module).
//
// Discipline master comment (from current term marks, out of 40):
//   40        -> EXCELLENT          (no marks removed)
//   28 .. 39  -> Good               (lost marks)
//   below 28  -> Improve your conduct
// ------------------------------------------------------------
import { supabase } from './supabase-client.js';
import { getCurrentTerm, TERM_LABELS } from './term.js';

const PRINT_ROLES = ['administrator', 'head_teacher'];
const MIN_ROWS = 5;

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (d) => {
  if (!d) return '—';
  const x = new Date(d);
  return Number.isNaN(x.getTime()) ? esc(d) : x.toLocaleDateString('en-GB');
};

export function disciplineComment(marks) {
  const m = Number(marks);
  if (m >= 40) return { text: 'EXCELLENT', cls: 'sf-rem--excellent' };
  if (m < 28) return { text: 'Improve your conduct', cls: 'sf-rem--improve' };
  return { text: 'Good', cls: 'sf-rem--good' };
}

export function canPrintFile(role) { return PRINT_ROLES.includes(role); }

const sheet = document.getElementById('student-file-print');
const printBtn = document.getElementById('print-file-btn');
const classBtn = document.getElementById('print-class-files-btn');
const classFilter = document.getElementById('class-filter');
let ready = false;
let activeRole = null;

const INC_SELECT = 'student_id, incident_date, term, deduction_applied, comment, offenses ( title ), offense_categories ( name ), profiles!incidents_teacher_id_fkey ( first_name, last_name )';
const STUDENT_SELECT = 'id, first_name, last_name, student_number, gender, year_of_birth, parent_phone, parent_email, current_marks, status, photo_url, classes ( class_name )';

// All incidents for the given students, every term, paged past the
// 1000-row API cap. Oldest first so the file reads as a history.
async function fetchIncidents(ids) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('incidents').select(INC_SELECT)
      .in('student_id', ids).eq('is_voided', false)
      .order('incident_date', { ascending: true })
      .range(from, from + 999);
    if (error) { console.error('Student file: could not load incidents', error); break; }
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

function fileHtml(s, rows, term) {
  const deducted = rows.reduce((n, r) => n + (r.deduction_applied ?? 0), 0);
  const c = disciplineComment(s.current_marks);
  const body = rows.map((h) => `<tr><td>${esc(TERM_LABELS[h.term] ?? h.term ?? '—')}</td><td>${fmt(h.incident_date)}</td><td>${esc(h.offenses?.title ?? '—')}</td><td>${esc(h.offense_categories?.name ?? '—')}</td><td>−${h.deduction_applied ?? 0}</td><td>${esc(`${h.profiles?.first_name ?? ''} ${h.profiles?.last_name ?? ''}`.trim())}</td><td>${esc(h.comment ?? '')}</td></tr>`).join('')
    + '<tr><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>'.repeat(Math.max(0, MIN_ROWS - rows.length));
  const initials = `${s.first_name?.[0] ?? ''}${s.last_name?.[0] ?? ''}`.toUpperCase();
  const last = rows.length ? rows[rows.length - 1].incident_date : null;
  return `
    <div class="sf-page">
      <header class="sf-head">
        <div class="sf-logo"><b>NDERA</b><i>SYSTEM</i></div>
        <div class="sf-title"><small>Discipline Department</small><h1>GS Gakoro</h1><p>Student Discipline File · printed in ${esc(TERM_LABELS[term] ?? term)}</p></div>
        <div class="sf-status"><small>Status</small><div class="sf-v">${esc(s.status)}</div></div>
      </header>
      <section class="sf-id">
        <div class="sf-photo">${s.photo_url ? `<img src="${esc(s.photo_url)}" alt="">` : `<span>${esc(initials)}</span>`}</div>
        <div class="sf-fields">
          <div><small>Student name</small><div class="sf-v">${esc(s.last_name)} ${esc(s.first_name)}</div></div>
          <div class="sf-row"><div><small>Student SDMS</small><div class="sf-v">${esc(s.student_number)}</div></div><div><small>Gender</small><div class="sf-v">${esc(s.gender)}</div></div><div><small>Year of birth</small><div class="sf-v">${esc(s.year_of_birth)}</div></div></div>
          <div class="sf-row"><div><small>Class</small><div class="sf-v">${esc(s.classes?.class_name ?? 'Unassigned')}</div></div><div><small>Parent phone</small><div class="sf-v">${esc(s.parent_phone)}</div></div><div><small>Parent email</small><div class="sf-v">${esc(s.parent_email)}</div></div></div>
        </div>
      </section>
      <section class="sf-stats">
        <div class="sf-box sf-box--main"><small>Current term marks</small><strong>${esc(s.current_marks)} <em>/ 40</em></strong></div>
        <div class="sf-box"><small>Total incidents</small><strong>${rows.length}</strong></div>
        <div class="sf-box"><small>Points deducted</small><strong class="sf-red">${deducted}</strong></div>
        <div class="sf-box"><small>Last incident</small><span>${last ? fmt(last) : '—'}</span></div>
      </section>
      <section><h2 class="sf-h">Incident history · all terms</h2>
        <table class="sf-table"><thead><tr><th>Term</th><th>Date</th><th>Offense</th><th>Category</th><th>Deduction</th><th>Recorded by</th><th>Comment</th></tr></thead><tbody>${body}</tbody></table>
      </section>
      <section class="sf-keep"><small>Discipline master comment</small><div class="sf-rem ${c.cls}">${esc(c.text)}</div></section>
      <footer class="sf-sign sf-keep"><div><i></i><small>Discipline master</small></div><div><i></i><small>Parent / guardian</small></div><div><i></i><small>Head teacher &amp; stamp</small></div></footer>
    </div>`;
}

function print() {
  document.body.classList.add('printing-file');
  window.addEventListener('afterprint', () => document.body.classList.remove('printing-file'), { once: true });
  window.print();
}

// One student (the open profile).
export async function prepareStudentFile(studentId, role) {
  ready = false;
  activeRole = role;
  printBtn.hidden = true;
  sheet.innerHTML = '';
  if (!canPrintFile(role)) return;

  const [term, { data: s, error }, rows] = await Promise.all([
    getCurrentTerm(),
    supabase.from('students').select(STUDENT_SELECT).eq('id', studentId).single(),
    fetchIncidents([studentId]),
  ]);
  if (error || !s) { console.error('Student file: could not load student', error); return; }
  sheet.innerHTML = fileHtml(s, rows, term);
  printBtn.hidden = false;
  ready = true;
}

// Every active student in the chosen class: one file each, one per page.
export function initClassPrint(role) {
  activeRole = role;
  if (!canPrintFile(role)) return;
  const sync = () => {
    classBtn.disabled = !classFilter.value;
    classBtn.title = classFilter.value ? '' : 'Choose a class first';
  };
  classBtn.hidden = false;
  classFilter.addEventListener('change', sync);
  sync();
  classBtn.addEventListener('click', async () => {
    if (!canPrintFile(activeRole) || !classFilter.value) return;
    const label = classBtn.textContent;
    classBtn.disabled = true; classBtn.textContent = 'Preparing files…';
    try {
      const [term, { data: studs, error }] = await Promise.all([
        getCurrentTerm(),
        supabase.from('students').select(STUDENT_SELECT)
          .eq('class_id', classFilter.value).eq('status', 'active')
          .order('last_name').order('first_name'),
      ]);
      if (error || !studs?.length) { alert('No active students found in this class.'); return; }
      const all = await fetchIncidents(studs.map((x) => x.id));
      sheet.innerHTML = studs.map((x) => fileHtml(x, all.filter((r) => r.student_id === x.id), term)).join('');
      print();
    } finally {
      classBtn.textContent = label; sync();
    }
  });
}

printBtn.addEventListener('click', () => {
  // Re-check at print time — never trust the button being visible.
  if (!ready || !canPrintFile(activeRole)) return;
  print();
});
