// ============================================================
// SDMS — current academic term helper
//
// The school runs on 3 terms a year (term1/term2/term3). Behavior
// tracking (marks, incidents, likes) is scoped to "this term" —
// see js/students.js and the school_settings table (migration
// 0015) for how switching terms resets marks and starts a fresh
// count. Every page that tallies "this term" data should filter
// its incidents/student_likes queries by the value this returns,
// so old terms' records stay in the database for history but stop
// counting once a new term starts.
//
// Cached in-memory per page load — the term doesn't change under a
// user's feet mid-session, and this avoids an extra round trip on
// every single query that needs it.
// ============================================================
import { supabase } from './supabase-client.js';

export const TERM_LABELS = { term1: 'Term 1', term2: 'Term 2', term3: 'Term 3' };
export const TERM_VALUES = ['term1', 'term2', 'term3'];

let cachedTerm = null;

export async function getCurrentTerm() {
  if (cachedTerm) return cachedTerm;

  const { data, error } = await supabase.rpc('get_school_settings');

  if (error || !data || data.length === 0) {
    console.error('Failed to load current term, defaulting to term1:', error);
    cachedTerm = 'term1';
    return cachedTerm;
  }

  cachedTerm = data[0].current_term;
  return cachedTerm;
}
