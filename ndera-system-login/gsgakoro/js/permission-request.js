// ============================================================
// SDMS — Permission request page
//
// Anyone can open this page from the login screen, no account
// needed. Submitting inserts a row into public.permission_requests.
// A Supabase Database Webhook on that table then calls the
// notify-permission-request Edge Function, which relays the
// request to DOD over WhatsApp via CallMeBot. Nothing here talks
// to WhatsApp directly.
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
    errorBox.textContent = 'Ntibyakunze kohereza ubusabe. Ongera ugerageze.';
    errorBox.hidden = false;
    return;
  }

  // `.login-form` sets display:flex in style.css, which overrides the
  // browser's default styling for the [hidden] attribute — so setting
  // form.hidden alone left the form (and the typed-in values) visibly
  // on screen. Setting display directly, and clearing the fields,
  // actually hides it and stops stale data sitting in the boxes.
  form.reset();
  form.style.display = 'none';
  successBox.textContent = 'Ubusabe bwoherejwe! DOD arabimenya kuri WhatsApp.';
  successBox.hidden = false;
});
