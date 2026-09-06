/* =====================================================
   SANGWA STUDIO — front-end configuration
   Fill these in, then save. Loaded before main.js.

   NOTE: these are attached to `window` (not `const`/`let`)
   on purpose — if this file ever gets included twice on a
   page (some site builders / hosts do this), `const`/`let`
   would throw "Identifier has already been declared" and
   break the whole page. Assigning to `window.X` is safe to
   run more than once.
===================================================== */
window.SUPABASE_URL = "https://fidxmzxqftemdcjxykpb.supabase.co"; // e.g. https://xxxxx.supabase.co
window.SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZpZHhtenhxZnRlbWRjanh5a3BiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQzNzAxNjgsImV4cCI6MjA5OTk0NjE2OH0.52n7B8iAudYcm2U4eVw2Xen2QUol0h5vs1kd9bQ5caM";
window.TELEGRAM_USERNAME = "sangwastudio_bot"; // your bot's or studio's Telegram @username, no @

/* ---- YouTube (Gakoro Media TV) ----
   Handled entirely by the Supabase Edge Function
   `get-youtube-videos` — the YouTube API key lives there as a
   secret, never in this file. See README.md section 4 to deploy
   it and set the key. Nothing to fill in here. */

window.sbClient = window.sbClient || null;
try{
  if (
    window.supabase &&
    typeof window.supabase.createClient === "function" &&
    window.SUPABASE_URL.startsWith("https://") &&
    window.SUPABASE_ANON_KEY !== "YOUR_SUPABASE_ANON_KEY"
  ){
    window.sbClient = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
  }
}catch(e){ console.warn("Supabase not configured yet:", e); }
