// ============================================================
// SDMS — notify-login-attempt
//
// Called by a Supabase Database Webhook every time a row is
// inserted into public.login_attempts. Formats the row into a
// message and relays it to CallMeBot, which delivers it as a
// WhatsApp message to DOD's phone. Reuses the same CallMeBot
// secrets already configured for notify-permission-request.
//
// Required environment variables (set with `supabase secrets set`,
// skip if already set for notify-permission-request — they're
// shared across functions in the same project):
//   CALLMEBOT_PHONE     — destination WhatsApp number, digits only,
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

  // TEMPORARY DEBUG — remove once the notification is confirmed
  // working. Logs only lengths/char codes, never the actual secret
  // values, so it's safe to leave in the function logs briefly.
  console.log(
    'DEBUG phone length:', phone?.length,
    'apikey length:', apikey?.length,
    'apikey first char code:', apikey?.charCodeAt(0),
    'apikey last char code:', apikey?.charCodeAt((apikey?.length ?? 1) - 1),
  );

  if (!phone || !apikey) {
    return new Response('CallMeBot credentials are not configured', { status: 500 });
  }

  const when = new Date(record.attempted_at ?? Date.now()).toLocaleString('en-GB', {
    timeZone: 'Africa/Kigali',
  });

  const message = record.success
    ? [
        'SDMS login — success',
        `Account: ${record.email}`,
        `Time: ${when}`,
      ].join('\n')
    : [
        'SDMS login — FAILED attempt',
        `Account: ${record.email}`,
        `Reason: ${record.failure_reason ?? 'unknown'}`,
        `Time: ${when}`,
      ].join('\n');

  const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(phone)}&text=${encodeURIComponent(message)}&apikey=${encodeURIComponent(apikey)}`;

  try {
    const res = await fetch(url);
    const body = await res.text();

    // CallMeBot returns HTTP 200 even when the message itself failed
    // (e.g. bad apikey, phone not activated) — the failure only shows
    // up in the response text. Treat any body containing "ERROR" as a
    // failure regardless of the HTTP status.
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
