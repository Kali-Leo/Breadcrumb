/**
 * Purpose: tests for podcast discovery through iTunes Search against payloads shaped like the live
 * API's — that a show search yields feed addresses the generic adapter can then poll, that an
 * episode search yields playable candidates with the show notes intact, and that results missing
 * the parts that make them usable are dropped rather than shown as blanks.
 */
import { describe, expect, it } from "vitest";
import {
  buildItunesSearchUrl,
  searchPodcastEpisodes,
  searchPodcastShows,
} from "./podcastSearchAdapter";
import { fakeChannelSource, fakeFetchContext } from "./testDoubles";

const observedAt = new Date("2026-08-17T12:00:00.000Z");

const source = fakeChannelSource({
  id: "podcast-search",
  adapterType: "podcast-search",
  endpoint: { feedUrl: "https://itunes.apple.com/search" },
  defaultKind: "podcast",
});

const showResults = JSON.stringify({
  resultCount: 2,
  results: [
    {
      wrapperType: "track",
      kind: "podcast",
      collectionName: "The Climate Question",
      artistName: "BBC World Service",
      feedUrl: "https://podcasts.files.bbci.co.uk/w13xtvb6.rss",
      trackViewUrl: "https://podcasts.apple.com/us/podcast/the-climate-question/id1234",
      artworkUrl600: "https://is1-ssl.mzstatic.com/image/thumb/600.jpg",
    },
    { wrapperType: "track", collectionName: "A show with no feed", artistName: "Nobody" },
  ],
});

const episodeResults = JSON.stringify({
  resultCount: 2,
  results: [
    {
      wrapperType: "podcastEpisode",
      kind: "podcast-episode",
      trackId: 1000774569017,
      trackName: '"Super" El Niños and climate change',
      collectionName: "The Climate Question",
      feedUrl: "https://podcasts.files.bbci.co.uk/w13xtvb6.rss",
      trackViewUrl: "https://podcasts.apple.com/us/podcast/super-el-ninos/id1234",
      episodeUrl: "https://open.live.bbc.co.uk/mediaselector/audio.mp3",
      episodeGuid: "urn:bbc:podcast:w3ct99hn",
      description: "<p>Scientists say the El Ni&#241;o pattern has started.</p>",
      artworkUrl600: "https://is1-ssl.mzstatic.com/image/thumb/600.jpg",
      releaseDate: "2026-06-28T13:00:00Z",
    },
    { wrapperType: "podcastEpisode", trackName: "An episode with nowhere to play" },
  ],
});

describe("buildItunesSearchUrl", () => {
  it("asks for podcasts, in the entity the caller needs", () => {
    expect(buildItunesSearchUrl(source, "climate", "podcast", { limit: 5 })).toBe(
      "https://itunes.apple.com/search?media=podcast&entity=podcast&term=climate&limit=5",
    );
    expect(buildItunesSearchUrl(source, "climate", "podcastEpisode", { country: "CN" })).toContain(
      "&country=CN",
    );
  });
});

describe("searchPodcastShows", () => {
  it("returns the feed addresses that make a show subscribable", async () => {
    const url = buildItunesSearchUrl(source, "climate", "podcast");
    const { context } = fakeFetchContext({ [url]: showResults });
    const shows = await searchPodcastShows("climate", source, context);

    expect(shows).toHaveLength(1);
    expect(shows[0]?.feedUrl).toBe("https://podcasts.files.bbci.co.uk/w13xtvb6.rss");
    expect(shows[0]?.showName).toBe("The Climate Question");
    expect(shows[0]?.artworkUrl).toBe("https://is1-ssl.mzstatic.com/image/thumb/600.jpg");
  });

  it("comes back empty for a blank term and when iTunes is unreachable", async () => {
    const { context, requests } = fakeFetchContext({});
    expect(await searchPodcastShows("  ", source, context)).toEqual([]);
    expect(requests).toEqual([]);
    expect(await searchPodcastShows("climate", source, context)).toEqual([]);
  });
});

describe("searchPodcastEpisodes", () => {
  it("builds playable candidates with the show notes and the artwork", async () => {
    const url = buildItunesSearchUrl(source, "climate", "podcastEpisode");
    const { context } = fakeFetchContext({ [url]: episodeResults });
    const items = await searchPodcastEpisodes("climate", source, context, { observedAt });

    expect(items).toHaveLength(1);
    expect(items[0]?.id).toBe("podcast-search:urn:bbc:podcast:w3ct99hn");
    expect(items[0]?.kind).toBe("podcast");
    expect(items[0]?.url).toBe("https://open.live.bbc.co.uk/mediaselector/audio.mp3");
    expect(items[0]?.summary).toBe("Scientists say the El Niño pattern has started.");
    expect(items[0]?.author).toBe("The Climate Question");
    expect(items[0]?.coverUrl).toBe("https://is1-ssl.mzstatic.com/image/thumb/600.jpg");
    expect(items[0]?.publishedAt).toBe("2026-06-28T13:00:00.000Z");
    expect(items[0]?.upstreamSignal).toBeNull();
  });
});
