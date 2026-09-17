// ============================================================
// SDMS — notify-login-attempt
//
// Called by a Supabase Database Webhook every time a row is
// inserted into public.login_attempts. Formats the row into a
// message and relays it via the official Telegram Bot API, which
// delivers it as a Telegram message to DOD's chat. Reuses the
// same Telegram secrets already configured for
// notify-permission-request.
//
// Required environment variables (set with `supabase secrets set`,
// skip if already set for notify-permission-request — they're
// shared across functions in the same project):
//   TELEGRAM_BOT_TOKEN   — the bot token from @BotFather
//   TELEGRAM_CHAT_ID     — the chat that should receive the alert
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

  const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
  const chatId = Deno.env.get('TELEGRAM_CHAT_ID');

  // TEMPORARY DEBUG — remove once the notification is confirmed
  // working. Logs only lengths, never the actual secret values,
  // so it's safe to leave in the function logs briefly.
  console.log(
    'DEBUG bot token length:', botToken?.length,
    'chat id length:', chatId?.length,
  );

  if (!botToken || !chatId) {
    return new Response('Telegram credentials are not configured', { status: 500 });
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

  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: message }),
    });
    const body = await res.json();

    // The Telegram API returns `ok: false` in the JSON body on
    // failure (e.g. bad token, chat not started) even when the HTTP
    // status looks fine, so check both.
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
