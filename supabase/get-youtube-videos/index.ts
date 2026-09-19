// ============================================================
// SANGWA STUDIO — get-youtube-videos Edge Function
//
// Fetches the latest uploads from the GAKORO MEDIA TV YouTube
// channel and returns them as clean JSON. The YouTube Data API
// key stays on the server as a secret — it's never sent to the
// browser, unlike calling the YouTube API directly from js/*.
//
// LANDSCAPE-ONLY: Shorts and other vertical/portrait uploads are
// filtered out before the response is sent, so the site's 16:9
// player and thumbnail grid never end up with a portrait video.
// Detection asks the API for the `player` part with a fixed
// maxHeight — YouTube scales the returned embed width to match
// the video's true aspect ratio, so a portrait upload comes back
// much narrower than a 16:9 one. Videos whose width/height ratio
// is below ~1 (taller than wide) are treated as vertical and
// skipped. If that signal is ever missing, a duration fallback
// (Shorts are almost always ≤ 60s) is used instead.
// ============================================================

const CHANNEL_ID = "UCuQCsYE_gp4h-8GtECfcdbw"; // GAKORO MEDIA TV (@gakoromediatv)
const API = "https://www.googleapis.com/youtube/v3";
const PLAYER_MAX_HEIGHT = 720; // any fixed value works; we only care about the returned ratio
const MAX_PLAYLIST_PAGES = 5; // safety cap: up to 250 playlist items scanned per request

// Simple in-memory cache (per warm function instance) so repeat
// page loads don't burn YouTube API quota on every visitor.
let cache: { data: unknown; expires: number } | null = null;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function getJSON(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`YouTube API error ${res.status}: ${await res.text()}`);
  return res.json();
}

function bestThumb(thumbnails: Record<string, { url: string }>) {
  return (
    thumbnails.maxres || thumbnails.standard || thumbnails.high ||
    thumbnails.medium || thumbnails.default
  ).url;
}

function durationSeconds(iso: string) {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  const h = parseInt(m?.[1] || "0", 10);
  const min = parseInt(m?.[2] || "0", 10);
  const s = parseInt(m?.[3] || "0", 10);
  return h * 3600 + min * 60 + s;
}

// Returns true for landscape (or square) videos, false for
// portrait/vertical ones (Shorts and similar).
function isLandscape(v: any): boolean {
  const html: string | undefined = v.player?.embedHtml;
  if (html) {
    const w = Number(html.match(/width="(\d+)"/)?.[1]);
    const h = Number(html.match(/height="(\d+)"/)?.[1]);
    if (w > 0 && h > 0) return w / h >= 1;
  }
  // Fallback if the player field is ever missing: Shorts are
  // almost always 60s or under, so treat very short videos as
  // vertical and everything else as landscape.
  return durationSeconds(v.contentDetails.duration) > 60;
}

async function fetchLatestVideos(apiKey: string, count: number) {
  const chanData = await getJSON(
    `${API}/channels?part=contentDetails&id=${CHANNEL_ID}&key=${apiKey}`
  );
  const uploadsPlaylistId =
    chanData.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploadsPlaylistId) throw new Error("Channel/uploads playlist not found");

  const landscapeVideos: any[] = [];
  let pageToken = "";
  let pagesFetched = 0;

  while (landscapeVideos.length < count && pagesFetched < MAX_PLAYLIST_PAGES) {
    const plData = await getJSON(
      `${API}/playlistItems?part=snippet&maxResults=50&playlistId=${uploadsPlaylistId}&key=${apiKey}` +
        (pageToken ? `&pageToken=${pageToken}` : "")
    );
    pagesFetched++;

    const videoIds = plData.items.map((i: any) => i.snippet.resourceId.videoId).join(",");
    if (videoIds) {
      const vidData = await getJSON(
        `${API}/videos?part=contentDetails,statistics,snippet,player&id=${videoIds}` +
          `&maxHeight=${PLAYER_MAX_HEIGHT}&key=${apiKey}`
      );
      const byId = Object.fromEntries(vidData.items.map((v: any) => [v.id, v]));

      for (const item of plData.items) {
        const v = byId[item.snippet.resourceId.videoId];
        if (!v || !isLandscape(v)) continue; // skip missing or vertical videos

        landscapeVideos.push({
          id: v.id,
          title: v.snippet.title,
          thumb: bestThumb(v.snippet.thumbnails),
          viewCount: Number(v.statistics.viewCount || 0),
          publishedAt: v.snippet.publishedAt,
          duration: v.contentDetails.duration,
          url: `https://www.youtube.com/watch?v=${v.id}`,
        });

        if (landscapeVideos.length >= count) break;
      }
    }

    pageToken = plData.nextPageToken;
    if (!pageToken) break; // reached the end of the uploads playlist
  }

  return landscapeVideos.slice(0, count);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Deno.env.get() takes the NAME of the secret, not the key value itself.
    // Set the actual key via: supabase secrets set YOUTUBE_API_KEY=AIzaSy...
    const apiKey = Deno.env.get("YOUTUBE_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "Missing YOUTUBE_API_KEY secret" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const url = new URL(req.url);
    const count = Math.min(Number(url.searchParams.get("count")) || 10, 20);

    if (cache && cache.expires > Date.now()) {
      return new Response(JSON.stringify({ videos: cache.data, cached: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const videos = await fetchLatestVideos(apiKey, count);
    cache = { data: videos, expires: Date.now() + CACHE_TTL_MS };

    return new Response(JSON.stringify({ videos, cached: false }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
