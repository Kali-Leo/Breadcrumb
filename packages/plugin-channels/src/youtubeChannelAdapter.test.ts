/**
 * Purpose: tests for the YouTube adapter against a channel feed shaped like the live one — that
 * the media:group thumbnail really does become the cover (the feed carries no Atom summary or
 * enclosure, so the mapping had to learn media:description too), that videos come out as videos,
 * and that oEmbed fills in title, channel and cover for a bare video address.
 */
import { describe, expect, it } from "vitest";
import { fakeChannelSource, fakeFetchContext } from "./testDoubles";
import {
  buildYoutubeChannelFeedUrl,
  buildYoutubeOEmbedUrl,
  fetchYoutubeChannelSource,
  fetchYoutubeOEmbed,
} from "./youtubeChannelAdapter";

const observedAt = new Date("2026-08-17T12:00:00.000Z");

const channelFeed = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015"
      xmlns:media="http://search.yahoo.com/mrss/"
      xmlns="http://www.w3.org/2005/Atom">
  <link rel="alternate" href="https://www.youtube.com/channel/UCsample"/>
  <id>yt:channel:UCsample</id>
  <title>Example Channel</title>
  <author><name>Example Channel</name><uri>https://www.youtube.com/channel/UCsample</uri></author>
  <entry>
    <id>yt:video:VIDEOID1</id>
    <yt:videoId>VIDEOID1</yt:videoId>
    <title>How memory palaces work</title>
    <link rel="alternate" href="https://www.youtube.com/watch?v=VIDEOID1"/>
    <author><name>Example Channel</name></author>
    <published>2026-08-16T12:00:00+00:00</published>
    <updated>2026-08-16T13:00:00+00:00</updated>
    <media:group>
      <media:title>How memory palaces work</media:title>
      <media:content url="https://www.youtube.com/v/VIDEOID1?version=3" type="application/x-shockwave-flash"/>
      <media:thumbnail url="https://i4.ytimg.com/vi/VIDEOID1/hqdefault.jpg" width="480" height="360"/>
      <media:description>A walk through the method of loci.</media:description>
    </media:group>
  </entry>
</feed>`;

const feedUrl = buildYoutubeChannelFeedUrl("UCsample");

const source = fakeChannelSource({
  id: "youtube-example",
  adapterType: "youtube-channel",
  endpoint: { feedUrl },
  defaultKind: "video",
});

describe("buildYoutubeChannelFeedUrl", () => {
  it("uses the public channel feed address", () => {
    expect(feedUrl).toBe("https://www.youtube.com/feeds/videos.xml?channel_id=UCsample");
  });
});

describe("fetchYoutubeChannelSource", () => {
  it("maps the media:group thumbnail to the cover and the description to the summary", async () => {
    const { context } = fakeFetchContext({ [feedUrl]: channelFeed });
    const result = await fetchYoutubeChannelSource(source, context, observedAt);
    const [video] = result.items;

    expect(video?.kind).toBe("video");
    expect(video?.coverUrl).toBe("https://i4.ytimg.com/vi/VIDEOID1/hqdefault.jpg");
    expect(video?.summary).toBe("A walk through the method of loci.");
    expect(video?.title).toBe("How memory palaces work");
    expect(video?.url).toBe("https://www.youtube.com/watch?v=VIDEOID1");
    expect(video?.author).toBe("Example Channel");
    expect(video?.publishedAt).toBe("2026-08-16T12:00:00.000Z");
  });
});

describe("fetchYoutubeOEmbed", () => {
  const videoUrl = "https://www.youtube.com/watch?v=VIDEOID1";
  const oembedUrl = buildYoutubeOEmbedUrl(videoUrl);

  it("asks the documented address for JSON", () => {
    expect(oembedUrl).toBe(
      "https://www.youtube.com/oembed?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DVIDEOID1&format=json",
    );
  });

  it("fills in title, channel and cover for an address we know nothing else about", async () => {
    const { context, requests } = fakeFetchContext({
      [oembedUrl]: JSON.stringify({
        title: "How memory palaces work",
        author_name: "Example Channel",
        author_url: "https://www.youtube.com/channel/UCsample",
        thumbnail_url: "https://i.ytimg.com/vi/VIDEOID1/hqdefault.jpg",
        provider_name: "YouTube",
      }),
    });
    const preview = await fetchYoutubeOEmbed(videoUrl, context);

    expect(preview?.title).toBe("How memory palaces work");
    expect(preview?.channelName).toBe("Example Channel");
    expect(preview?.thumbnailUrl).toBe("https://i.ytimg.com/vi/VIDEOID1/hqdefault.jpg");
    expect(requests[0]?.accept).toContain("application/json");
  });

  it("returns null for a video that is gone or a body that is not oEmbed", async () => {
    expect(await fetchYoutubeOEmbed(videoUrl, fakeFetchContext({}).context)).toBeNull();
    expect(
      await fetchYoutubeOEmbed(videoUrl, fakeFetchContext({ [oembedUrl]: "<html>" }).context),
    ).toBeNull();
  });
});
