/**
 * Purpose: turn a video item's own address into the address of its publisher's official embed
 * player (spec 053 §7) — YouTube's /embed/ page and bilibili's player.html. Only the two
 * providers the spec names are recognized; every other video link returns null and the reader
 * falls back to the article path, which ends at "在浏览器打开". No request is made here: both
 * embed addresses are derivable from the link itself.
 * Main exports: videoEmbedForUrl, VideoEmbed.
 */

export interface VideoEmbed {
  provider: "youtube" | "bilibili";
  /** The publisher's own player page, ready to drop into an iframe src. */
  embedUrl: string;
  /** Shown to assistive technology in place of the frame's contents. */
  title: string;
}

/** YouTube video ids are exactly 11 characters of the URL-safe alphabet. Checking the shape
 * keeps a mis-parsed path segment (a channel name, "playlist", …) out of the player. */
const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const BILIBILI_ID_PATTERN = /^BV[A-Za-z0-9]{8,}$/;

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
  "www.youtu.be",
]);

const BILIBILI_HOSTS = new Set([
  "bilibili.com",
  "www.bilibili.com",
  "m.bilibili.com",
  "player.bilibili.com",
]);

function parseUrl(raw: string): URL | null {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

/** Path shapes YouTube itself links with: /watch?v=, youtu.be/<id>, /embed/<id>, /shorts/<id>,
 * /live/<id>. */
function youtubeVideoId(url: URL): string | null {
  const queryId = url.searchParams.get("v");
  if (queryId !== null && YOUTUBE_ID_PATTERN.test(queryId)) return queryId;
  const segments = url.pathname.split("/").filter((segment) => segment.length > 0);
  if (segments.length === 1 && url.hostname.endsWith("youtu.be")) {
    return YOUTUBE_ID_PATTERN.test(segments[0] ?? "") ? (segments[0] ?? null) : null;
  }
  const [first, second] = segments;
  if (first === undefined || second === undefined) return null;
  if (first !== "embed" && first !== "shorts" && first !== "live" && first !== "v") return null;
  return YOUTUBE_ID_PATTERN.test(second) ? second : null;
}

/** bilibili links carry the id in the path (/video/BV…) or, for the player page itself, in the
 * bvid query parameter. */
function bilibiliVideoId(url: URL): string | null {
  const queryId = url.searchParams.get("bvid");
  if (queryId !== null && BILIBILI_ID_PATTERN.test(queryId)) return queryId;
  const segments = url.pathname.split("/").filter((segment) => segment.length > 0);
  const videoIndex = segments.indexOf("video");
  const candidate = videoIndex >= 0 ? segments[videoIndex + 1] : undefined;
  if (candidate === undefined) return null;
  return BILIBILI_ID_PATTERN.test(candidate) ? candidate : null;
}

export function videoEmbedForUrl(rawUrl: string | null): VideoEmbed | null {
  if (rawUrl === null) return null;
  const url = parseUrl(rawUrl);
  if (url === null || (url.protocol !== "https:" && url.protocol !== "http:")) return null;

  if (YOUTUBE_HOSTS.has(url.hostname)) {
    const videoId = youtubeVideoId(url);
    if (videoId === null) return null;
    return {
      provider: "youtube",
      embedUrl: `https://www.youtube.com/embed/${videoId}`,
      title: "YouTube 播放器",
    };
  }

  if (BILIBILI_HOSTS.has(url.hostname)) {
    const videoId = bilibiliVideoId(url);
    if (videoId === null) return null;
    return {
      provider: "bilibili",
      embedUrl: `https://player.bilibili.com/player.html?bvid=${videoId}`,
      title: "哔哩哔哩播放器",
    };
  }

  return null;
}
