/* =====================================================
   GAKORO MEDIA TV — on-site "live" YouTube player.

   The player embeds the channel's uploads playlist directly
   (no API key required) so it starts playing automatically —
   muted, since browsers block unmuted autoplay — the moment
   anyone opens the site, and keeps rolling through the latest
   videos back to back like a live broadcast.

   Clicking any video card or side-card calls window.gakoroPlay()
   which swaps the player to that specific video (unmuted, since
   a click counts as a user gesture) while staying queued to the
   same channel playlist afterwards. Nothing ever opens
   youtube.com — playback always stays on this page.
===================================================== */
(function () {
  // GAKORO MEDIA TV channel ID UCuQCsYE_gp4h-8GtECfcdbw, converted
  // to its default "uploads" playlist ID (UC -> UU).
  var UPLOADS_PLAYLIST = "UUuQCsYE_gp4h-8GtECfcdbw";
  var EMBED_HOST = "https://www.youtube-nocookie.com/embed/";

  var iframe = document.getElementById("tvIframe");
  var titleEl = document.getElementById("nowPlayingTitle");
  var dekEl = document.getElementById("nowPlayingDek");
  var bylineEl = document.getElementById("nowPlayingByline");
  var playerBox = document.getElementById("tvPlayer");
  var muteToggle = document.getElementById("tvMuteToggle");

  // ---- Mute/unmute control ----
  // The player starts muted (autoplay requires it on most mobile
  // browsers). YouTube's own built-in unmute icon isn't always
  // reliable inside an embed, so this button talks to the iframe
  // directly via the documented postMessage command protocol
  // (works as long as the iframe URL has enablejsapi=1 — no need
  // to load the full IFrame API script for just mute/unmute).
  var isMuted = true;

  function sendCommand(func, args) {
    if (!iframe || !iframe.contentWindow) return;
    iframe.contentWindow.postMessage(
      JSON.stringify({ event: "command", func: func, args: args || [] }),
      "*"
    );
  }

  function setMuteUI(muted) {
    isMuted = muted;
    if (!muteToggle) return;
    muteToggle.classList.toggle("is-unmuted", !muted);
    muteToggle.setAttribute("aria-label", muted ? "Unmute video" : "Mute video");
  }

  if (muteToggle) {
    muteToggle.addEventListener("click", function () {
      if (isMuted) {
        sendCommand("unMute");
        sendCommand("setVolume", [100]);
      } else {
        sendCommand("mute");
      }
      setMuteUI(!isMuted);
    });
  }

  window.gakoroPlay = function (videoId, meta) {
    if (!iframe || !videoId) return;
    var src =
      EMBED_HOST +
      videoId +
      "?list=" + UPLOADS_PLAYLIST +
      "&autoplay=1&rel=0&modestbranding=1&playsinline=1&enablejsapi=1";
    iframe.src = src;
    // A card click is a real user gesture, so the new video loads
    // unmuted — reflect that in the toggle immediately.
    setMuteUI(false);

    if (meta) {
      if (titleEl && meta.title) titleEl.textContent = meta.title;
      if (dekEl) dekEl.style.display = "none";
      if (bylineEl) {
        var bits = ["GAKORO MEDIA TV"];
        if (meta.views) bits.push(meta.views);
        if (meta.ago) bits.push(meta.ago);
        bylineEl.innerHTML = bits.join(' <span class="sep">&bull;</span> ');
      }
    }

    if (playerBox && window.matchMedia && window.matchMedia("(max-width: 880px)").matches) {
      playerBox.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  // Make any element with a data-video-id attribute playable —
  // click, or Enter/Space when focused via keyboard.
  function wireUpPlayable(el) {
    if (!el || el.__gakoroWired) return;
    el.__gakoroWired = true;
    el.setAttribute("tabindex", "0");
    el.setAttribute("role", "button");
    var trigger = function (e) {
      if (e.type === "keydown" && e.key !== "Enter" && e.key !== " ") return;
      if (e.type === "keydown") e.preventDefault();
      var id = el.getAttribute("data-video-id");
      if (!id) return;
      window.gakoroPlay(id, {
        title: el.getAttribute("data-video-title") || "",
        views: el.getAttribute("data-video-views") || "",
        ago: el.getAttribute("data-video-ago") || "",
      });
    };
    el.addEventListener("click", trigger);
    el.addEventListener("keydown", trigger);
  }

  // Exposed so youtube.js can wire up cards once real data loads.
  window.gakoroWireUpPlayable = wireUpPlayable;

  // Keep the masthead date current instead of a hardcoded string.
  var dateEl = document.querySelector(".meta-date");
  if (dateEl) {
    var today = new Date();
    dateEl.textContent = today
      .toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      })
      .toUpperCase()
      .replace(",", ",");
  }
})();
