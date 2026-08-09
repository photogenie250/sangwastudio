# SANGWA STUDIO — Website

A website for **SANGWA STUDIO** (Kigali) covering all three divisions:

- **SANGWA PHOTO** — photography bookings
- **SANGWA VIDEO** — videography / live streaming bookings
- **SANGWA MUSIC** — studio recording bookings

Organized as separate files (HTML / CSS / JS / images) so it's easy to edit and host anywhere — Netlify, Vercel, GitHub Pages, cPanel, etc. No build step required, just upload the folder as-is.

---

## 1. File structure

```
index.html          ← page markup
css/style.css        ← all styling
js/config.js          ← YOUR SETTINGS: phone number, WhatsApp, Supabase keys
js/main.js            ← site behavior (menu, animations, form logic) — no edits needed
assets/logo-small.png ← logo used in the nav bar & favicon
assets/logo-mark.png  ← larger logo used in hero & about section
assets/logo-full.png  ← your original uploaded logo, full size, kept for reference
assets/hero/          ← crossfading background photos behind the hero headline
sql/schema.sql        ← run once in Supabase to create the booking database
supabase/functions/notify-order/index.ts  ← Edge Function that pings your WhatsApp on every new booking
```

Keep the folder structure intact when uploading — `index.html` expects `css/`, `js/`, and `assets/` to sit right next to it.

---

## 2. Quick edits before you launch

Open **`js/config.js`** — this is the only file you need to touch for basic setup:

```js
const SUPABASE_URL = "YOUR_SUPABASE_URL";
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";
const WHATSAPP_NUMBER = "250780000000"; // digits only, country code first, no + or spaces
```

Then open **`index.html`** and update these placeholders (use Ctrl/Cmd+F):

| Placeholder | Where | Replace with |
|---|---|---|
| `+250 780 000 000` | Contact section, footer | Your real phone number |
| `hello@sangwastudio.rw` | Contact section, footer | Your real email |
| `instagram.com/sangwa_studio` | Connect section, footer | Your real Instagram URL |
| `youtube.com/@sangwastudio` | Connect section, footer | Your real YouTube URL |
| Testimonial text + "Client Name" | Testimonials section | Real client quotes (with permission) |
| Portfolio tile captions | Portfolio section | Your real project names — see below |

### Swapping in real hero photos
Like the reference site, the homepage headline sits over a slow crossfading photo background. Right now `assets/hero/slide-photo.jpg`, `slide-video.jpg`, and `slide-music.jpg` are studio-branded duotone placeholders (no stock photos used). To use your own photos:

1. Drop your images into `assets/hero/`, keeping (or renaming to) the same three filenames — or add more.
2. If you add/rename files, update the three `background-image:url('assets/hero/...')` lines in the `.hero-slides` block near the top of `index.html`.
3. For best results use wide (16:9) images at least 1600px wide — one representing each division works well, but any strong photos will do.

### Adding real photos/videos to the portfolio grid
The portfolio tiles currently use styled icon placeholders (no stock photos were used). To swap one in, replace a tile's `<div class="p-bg">...</div>` with an image, e.g.:

```html
<div class="p-tile p-photo" data-cat="photo">
  <div class="p-bg"><img src="assets/portfolio/wedding-01.jpg" style="width:100%;height:100%;object-fit:cover;"></div>
  <div class="p-caption"><div class="tag">Photo</div><h4>Wedding Day, Kigali</h4></div>
</div>
```
Just drop your images into a new `assets/portfolio/` folder.

---

## 3. Connecting the Supabase backend (free tier)

The booking form saves straight to a database and confirms in-page — no WhatsApp redirect for the customer. **You** get pinged on your own WhatsApp automatically for every new booking, using a Supabase Edge Function + a free WhatsApp notifier called CallMeBot.

If Supabase isn't connected yet, the form falls back to the old "open WhatsApp" flow so you never lose a lead in the meantime.

### Step-by-step

