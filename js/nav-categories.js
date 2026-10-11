/* Syncs the nav and footer category links with the categories table.
   The pages ship with default links so they work if Supabase is down; this
   rebuilds #navRow and #footerCategories when categories change in admin.
   body[data-site-root] ("" or "../") is used for the relative links. */
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
    return `${root}category/?cat=${encodeURIComponent(name)}`;
  }

  function newsUrl() {
    return `${root}#latest-articles`;
  }

  function buildNav(names) {
    if (!navRow) return;
    let html = `<a href="${root}">Home</a>`;
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

      // News always comes first and points at the homepage feed, so skip it here
      const names = data.map((c) => c.name).filter((n) => n && n.toLowerCase() !== "news");

      buildNav(names);
      buildFooter(names);
    } catch (err) {
      // categories table missing or offline: keep the default links in the page
      console.warn("Gakoro Media TV: using default category links.", err.message || err);
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
