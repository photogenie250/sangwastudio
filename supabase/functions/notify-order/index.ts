// ============================================================
// SANGWA STUDIO — notify-order Edge Function
//
// Fires whenever a new row is inserted into the `orders` table
// OR the `messages` table (wired up via two Database Webhooks,
// see README section 3) and sends YOU a Telegram message with
// the details — using the official Telegram Bot API (free,
// instant, no rate limits like the old WhatsApp workaround).
//
// Deploy:
//   supabase functions deploy notify-order
//
// Set secrets (your bot token from @BotFather + the chat ID
// that should receive the alerts — see README):
//   supabase secrets set TELEGRAM_BOT_TOKEN=123456789:AAF...
//   supabase secrets set TELEGRAM_CHAT_ID=123456789
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

    const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
    const chatId = Deno.env.get("TELEGRAM_CHAT_ID");

    if (!botToken || !chatId) {
      return new Response(
        JSON.stringify({ error: "Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID secret" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const text = table === "messages"
      ? `📩 New SANGWA STUDIO quick message!

Name: ${row.full_name ?? "N/A"}
Email: ${row.email ?? "N/A"}
Subject: ${row.subject ?? "N/A"}
Message: ${row.message ?? "N/A"}`
      : `📸 New SANGWA STUDIO booking!

Division: ${row.division ?? "N/A"}
Service: ${row.service_type ?? "N/A"}
Name: ${row.full_name ?? "N/A"}
Phone: ${row.phone ?? "N/A"}
Email: ${row.email ?? "N/A"}
Date: ${row.event_date ?? "Not specified"}
Budget: ${row.budget ?? "N/A"}
Details: ${row.details ?? "N/A"}`;

    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
    const result = await resp.json();

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
