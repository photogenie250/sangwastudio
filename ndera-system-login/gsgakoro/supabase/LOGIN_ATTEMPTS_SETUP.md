# Setting up login-form → WhatsApp notification

This wires the login page to a WhatsApp message sent to DOD
(`+250787692411`) on every sign-in attempt — success or failure —
using CallMeBot as the WhatsApp relay. The password never leaves
the browser; only the email, success/failure, a short reason code,
and the browser's user-agent string are logged.

Flow: **login form → `login_attempts` table → Database Webhook →
Edge Function → CallMeBot → WhatsApp**

This reuses the same CallMeBot contact already set up for
`notify-permission-request`. If you've already done steps 2 and the
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

## 2. Activate CallMeBot (skip if already done)

1. On the phone with number `+250787692411`, save `+34 644 59 71 65` as a
   contact (CallMeBot's number).
2. From that phone, send this exact WhatsApp message to that contact:
   `I allow callmebot to send me messages`
3. CallMeBot replies with an **API key** — you'll need it below.

## 3. Deploy the Edge Function

With the Supabase CLI, from the `supabase/` folder:

```bash
supabase login
supabase link --project-ref svairnqnnvxcwjasuziz
supabase functions deploy notify-login-attempt
```

If `CALLMEBOT_PHONE`, `CALLMEBOT_APIKEY`, and `WEBHOOK_SECRET` are not
already set on this project (e.g. from setting up
`notify-permission-request`), set them:

```bash
supabase secrets set CALLMEBOT_PHONE=250787692411
supabase secrets set CALLMEBOT_APIKEY=<the API key CallMeBot texted you>
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
once with correct details. DOD's WhatsApp should receive two messages
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
deterrent only — it's there to cut down on noisy WhatsApp alerts, not
to replace server-side protection, since anyone can clear it.

## Notes

- CallMeBot's free tier is rate-limited and meant for personal
  notifications, not bulk messaging. On a small school system this is
  fine, but a flood of automated login attempts could outrun it —
  that's part of why the client-side throttle exists.
- The `WEBHOOK_SECRET` header is optional but recommended — without
  it, anyone who discovers the function URL could trigger a WhatsApp
  send.
- No password is ever written to `login_attempts`, sent to the Edge
  Function, or included in the WhatsApp message.
