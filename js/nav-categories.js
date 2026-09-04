/* =====================================================
   GAKORO MEDIA TV — nav/footer categories sync.

   The nav bar and footer already ship with links matching
   the categories seeded in sql/add_admin_desk_features.sql
   (News, Education, Sports, Community, Interviews, Business,
   Opinion), so the site works correctly even before this
   script runs or if Supabase is unreachable.

   This script then checks the live `categories` table (the
   same one the admin's Categories tab reads and writes) and,
   if an admin has added, renamed, or removed a category since
   those defaults were written, rebuilds #navRow and
   #footerCategories to match — so the public nav always
   reflects whatever exists in the admin dashboard.

   Runs on any page that includes it and has a #navRow and/or
   #footerCategories element. `document.body`'s
   `data-site-root` attribute ("" on the homepage, "../" one
   level down) is used to build correct relative links.
===================================================== */
(function () {
  const SUPABASE_URL = window.SUPABASE_URL;
  const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !window.supabase) return;

  const root = document.body.getAttribute("data-site-root") || "";
  const navRow = document.getElementById("navRow");
  const footerCategories = document.getElementById("footerCategories");
  if (!navRow && !footerCategories) return;

  const params = new URLSearchParams(window.location.search);
  const activeCat = (params.get("cat") || "").trim().toLowerCase();
  const onCategoryPage = !!document.getElementById("catGrid");

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function catUrl(name) {
    return `${root}category/index.html?cat=${encodeURIComponent(name)}`;
  }

  function newsUrl() {
    return `${root}index.html#latest-articles`;
  }

  function buildNav(names) {
    if (!navRow) return;
    let html = `<a href="${root}index.html">Home</a>`;
    html += `<a href="${newsUrl()}"${onCategoryPage && !activeCat ? ' class="active"' : ""}>News <svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 10l5 5 5-5z"/></svg></a>`;
    names.forEach((n) => {
      const active = onCategoryPage && activeCat === n.toLowerCase();
      html += `<a href="${catUrl(n)}"${active ? ' class="active"' : ""}>${escapeHtml(n)}</a>`;
    });
    navRow.innerHTML = html;
  }

  function buildFooter(names) {
    if (!footerCategories) return;
    let html = `<div class="footer-col-title">Categories</div>`;
    html += `<a href="${newsUrl()}"${onCategoryPage && !activeCat ? ' class="active"' : ""}>News</a>`;
    names.forEach((n) => {
      const active = onCategoryPage && activeCat === n.toLowerCase();
      html += `<a href="${catUrl(n)}"${active ? ' class="active"' : ""}>${escapeHtml(n)}</a>`;
    });
    footerCategories.innerHTML = html;
  }

  async function init() {
    try {
      const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      const { data, error } = await client.from("categories").select("name").order("name", { ascending: true });
      if (error) throw error;
      if (!data || !data.length) return; // keep the shipped defaults

      // "News" is always pinned first and points at the homepage feed
      // rather than a filtered category page, so exclude it here.
      const names = data.map((c) => c.name).filter((n) => n && n.toLowerCase() !== "news");

      buildNav(names);
      buildFooter(names);
    } catch (err) {
      // categories table not deployed yet, or offline — keep the
      // hardcoded defaults already in the page.
      console.warn("Gakoro Media TV: using default category links.", err.message || err);
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
