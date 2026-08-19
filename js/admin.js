/* =====================================================
   GAKORO MEDIA TV — News Desk Admin logic.

   Handles login, writing/editing articles, uploading photos
   to the `news-photos` storage bucket, and publishing.
   Row Level Security on `news_articles` only allows writes
   from a logged-in (authenticated) user, so this page is
   safe to leave un-linked from the public site.
===================================================== */
(function () {
  if (!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY || !window.supabase) {
    alert("News desk isn't configured yet (missing Supabase settings in js/config.js).");
    return;
  }
  const client = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

  // ---------- Elements ----------
  const loginPanel = document.getElementById("loginPanel");
  const appPanel = document.getElementById("appPanel");
  const logoutBtn = document.getElementById("logoutBtn");

  const loginForm = document.getElementById("loginForm");
  const loginBtn = document.getElementById("loginBtn");
  const loginMsg = document.getElementById("loginMsg");

  const articleForm = document.getElementById("articleForm");
  const articleIdEl = document.getElementById("articleId");
  const fHeadline = document.getElementById("fHeadline");
  const fSlug = document.getElementById("fSlug");
  const fCategory = document.getElementById("fCategory");
  const fDek = document.getElementById("fDek");
  const fAuthor = document.getElementById("fAuthor");
  const fPhoto = document.getElementById("fPhoto");
  const fPhotoCaption = document.getElementById("fPhotoCaption");
  const fBody = document.getElementById("fBody");
  const fBreaking = document.getElementById("fBreaking");
  const photoPreviewImg = document.getElementById("photoPreviewImg");
  const photoPlaceholder = document.getElementById("photoPlaceholder");

  const composerTitle = document.getElementById("composerTitle");
  const composerSub = document.getElementById("composerSub");
  const composerMsg = document.getElementById("composerMsg");
  const saveDraftBtn = document.getElementById("saveDraftBtn");
  const publishBtn = document.getElementById("publishBtn");
  const cancelEditBtn = document.getElementById("cancelEditBtn");

  const articleList = document.getElementById("articleList");
  const emptyList = document.getElementById("emptyList");

  let currentPhotoUrl = "";
  let slugManuallyEdited = false;
  let editingPublishedAt = null; // preserves original publish date when re-publishing an edit

  // ---------- Helpers ----------
  function showMsg(el, msg, ok) {
    el.textContent = msg;
    el.className = "form-msg show " + (ok ? "ok" : "err");
  }

  function slugify(text) {
    return text
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80);
  }

  function resetComposer() {
    articleForm.reset();
    articleIdEl.value = "";
    currentPhotoUrl = "";
    slugManuallyEdited = false;
    editingPublishedAt = null;
    fAuthor.value = "GAKORO MEDIA TV";
    photoPreviewImg.style.display = "none";
    photoPlaceholder.style.display = "block";
    composerTitle.textContent = "Write a new article";
    composerSub.textContent = "Fill this in and publish when it's ready. Every article needs a photo and a report.";
    cancelEditBtn.style.display = "none";
    composerMsg.className = "form-msg";
  }

  fHeadline.addEventListener("input", () => {
    if (!slugManuallyEdited) fSlug.value = slugify(fHeadline.value);
  });
  fSlug.addEventListener("input", () => { slugManuallyEdited = true; });

  // ---------- Photo upload ----------
  fPhoto.addEventListener("change", async () => {
    const file = fPhoto.files[0];
    if (!file) return;
    showMsg(composerMsg, "Uploading photo\u2026", true);
    try {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await client.storage.from("news-photos").upload(path, file, {
        cacheControl: "3600",
        upsert: false,
      });
      if (upErr) throw upErr;
      const { data } = client.storage.from("news-photos").getPublicUrl(path);
      currentPhotoUrl = data.publicUrl;
      photoPreviewImg.src = currentPhotoUrl;
      photoPreviewImg.style.display = "block";
      photoPlaceholder.style.display = "none";
      composerMsg.className = "form-msg";
    } catch (err) {
      console.error(err);
      showMsg(composerMsg, "Photo upload failed: " + (err.message || err), false);
    }
  });

  // ---------- Save / publish ----------
  async function saveArticle(targetStatus) {
    const headline = fHeadline.value.trim();
    const body = fBody.value.trim();
    let slug = slugify(fSlug.value || fHeadline.value);

    if (!headline) { showMsg(composerMsg, "Add a headline first.", false); return; }
    if (!body) { showMsg(composerMsg, "The report can't be empty.", false); return; }
    if (!currentPhotoUrl) { showMsg(composerMsg, "Upload a photo before saving.", false); return; }
    if (!slug) { showMsg(composerMsg, "Add a URL slug.", false); return; }

    saveDraftBtn.disabled = true;
    publishBtn.disabled = true;
    showMsg(composerMsg, "Saving\u2026", true);

    const id = articleIdEl.value || null;
    const payload = {
      headline,
      slug,
      dek: fDek.value.trim() || null,
      category: fCategory.value,
      author: fAuthor.value.trim() || "GAKORO MEDIA TV",
      photo_url: currentPhotoUrl,
      photo_caption: fPhotoCaption.value.trim() || null,
      body,
      breaking: fBreaking.checked,
      status: targetStatus,
      published_at: targetStatus === "published" ? (editingPublishedAt || new Date().toISOString()) : editingPublishedAt,
    };

    let attempt = 0;
    let lastError = null;

    while (attempt < 5) {
      try {
        payload.slug = attempt === 0 ? slug : `${slug}-${attempt + 1}`;
        let result;
        if (id) {
          result = await client.from("news_articles").update(payload).eq("id", id).select().single();
        } else {
          result = await client.from("news_articles").insert(payload).select().single();
        }
        if (result.error) throw result.error;

        articleIdEl.value = result.data.id;
        fSlug.value = result.data.slug;
        editingPublishedAt = result.data.published_at;
        showMsg(
          composerMsg,
          targetStatus === "published" ? "Published! Live on the site now." : "Draft saved.",
          true
        );
        await loadArticles();
        saveDraftBtn.disabled = false;
        publishBtn.disabled = false;
        return;
      } catch (err) {
        lastError = err;
        // 23505 = unique_violation on the slug column — try a numbered suffix.
        if (err.code === "23505" || (err.message && err.message.includes("duplicate"))) {
          attempt++;
          continue;
        }
        break;
      }
    }

    console.error(lastError);
    showMsg(composerMsg, "Couldn't save: " + (lastError?.message || lastError), false);
    saveDraftBtn.disabled = false;
    publishBtn.disabled = false;
  }

  saveDraftBtn.addEventListener("click", () => saveArticle("draft"));
  publishBtn.addEventListener("click", () => saveArticle("published"));
  cancelEditBtn.addEventListener("click", resetComposer);
  articleForm.addEventListener("submit", (e) => e.preventDefault());

  // ---------- Article list ----------
  function formatDate(iso) {
    if (!iso) return "";
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  function editArticle(a) {
    articleIdEl.value = a.id;
    fHeadline.value = a.headline;
    fSlug.value = a.slug;
    slugManuallyEdited = true;
    fCategory.value = a.category || "Latest";
    fDek.value = a.dek || "";
    fAuthor.value = a.author || "GAKORO MEDIA TV";
    fPhotoCaption.value = a.photo_caption || "";
    fBody.value = a.body;
    fBreaking.checked = !!a.breaking;
    currentPhotoUrl = a.photo_url;
    editingPublishedAt = a.published_at;
    photoPreviewImg.src = a.photo_url;
    photoPreviewImg.style.display = "block";
    photoPlaceholder.style.display = "none";
    composerTitle.textContent = "Editing article";
    composerSub.textContent = `Editing "${a.headline}". Save as a draft or publish your changes.`;
    cancelEditBtn.style.display = "inline-flex";
    composerMsg.className = "form-msg";
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function toggleStatus(a) {
    const newStatus = a.status === "published" ? "draft" : "published";
    const payload = {
      status: newStatus,
      published_at: newStatus === "published" ? (a.published_at || new Date().toISOString()) : a.published_at,
    };
    const { error } = await client.from("news_articles").update(payload).eq("id", a.id);
    if (error) { alert("Couldn't update status: " + error.message); return; }
    await loadArticles();
  }

  async function deleteArticle(a) {
    if (!confirm(`Delete "${a.headline}"? This can't be undone.`)) return;
    const { error } = await client.from("news_articles").delete().eq("id", a.id);
    if (error) { alert("Couldn't delete: " + error.message); return; }
    if (articleIdEl.value === a.id) resetComposer();
    await loadArticles();
  }

  async function loadArticles() {
    const { data, error } = await client
      .from("news_articles")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      articleList.innerHTML = "";
      emptyList.style.display = "block";
      emptyList.textContent = "Couldn't load articles: " + error.message;
      return;
    }

    if (!data || data.length === 0) {
      articleList.innerHTML = "";
      emptyList.style.display = "block";
      emptyList.textContent = "No articles yet — write your first one above.";
      return;
    }

    emptyList.style.display = "none";
    articleList.innerHTML = "";
    data.forEach((a) => {
      const row = document.createElement("div");
      row.className = "art-row";
      row.innerHTML = `
        <img class="art-row-thumb" src="${a.photo_url}" alt="">
        <div>
          <div class="art-row-title">${a.headline}</div>
          <div class="art-row-meta">
            <span class="status-pill ${a.status}">${a.status}</span>
            ${a.breaking ? '<span class="status-pill breaking">Breaking</span>' : ""}
            ${a.category || "Latest"} &bull; ${formatDate(a.published_at || a.created_at)}
          </div>
        </div>
        <div class="art-row-actions">
          <button data-action="edit">Edit</button>
          <button data-action="toggle">${a.status === "published" ? "Unpublish" : "Publish"}</button>
          <button data-action="delete" class="danger">Delete</button>
        </div>
      `;
      row.querySelector('[data-action="edit"]').addEventListener("click", () => editArticle(a));
      row.querySelector('[data-action="toggle"]').addEventListener("click", () => toggleStatus(a));
      row.querySelector('[data-action="delete"]').addEventListener("click", () => deleteArticle(a));
      articleList.appendChild(row);
    });
  }

  // ---------- Auth ----------
  function showApp() {
    loginPanel.style.display = "none";
    appPanel.style.display = "block";
    logoutBtn.style.display = "inline-flex";
    resetComposer();
    loadArticles();
  }

  function showLogin() {
    loginPanel.style.display = "block";
    appPanel.style.display = "none";
    logoutBtn.style.display = "none";
  }

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    loginBtn.disabled = true;
    loginMsg.className = "form-msg";
    const email = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value;
    const { error } = await client.auth.signInWithPassword({ email, password });
    loginBtn.disabled = false;
    if (error) {
      showMsg(loginMsg, error.message, false);
      return;
    }
    showApp();
  });

  logoutBtn.addEventListener("click", async () => {
    await client.auth.signOut();
    showLogin();
  });

  async function init() {
    const { data } = await client.auth.getSession();
    if (data.session) {
      showApp();
    } else {
      showLogin();
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
