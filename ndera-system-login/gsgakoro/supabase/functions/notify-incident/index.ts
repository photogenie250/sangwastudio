// ============================================================
// SDMS — notify-incident
//
// Called by a Supabase Database Webhook every time a row is
// inserted into public.incidents (i.e. every time a teacher
// records an incident and marks are deducted from a student).
// Looks up the student, offense, and recording teacher, formats
// a message, and relays it via the official Telegram Bot API,
// which delivers it as a Telegram message to DOD's chat.
//
// This replaces relying on the browser-side EmailJS "parent
// notification" as the only alert — that email depends on the
// parent's address being on file *and* EmailJS being configured,
// and silently does nothing (or shows "Could not send the parent
// notification email") if either is missing. This function is
// server-side and fires on every insert regardless of what the
// browser does, so DOD always finds out marks were removed.
//
// Required environment variables (set with `supabase secrets set`,
// skip if already set for notify-permission-request /
// notify-login-attempt — they're shared across functions in the
// same project):
//   TELEGRAM_BOT_TOKEN   — the bot token from @BotFather
//   TELEGRAM_CHAT_ID     — the chat that should receive the alert
//   WEBHOOK_SECRET       — a string you make up; the Database
//                          Webhook must send it back in the
//                          `x-webhook-secret` header, so random
//                          internet traffic can't trigger sends
//
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected
// automatically by the Edge Functions runtime — nothing to set.
// ============================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const expectedSecret = Deno.env.get('WEBHOOK_SECRET');
  const providedSecret = req.headers.get('x-webhook-secret');
  if (expectedSecret && providedSecret !== expectedSecret) {
    return new Response('Unauthorized', { status: 401 });
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return new Response('Invalid JSON body', { status: 400 });
  }

  const record = payload?.record;
  if (!record) {
    return new Response('No record in payload', { status: 400 });
  }

  const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
  const chatId = Deno.env.get('TELEGRAM_CHAT_ID');
  if (!botToken || !chatId) {
    return new Response('Telegram credentials are not configured', { status: 500 });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const supabase = createClient(supabaseUrl!, serviceRoleKey!);

  // Look up the friendly details the raw incidents row doesn't carry
  // (it only has foreign-key ids). Every lookup is best-effort —
  // a missing name should never stop the Telegram alert from going out.
  const [{ data: student }, { data: offense }, { data: teacher }] = await Promise.all([
    supabase
      .from('students')
      .select('first_name, last_name, student_number, current_marks, classes ( class_name )')
      .eq('id', record.student_id)
      .maybeSingle(),
    supabase
      .from('offenses')
      .select('title, deduction')
      .eq('id', record.offense_id)
      .maybeSingle(),
    supabase
      .from('profiles')
      .select('first_name, last_name')
      .eq('id', record.teacher_id)
      .maybeSingle(),
  ]);

  const studentName = student ? `${student.first_name} ${student.last_name}` : 'Unknown student';
  const className = student?.classes?.class_name ?? 'Unassigned';
  const newMarks = student?.current_marks;
  const deduction = record.deduction_applied ?? offense?.deduction;
  const oldMarks = (typeof newMarks === 'number' && typeof deduction === 'number')
    ? newMarks + deduction
    : null;
  const teacherName = teacher ? `${teacher.first_name} ${teacher.last_name}` : 'Unknown';

  const when = new Date(record.incident_date ?? Date.now()).toLocaleDateString('en-GB', {
    timeZone: 'Africa/Kigali',
  });

  const message = [
    'SDMS incident — marks removed',
    `Umunyeshuri: ${studentName} (${className}${student?.student_number ? ' · ' + student.student_number : ''})`,
    `Icyaha: ${offense?.title ?? 'Unknown offense'}${typeof deduction === 'number' ? ' (−' + deduction + ')' : ''}`,
    oldMarks !== null ? `Amanota: ${oldMarks} → ${newMarks}` : (typeof newMarks === 'number' ? `Amanota nshya: ${newMarks}` : ''),
    `Byanditswe na: ${teacherName}`,
    `Itariki: ${when}`,
    record.comment ? `Icyabaye: ${record.comment}` : '',
  ].filter(Boolean).join('\n');

  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: message }),
    });
    const body = await res.json();
    const succeeded = res.ok && body?.ok !== false;

    return new Response(JSON.stringify({ ok: succeeded, telegram_response: body }), {
      status: succeeded ? 200 : 502,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
