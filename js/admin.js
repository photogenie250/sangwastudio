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

  const showForgotLink = document.getElementById("showForgotLink");
  const forgotForm = document.getElementById("forgotForm");
  const forgotEmail = document.getElementById("forgotEmail");
  const forgotBtn = document.getElementById("forgotBtn");
  const forgotMsg = document.getElementById("forgotMsg");

  const resetPanel = document.getElementById("resetPanel");
  const resetPasswordForm = document.getElementById("resetPasswordForm");
  const newPassword = document.getElementById("newPassword");
  const confirmPassword = document.getElementById("confirmPassword");
  const resetPasswordBtn = document.getElementById("resetPasswordBtn");
  const resetPasswordMsg = document.getElementById("resetPasswordMsg");

  const articleForm = document.getElementById("articleForm");
  const articleIdEl = document.getElementById("articleId");
  const fHeadline = document.getElementById("fHeadline");
  const fSlug = document.getElementById("fSlug");
  const fCategory = document.getElementById("fCategory");
  const fDek = document.getElementById("fDek");
  const fAuthor = document.getElementById("fAuthor");
  const fPhoto = document.getElementById("fPhoto");
  const fPhotoCaption = document.getElementById("fPhotoCaption");
  const fGallery = document.getElementById("fGallery");
  const galleryPreviewWrap = document.getElementById("galleryPreviewWrap");
  const galleryPlaceholder = document.getElementById("galleryPlaceholder");
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
  let currentGalleryUrls = []; // up to 4 extra photo URLs, shown at the end of the report
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
    currentGalleryUrls = [];
    slugManuallyEdited = false;
    editingPublishedAt = null;
    fAuthor.value = "GAKORO MEDIA TV";
    photoPreviewImg.style.display = "none";
    photoPlaceholder.style.display = "block";
    renderGalleryPreview();
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

  // ---------- Gallery photos (up to 4, shown at the end of the report) ----------
  function renderGalleryPreview() {
    galleryPlaceholder.style.display = currentGalleryUrls.length ? "none" : "block";
    galleryPreviewWrap.querySelectorAll(".gallery-thumb").forEach((el) => el.remove());
    currentGalleryUrls.forEach((url, i) => {
      const thumb = document.createElement("div");
      thumb.className = "gallery-thumb";
      thumb.innerHTML = `<img src="${url}" alt=""><button type="button" title="Remove">&times;</button>`;
      thumb.querySelector("button").addEventListener("click", () => {
        currentGalleryUrls.splice(i, 1);
        renderGalleryPreview();
      });
      galleryPreviewWrap.appendChild(thumb);
    });
    fGallery.disabled = currentGalleryUrls.length >= 4;
  }

  fGallery.addEventListener("change", async () => {
    const files = Array.from(fGallery.files || []);
    fGallery.value = ""; // allow re-selecting the same file later
    if (!files.length) return;

    const room = 4 - currentGalleryUrls.length;
    if (room <= 0) {
      showMsg(composerMsg, "You can add up to 4 extra photos.", false);
      return;
    }
    const toUpload = files.slice(0, room);
    if (files.length > room) {
      showMsg(composerMsg, `Only added ${room} — the limit is 4 extra photos per article.`, false);
    }

    for (const file of toUpload) {
      const placeholderThumb = document.createElement("div");
      placeholderThumb.className = "gallery-thumb uploading";
      galleryPreviewWrap.appendChild(placeholderThumb);
      try {
        const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
        const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: upErr } = await client.storage.from("news-photos").upload(path, file, {
          cacheControl: "3600",
          upsert: false,
        });
        if (upErr) throw upErr;
        const { data } = client.storage.from("news-photos").getPublicUrl(path);
        currentGalleryUrls.push(data.publicUrl);
      } catch (err) {
        console.error(err);
        showMsg(composerMsg, "A gallery photo failed to upload: " + (err.message || err), false);
      } finally {
        placeholderThumb.remove();
        renderGalleryPreview();
      }
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
      gallery_urls: currentGalleryUrls,
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

  function formatViewCount(n) {
    n = Number(n) || 0;
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(n % 1_000_000 >= 100_000 ? 1 : 0) + "M";
    if (n >= 1_000) return (n / 1_000).toFixed(n % 1_000 >= 100 ? 1 : 0) + "K";
    return String(n);
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
    currentGalleryUrls = Array.isArray(a.gallery_urls) ? a.gallery_urls.slice(0, 4) : [];
    renderGalleryPreview();
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
            &bull; ${formatViewCount(a.views_count)} view${Number(a.views_count) === 1 ? "" : "s"}
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
    resetPanel.style.display = "none";
    appPanel.style.display = "block";
    logoutBtn.style.display = "inline-flex";
    resetComposer();
    loadArticles();
  }

  function showLogin() {
    loginPanel.style.display = "block";
    resetPanel.style.display = "none";
    appPanel.style.display = "none";
    logoutBtn.style.display = "none";
  }

  function showResetPanel() {
    loginPanel.style.display = "none";
    resetPanel.style.display = "block";
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

  // ---------- Forgot password ----------
  showForgotLink.addEventListener("click", (e) => {
    e.preventDefault();
    forgotForm.style.display = forgotForm.style.display === "none" ? "block" : "none";
  });

  forgotForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    forgotBtn.disabled = true;
    forgotMsg.className = "form-msg";
    const email = forgotEmail.value.trim();
    try {
      // Sends a reset email whose link brings the user back to this
      // exact admin page. Supabase appends its own auth tokens to the
      // URL, and detectSessionInUrl (on by default) picks them up,
      // firing a PASSWORD_RECOVERY event we listen for below — that's
      // what swaps the view to the "set a new password" panel instead
      // of erroring out on a stale/localhost redirect.
      const { error } = await client.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + "/admin/",
      });
      if (error) throw error;
      showMsg(forgotMsg, "Reset link sent — check that inbox.", true);
    } catch (err) {
      showMsg(forgotMsg, err.message || "Couldn't send reset email.", false);
    } finally {
      forgotBtn.disabled = false;
    }
  });

  // ---------- Set new password (after following reset link) ----------
  // Supabase reset-password links land back here with "type=recovery"
  // in the URL hash. Check for it directly so init() below doesn't
  // race the PASSWORD_RECOVERY event and jump straight to the
  // dashboard just because a (recovery) session now exists.
  const isPasswordRecovery = window.location.hash.includes("type=recovery");

  client.auth.onAuthStateChange((event) => {
    if (event === "PASSWORD_RECOVERY") {
      showResetPanel();
    }
  });

  resetPasswordForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    resetPasswordMsg.className = "form-msg";

    if (newPassword.value.length < 6) {
      showMsg(resetPasswordMsg, "Password must be at least 6 characters.", false);
      return;
    }
    if (newPassword.value !== confirmPassword.value) {
      showMsg(resetPasswordMsg, "Passwords don't match.", false);
      return;
    }

    resetPasswordBtn.disabled = true;
    try {
      const { error } = await client.auth.updateUser({ password: newPassword.value });
      if (error) throw error;
      showMsg(resetPasswordMsg, "Password updated. You're logged in.", true);
      setTimeout(showApp, 800);
    } catch (err) {
      showMsg(resetPasswordMsg, err.message || "Couldn't update password.", false);
    } finally {
      resetPasswordBtn.disabled = false;
    }
  });

  logoutBtn.addEventListener("click", async () => {
    await client.auth.signOut();
    showLogin();
  });

  async function init() {
    if (isPasswordRecovery) {
      showResetPanel();
      return;
    }
    const { data } = await client.auth.getSession();
    if (data.session) {
      showApp();
    } else {
      showLogin();
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
