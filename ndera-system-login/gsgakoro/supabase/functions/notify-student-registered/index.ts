// ============================================================
// SDMS — notify-student-registered
//
// Called by a Supabase Database Webhook every time a row is
// inserted into public.students — whether added one at a time
// from the "Add student" form, or in bulk through the Excel
// import (each imported row is its own insert, so each one
// fires this the same way). Formats the row into a message and
// relays it via the official Telegram Bot API, which delivers it
// as a Telegram message to DOD's chat. Reuses the same Telegram
// secrets already configured for the other notify-* functions.
//
// Required environment variables (skip if already set for the
// other notify-* functions — they're shared across functions in
// the same project):
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

  // Class name isn't on the students row itself (only class_id) —
  // look it up so the Telegram message is readable. Best-effort:
  // a lookup failure should never stop the alert from going out.
  let className = 'Unassigned';
  if (record.class_id) {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabase = createClient(supabaseUrl!, serviceRoleKey!);
    const { data: cls } = await supabase
      .from('classes')
      .select('class_name')
      .eq('id', record.class_id)
      .maybeSingle();
    if (cls?.class_name) className = cls.class_name;
  }

  const message = [
    'SDMS — new student registered',
    `Umunyeshuri: ${record.first_name} ${record.last_name}`,
    `Nimero: ${record.student_number}`,
    `Ishuri: ${className}`,
    record.gender ? `Igitsina: ${record.gender}` : '',
    record.parent_phone ? `Telefoni y'umubyeyi: ${record.parent_phone}` : '',
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
