// ============================================================
// Parent portal — "write to DOD" contact form
//
// Standalone copy of the sdms-frontend permission-request flow:
// submitting inserts a row into public.permission_requests. A
// Supabase Database Webhook on that table calls the
// notify-permission-request Edge Function, which relays the
// request to DOD over Telegram. Nothing here talks to Telegram
// directly, and no login is required to use this page.
// ============================================================
import { supabase } from './supabase-client.js';

const form = document.getElementById('permission-form');
const errorBox = document.getElementById('permission-form-error');
const successBox = document.getElementById('permission-form-success');
const submitBtn = document.getElementById('permission-submit-btn');
const submitLabel = submitBtn.querySelector('.submit-btn__label');

function setLoading(isLoading) {
  submitBtn.disabled = isLoading;
  submitLabel.textContent = isLoading ? 'Kohereza…' : 'Ohereza';
}

// Prefill from query string, e.g. when a parent arrives here from
// the parent dashboard (?student_name=...&student_class=...).
(function prefillFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const studentName = params.get('student_name');
  const studentClass = params.get('student_class');
  if (studentName) form.student_name.value = studentName;
  if (studentClass) form.student_class.value = studentClass;
})();

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  errorBox.hidden = true;

  const payload = {
    requester_name: form.requester_name.value.trim(),
    requester_phone: form.requester_phone.value.trim(),
    student_name: form.student_name.value.trim(),
    student_class: form.student_class.value.trim() || null,
    reason: form.reason.value.trim(),
  };

  if (!payload.requester_name || !payload.requester_phone || !payload.student_name || !payload.reason) {
    errorBox.textContent = 'Uzuza imyanya yose isabwa.';
    errorBox.hidden = false;
    return;
  }

  setLoading(true);

  const { error } = await supabase.from('permission_requests').insert(payload);

  setLoading(false);

  if (error) {
    console.error('permission_requests insert failed:', error.message, error);
    errorBox.textContent = 'Ntibyakunze kohereza ubusabe. Ongera ugerageze.';
    errorBox.hidden = false;
    return;
  }

  form.reset();
  form.style.display = 'none';
  successBox.textContent = 'Usabiye umunyeshuri uruhushya urabimenyeshwa kuri telephone.';
  successBox.hidden = false;
});
