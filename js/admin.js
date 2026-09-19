/* =====================================================
   GAKORO MEDIA TV — News Desk Admin logic.

   Handles login, writing/editing articles, uploading photos
   to the `news-photos` storage bucket, publishing/scheduling,
   plus the desk's supporting tabs: dashboard stats, categories,
   tags, media library, comment moderation, user roles and
   account settings.

   Row Level Security only allows writes from a logged-in
   (authenticated) user, so this page is safe to leave
   un-linked from the public site. See sql/add_admin_desk_features.sql
   for the tables/policies this file depends on.
===================================================== */
(function () {
  if (!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY || !window.supabase) {
    alert("News desk isn't configured yet (missing Supabase settings in js/config.js).");
    return;
  }
  if (!window.sbClient) {
    alert("News desk isn't configured yet (Supabase client failed to initialize — check js/config.js).");
    return;
  }
  // Reuse the single shared client from config.js. Creating a second
  // client here with the same URL/key used to cause two GoTrue auth
  // clients to fight over the same localStorage session key — their
  // background token-refresh timers would race and randomly wipe out
  // a valid session, silently bouncing logged-in users back to the
  // login screen. See config.js for the shared client.
  const client = window.sbClient;
  const qs = (id) => document.getElementById(id);

  const FALLBACK_CATEGORIES = ["News", "Education", "Sports", "Community", "Interviews", "Business", "Opinion"];

  // ---------- Chrome / auth elements ----------
  const loginWrap = qs("loginWrap");
  const resetWrap = qs("resetWrap");
  const appPanel = qs("appPanel");
  const logoutBtn = qs("logoutBtn");
  const notifBell = qs("notifBell");
  const notifBadge = qs("notifBadge");
  const commentsNavBadge = qs("commentsNavBadge");
  const usersNavBtn = qs("usersNavBtn");
  const sideAccountName = qs("sideAccountName");

  const loginForm = qs("loginForm");
  const loginBtn = qs("loginBtn");
  const loginMsg = qs("loginMsg");

  const showForgotLink = qs("showForgotLink");
  const forgotForm = qs("forgotForm");
  const forgotEmail = qs("forgotEmail");
  const forgotBtn = qs("forgotBtn");
  const forgotMsg = qs("forgotMsg");

  const resetPanel = qs("resetPanel");
  const resetPasswordForm = qs("resetPasswordForm");
  const newPassword = qs("newPassword");
  const confirmPassword = qs("confirmPassword");
  const resetPasswordBtn = qs("resetPasswordBtn");
  const resetPasswordMsg = qs("resetPasswordMsg");

  // ---------- Composer elements ----------
  const articleForm = qs("articleForm");
  const articleIdEl = qs("articleId");
  const fHeadline = qs("fHeadline");
  const fSlug = qs("fSlug");
  const fCategory = qs("fCategory");
  const fTags = qs("fTags");
  const fDek = qs("fDek");
  const fAuthor = qs("fAuthor");
  const fPhoto = qs("fPhoto");
  const fPhotoCaption = qs("fPhotoCaption");
  const fGallery = qs("fGallery");
  const galleryPreviewWrap = qs("galleryPreviewWrap");
  const galleryPlaceholder = qs("galleryPlaceholder");
  const fBody = qs("fBody");
  const wordCount = qs("wordCount");
  const fBreaking = qs("fBreaking");
  const fPublishAt = qs("fPublishAt");
  const fVisibility = qs("fVisibility");
  const railStatusPill = qs("railStatusPill");
  const photoPreviewImg = qs("photoPreviewImg");
  const photoPlaceholder = qs("photoPlaceholder");

  const composerTitle = qs("composerTitle");
  const composerSub = qs("composerSub");
  const composerMsg = qs("composerMsg");
  const saveDraftBtn = qs("saveDraftBtn");
  const publishBtn = qs("publishBtn");
  const cancelEditBtn = qs("cancelEditBtn");

  // ---------- All articles elements ----------
  const articleList = qs("articleList");
  const emptyList = qs("emptyList");
  const articleSearch = qs("articleSearch");
  const statusFilter = qs("statusFilter");
  const categoryFilter = qs("categoryFilter");

  // ---------- Categories / tags ----------
  const categoryChips = qs("categoryChips");
  const categoryAddForm = qs("categoryAddForm");
  const newCategoryName = qs("newCategoryName");
  const categoryMsg = qs("categoryMsg");
  const tagChips = qs("tagChips");
  const tagsEmpty = qs("tagsEmpty");

  // ---------- Media library ----------
  const mediaGrid = qs("mediaGrid");
  const mediaEmpty = qs("mediaEmpty");

  // ---------- Comments ----------
  const commentList = qs("commentList");
  const commentsEmpty = qs("commentsEmpty");
  const commentStatusFilter = qs("commentStatusFilter");

  // ---------- Users ----------
  const userList = qs("userList");
  const usersEmpty = qs("usersEmpty");

  // ---------- Settings ----------
  const accountForm = qs("accountForm");
  const fDisplayName = qs("fDisplayName");
  const fAccountEmail = qs("fAccountEmail");
  const accountMsg = qs("accountMsg");
  const saveAccountBtn = qs("saveAccountBtn");
  const changePasswordForm = qs("changePasswordForm");
  const fNewPassword = qs("fNewPassword");
  const fConfirmPassword = qs("fConfirmPassword");
  const changePasswordMsg = qs("changePasswordMsg");
  const changePasswordBtn = qs("changePasswordBtn");

  // ---------- State ----------
  let currentPhotoUrl = "";
  let currentGalleryUrls = [];
  let slugManuallyEdited = false;
  let editingPublishedAt = null;
  let isAdmin = false;
  let currentUserId = null;
  let currentUserEmail = "";
  let articlesCache = [];
  let categoriesCache = [];
  let mediaLoaded = false;

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

  function escapeHtml(s) {
    return String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function formatDate(iso) {
    if (!iso) return "";
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  function formatDateTime(iso) {
    if (!iso) return "";
    return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
  }

  function formatViewCount(n) {
    n = Number(n) || 0;
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(n % 1_000_000 >= 100_000 ? 1 : 0) + "M";
    if (n >= 1_000) return (n / 1_000).toFixed(n % 1_000 >= 100 ? 1 : 0) + "K";
    return String(n);
  }

  // datetime-local <-> ISO helpers (datetime-local values are local time, no timezone)
  function toLocalInputValue(isoOrDate) {
    const d = isoOrDate ? new Date(isoOrDate) : new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  function fromLocalInputValue(val) {
    if (!val) return null;
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }

  function articleStatusLabel(a) {
    if (a.status !== "published") return "draft";
    if (a.published_at && new Date(a.published_at).getTime() > Date.now()) return "scheduled";
    return "published";
  }

  // ---------- Tab navigation ----------
  const navButtons = Array.from(document.querySelectorAll(".nav-item"));
  const tabPanels = Array.from(document.querySelectorAll(".tab-panel"));
  function showTab(name) {
    navButtons.forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
    tabPanels.forEach((p) => p.classList.toggle("active", p.id === "tab-" + name));
    if (name === "media" && !mediaLoaded) loadMedia();
    if (name === "comments") loadComments();
    if (name === "users" && isAdmin) loadUsers();
    if (name === "dashboard") renderDashboard();
    if (name === "tags") renderTagChips();
    if (name === "categories") renderCategoryChips();
    if (name === "settings") loadAccount();
  }
  navButtons.forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab)));
  notifBell.addEventListener("click", () => showTab("comments"));

  // ---------- Composer: reset / slug ----------
  function resetComposer() {
    articleForm.reset();
    articleIdEl.value = "";
    currentPhotoUrl = "";
    currentGalleryUrls = [];
    slugManuallyEdited = false;
    editingPublishedAt = null;
    fAuthor.value = "GAKORO MEDIA TV";
    fTags.value = "";
    fVisibility.value = "public";
    fPublishAt.value = toLocalInputValue(new Date());
    photoPreviewImg.style.display = "none";
    photoPlaceholder.style.display = "block";
    renderGalleryPreview();
    composerTitle.textContent = "Write a new article";
    composerSub.textContent = "Fill this in and publish when it's ready. Every article needs a photo and a report.";
    cancelEditBtn.style.display = "none";
    composerMsg.className = "form-msg";
    updateRailStatus("draft");
    updateWordCount();
  }

  function updateRailStatus(label) {
    railStatusPill.textContent = label.charAt(0).toUpperCase() + label.slice(1);
    railStatusPill.className = "status-pill " + label;
  }

  function updateWordCount() {
    const words = fBody.value.trim().split(/\s+/).filter(Boolean).length;
    wordCount.textContent = `${words} word${words === 1 ? "" : "s"}`;
  }
  fBody.addEventListener("input", updateWordCount);

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
      mediaLoaded = false; // so the Media Library tab picks up the new upload next visit
    } catch (err) {
      console.error(err);
      showMsg(composerMsg, "Photo upload failed: " + (err.message || err), false);
    }
  });

  // ---------- Gallery photos (up to 4) ----------
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
    fGallery.value = "";
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
        mediaLoaded = false;
      } catch (err) {
        console.error(err);
        showMsg(composerMsg, "A gallery photo failed to upload: " + (err.message || err), false);
      } finally {
        placeholderThumb.remove();
        renderGalleryPreview();
      }
    }
  });

  // ---------- Categories ----------
  async function loadCategories() {
    try {
      const { data, error } = await client.from("categories").select("*").order("name", { ascending: true });
      if (error) throw error;
      categoriesCache = data || [];
    } catch (err) {
      console.warn("Categories table not available yet, using defaults.", err.message || err);
      categoriesCache = FALLBACK_CATEGORIES.map((name) => ({ id: null, name, slug: slugify(name) }));
    }
    populateCategorySelects();
  }

  function populateCategorySelects() {
    const names = categoriesCache.length ? categoriesCache.map((c) => c.name) : FALLBACK_CATEGORIES;
    const prevComposerVal = fCategory.value;
    const prevFilterVal = categoryFilter.value;
    fCategory.innerHTML = names.map((n) => `<option>${escapeHtml(n)}</option>`).join("");
    categoryFilter.innerHTML = `<option value="">All categories</option>` + names.map((n) => `<option>${escapeHtml(n)}</option>`).join("");
    if (names.includes(prevComposerVal)) fCategory.value = prevComposerVal;
    if (names.includes(prevFilterVal)) categoryFilter.value = prevFilterVal;
  }

  function renderCategoryChips() {
    if (!categoriesCache.length) {
      categoryChips.innerHTML = `<div class="empty-note">No categories yet — add your first one below.</div>`;
      return;
    }
    categoryChips.innerHTML = categoriesCache
      .map((c) => {
        const count = articlesCache.filter((a) => (a.category || "News") === c.name).length;
        return `<div class="chip" data-id="${c.id || ""}" data-name="${escapeHtml(c.name)}">
          <span>${escapeHtml(c.name)}</span>
          <span class="chip-count">${count}</span>
          ${c.id ? '<button type="button" title="Delete">&times;</button>' : ""}
        </div>`;
      })
      .join("");
    categoryChips.querySelectorAll(".chip button").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        const chip = e.target.closest(".chip");
        const id = chip.dataset.id;
        const name = chip.dataset.name;
        if (!confirm(`Delete the "${name}" category? Articles already using it are unaffected.`)) return;
        const { error } = await client.from("categories").delete().eq("id", id);
        if (error) { alert("Couldn't delete: " + error.message); return; }
        await loadCategories();
        renderCategoryChips();
      });
    });
  }

  categoryAddForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = newCategoryName.value.trim();
    if (!name) return;
    try {
      const { error } = await client.from("categories").insert({ name, slug: slugify(name) });
      if (error) throw error;
      newCategoryName.value = "";
      showMsg(categoryMsg, "Category added.", true);
      await loadCategories();
      renderCategoryChips();
    } catch (err) {
      showMsg(categoryMsg, "Couldn't add category: " + (err.message || err), false);
    }
  });

  // ---------- Tags ----------
  function renderTagChips() {
    const counts = new Map();
    articlesCache.forEach((a) => {
      (Array.isArray(a.tags) ? a.tags : []).forEach((t) => counts.set(t, (counts.get(t) || 0) + 1));
    });
    const entries = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
    tagsEmpty.style.display = entries.length ? "none" : "block";
    tagChips.innerHTML = entries
      .map(([tag, count]) => `<div class="chip" data-tag="${escapeHtml(tag)}" style="cursor:pointer;"><span>#${escapeHtml(tag)}</span><span class="chip-count">${count}</span></div>`)
      .join("");
    tagChips.querySelectorAll(".chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        articleSearch.value = chip.dataset.tag;
        statusFilter.value = "";
        categoryFilter.value = "";
        showTab("articles");
        renderArticleList();
      });
    });
  }

  // ---------- Dashboard ----------
  function renderDashboard() {
    const published = articlesCache.filter((a) => articleStatusLabel(a) === "published").length;
    const scheduled = articlesCache.filter((a) => articleStatusLabel(a) === "scheduled").length;
    const drafts = articlesCache.filter((a) => articleStatusLabel(a) === "draft").length;
    const breaking = articlesCache.filter((a) => a.breaking).length;
    const views = articlesCache.reduce((sum, a) => sum + (Number(a.views_count) || 0), 0);
    const likes = articlesCache.reduce((sum, a) => sum + (Number(a.likes_count) || 0), 0);

    const cards = [
      { label: "Published", num: published, cls: "" },
      { label: "Scheduled", num: scheduled, cls: "warn" },
      { label: "Drafts", num: drafts, cls: "" },
      { label: "Breaking now", num: breaking, cls: "accent" },
      { label: "Total views", num: formatViewCount(views), cls: "" },
      { label: "Total likes", num: formatViewCount(likes), cls: "" },
    ];
    qs("dashStats").innerHTML = cards
      .map((c) => `<div class="stat-card ${c.cls}"><div class="stat-num">${c.num}</div><div class="stat-label">${c.label}</div></div>`)
      .join("");

    const recent = articlesCache.slice(0, 6);
    const dashRecent = qs("dashRecent");
    if (!recent.length) {
      dashRecent.innerHTML = `<div class="empty-note">No articles yet — write your first one from the sidebar.</div>`;
      return;
    }
    dashRecent.innerHTML = "";
    recent.forEach((a) => {
      const label = articleStatusLabel(a);
      const row = document.createElement("div");
      row.className = "art-row";
      row.innerHTML = `
        <img class="art-row-thumb" src="${a.photo_url}" alt="">
        <div>
          <div class="art-row-title">${escapeHtml(a.headline)}</div>
          <div class="art-row-meta">
            <span class="status-pill ${label}">${label}</span>
            ${a.category || "News"} &bull; ${formatDate(a.published_at || a.created_at)}
          </div>
        </div>
        <div class="art-row-actions"><button data-action="edit">Edit</button></div>
      `;
      row.querySelector('[data-action="edit"]').addEventListener("click", () => { editArticle(a); showTab("write"); });
      dashRecent.appendChild(row);
    });
  }

  // ---------- Save / publish ----------
  async function saveArticle(targetStatus) {
    const headline = fHeadline.value.trim();
    const body = fBody.value.trim();
    let slug = slugify(fSlug.value || fHeadline.value);
    const tags = Array.from(new Set(fTags.value.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean)));

    if (!headline) { showMsg(composerMsg, "Add a headline first.", false); return; }
    if (!body) { showMsg(composerMsg, "The report can't be empty.", false); return; }
    if (!currentPhotoUrl) { showMsg(composerMsg, "Upload a photo before saving.", false); return; }
    if (!slug) { showMsg(composerMsg, "Add a URL slug.", false); return; }

    saveDraftBtn.disabled = true;
    publishBtn.disabled = true;
    showMsg(composerMsg, "Saving\u2026", true);

    const id = articleIdEl.value || null;
    const chosenPublishAt = fromLocalInputValue(fPublishAt.value);
    const payload = {
      headline,
      slug,
      dek: fDek.value.trim() || null,
      category: fCategory.value,
      tags,
      author: fAuthor.value.trim() || "GAKORO MEDIA TV",
      photo_url: currentPhotoUrl,
      photo_caption: fPhotoCaption.value.trim() || null,
      gallery_urls: currentGalleryUrls,
      body,
      breaking: fBreaking.checked,
      visibility: fVisibility.value,
      status: targetStatus,
      published_at: targetStatus === "published" ? (chosenPublishAt || editingPublishedAt || new Date().toISOString()) : editingPublishedAt,
    };
    if (!id) {
      payload.author_id = currentUserId;
    }

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
        fPublishAt.value = toLocalInputValue(result.data.published_at || new Date());
        updateRailStatus(articleStatusLabel(result.data));
        showMsg(
          composerMsg,
          targetStatus === "published"
            ? (articleStatusLabel(result.data) === "scheduled" ? `Scheduled for ${formatDateTime(result.data.published_at)}.` : "Published! Live on the site now.")
            : "Draft saved.",
          true
        );
        await loadArticles();
        saveDraftBtn.disabled = false;
        publishBtn.disabled = false;
        return;
      } catch (err) {
        lastError = err;
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
  function editArticle(a) {
    articleIdEl.value = a.id;
    fHeadline.value = a.headline;
    fSlug.value = a.slug;
    slugManuallyEdited = true;
    fCategory.value = a.category || "News";
    fTags.value = Array.isArray(a.tags) ? a.tags.join(", ") : "";
    fDek.value = a.dek || "";
    fAuthor.value = a.author || "GAKORO MEDIA TV";
    fPhotoCaption.value = a.photo_caption || "";
    fBody.value = a.body;
    fBreaking.checked = !!a.breaking;
    fVisibility.value = a.visibility || "public";
    fPublishAt.value = toLocalInputValue(a.published_at || new Date());
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
    updateRailStatus(articleStatusLabel(a));
    updateWordCount();
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

  function renderArticleList() {
    const q = articleSearch.value.trim().toLowerCase();
    const sf = statusFilter.value;
    const cf = categoryFilter.value;

    const filtered = articlesCache.filter((a) => {
      if (sf && articleStatusLabel(a) !== sf) return false;
      if (cf && (a.category || "News") !== cf) return false;
      if (q) {
        const haystack = [a.headline, a.category, ...(Array.isArray(a.tags) ? a.tags : [])].join(" ").toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });

    if (!filtered.length) {
      articleList.innerHTML = "";
      emptyList.style.display = "block";
      emptyList.textContent = articlesCache.length ? "No articles match your search or filters." : "No articles yet — write your first one above.";
      return;
    }

    emptyList.style.display = "none";
    articleList.innerHTML = "";
    filtered.forEach((a) => {
      const label = articleStatusLabel(a);
      const row = document.createElement("div");
      row.className = "art-row";
      row.innerHTML = `
        <img class="art-row-thumb" src="${a.photo_url}" alt="">
        <div>
          <div class="art-row-title">${escapeHtml(a.headline)}</div>
          <div class="art-row-meta">
            <span class="status-pill ${label}">${label}</span>
            ${a.breaking ? '<span class="status-pill breaking">Breaking</span>' : ""}
            ${a.visibility === "unlisted" ? '<span class="status-pill unlisted">Unlisted</span>' : ""}
            ${a.category || "News"} &bull; ${label === "scheduled" ? "goes live " + formatDateTime(a.published_at) : formatDate(a.published_at || a.created_at)}
            &bull; ${formatViewCount(a.views_count)} view${Number(a.views_count) === 1 ? "" : "s"}
          </div>
        </div>
        <div class="art-row-actions">
          <button data-action="edit">Edit</button>
          <button data-action="toggle">${a.status === "published" ? "Unpublish" : "Publish"}</button>
          ${isAdmin ? '<button data-action="delete" class="danger">Delete</button>' : ""}
        </div>
      `;
      row.querySelector('[data-action="edit"]').addEventListener("click", () => { editArticle(a); showTab("write"); });
      row.querySelector('[data-action="toggle"]').addEventListener("click", () => toggleStatus(a));
      const delBtn = row.querySelector('[data-action="delete"]');
      if (delBtn) delBtn.addEventListener("click", () => deleteArticle(a));
      articleList.appendChild(row);
    });
  }
  [articleSearch, statusFilter, categoryFilter].forEach((el) => el.addEventListener("input", renderArticleList));

  async function loadArticles() {
    const { data, error } = await client
      .from("news_articles")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      articlesCache = [];
      articleList.innerHTML = "";
      emptyList.style.display = "block";
      emptyList.textContent = "Couldn't load articles: " + error.message;
      return;
    }

    articlesCache = data || [];
    renderArticleList();
    renderDashboard();
  }

  // ---------- Media library ----------
  async function loadMedia() {
    mediaGrid.innerHTML = `<div class="empty-note">Loading\u2026</div>`;
    try {
      const { data, error } = await client.storage.from("news-photos").list("", {
        limit: 100,
        sortBy: { column: "created_at", order: "desc" },
      });
      if (error) throw error;
      mediaLoaded = true;
      const files = (data || []).filter((f) => f.name && !f.name.startsWith("."));
      mediaEmpty.style.display = files.length ? "none" : "block";
      mediaGrid.innerHTML = "";
      files.forEach((f) => {
        const { data: pub } = client.storage.from("news-photos").getPublicUrl(f.name);
        const item = document.createElement("div");
        item.className = "media-item";
        item.innerHTML = `
          <img src="${pub.publicUrl}" alt="" loading="lazy">
          <div class="media-item-actions">
            <button type="button" data-action="copy">Copy link</button>
            <button type="button" data-action="delete" class="danger">Delete</button>
          </div>
        `;
        item.querySelector('[data-action="copy"]').addEventListener("click", () => {
          if (navigator.clipboard) navigator.clipboard.writeText(pub.publicUrl);
          else window.prompt("Copy this link:", pub.publicUrl);
        });
        item.querySelector('[data-action="delete"]').addEventListener("click", async () => {
          if (!confirm("Delete this photo? Articles already using it will show a broken image.")) return;
          const { error: delErr } = await client.storage.from("news-photos").remove([f.name]);
          if (delErr) { alert("Couldn't delete: " + delErr.message); return; }
          loadMedia();
        });
        mediaGrid.appendChild(item);
      });
    } catch (err) {
      mediaGrid.innerHTML = `<div class="empty-note">Couldn't load the media library: ${err.message || err}</div>`;
    }
  }

  // ---------- Comments ----------
  async function loadComments() {
    commentList.innerHTML = `<div class="empty-note">Loading\u2026</div>`;
    try {
      let query = client.from("article_comments").select("*").order("created_at", { ascending: false }).limit(200);
      const status = commentStatusFilter.value;
      if (status) query = query.eq("status", status);
      const { data, error } = await query;
      if (error) throw error;

      refreshPendingCount();

      commentsEmpty.style.display = (data || []).length ? "none" : "block";
      commentList.innerHTML = "";
      (data || []).forEach((c) => {
        const row = document.createElement("div");
        row.className = "comment-row";
        row.innerHTML = `
          <div class="comment-row-head">
            <span class="comment-row-who">${escapeHtml(c.name)} <span class="status-pill ${c.status}">${c.status}</span></span>
            <span class="comment-row-meta">on “${escapeHtml(c.article_slug)}” &bull; ${formatDateTime(c.created_at)}</span>
          </div>
          <div class="comment-row-body">${escapeHtml(c.comment)}</div>
          <div class="comment-row-actions">
            ${c.status !== "approved" ? '<button data-action="approve">Approve</button>' : ""}
            ${c.status !== "hidden" ? '<button data-action="hide">Hide</button>' : ""}
            <button data-action="delete" class="danger">Delete</button>
          </div>
        `;
        const approveBtn = row.querySelector('[data-action="approve"]');
        if (approveBtn) approveBtn.addEventListener("click", () => setCommentStatus(c, "approved"));
        const hideBtn = row.querySelector('[data-action="hide"]');
        if (hideBtn) hideBtn.addEventListener("click", () => setCommentStatus(c, "hidden"));
        row.querySelector('[data-action="delete"]').addEventListener("click", () => deleteComment(c));
        commentList.appendChild(row);
      });
    } catch (err) {
      commentList.innerHTML = `<div class="empty-note">Couldn't load comments: ${err.message || err}</div>`;
    }
  }

  async function setCommentStatus(c, status) {
    const { error } = await client.from("article_comments").update({ status }).eq("id", c.id);
    if (error) { alert("Couldn't update comment: " + error.message); return; }
    await loadComments();
    refreshPendingCount();
  }

  async function deleteComment(c) {
    if (!confirm("Delete this comment? This can't be undone.")) return;
    const { error } = await client.from("article_comments").delete().eq("id", c.id);
    if (error) { alert("Couldn't delete: " + error.message); return; }
    await loadComments();
    refreshPendingCount();
  }
  commentStatusFilter.addEventListener("change", loadComments);

  async function refreshPendingCount() {
    try {
      const { count } = await client.from("article_comments").select("id", { count: "exact", head: true }).eq("status", "pending");
      const n = count || 0;
      if (n > 0) {
        notifBadge.style.display = "flex";
        notifBadge.textContent = n > 99 ? "99+" : String(n);
        commentsNavBadge.style.display = "inline-block";
        commentsNavBadge.textContent = n > 99 ? "99+" : String(n);
      } else {
        notifBadge.style.display = "none";
        commentsNavBadge.style.display = "none";
      }
    } catch (err) {
      console.warn("Couldn't refresh pending comment count.", err.message || err);
    }
  }

  // ---------- Users (admin only) ----------
  async function loadUsers() {
    userList.innerHTML = `<div class="empty-note">Loading\u2026</div>`;
    try {
      const { data, error } = await client.from("profiles").select("*").order("display_name", { ascending: true, nullsFirst: false });
      if (error) throw error;
      usersEmpty.style.display = (data || []).length ? "none" : "block";
      userList.innerHTML = "";
      (data || []).forEach((u) => {
        const row = document.createElement("div");
        row.className = "user-row";
        row.innerHTML = `
          <div>
            <div class="user-row-name">${escapeHtml(u.display_name || u.email || u.id)}</div>
            <div class="user-row-meta">${escapeHtml(u.email || u.id)}</div>
          </div>
          <select ${u.id === currentUserId ? "disabled title=\"You can't change your own role\"" : ""}>
            <option value="editor" ${u.role !== "admin" ? "selected" : ""}>Editor</option>
            <option value="admin" ${u.role === "admin" ? "selected" : ""}>Admin</option>
          </select>
        `;
        const select = row.querySelector("select");
        if (!select.disabled) {
          select.addEventListener("change", async () => {
            const { error: updErr } = await client.from("profiles").update({ role: select.value }).eq("id", u.id);
            if (updErr) alert("Couldn't update role: " + updErr.message);
          });
        }
        userList.appendChild(row);
      });
    } catch (err) {
      userList.innerHTML = `<div class="empty-note">Couldn't load users: ${err.message || err}</div>`;
    }
  }

  // ---------- Settings ----------
  async function loadAccount() {
    fAccountEmail.value = currentUserEmail;
    try {
      const { data, error } = await client.from("profiles").select("display_name").eq("id", currentUserId).single();
      if (error) throw error;
      fDisplayName.value = data?.display_name || "";
    } catch (err) {
      fDisplayName.value = "";
    }
  }

  accountForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    saveAccountBtn.disabled = true;
    try {
      const { error } = await client.from("profiles").update({ display_name: fDisplayName.value.trim() || null }).eq("id", currentUserId);
      if (error) throw error;
      showMsg(accountMsg, "Saved.", true);
      sideAccountName.textContent = fDisplayName.value.trim() || currentUserEmail;
    } catch (err) {
      showMsg(accountMsg, "Couldn't save: " + (err.message || err), false);
    } finally {
      saveAccountBtn.disabled = false;
    }
  });

  changePasswordForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (fNewPassword.value.length < 6) { showMsg(changePasswordMsg, "Password must be at least 6 characters.", false); return; }
    if (fNewPassword.value !== fConfirmPassword.value) { showMsg(changePasswordMsg, "Passwords don't match.", false); return; }
    changePasswordBtn.disabled = true;
    try {
      const { error } = await client.auth.updateUser({ password: fNewPassword.value });
      if (error) throw error;
      showMsg(changePasswordMsg, "Password updated.", true);
      changePasswordForm.reset();
    } catch (err) {
      showMsg(changePasswordMsg, "Couldn't update password: " + (err.message || err), false);
    } finally {
      changePasswordBtn.disabled = false;
    }
  });

  // ---------- Auth ----------
  async function loadRole() {
    isAdmin = false;
    try {
      const { data: userData } = await client.auth.getUser();
      currentUserId = userData?.user?.id || null;
      currentUserEmail = userData?.user?.email || "";
      if (!currentUserId) return;
      const { data, error } = await client
        .from("profiles")
        .select("role, display_name")
        .eq("id", currentUserId)
        .single();
      if (error) { console.error("Couldn't load role:", error.message); return; }
      isAdmin = data?.role === "admin";
      sideAccountName.textContent = data?.display_name || currentUserEmail || "Admin";
      usersNavBtn.style.display = isAdmin ? "flex" : "none";
    } catch (err) {
      console.error("Couldn't load role:", err);
    }
  }

  async function showApp() {
    loginWrap.style.display = "none";
    resetWrap.style.display = "none";
    appPanel.style.display = "block";
    logoutBtn.style.display = "inline-flex";
    notifBell.style.display = "flex";
    await loadRole();
    resetComposer();
    await loadCategories();
    await loadArticles();
    showTab("dashboard");
    refreshPendingCount();
    startIdleWatcher();
  }

  function showLogin(msg) {
    stopIdleWatcher();
    loginWrap.style.display = "block";
    resetWrap.style.display = "none";
    appPanel.style.display = "none";
    logoutBtn.style.display = "none";
    notifBell.style.display = "none";
    if (msg) showMsg(loginMsg, msg, true);
  }

  // ---------- Auto-logout after inactivity ----------
  // Anyone who forgets to log out on a shared/public computer leaves
  // the news desk (and its publish/edit powers) open indefinitely.
  // After IDLE_LIMIT_MS with no mouse/keyboard/touch activity, show a
  // countdown warning; if still no activity by the time it runs out,
  // sign the session out automatically.
  const IDLE_LIMIT_MS = 15 * 60 * 1000; // 15 minutes of inactivity
  const IDLE_WARN_MS = 60 * 1000; // 60-second warning before logout
  const IDLE_EVENTS = ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "click"];

  const idleWarnOverlay = qs("idleWarnOverlay");
  const idleWarnCountdown = qs("idleWarnCountdown");
  const idleStayBtn = qs("idleStayBtn");
  const idleLogoutNowBtn = qs("idleLogoutNowBtn");

  let idleTimer = null;
  let idleCountdownTimer = null;
  let idleWatcherActive = false;

  function idleWarningShowing() {
    return idleWarnOverlay && idleWarnOverlay.classList.contains("show");
  }

  function armIdleTimer() {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(showIdleWarning, IDLE_LIMIT_MS);
  }

  function showIdleWarning() {
    if (!idleWatcherActive || !idleWarnOverlay) return;
    let secondsLeft = Math.round(IDLE_WARN_MS / 1000);
    idleWarnCountdown.textContent = secondsLeft;
    idleWarnOverlay.classList.add("show");
    if (idleCountdownTimer) clearInterval(idleCountdownTimer);
    idleCountdownTimer = setInterval(() => {
      secondsLeft -= 1;
      if (secondsLeft <= 0) {
        clearInterval(idleCountdownTimer);
        idleCountdownTimer = null;
        autoLogout();
        return;
      }
      idleWarnCountdown.textContent = secondsLeft;
    }, 1000);
  }

  function hideIdleWarning() {
    if (idleWarnOverlay) idleWarnOverlay.classList.remove("show");
    if (idleCountdownTimer) {
      clearInterval(idleCountdownTimer);
      idleCountdownTimer = null;
    }
  }

  function resetIdleTimer() {
    if (!idleWatcherActive) return;
    if (idleWarningShowing()) hideIdleWarning();
    armIdleTimer();
  }

  async function autoLogout() {
    hideIdleWarning();
    stopIdleWatcher();
    try {
      await client.auth.signOut();
    } catch (err) {
      console.error("Auto-logout sign-out failed:", err);
    }
    showLogin("You were signed out after a period of inactivity.");
  }

  function startIdleWatcher() {
    if (idleWatcherActive) return; // already running
    idleWatcherActive = true;
    IDLE_EVENTS.forEach((evt) => window.addEventListener(evt, resetIdleTimer, { passive: true }));
    document.addEventListener("visibilitychange", handleIdleVisibilityChange);
    armIdleTimer();
  }

  function stopIdleWatcher() {
    idleWatcherActive = false;
    if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
    hideIdleWarning();
    IDLE_EVENTS.forEach((evt) => window.removeEventListener(evt, resetIdleTimer));
    document.removeEventListener("visibilitychange", handleIdleVisibilityChange);
  }

  function handleIdleVisibilityChange() {
    if (document.visibilityState === "visible") resetIdleTimer();
  }

  if (idleStayBtn) idleStayBtn.addEventListener("click", resetIdleTimer);
  if (idleLogoutNowBtn) idleLogoutNowBtn.addEventListener("click", autoLogout);

  function showResetPanel() {
    loginWrap.style.display = "none";
    resetWrap.style.display = "block";
    resetPanel.style.display = "block";
    appPanel.style.display = "none";
    logoutBtn.style.display = "none";
    notifBell.style.display = "none";
  }

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    loginBtn.disabled = true;
    loginMsg.className = "form-msg";
    const email = qs("loginEmail").value.trim();
    const password = qs("loginPassword").value;
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
