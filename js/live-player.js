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

  // Landscape-only queue (set by youtube.js). Falls back to the uploads
  // playlist if the feed could not be loaded.
  window.gakoroQueue = window.gakoroQueue || [];

  function embedUrl(videoId, muted) {
    // YouTube takes the queue as a comma list in the URL; 150 ids keeps it short enough
    var rest = window.gakoroQueue.filter(function (id) { return id !== videoId; }).slice(0, 150);
    // loop=1 makes the whole queue repeat forever
    var url = EMBED_HOST + videoId + "?autoplay=1&loop=1&rel=0&modestbranding=1&playsinline=1&enablejsapi=1";
    if (muted) url += "&mute=1";
    if (rest.length) url += "&playlist=" + rest.join(",");
    else url += "&list=" + UPLOADS_PLAYLIST;
    if (/^https?:$/.test(location.protocol)) url += "&origin=" + encodeURIComponent(location.origin);
    return url;
  }
  window.gakoroEmbedUrl = embedUrl;

  window.gakoroPlay = function (videoId, meta) {
    if (!iframe || !videoId) return;
    iframe.src = embedUrl(videoId, false);
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

    if (playerBox) {
      var offScreen = playerBox.getBoundingClientRect().top < 0;
      var mobile = window.matchMedia && window.matchMedia("(max-width: 880px)").matches;
      if (offScreen || mobile) playerBox.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  // Keep the "now playing" text in step when the queue advances by itself.
  // YouTube reports the current video id through postMessage once we say we
  // are listening. youtube.js fills window.gakoroVideoMeta (id -> details).
  function showNowPlaying(id) {
    var m = window.gakoroVideoMeta && window.gakoroVideoMeta[id];
    if (!m) return;
    if (titleEl) titleEl.textContent = m.title;
    if (dekEl) dekEl.style.display = "none";
    if (bylineEl) {
      bylineEl.innerHTML = ["GAKORO MEDIA TV", m.views, m.ago].filter(Boolean).join(' <span class="sep">&bull;</span> ');
    }
  }
  function startListening() {
    if (iframe && iframe.contentWindow) {
      iframe.contentWindow.postMessage(JSON.stringify({ event: "listening", id: 1 }), "*");
    }
  }
  // ---- Autoplay guarantee ----
  // Browsers only allow MUTED autoplay, and some (iOS Safari, strict Chrome
  // settings) still hold the video back. After each load we ask the player
  // to play; if it is not playing 2.5s later we retry muted. Any first tap
  // or key press on the page also starts it, since that is always allowed.
  var playerState = -1; // YouTube states: -1 unstarted, 1 playing, 2 paused, 3 buffering
  var watchdog = null;
  function isRunning() { return playerState === 1 || playerState === 3; }
  function armAutoplay() {
    playerState = -1;
    clearTimeout(watchdog);
    sendCommand("playVideo");
    watchdog = setTimeout(function () {
      if (isRunning()) return;
      sendCommand("mute");
      setMuteUI(true);
      sendCommand("playVideo");
    }, 2500);
  }
  function kickOnFirstGesture() {
    if (!isRunning()) sendCommand("playVideo");
  }
  ["pointerdown", "keydown", "touchstart"].forEach(function (evt) {
    window.addEventListener(evt, kickOnFirstGesture, { once: true, passive: true });
  });

  if (iframe) iframe.addEventListener("load", function () {
    startListening();
    setTimeout(startListening, 800);
    setTimeout(armAutoplay, 1200);
  });
  window.addEventListener("message", function (e) {
    if (!iframe || e.source !== iframe.contentWindow) return;
    try {
      var d = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
      var id = d && d.info && d.info.videoData && d.info.videoData.video_id;
      if (id) showNowPlaying(id);
      if (d && d.info && typeof d.info.playerState === "number") playerState = d.info.playerState;
    } catch (err) {}
  });

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
