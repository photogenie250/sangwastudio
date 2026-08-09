// ============================================================
// SANGWA STUDIO — notify-order Edge Function
//
// Fires whenever a new row is inserted into the `orders` table
// OR the `messages` table (wired up via two Database Webhooks,
// see README section 3) and sends YOU a WhatsApp message with
// the details — using CallMeBot's free WhatsApp API (see README
// for the 2-minute setup: no Meta Business account needed).
//
// Deploy:
//   supabase functions deploy notify-order
//
// Set secrets (your own WhatsApp number + the API key CallMeBot
// gives you — see README):
//   supabase secrets set CALLMEBOT_PHONE=250780000000
//   supabase secrets set CALLMEBOT_APIKEY=123456
// ============================================================

Deno.serve(async (req: Request) => {
  try {
    const payload = await req.json();
    // Supabase Database Webhooks wrap the inserted row in `record`,
    // plus a `table` field telling us which table fired the webhook.
    // If this function is ever called directly with just the row,
    // that still works too (falls back to treating it as an order).
    const row = payload.record ?? payload;
    const table = payload.table ?? "orders";

    const phone = Deno.env.get("CALLMEBOT_PHONE");
    const apikey = Deno.env.get("CALLMEBOT_APIKEY");

    if (!phone || !apikey) {
      return new Response(
        JSON.stringify({ error: "Missing CALLMEBOT_PHONE or CALLMEBOT_APIKEY secret" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const text = table === "messages"
      ? `New SANGWA STUDIO quick message!

Name: ${row.full_name ?? "N/A"}
Email: ${row.email ?? "N/A"}
Subject: ${row.subject ?? "N/A"}
Message: ${row.message ?? "N/A"}`
      : `New SANGWA STUDIO booking!

Division: ${row.division ?? "N/A"}
Service: ${row.service_type ?? "N/A"}
Name: ${row.full_name ?? "N/A"}
Phone: ${row.phone ?? "N/A"}
Email: ${row.email ?? "N/A"}
Date: ${row.event_date ?? "Not specified"}
Budget: ${row.budget ?? "N/A"}
Details: ${row.details ?? "N/A"}`;

    const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(phone)}&text=${encodeURIComponent(text)}&apikey=${encodeURIComponent(apikey)}`;
    const resp = await fetch(url);
    const result = await resp.text();

    return new Response(JSON.stringify({ ok: resp.ok, result }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
