/* =====================================================
   GAKORO MEDIA TV / SANGWA STUDIO — cookie consent banner.

   A small, dependency-free banner so the site has a basic
   cookie/ads consent notice in place before turning on Google
   AdSense (recommended, and required in some regions like the
   EU/UK). Include this script on any page after </body> content
   (or anywhere — it waits for DOMContentLoaded):

     <script src="/js/consent.js"></script>

   Stores the visitor's choice in localStorage under
   "gakoro-cookie-consent" ("accepted" | "declined") so the
   banner only shows once per browser.

   WIRING UP ADSENSE (do this once you have a publisher ID):
   Only load the AdSense script AFTER consent is accepted, by
   putting your AdSense <script> tag inside window.loadAds()
   below instead of hard-coding it in every page's <head>. That
   keeps ad cookies from being set before a visitor has agreed —
   the safest default for GDPR/UK-GDPR compliance.
===================================================== */
(function () {
  var CONSENT_KEY = "gakoro-cookie-consent";

  window.loadAds = window.loadAds || function () {
    if (document.getElementById("adsbygoogle-js")) return; // don't load twice
    var s = document.createElement("script");
    s.id = "adsbygoogle-js";
    s.async = true;
    s.src = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-2056887490896774";
    s.crossOrigin = "anonymous";
    document.head.appendChild(s);
  };

  function injectBanner() {
    var bar = document.createElement("div");
    bar.id = "cookieConsentBar";
    bar.setAttribute("role", "region");
    bar.setAttribute("aria-label", "Cookie notice");
    bar.innerHTML =
      '<p>We use cookies and similar tools to run this site and, where enabled, to show ads that help keep our reporting free. ' +
      '<a href="/privacy/">Learn more</a></p>' +
      '<div class="ccb-actions">' +
      '<button type="button" id="ccbDecline">Decline</button>' +
      '<button type="button" id="ccbAccept">Accept</button>' +
      "</div>";

    var style = document.createElement("style");
    style.textContent =
      "#cookieConsentBar{position:fixed;left:0;right:0;bottom:0;z-index:9999;" +
      "background:#0E1C2B;color:#F2F0E9;padding:16px 20px;display:flex;gap:16px;" +
      "align-items:center;justify-content:space-between;flex-wrap:wrap;" +
      "border-top:1px solid #23364F;font-family:Inter,system-ui,sans-serif;font-size:13.5px;" +
      "box-shadow:0 -6px 24px rgba(0,0,0,.35);}" +
      "#cookieConsentBar p{margin:0;max-width:640px;line-height:1.5;}" +
      "#cookieConsentBar a{color:#C69A4E;}" +
      "#cookieConsentBar .ccb-actions{display:flex;gap:10px;flex-shrink:0;}" +
      "#cookieConsentBar button{font-family:inherit;font-size:12.5px;letter-spacing:.04em;" +
      "text-transform:uppercase;padding:9px 16px;cursor:pointer;border:1px solid #23364F;" +
      "background:transparent;color:#A9B4C4;}" +
      "#cookieConsentBar #ccbAccept{background:#D3242C;border-color:#D3242C;color:#fff;}" +
      "@media (max-width:560px){#cookieConsentBar{flex-direction:column;align-items:stretch;text-align:left;}}";

    document.head.appendChild(style);
    document.body.appendChild(bar);

    document.getElementById("ccbAccept").addEventListener("click", function () {
      localStorage.setItem(CONSENT_KEY, "accepted");
      bar.remove();
      window.loadAds();
      // Let other scripts (e.g. js/article.js) know consent just
      // changed, in case they need to backfill an ad slot that was
      // rendered empty before this click.
      document.dispatchEvent(new CustomEvent("gakoro-ads-consent-accepted"));
    });
    document.getElementById("ccbDecline").addEventListener("click", function () {
      localStorage.setItem(CONSENT_KEY, "declined");
      bar.remove();
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    var choice = localStorage.getItem(CONSENT_KEY);
    if (choice === "accepted") {
      window.loadAds();
      return;
    }
    if (choice === "declined") return;
    injectBanner();
  });
})();
