// ============================================================
// SDMS — Shared Supabase client
// Every page imports its client from here, so project
// credentials only ever need to be set in one place.
//
// Uses a locally vendored, version-pinned copy of the Supabase
// JS SDK (js/vendor/supabase-js-2.112.3.min.js) instead of
// importing it live from a CDN on every page load — avoids
// blocking page interactivity on a third-party network fetch.
// To upgrade, download a newer UMD build from
// https://www.npmjs.com/package/@supabase/supabase-js and
// update every page's <script> tag + this comment together.
// ============================================================
const { createClient } = window.supabase;

// Replace with your real project credentials
// (Supabase dashboard -> Project Settings -> API).
const SUPABASE_URL = 'https://svairnqnnvxcwjasuziz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN2YWlybnFubnZ4Y3dqYXN1eml6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM3NTk2NDMsImV4cCI6MjA5OTMzNTY0M30.5qSmG8dH2MsNxOQtrBamhLlLopguPd7If4RKn-lE9L8';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
