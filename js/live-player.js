/* Live YouTube player. Embeds the channel's uploads playlist (no API key).
   It starts muted because browsers block unmuted autoplay. Clicking a card
   calls window.gakoroPlay() to switch videos without leaving the page. */
(function () {
  // channel ID turned into its uploads playlist ID (UC -> UU)
  var UPLOADS_PLAYLIST = "UUuQCsYE_gp4h-8GtECfcdbw";
  var EMBED_HOST = "https://www.youtube-nocookie.com/embed/";

  var iframe = document.getElementById("tvIframe");
  var titleEl = document.getElementById("nowPlayingTitle");
  var dekEl = document.getElementById("nowPlayingDek");
  var bylineEl = document.getElementById("nowPlayingByline");
  var playerBox = document.getElementById("tvPlayer");
  var muteToggle = document.getElementById("tvMuteToggle");

  // Mute toggle. The player starts muted because autoplay needs it.
  // YouTube's own unmute icon is flaky in embeds, so we send the command
  // to the iframe with postMessage (needs enablejsapi=1 in the iframe URL)
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
    // a card click is a user gesture, so the new video plays unmuted;
    // update the toggle to match
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

  // make anything with data-video-id playable (click, Enter or Space)
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

  // used by youtube.js once real data loads
  window.gakoroWireUpPlayable = wireUpPlayable;

  // keep the masthead date current
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
