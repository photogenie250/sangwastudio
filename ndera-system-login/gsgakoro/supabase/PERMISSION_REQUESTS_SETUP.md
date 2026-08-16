# Setting up "Gusabira umunyeshuri uruhushya" → WhatsApp notification

This wires the login-page request form to a WhatsApp message sent to DOD
(`+250787692411`) automatically, using CallMeBot as the WhatsApp relay.

Flow: **login page form → `permission_requests` table → Database Webhook →
Edge Function → CallMeBot → WhatsApp**

## 1. Run the migration

In the Supabase dashboard for this project
(`https://supabase.com/dashboard/project/svairnqnnvxcwjasuziz`), open
**SQL Editor** and run the contents of
`supabase/migrations/0001_permission_requests.sql`. This creates the
`permission_requests` table and locks it down with RLS: anyone can insert
a request, only signed-in active staff can read the list, and nobody can
edit or delete from the client.

## 2. Activate CallMeBot (one-time, on DOD's phone)

1. On the phone with number `+250787692411`, save `+34 644 59 71 65` as a
   contact (CallMeBot's number).
2. From that phone, send this exact WhatsApp message to that contact:
   `I allow callmebot to send me messages`
3. CallMeBot replies with an **API key** — save it, you'll need it below.

## 3. Deploy the Edge Function

With the Supabase CLI, from the `supabase/` folder:

```bash
supabase login
supabase link --project-ref svairnqnnvxcwjasuziz
supabase functions deploy notify-permission-request
```

Then set its secrets:

```bash
supabase secrets set CALLMEBOT_PHONE=250787692411
supabase secrets set CALLMEBOT_APIKEY=<the API key CallMeBot texted you>
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
in the form, and submit. DOD's WhatsApp should receive a message within a
few seconds. If it doesn't arrive, check **Database → Webhooks → logs** and
**Edge Functions → notify-permission-request → logs** in the dashboard for
the error.

## Notes

- CallMeBot's free tier is rate-limited and meant for personal notifications,
  not bulk messaging — fine for this use case, but don't expect it to hold
  up under high volume.
- The `WEBHOOK_SECRET` step is optional but recommended — without it,
  anyone who discovers the function URL could trigger a WhatsApp send.
