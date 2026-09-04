# Setting up login-form → Telegram notification

This wires the login page to a Telegram message sent to DOD on every
sign-in attempt — success or failure — using the official Telegram Bot
API. The password never leaves the browser; only the email,
success/failure, a short reason code, and the browser's user-agent
string are logged.

Flow: **login form → `login_attempts` table → Database Webhook →
Edge Function → Telegram Bot API → Telegram**

This reuses the same Telegram bot already set up for
`notify-permission-request`. If you've already done step 2 and the
secrets in step 3 for that function, you can skip straight to
deploying the new function and creating its webhook.

## 1. Run the migration

In the Supabase dashboard for this project
(`https://supabase.com/dashboard/project/svairnqnnvxcwjasuziz`), open
**SQL Editor** and run the contents of
`supabase/migrations/0002_login_attempts.sql`. This creates the
`login_attempts` table and locks it down with RLS: the login page can
only insert (never read, edit, or delete), and only signed-in active
staff can read the log back.

## 2. Get your bot token and chat ID (skip if already done)

1. Message [@BotFather](https://t.me/BotFather) on Telegram to create a bot
   (or reuse an existing one) — it replies with a **bot token**.
2. Open Telegram, find your bot by its @username, and send it any message
   (e.g. "hi") — required once so Telegram allows it to message that chat.
3. In a browser, visit `https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates`
   (swap in your real token). In the JSON response, find
   `"chat":{"id":123456789,...}` — that number is your **chat ID**.

## 3. Deploy the Edge Function

With the Supabase CLI, from the `supabase/` folder:

```bash
supabase login
supabase link --project-ref svairnqnnvxcwjasuziz
supabase functions deploy notify-login-attempt
```

If `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, and `WEBHOOK_SECRET` are not
already set on this project (e.g. from setting up
`notify-permission-request`), set them:

```bash
supabase secrets set TELEGRAM_BOT_TOKEN=<your bot token from @BotFather>
supabase secrets set TELEGRAM_CHAT_ID=<your chat ID from step 2>
supabase secrets set WEBHOOK_SECRET=<make up a random string>
```

Secrets are shared across all functions in the project, so if they're
already set you don't need to set them again.

## 4. Create the Database Webhook

In the dashboard: **Database → Webhooks → Create a new hook**

- **Table:** `login_attempts`
- **Events:** `Insert` only
- **Type:** HTTP Request
- **URL:** `https://svairnqnnvxcwjasuziz.functions.supabase.co/notify-login-attempt`
- **HTTP Headers:** add `x-webhook-secret: <the same random string from step 3>`

## 5. Test it

Open `login.html` and try signing in once with the wrong password and
once with correct details. DOD's Telegram should receive two messages
within a few seconds — one marked `FAILED attempt`, one marked
`success`. If nothing arrives, check **Database → Webhooks → logs**
and **Edge Functions → notify-login-attempt → logs** in the dashboard.

## Recommended: turn on Supabase's own protections too

Everything above is a monitoring/alerting layer. The real brute-force
defense should come from Supabase Auth itself, in
**Authentication → Rate Limits** and **Authentication → Attack
Protection** in the dashboard:

- Keep the built-in sign-in rate limiting on (Supabase already throttles
  repeated `signInWithPassword` calls per IP/account).
- Turn on **leaked password protection** so accounts can't use
  passwords known to be in public breach lists.
- Consider enabling CAPTCHA (hCaptcha/Turnstile) on the auth request if
  the school's internet-facing login ever sees real brute-force traffic.

The client-side throttle added in `js/auth.js` (a short lockout after
repeated failed attempts, stored in the browser's `localStorage`) is a
deterrent only — it's there to cut down on noisy Telegram alerts, not
to replace server-side protection, since anyone can clear it.

## Notes

- The Telegram Bot API is free with no practical rate limit for a small
  school system's login volume — unlike the old CallMeBot/WhatsApp
  relay it replaces.
- The `WEBHOOK_SECRET` header is optional but recommended — without
  it, anyone who discovers the function URL could trigger a Telegram
  send.
- No password is ever written to `login_attempts`, sent to the Edge
  Function, or included in the Telegram message.
