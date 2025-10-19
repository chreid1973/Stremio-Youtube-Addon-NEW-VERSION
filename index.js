// Minimal Stremio YouTube (RSS-only) — clean reset

import pkg from "stremio-addon-sdk";
import fetch from "node-fetch";
const { addonBuilder, serveHTTP } = pkg;

// --- Config: a few known channels grouped (UC IDs only)
const CHANNEL_GROUPS = {
  Tech: [
    { id: "UCXuqSBlHAE6Xw-yeJA0Tunw", name: "Linus Tech Tips" },
    { id: "UCBJycsmduvYEL83R_U4JriQ", name: "MKBHD" },
    { id: "UCdBK94H6oZT2Q7l0-b0xmMg", name: "Short Circuit - LTT" }
  ],
  Automotive: [
    { id: "UCyXiDU5qjfOPxgOPeFWGwKw", name: "Throttle House" }
  ],
  Podcasts: [
    { id: "UCFP1dDbFt0B7X6M2xPDj1bA", name: "WVFRM Podcast" }
  ],
  Entertainment: [
    { id: "UCSpFnDQr88xCZ80N-X7t0nQ", name: "Corridor Crew MAIN" }
  ]
};

const VIDEOS_PER_CHANNEL = 20; // change if you like (max ~50 via RSS)

// --- Manifest (short, clear)
const manifest = {
  id: "community.youtube.rss.clean",
  version: "1.0.0",
  name: "YouTube Universe (Clean RSS)",
  description: [
    "Zero-API, RSS-only YouTube catalogs per channel.",
    "Stable baseline. No API keys. Streams open on YouTube."
  ].join("\n"),
  logo: "https://www.youtube.com/s/desktop/d743f786/img/favicon_144x144.png",
  resources: ["catalog", "meta", "stream"],
  types: ["series"],
  idPrefixes: ["yt"],
  catalogs: [
    // one catalog per channel to avoid jumbled results
    ...Object.entries(CHANNEL_GROUPS).flatMap(([group, chans]) =>
      chans.map(ch => ({
        type: "series",
        id: `youtube-${group.toLowerCase()}-${ch.id}`,
        name: `YouTube: ${group} – ${ch.name}`
      }))
    )
  ]
};

const builder = new addonBuilder(manifest);

// --- RSS helpers (no API key)

async function fetchUploadsMetasRSS(channelId, maxResults = VIDEOS_PER_CHANNEL) {
  const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
  const r = await fetch(feedUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!r.ok) {
    console.error("[RSS] error", channelId, r.status, r.statusText);
    return [];
  }
  const xml = await r.text();
  const entries = xml.split("<entry>").slice(1);

  const metas = [];
  for (const e of entries.slice(0, Math.min(maxResults, 50))) {
    const vid = (e.match(/<yt:videoId>([^<]+)<\/yt:videoId>/) || [])[1];
    const title = (e.match(/<title>([^<]+)<\/title>/) || [])[1];
    const thumb = (e.match(/media:thumbnail[^>]+url="([^"]+)"/) || [])[1];
    if (!vid) continue;
    metas.push({
      id: `yt:${vid}`,
      type: "series",
      name: title || vid,
      poster: thumb,
      description: "",
      posterShape: "landscape"
    });
  }
  return metas;
}

async function oembed(videoId) {
  const url = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&format=json`;
  const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!r.ok) return null;
  return r.json();
}

// --- Catalog: fetch RSS for the one channel that catalog represents
builder.defineCatalogHandler(async ({ id }) => {
  const m = id.match(/^youtube-(.+?)-([A-Za-z0-9_-]+)$/);
  if (!m) return { metas: [] };
  const [, group] = m;
  const groupKey = Object.keys(CHANNEL_GROUPS).find(g => g.toLowerCase() === group);
  const channel = CHANNEL_GROUPS[groupKey]?.find(c => `youtube-${group.toLowerCase()}-${c.id}` === id);
  if (!channel) return { metas: [] };

  const metas = await fetchUploadsMetasRSS(channel.id, VIDEOS_PER_CHANNEL);
  return { metas };
});

// --- Meta: use oEmbed to fill in a nice title/thumbnail (no API key)
builder.defineMetaHandler(async ({ id }) => {
  const vid = id.replace("yt:", "");
  const oe = await oembed(vid);
  if (!oe) {
    return { meta: {
      id, type: "series",
      name: `YouTube Video ${vid}`,
      posterShape: "landscape",
      videos: [{ id, title: `Video ${vid}`, season: 1, episode: 1 }]
    }};
  }
  return { meta: {
    id, type: "series",
    name: oe.title,
    poster: oe.thumbnail_url,
    background: oe.thumbnail_url,
    description: `${oe.title}\nby ${oe.author_name}`,
    posterShape: "landscape",
    videos: [{ id, title: oe.title, season: 1, episode: 1 }]
  }};
});

// --- Stream: open on YouTube
builder.defineStreamHandler(async ({ id }) => {
  const vid = id.split(":")[1];
  return {
    streams: [{ title: "Open on YouTube", externalUrl: `https://www.youtube.com/watch?v=${vid}` }]
  };
});

// --- Serve via SDK
const port = process.env.PORT || 7000;
serveHTTP(builder.getInterface(), { port });
console.log(`✅ Clean RSS add-on running at http://localhost:${port}/manifest.json`);
