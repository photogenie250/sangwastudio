// ============================================================
// SDMS — notify-permission-request
//
// Called by a Supabase Database Webhook every time a row is
// inserted into public.permission_requests. Formats the row
// into a message and relays it to CallMeBot, which delivers it
// as a WhatsApp message to DOD's phone.
//
// Required environment variables (set with `supabase secrets set`):
//   CALLMEBOT_PHONE     — DOD's WhatsApp number, digits only,
//                          with country code (e.g. 250787692411)
//   CALLMEBOT_APIKEY    — the API key CallMeBot texted back after
//                          the one-time activation message
//   WEBHOOK_SECRET       — a string you make up; the Database
//                          Webhook must send it back in the
//                          `x-webhook-secret` header, so random
//                          internet traffic can't trigger sends
// ============================================================

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

  const message = [
    'Gusabira umunyeshuri uruhushya — new request',
    `Umunyeshuri: ${record.student_name}${record.student_class ? ' (' + record.student_class + ')' : ''}`,
    `Uwasabye: ${record.requester_name} — ${record.requester_phone}`,
    `Impamvu: ${record.reason}`,
  ].join('\n');

  const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(phone)}&text=${encodeURIComponent(message)}&apikey=${encodeURIComponent(apikey)}`;

  try {
    const res = await fetch(url);
    const body = await res.text();

    return new Response(JSON.stringify({ ok: res.ok, callmebot_response: body }), {
      status: res.ok ? 200 : 502,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
