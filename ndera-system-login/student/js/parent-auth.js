// ============================================================
// SDMS — Parent portal sign-in
//
// Parents have no Supabase Auth account. Sign-in here is a
// per-student credential gate: the Student SDMS number as the
// username, and that student's year of birth as the password.
//
// Both are verified together, server-side, inside the
// `parent_portal_lookup` Postgres function (see
// supabase/migrations/0010_sdms_year_of_birth_login.sql) — the
// function only returns data when the year of birth matches the
// student for that SDMS number. The anon key still cannot read
// the students/incidents tables directly.
// ============================================================
import { supabase } from './supabase-client.js';

const form = document.getElementById('parent-login-form');
const codeInput = document.getElementById('student-code');
const passwordInput = document.getElementById('parent-password');
const toggleBtn = document.getElementById('toggle-password');
const errorBox = document.getElementById('form-error');
const submitBtn = document.getElementById('submit-btn');
const submitLabel = submitBtn.querySelector('.submit-btn__label');

toggleBtn.addEventListener('click', () => {
  const isHidden = passwordInput.type === 'password';
  passwordInput.type = isHidden ? 'text' : 'password';
  toggleBtn.textContent = isHidden ? 'Hisha' : 'Erekana';
  toggleBtn.setAttribute('aria-pressed', String(isHidden));
});

function showError(message) {
  errorBox.textContent = message;
  errorBox.hidden = false;
}

function clearError() {
  errorBox.hidden = true;
  errorBox.textContent = '';
}

// If the dashboard signed this parent out automatically after 5
// minutes of inactivity, let them know why they landed back here.
(function showTimeoutMessageIfAny() {
  if (sessionStorage.getItem('sdms_parent_timed_out')) {
    sessionStorage.removeItem('sdms_parent_timed_out');
    showError('Wasohotse kubera ko utigeze ukoresha iyi paji mu minota 5. Ongera winjire.');
  }
})();

function setLoading(isLoading) {
  submitBtn.disabled = isLoading;
  submitLabel.textContent = isLoading ? 'Kwinjira…' : 'Injira';
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearError();

  const code = codeInput.value.trim();
  const yearOfBirth = parseInt(passwordInput.value.trim(), 10);

  if (!code || !passwordInput.value.trim()) {
    showError('Andika nomero SDMS n\'umwaka wavukiyemo byombi.');
    return;
  }

  if (Number.isNaN(yearOfBirth) || passwordInput.value.trim().length !== 4) {
    showError('Umwaka wavukiyemo ugomba kuba imibare 4 (urugero: 2014).');
    return;
  }

  setLoading(true);

  const { data, error } = await supabase.rpc('parent_portal_lookup', {
    p_student_number: code,
    p_year_of_birth: yearOfBirth,
  });

  setLoading(false);

  if (error) {
    console.error('parent_portal_lookup failed:', error.message);
    showError('Ntibyashobotse kugenzura ayo makuru ubu. Ongera ugerageze vuba.');
    return;
  }

  if (!data || !data.found) {
    showError('Nomero SDMS cyangwa umwaka wavukiyemo ntibyo. Isuzume hanyuma wongere ugerageze.');
    return;
  }

  // No real session/token — just remember which student code (and
  // year of birth, needed to re-authenticate every subsequent call)
  // this browser tab is looking at. Session-scoped, cleared when
  // the tab closes.
  sessionStorage.setItem('sdms_parent_student_code', code);
  sessionStorage.setItem('sdms_parent_year_of_birth', String(yearOfBirth));
  window.location.href = 'dashboard/';
});
