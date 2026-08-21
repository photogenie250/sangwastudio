// ============================================================
// Parent portal — standalone Supabase client
// This is its own copy (not shared with the staff sdms-frontend
// app) so the parent portal can be hosted/deployed on its own,
// pointed at the same Supabase project.
// ============================================================
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// Same project as the main SDMS staff app — replace with your
// own credentials if this ever points at a different project
// (Supabase dashboard -> Project Settings -> API).
const SUPABASE_URL = 'https://svairnqnnvxcwjasuziz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN2YWlybnFubnZ4Y3dqYXN1eml6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM3NTk2NDMsImV4cCI6MjA5OTMzNTY0M30.5qSmG8dH2MsNxOQtrBamhLlLopguPd7If4RKn-lE9L8';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
