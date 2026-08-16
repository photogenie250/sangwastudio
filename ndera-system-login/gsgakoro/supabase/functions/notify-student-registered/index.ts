// ============================================================
// SDMS — notify-student-registered
//
// Called by a Supabase Database Webhook every time a row is
// inserted into public.students — whether added one at a time
// from the "Add student" form, or in bulk through the Excel
// import (each imported row is its own insert, so each one
// fires this the same way). Formats the row into a message and
// relays it to CallMeBot, which delivers it as a WhatsApp message
// to DOD's phone. Reuses the same CallMeBot secrets already
// configured for the other notify-* functions.
//
// Required environment variables (skip if already set for the
// other notify-* functions — they're shared across functions in
// the same project):
//   CALLMEBOT_PHONE     — DOD's WhatsApp number, digits only,
//                          with country code (e.g. 250787692411)
//   CALLMEBOT_APIKEY    — the API key CallMeBot texted back after
//                          the one-time activation message
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

  const phone = Deno.env.get('CALLMEBOT_PHONE');
  const apikey = Deno.env.get('CALLMEBOT_APIKEY');
  if (!phone || !apikey) {
    return new Response('CallMeBot credentials are not configured', { status: 500 });
  }

  // Class name isn't on the students row itself (only class_id) —
  // look it up so the WhatsApp message is readable. Best-effort:
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

  const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(phone)}&text=${encodeURIComponent(message)}&apikey=${encodeURIComponent(apikey)}`;

  try {
    const res = await fetch(url);
    const body = await res.text();
    const succeeded = res.ok && !/error/i.test(body);

    return new Response(JSON.stringify({ ok: succeeded, callmebot_response: body }), {
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