1. Go to [supabase.com](https://supabase.com) and create a free account + new project.
2. Open **SQL Editor → New query**, paste the contents of `sql/schema.sql`, and click **Run**. This creates the `orders` table (booking form) and the `messages` table (the "Send a quick message" mini-form) with safe permissions (the public can submit but cannot read anyone else's data).
3. Go to **Project Settings → API**. Copy:
   - **Project URL** (looks like `https://xxxxxxxx.supabase.co`)
   - **anon public** key (a long string starting with `eyJ...`)
4. Paste both into `js/config.js`:

   ```js
   window.SUPABASE_URL = "https://xxxxxxxx.supabase.co";
   window.SUPABASE_ANON_KEY = "eyJhbGciOi....";
   ```

5. Save and re-upload the site. Bookings and quick messages now save straight to your Supabase tables.

### Getting notified on your own WhatsApp for every booking AND quick message

This uses [CallMeBot](https://www.callmebot.com/blog/free-api-whatsapp-messages/) — a free, unofficial service made for exactly this (pinging yourself), so no Meta Business account or approval process is needed. One Edge Function handles both the booking form (`orders` table) and the quick contact form (`messages` table) — it just formats the WhatsApp text differently depending on which table triggered it.

1. **Authorize CallMeBot on your WhatsApp** (one time, from your phone):
   - Save `+34 644 59 71 67` as a contact (any name, e.g. "CallMeBot").
   - Send that contact this exact WhatsApp message: `I allow callmebot to send me messages`
   - Within a minute or two you'll get a reply back with your personal **API key** (a number).
2. **Install the Supabase CLI** if you haven't already, then from this project folder:
   ```bash
   supabase login
   supabase link --project-ref xxxxxxxx   # your project ref, from the Supabase dashboard URL
   supabase functions deploy notify-order
   ```
3. **Set your secrets** (your own WhatsApp number, and the API key CallMeBot sent you):
   ```bash
   supabase secrets set CALLMEBOT_PHONE=250780000000
   supabase secrets set CALLMEBOT_APIKEY=123456
   ```
4. **Wire up two triggers**: in the Supabase dashboard, go to **Database → Webhooks → Create a new webhook**, and create it twice — once per table:
   - **Webhook 1**
     - Table: `orders`
     - Events: `Insert`
     - Type: `Supabase Edge Functions`
     - Edge Function: `notify-order`
   - **Webhook 2**
     - Table: `messages`
     - Events: `Insert`
     - Type: `Supabase Edge Functions`
     - Edge Function: `notify-order`
5. Submit a test booking, then a test quick message, on the live site — you should get a WhatsApp message for each within a few seconds.

CallMeBot is free and great for a solo studio owner, but it's an unofficial community service (occasional delays, and it's rate-limited to a handful of messages a day per number). If you outgrow it later, swap the `fetch` call inside `supabase/functions/notify-order/index.ts` for the official [Meta WhatsApp Cloud API](https://developers.facebook.com/docs/whatsapp/cloud-api) — the webhook wiring stays exactly the same, only that one function changes.

### Viewing your bookings & messages
In Supabase, go to **Table Editor → orders** to see every booking as it comes in, with the division, service type, contact details, and a `status` column you can update manually (`new`, `contacted`, `confirmed`, `completed`, `cancelled`). Go to **Table Editor → messages** to see quick contact-form messages the same way.

If Supabase isn't configured yet, the quick-message form falls back to opening the visitor's email app instead — so it always works, with or without a backend.

### Optional next steps (not included, but easy to add later)
- A simple password-protected admin page to view/update bookings without opening Supabase directly.
- Row-level security already blocks the public from reading other people's bookings — keep the `anon` key limited to insert-only as configured in `sql/schema.sql`.

---

## 4. What's inside the design

- **Palette**: near-black background with the logo's signature orange (`#F5740A`), sampled directly from your uploaded logo.
- **Type**: Fraunces (display serif, echoes the logo's flared serif lettering) + Manrope (body) + Space Mono (labels/eyebrows).
- **Signature motif**: the ribbon shape from your "S" logo reappears as a hand-drawn divider line between sections, animating in as you scroll.
- Fully responsive down to mobile, with a slide-in mobile menu, animated stat counters, a filterable portfolio grid (All / Photo / Video / Music), a rotating testimonial carousel, and a floating WhatsApp button.

## 5. Previewing locally
Because the page loads separate CSS/JS files, some browsers block that when you just double-click `index.html` (a `file://` restriction). If styles or scripts don't seem to load, run a tiny local server from inside the folder instead:

```bash
# Python 3
python3 -m http.server 8000
# then open http://localhost:8000 in your browser
```

Once uploaded to any real web host, this isn't an issue.
