/* Cookie consent banner. The choice is saved in localStorage under
   "gakoro-cookie-consent" (accepted / declined). The AdSense script is only
   loaded after Accept, from loadAds() below. */
(function () {
  var CONSENT_KEY = "gakoro-cookie-consent";

  // pages where we never show ads (tools, legal, login/admin)
  var NO_AD_PATHS = ["/privacy", "/terms", "/contact", "/advertise",
                     "/lesson-maker", "/ndera-system-login", "/admin"];

  function adsAllowedHere() {
    var path = location.pathname.replace(/\/index\.html$/, "/");
    return !NO_AD_PATHS.some(function (p) {
      return path === p || path.indexOf(p + "/") === 0;
    });
  }

  window.loadAds = window.loadAds || function () {
    if (!adsAllowedHere()) return;
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
      // tell other scripts (article.js) so they can fill an ad slot that
      // rendered empty
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
