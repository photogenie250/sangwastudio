# Setting up "Gusabira umunyeshuri uruhushya" → Telegram notification

This wires the login-page request form to a Telegram message sent to DOD
automatically, using the official Telegram Bot API.

Flow: **login page form → `permission_requests` table → Database Webhook →
Edge Function → Telegram Bot API → Telegram**

## 1. Run the migration

In the Supabase dashboard for this project
(`https://supabase.com/dashboard/project/svairnqnnvxcwjasuziz`), open
**SQL Editor** and run the contents of
`supabase/migrations/0001_permission_requests.sql`. This creates the
`permission_requests` table and locks it down with RLS: anyone can insert
a request, only signed-in active staff can read the list, and nobody can
edit or delete from the client.

## 2. Get your bot token and chat ID (one-time)

1. Message [@BotFather](https://t.me/BotFather) on Telegram to create a bot
   (or reuse an existing one) — it replies with a **bot token**, a string
   like `123456789:AAF...`. Keep it secret.
2. Open Telegram, find your bot by its @username, and send it any message
   (e.g. "hi") — required once so Telegram allows it to message that chat.
3. In a browser, visit `https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates`
   (swap in your real token). In the JSON response, find
   `"chat":{"id":123456789,...}` — that number is your **chat ID**. To send
   alerts to a group instead, add the bot to the group, send a message
   there, then repeat this step (group IDs are negative numbers).

## 3. Deploy the Edge Function

With the Supabase CLI, from the `supabase/` folder:

```bash
supabase login
supabase link --project-ref svairnqnnvxcwjasuziz
supabase functions deploy notify-permission-request
```

Then set its secrets:

```bash
supabase secrets set TELEGRAM_BOT_TOKEN=<your bot token from @BotFather>
supabase secrets set TELEGRAM_CHAT_ID=<your chat ID from step 2>
supabase secrets set WEBHOOK_SECRET=<make up a random string>
```

## 4. Create the Database Webhook

In the dashboard: **Database → Webhooks → Create a new hook**

- **Table:** `permission_requests`
- **Events:** `Insert` only
- **Type:** HTTP Request
- **URL:** `https://svairnqnnvxcwjasuziz.functions.supabase.co/notify-permission-request`
- **HTTP Headers:** add `x-webhook-secret: <the same random string from step 3>`

## 5. Test it

Open `login.html`, click **"Gusabira umunyeshuri uruhushya kwa DOD"**, fill
in the form, and submit. DOD's Telegram should receive a message within a
few seconds. If it doesn't arrive, check **Database → Webhooks → logs** and
**Edge Functions → notify-permission-request → logs** in the dashboard for
the error.

## Notes

- The Telegram Bot API is free with no practical rate limit for this use
  case — unlike the old CallMeBot/WhatsApp relay it replaces.
- The `WEBHOOK_SECRET` step is optional but recommended — without it,
  anyone who discovers the function URL could trigger a Telegram send.
