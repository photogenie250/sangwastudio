// ============================================================
// SDMS — notify-permission-request
//
// Called by a Supabase Database Webhook every time a row is
// inserted into public.permission_requests. Formats the row
// into a message and relays it via the official Telegram Bot
// API, which delivers it as a Telegram message to DOD's chat.
//
// Required environment variables (set with `supabase secrets set`):
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
  if (!botToken || !chatId) {
    return new Response('Telegram credentials are not configured', { status: 500 });
  }

  const message = [
    'Gusabira umunyeshuri uruhushya — new request',
    `Umunyeshuri: ${record.student_name}${record.student_class ? ' (' + record.student_class + ')' : ''}`,
    `Uwasabye: ${record.requester_name} — ${record.requester_phone}`,
    `Impamvu: ${record.reason}`,
  ].join('\n');

  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: message }),
    });
    const body = await res.json();

    return new Response(JSON.stringify({ ok: res.ok, telegram_response: body }), {
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
