// ============================================================
// Parent portal — standalone Supabase client
// This is its own copy (not shared with the staff sdms-frontend
// app) so the parent portal can be hosted/deployed on its own,
// pointed at the same Supabase project.
//
// Uses a locally vendored, version-pinned copy of the Supabase
// JS SDK (js/vendor/supabase-js-2.112.3.min.js) instead of
// importing it live from a CDN on every page load. This avoids
// blocking page interactivity (e.g. the password-toggle button)
// on a third-party network fetch. To upgrade, download a newer
// UMD build from https://www.npmjs.com/package/@supabase/supabase-js
// and update the <script> tag + this comment together.
// ============================================================
const { createClient } = window.supabase;

// Same project as the main SDMS staff app — replace with your
// own credentials if this ever points at a different project
// (Supabase dashboard -> Project Settings -> API).
const SUPABASE_URL = 'https://svairnqnnvxcwjasuziz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN2YWlybnFubnZ4Y3dqYXN1eml6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM3NTk2NDMsImV4cCI6MjA5OTMzNTY0M30.5qSmG8dH2MsNxOQtrBamhLlLopguPd7If4RKn-lE9L8';

// Isolated auth storage key + no session persistence.
//
// Without this, supabase-js's default storageKey is derived only
// from the project URL — not the page — so this client would share
// the same localStorage slot as the staff app's client
// (gsgakoro/js/supabase-client.js) whenever both are served from
// the same domain. If a teacher had ever logged into the staff app
// on this same browser, their leftover Supabase Auth session would
// get auto-attached as the Authorization header on every request
// here too — including storage uploads — which Storage then
// evaluates as role `authenticated` instead of `anon`. The
// student-photos bucket's upload policies are scoped `to anon`
// only (see supabase/migrations/0008_student_photos.sql), so any
// such request is rejected with a 400, even though everything else
// about the upload is correct. This portal was never meant to hold
// a real Supabase Auth session anyway (see parent-auth.js) — the
// student-code + shared-password gate is enforced client-side —
// so persistSession is also turned off entirely.
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storageKey: 'sdms-parent-portal-auth',
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});
