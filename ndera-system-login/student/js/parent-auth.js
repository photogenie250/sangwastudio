// Student / parent login: SDMS number + year of birth.
// Verified server-side by parent_portal_lookup(text, integer).
import { supabase, SESSION_KEY } from './supabase-client.js';

const form = document.getElementById('parent-login-form');
const codeInput = document.getElementById('student-code');
const yobInput = document.getElementById('parent-password');
const errorBox = document.getElementById('form-error');
const submitBtn = document.getElementById('submit-btn');
const submitLabel = submitBtn.querySelector('.submit-btn__label');
const toggleBtn = document.getElementById('toggle-password');

function showError(msg) {
  errorBox.textContent = msg;
  errorBox.hidden = false;
}

function setLoading(on) {
  submitBtn.disabled = on;
  submitLabel.textContent = on ? 'Tegereza…' : 'Injira';
}

toggleBtn.addEventListener('click', () => {
  const show = yobInput.type === 'password';
  yobInput.type = show ? 'text' : 'password';
  toggleBtn.setAttribute('aria-pressed', String(show));
  toggleBtn.textContent = show ? 'Hisha' : 'Erekana';
});

// Already signed in on this tab? Go straight to the dashboard.
try {
  if (sessionStorage.getItem(SESSION_KEY)) {
    window.location.replace('dashboard/');
  }
} catch (_) { /* storage blocked — just show the form */ }

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  errorBox.hidden = true;

  const studentNumber = codeInput.value.trim().replace(/\s+/g, '');
  const yobRaw = yobInput.value.trim();

  if (!studentNumber) return showError('Andika nomero SDMS y\'umunyeshuri.');
  if (!/^\d{4}$/.test(yobRaw)) return showError('Umwaka wavukiyemo ugomba kuba imibare 4 (urugero: 2014).');

  setLoading(true);
  try {
    const { data, error } = await supabase.rpc('parent_portal_lookup', {
      p_student_number: studentNumber,
      p_year_of_birth: parseInt(yobRaw, 10),
    });
    if (error) throw error;
    if (!data || !data.found) {
      showError('Nomero SDMS cyangwa umwaka wavukiyemo si byo. Ongera ugerageze.');
      return;
    }
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({
      student_number: data.student.student_number,
      year_of_birth: parseInt(yobRaw, 10),
    }));
    window.location.replace('dashboard/');
  } catch (err) {
    console.error('Login failed:', err);
    showError('Habaye ikibazo mu guhuza na seriveri. Ongera ugerageze nyuma.');
  } finally {
    setLoading(false);
  }
});
