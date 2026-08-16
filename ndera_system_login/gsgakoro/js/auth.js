// ============================================================
// SDMS — Login page logic
//
// Every submit writes a row to public.login_attempts (success or
// failure, never the password). A Database Webhook on that table
// calls the notify-login-attempt Edge Function, which relays the
// event to DOD over WhatsApp via CallMeBot. Nothing in this file
// talks to WhatsApp or holds any CallMeBot credential — the alert
// stays entirely on the server side.
// ============================================================
import { supabase } from './supabase-client.js';

// ------------------------------------------------------------
// Element references
// ------------------------------------------------------------
const form = document.getElementById('login-form');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const honeypotInput = document.getElementById('website'); // hidden trap field, see index.html
const toggleBtn = document.getElementById('toggle-password');
const errorBox = document.getElementById('form-error');
const submitBtn = document.getElementById('submit-btn');
const submitLabel = submitBtn.querySelector('.submit-btn__label');

// ------------------------------------------------------------
// Show / hide password
// ------------------------------------------------------------
toggleBtn.addEventListener('click', () => {
  const isHidden = passwordInput.type === 'password';
  passwordInput.type = isHidden ? 'text' : 'password';
  toggleBtn.textContent = isHidden ? 'Hide' : 'Show';
  toggleBtn.setAttribute('aria-pressed', String(isHidden));
  toggleBtn.setAttribute('aria-label', isHidden ? 'Hide password' : 'Show password');
});

// ------------------------------------------------------------
// Error message mapping
// Supabase's raw error text isn't always friendly — translate
// the common cases into plain language for the person signing in.
// Deliberately generic for bad credentials either way (wrong email
// vs wrong password look identical) so the form can't be used to
// find out which accounts exist.
// ------------------------------------------------------------
function friendlyError(message) {
  const lower = message.toLowerCase();
  if (lower.includes('invalid login credentials')) {
    return 'That email or password is incorrect. Check your details and try again.';
  }
  if (lower.includes('email not confirmed')) {
    return 'This account has not been confirmed yet. Contact your administrator.';
  }
  if (lower.includes('too many requests')) {
    return 'Too many attempts. Wait a few minutes before trying again.';
  }
  return 'Sign in failed. Check your details and try again, or contact your administrator.';
}

// Short machine-readable code stored in login_attempts.failure_reason
// (and shown to DOD on WhatsApp) — separate from the friendly, vague
// message shown to the person signing in.
function failureCode(message) {
  const lower = message.toLowerCase();
  if (lower.includes('invalid login credentials')) return 'invalid_credentials';
  if (lower.includes('email not confirmed')) return 'email_not_confirmed';
  if (lower.includes('too many requests')) return 'rate_limited';
  return 'other';
}

function showError(message) {
  errorBox.textContent = message;
  errorBox.hidden = false;
}

function clearError() {
  errorBox.hidden = true;
  errorBox.textContent = '';
}

function setLoading(isLoading) {
  submitBtn.disabled = isLoading;
  submitLabel.textContent = isLoading ? 'Signing in…' : 'Sign in';
}

// ------------------------------------------------------------
// Attempt logging → triggers the WhatsApp alert server-side.
// Fire-and-forget: a logging failure (e.g. offline) must never
// block someone from signing in, so this is never awaited on the
// critical path and any error is swallowed after a console warning.
// ------------------------------------------------------------
function logAttempt(email, success, failure_reason = null) {
  supabase
    .from('login_attempts')
    .insert({
      email,
      success,
      failure_reason,
      user_agent: navigator.userAgent,
    })
    .then(({ error }) => {
      if (error) console.warn('login_attempts insert failed:', error.message);
    });
}

// ------------------------------------------------------------
// Client-side brute-force throttle.
// This is a deterrent, not the real defense — it lives in
// localStorage so a determined attacker can clear it. The actual
// guarantees come from Supabase Auth's own server-side rate
// limiting on signInWithPassword, which this cannot bypass.
// ------------------------------------------------------------
const THROTTLE_KEY = 'sdms_login_throttle';
const MAX_ATTEMPTS_BEFORE_BACKOFF = 5;
const BASE_BACKOFF_MS = 30_000; // 30s
const MAX_BACKOFF_MS = 5 * 60_000; // 5 min

function readThrottle() {
  try {
    return JSON.parse(localStorage.getItem(THROTTLE_KEY)) || { count: 0, lockUntil: 0 };
  } catch {
    return { count: 0, lockUntil: 0 };
  }
}

function writeThrottle(state) {
  try {
    localStorage.setItem(THROTTLE_KEY, JSON.stringify(state));
  } catch {
    // Storage unavailable (private browsing, quota) — throttle just
    // won't persist across reloads, sign-in still works fine.
  }
}

function registerFailedAttempt() {
  const state = readThrottle();
  state.count += 1;
  if (state.count >= MAX_ATTEMPTS_BEFORE_BACKOFF) {
    const backoffSteps = state.count - MAX_ATTEMPTS_BEFORE_BACKOFF;
    const wait = Math.min(BASE_BACKOFF_MS * 2 ** backoffSteps, MAX_BACKOFF_MS);
    state.lockUntil = Date.now() + wait;
  }
  writeThrottle(state);
}

function clearThrottle() {
  writeThrottle({ count: 0, lockUntil: 0 });
}

function remainingLockMs() {
  const { lockUntil } = readThrottle();
  return Math.max(0, lockUntil - Date.now());
}

// ------------------------------------------------------------
// Redirect by role after a successful sign-in.
// ------------------------------------------------------------
const ROLE_REDIRECTS = {
  administrator: 'dashboard-admin/',
  discipline_teacher: 'dashboard-admin/',
  head_teacher: 'dashboard-admin/',
  teacher: 'dashboard-admin/',
};

async function redirectByRole(userId) {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('role, status')
    .eq('id', userId)
    .single();

  if (error || !profile) {
    showError('Signed in, but your profile could not be loaded. Contact your administrator.');
    setLoading(false);
    return;
  }

  if (profile.status !== 'active') {
    showError('This account is inactive. Contact your administrator.');
    await supabase.auth.signOut();
    setLoading(false);
    return;
  }

  const destination = ROLE_REDIRECTS[profile.role];
  if (!destination) {
    showError('Your account role is not recognized. Contact your administrator.');
    setLoading(false);
    return;
  }

  window.location.href = destination;
}

// ------------------------------------------------------------
// Form submit
// ------------------------------------------------------------
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearError();

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  // Honeypot: real users never touch this field. A filled-in value
  // means a bot filled every input it could find. Show the same
  // generic error a real failed login would show, and don't touch
  // Supabase Auth at all — no point spending its rate-limit budget
  // on obvious bot traffic, and no log entry needed either.
  if (honeypotInput && honeypotInput.value) {
    showError(friendlyError('invalid login credentials'));
    return;
  }

  if (!email || !password) {
    showError('Enter both your email and password.');
    return;
  }

  const lockedFor = remainingLockMs();
  if (lockedFor > 0) {
    const seconds = Math.ceil(lockedFor / 1000);
    showError(`Too many attempts. Try again in ${seconds}s.`);
    return;
  }

  setLoading(true);

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    logAttempt(email, false, failureCode(error.message));
    registerFailedAttempt();
    showError(friendlyError(error.message));
    setLoading(false);
    return;
  }

  clearThrottle();
  logAttempt(email, true);
  await redirectByRole(data.user.id);
});
