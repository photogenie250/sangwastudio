# Setting up incident & new-student → WhatsApp notifications

This wires two more things to a WhatsApp message sent to DOD
(`+250787692411`) automatically, using CallMeBot as the WhatsApp relay —
the same relay already used for login attempts and permission requests:

1. **Every incident** (marks deducted from a student) — replaces relying
   on the browser-side "parent notification" email as the only alert.
   That email needs a parent address on file *and* EmailJS configured,
   and does nothing (or shows "Could not send the parent notification
   email") if either is missing. This new alert is server-side and
   fires on every incident regardless, so DOD always finds out.
2. **Every new student registered** — whether added one at a time from
   the "Add student" form, or in bulk via the Excel import (each
   imported row triggers its own alert, the same way).

Flow: **incidents / students table → Database Webhook → Edge Function →
CallMeBot → WhatsApp**

Both new functions reuse the same `CALLMEBOT_PHONE`, `CALLMEBOT_APIKEY`,
and `WEBHOOK_SECRET` already set up for `notify-permission-request` /
`notify-login-attempt` — skip straight to step 2 if those are already
configured on this project.

## 1. Fix the 'teacher' role bug first (unrelated, but do this too)

Run `supabase/migrations/0003_profiles_role_teacher_fix.sql` in the SQL
Editor. Assigning "Teacher" from Users → role dropdown currently looks
like it works but silently reverts — the `profiles.role` column still
has its original check constraint from before the "teacher" role was
added to the app, so Postgres rejects the update. This migration
replaces that constraint with one that allows all four roles
(`administrator`, `teacher`, `discipline_teacher`, `head_teacher`). If
it still doesn't stick after this, check `pg_policies` on `profiles` —
the SQL comment at the bottom of the migration explains how.

## 2. Deploy the Edge Functions

```bash
supabase login
supabase link --project-ref svairnqnnvxcwjasuziz
supabase functions deploy notify-incident
supabase functions deploy notify-student-registered
```

Set the shared secrets if they aren't already set on this project:

```bash
supabase secrets set CALLMEBOT_PHONE=250787692411
supabase secrets set CALLMEBOT_APIKEY=<the API key CallMeBot texted you>
supabase secrets set WEBHOOK_SECRET=<make up a random string>
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` don't need to be set —
Supabase injects them into every Edge Function automatically. Both
functions use the service role to look up the student/offense/teacher
(or class) names the raw webhook row doesn't carry, so the WhatsApp
message is readable instead of a row of UUIDs.

## 3. Create the two Database Webhooks

**Database → Webhooks → Create a new hook**, twice:

**Hook 1 — incidents**
- **Table:** `incidents`
- **Events:** `Insert` only
- **Type:** HTTP Request
- **URL:** `https://svairnqnnvxcwjasuziz.functions.supabase.co/notify-incident`
- **HTTP Headers:** `x-webhook-secret: <the same random string>`

**Hook 2 — students**
- **Table:** `students`
- **Events:** `Insert` only
- **Type:** HTTP Request
- **URL:** `https://svairnqnnvxcwjasuziz.functions.supabase.co/notify-student-registered`
- **HTTP Headers:** `x-webhook-secret: <the same random string>`

## 4. Test it

- Record an incident on `incidents.html` for any student. DOD's WhatsApp
  should get a message like:

  ```
  SDMS incident — marks removed
  Umunyeshuri: Senator Sangwa (S1A · STU005)
  Icyaha: <offense title> (−<deduction>)
  Amanota: 20 → 17
  Byanditswe na: <teacher name>
  Itariki: 22/07/2026
  Icyabaye: <comment>
  ```

- Add a student on `students.html` (or import an Excel sheet). DOD's
  WhatsApp should get one message per student:

  ```
  SDMS — new student registered
  Umunyeshuri: Alice Uwimana
  Nimero: STU-0001
  Ishuri: P6 A
  ```

If nothing arrives, check **Database → Webhooks → logs** and
**Edge Functions → notify-incident / notify-student-registered → logs**
in the dashboard for the error.

## Notes

- Same CallMeBot free-tier caveat as the other functions: fine for a
  small school, not built for bulk volume — a large Excel import will
  send one WhatsApp message per row, so keep that in mind for very
  large sheets.
- The incident message computes "old → new" marks by adding the
  offense's deduction back onto the student's current marks after the
  update; if the deduction was edited or the offense was deleted after
  the fact, only the "new" side is guaranteed accurate.
- The in-app "parent notified by email" note (EmailJS, in
  `js/incidents.js`) is unchanged and still optional — it no longer
  reads as an error when it's unset or fails, since the WhatsApp alert
  to DOD is now the reliable channel.
