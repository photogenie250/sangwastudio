// ============================================================
// SDMS — Parent portal sign-in
//
// Parents have no Supabase Auth account. Sign-in here is a
// simple shared-password gate: the student code (student_number,
// e.g. STU0001) plus one word every parent is given by the
// school. See supabase/PARENT_PORTAL_SETUP.md to change it.
//
// The actual data lookup happens through the `parent_portal_lookup`
// Postgres function (see supabase/migrations/0003_parent_portal.sql),
// which only ever returns the single matching student — the anon
// key still cannot read the students/incidents tables directly.
// ============================================================
import { supabase } from './supabase-client.js';

const PARENT_PASSWORD = 'Gakoro';

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
  const password = passwordInput.value;

  if (!code || !password) {
    showError('Andika kode y\'umunyeshuri n\'ijambo ry\'ibanga byombi.');
    return;
  }

  if (password !== PARENT_PASSWORD) {
    showError('Iryo jambo ry\'ibanga si ryo. Baza ibiro by\'ishuri niba utabizi neza.');
    return;
  }

  setLoading(true);

  const { data, error } = await supabase.rpc('parent_portal_lookup', { p_student_number: code });

  setLoading(false);

  if (error) {
    console.error('parent_portal_lookup failed:', error.message);
    showError('Ntibyashobotse kugenzura iyo kode y\'umunyeshuri ubu. Ongera ugerageze vuba.');
    return;
  }

  if (!data || !data.found) {
    showError('Nta munyeshuri ubonetse ufite iyo kode. Isuzume hanyuma wongere ugerageze.');
    return;
  }

  // No real session/token — just remember which student code this
  // browser tab is looking at, so the dashboard page knows what to
  // fetch. Session-scoped, cleared when the tab closes.
  sessionStorage.setItem('sdms_parent_student_code', code);
  window.location.href = 'dashboard/';
});
