// ============================================================
// SANGWA STUDIO — get-youtube-videos Edge Function
//
// Fetches the latest uploads from the GAKORO MEDIA TV YouTube
// channel and returns them as clean JSON. The YouTube Data API
// key stays on the server as a secret — it's never sent to the
// browser, unlike calling the YouTube API directly from js/*.
//
// Deploy:
//   supabase functions deploy get-youtube-videos --no-verify-jwt
//
//   (--no-verify-jwt because this is public read-only data — no
//   logged-in user is required to view the channel's videos)
//
// Set the secret (get a key at console.cloud.google.com/apis/credentials,
// after enabling "YouTube Data API v3" on the project):
//   supabase secrets set YOUTUBE_API_KEY=your_real_key_here
// ============================================================

const CHANNEL_ID = "UCuQCsYE_gp4h-8GtECfcdbw"; // GAKORO MEDIA TV (@gakoromediatv)
const API = "https://www.googleapis.com/youtube/v3";

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

async function fetchLatestVideos(apiKey: string, count: number) {
  // 1. Resolve the channel's uploads playlist
  const chanData = await getJSON(
    `${API}/channels?part=contentDetails&id=${CHANNEL_ID}&key=${apiKey}`
  );
  const uploadsPlaylistId =
    chanData.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploadsPlaylistId) throw new Error("Channel/uploads playlist not found");

  // 2. Latest N video IDs from that playlist
  const plData = await getJSON(
    `${API}/playlistItems?part=snippet&maxResults=${count}&playlistId=${uploadsPlaylistId}&key=${apiKey}`
  );
  const videoIds = plData.items.map((i: any) => i.snippet.resourceId.videoId).join(",");
  if (!videoIds) return [];

  // 3. Duration + view counts for those videos
  const vidData = await getJSON(
    `${API}/videos?part=contentDetails,statistics,snippet&id=${videoIds}&key=${apiKey}`
  );
  const byId = Object.fromEntries(vidData.items.map((v: any) => [v.id, v]));

  // Preserve upload order from the playlist response
  return plData.items
    .map((i: any) => byId[i.snippet.resourceId.videoId])
    .filter(Boolean)
    .map((v: any) => ({
      id: v.id,
      title: v.snippet.title,
      thumb: bestThumb(v.snippet.thumbnails),
      viewCount: Number(v.statistics.viewCount || 0),
      publishedAt: v.snippet.publishedAt,
      duration: v.contentDetails.duration, // ISO 8601, e.g. PT14M20S
      url: `https://www.youtube.com/watch?v=${v.id}`,
    }));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
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
