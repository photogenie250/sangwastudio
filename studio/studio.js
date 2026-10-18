/* ==========================================================
   SANGWA STUDIO — booking page script
   Everything this page does lives in this one file:
     1. light / dark theme
     2. mobile menu
     3. choosing a division (Photo / Video / Music)
     4. Telegram links
     5. sending the booking to Supabase
   It needs js/config.js loaded first (that is what creates
   window.sbClient and sets the Telegram username).
   ========================================================== */

(function () {
  "use strict";

  /* ---------- Small helpers ---------- */

  // localStorage can throw (private mode, blocked cookies), so wrap it.
  function saveSetting(key, value) {
    try { localStorage.setItem(key, value); } catch (e) { /* not a big deal */ }
  }

  function byId(id) { return document.getElementById(id); }


  /* ==========================================================
     1. LIGHT / DARK THEME
     Light is the default. The saved choice is applied in the
     <head> before the page paints, so there is no flash.
     ========================================================== */

  var themeColorMeta = document.querySelector('meta[name="theme-color"]');

  function applyTheme(theme) {
    if (theme === "dark") {
      document.documentElement.setAttribute("data-theme", "dark");
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
    // keep the browser's address-bar colour in step with the page
    if (themeColorMeta) themeColorMeta.setAttribute("content", theme === "dark" ? "#141A2E" : "#FFFFFF");
    saveSetting("sangwa_theme", theme);
  }

  function toggleTheme() {
    var isDark = document.documentElement.getAttribute("data-theme") === "dark";
    applyTheme(isDark ? "light" : "dark");
  }

  [byId("themeToggle"), byId("themeToggleMobile")].forEach(function (button) {
    if (button) button.addEventListener("click", toggleTheme);
  });

  // if the visitor already chose dark, make sure the meta colour matches
  if (document.documentElement.getAttribute("data-theme") === "dark" && themeColorMeta) {
    themeColorMeta.setAttribute("content", "#141A2E");
  }


  /* ==========================================================
     2. MOBILE MENU (slide-in panel)
     ========================================================== */

  var menuButton  = byId("mobileMenuButton");
  var menu        = byId("mobileMenu");
  var menuOverlay = byId("mobileMenuOverlay");
  var menuClose   = byId("mobileMenuClose");

  function openMenu() {
    menu.classList.add("open");
    menuOverlay.classList.add("open");
    menu.setAttribute("aria-hidden", "false");
    menuButton.setAttribute("aria-expanded", "true");
    document.body.classList.add("menu-open");
    menuClose.focus();
  }

  function closeMenu() {
    var wasOpen = menu.classList.contains("open");
    menu.classList.remove("open");
    menuOverlay.classList.remove("open");
    menu.setAttribute("aria-hidden", "true");
    menuButton.setAttribute("aria-expanded", "false");
    document.body.classList.remove("menu-open");
    if (wasOpen) menuButton.focus(); // put the keyboard back where it started
  }

  if (menuButton && menu && menuOverlay && menuClose) {
    menuButton.addEventListener("click", function () {
      if (menu.classList.contains("open")) closeMenu(); else openMenu();
    });
    menuClose.addEventListener("click", closeMenu);
    menuOverlay.addEventListener("click", closeMenu);

    // tapping any link inside the menu closes it (so "Book Now" reveals the form)
    menu.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", closeMenu);
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && menu.classList.contains("open")) closeMenu();
    });

    // if the window is widened past the mobile breakpoint, tidy up
    window.addEventListener("resize", function () {
      if (window.innerWidth > 720 && menu.classList.contains("open")) closeMenu();
    });
  }


  /* ==========================================================
     3. CHOOSING A DIVISION
     The three big cards set a hidden "division" field and
     swap the list of services to match.
     ========================================================== */

  var SERVICES = {
    photo: ["Wedding Photography", "Portrait Session", "Graduation Shoot", "Corporate / Event Coverage", "Product / Commercial Shoot", "Other Photo Project"],
    video: ["Wedding Film", "Event Coverage", "Live Streaming", "Video Editing", "Commercial / Brand Video", "Other Video Project"],
    music: ["Studio Recording Session", "Mixing & Mastering", "Beat Production", "Podcast / Voiceover Recording", "Live Session Recording", "Other Music Project"]
  };

  // Budget choices follow each division's price range.
  // Photo starts at 35,000 RWF; the top end is open.
  var BUDGETS = {
    photo: ["35,000 - 60,000 RWF", "60,000 - 90,000 RWF", "90,000 - 120,000 RWF", "Above 120,000 RWF"],
    video: ["100,000 - 125,000 RWF", "125,000 - 150,000 RWF"],
    music: ["60,000 - 80,000 RWF", "80,000 - 100,000 RWF"]
  };

  var form         = byId("orderForm");
  var divisionField = byId("ofDivision");
  var serviceField  = byId("ofService");
  var budgetField   = byId("ofBudget");
  var divisionCards  = document.querySelectorAll(".division-card");

  // fills a <select> with a "Select..." placeholder followed by the given choices.
  // createElement (not innerHTML) so characters like "&" are never read as HTML.
  function fillSelect(select, placeholderText, choices) {
    select.innerHTML = "";
    var placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = placeholderText;
    select.appendChild(placeholder);
    choices.forEach(function (choice) {
      var option = document.createElement("option");
      option.textContent = choice;
      select.appendChild(option);
    });
  }

  function chooseDivision(division) {
    divisionField.value = division;

    // highlight the chosen card
    divisionCards.forEach(function (card) {
      var isChosen = card.dataset.division === division;
      card.classList.toggle("active", isChosen);
      card.setAttribute("aria-pressed", isChosen ? "true" : "false");
    });

    // services and budgets both depend on the division
    fillSelect(serviceField, "Select a service", SERVICES[division]);
    fillSelect(budgetField, "Select budget", BUDGETS[division]);
  }

  divisionCards.forEach(function (card) {
    card.addEventListener("click", function () { chooseDivision(card.dataset.division); });
  });

  chooseDivision("photo");

  // you can't book a day that has already passed
  var dateField = byId("ofDate");
  if (dateField) {
    var today = new Date();
    var month = String(today.getMonth() + 1).padStart(2, "0");
    var day   = String(today.getDate()).padStart(2, "0");
    dateField.min = today.getFullYear() + "-" + month + "-" + day;
  }


  /* ==========================================================
     4. TELEGRAM LINKS + FOOTER YEAR
     ========================================================== */

  function telegramLink(message) {
    var username = window.TELEGRAM_USERNAME || "sangwastudio_bot";
    return "https://t.me/" + username + "?text=" + encodeURIComponent(message);
  }

  var greeting = "Hello SANGWA STUDIO! I'd like to know more about your services.";
  byId("tgFloat").href = telegramLink(greeting);
  byId("tgFooterLink").href = telegramLink(greeting);

  byId("yearNow").textContent = new Date().getFullYear();


  /* ==========================================================
     5. SENDING THE BOOKING
     The row goes into the Supabase "orders" table. A database
     webhook then pings the studio on Telegram (see README).
     ========================================================== */

  var resultMessage = byId("formToast");
  var submitButton = form.querySelector(".submit-button");

  function showMessage(text, isSuccess) {
    resultMessage.textContent = text;
    resultMessage.className = "message show " + (isSuccess ? "success" : "error");
  }

  // Rwandan numbers are usually 07xx xxx xxx or +250 7xx xxx xxx.
  // We only check there are enough digits, so any normal way of typing works.
  function looksLikePhoneNumber(text) {
    return text.replace(/\D/g, "").length >= 9;
  }

  form.addEventListener("submit", async function (event) {
    event.preventDefault();

    var data = Object.fromEntries(new FormData(form).entries());
    var phone = data.phone.trim();

    if (!looksLikePhoneNumber(phone)) {
      showMessage("Please enter a phone number we can reach you on.", false);
      byId("ofPhone").focus();
      return;
    }

    if (!window.sbClient) {
      showMessage("Booking isn't available right now. Please call or message us using the details at the bottom of the page.", false);
      console.error("window.sbClient is missing. Check js/config.js has the real Supabase URL and key, and that the Supabase script loads first.");
      return;
    }

    // stop double-taps from sending the same booking twice
    submitButton.disabled = true;
    submitButton.textContent = "Sending...";

    var booking = {
      division:     data.division,
      service_type: data.serviceType,
      full_name:    data.fullName.trim(),
      phone:        phone,
      email:        data.email ? data.email.trim() : null,
      event_date:   data.eventDate || null,
      budget:       data.budget,
      details:      data.details ? data.details.trim() : null
    };

    var result;
    try {
      result = await window.sbClient.from("orders").insert([booking]);
    } catch (networkError) {
      result = { error: networkError }; // e.g. the visitor went offline
    }

    submitButton.disabled = false;
    submitButton.textContent = "Confirm Booking";

    if (result.error) {
      console.error(result.error);
      showMessage("Something went wrong saving your booking. Please try again, or call us on +250 787 692 411.", false);
      return;
    }

    showMessage("Booking received! We'll call you to confirm shortly.", true);
    form.reset();
    chooseDivision(booking.division); // reset() clears the dropdowns, so rebuild them
  });
})();
