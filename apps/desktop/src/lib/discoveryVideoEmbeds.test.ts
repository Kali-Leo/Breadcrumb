import { describe, expect, it } from "vitest";
import { videoEmbedForUrl } from "./discoveryVideoEmbeds";

describe("videoEmbedForUrl", () => {
  it("turns every shape YouTube links with into the same embed address", () => {
    const expected = "https://www.youtube.com/embed/dQw4w9WgXcQ";
    const links = [
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s",
      "https://m.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://youtu.be/dQw4w9WgXcQ",
      "https://youtu.be/dQw4w9WgXcQ?si=abc",
      "https://www.youtube.com/embed/dQw4w9WgXcQ",
      "https://www.youtube.com/shorts/dQw4w9WgXcQ",
      "https://www.youtube.com/live/dQw4w9WgXcQ",
    ];
    for (const link of links) {
      expect(videoEmbedForUrl(link), link).toMatchObject({
        provider: "youtube",
        embedUrl: expected,
      });
    }
  });

  it("refuses YouTube links that carry no video id", () => {
    const links = [
      "https://www.youtube.com/",
      "https://www.youtube.com/@someChannel",
      "https://www.youtube.com/playlist?list=PL1234567890",
      "https://www.youtube.com/watch?v=tooShort",
      "https://www.youtube.com/embed/not+a+valid+id",
    ];
    for (const link of links) expect(videoEmbedForUrl(link), link).toBeNull();
  });

  it("turns bilibili video links into the official player page", () => {
    for (const link of [
      "https://www.bilibili.com/video/BV1GJ411x7h7",
      "https://www.bilibili.com/video/BV1GJ411x7h7/?spm_id_from=333.1007",
      "https://m.bilibili.com/video/BV1GJ411x7h7",
      "https://player.bilibili.com/player.html?bvid=BV1GJ411x7h7",
    ]) {
      expect(videoEmbedForUrl(link), link).toMatchObject({
        provider: "bilibili",
        embedUrl: "https://player.bilibili.com/player.html?bvid=BV1GJ411x7h7",
      });
    }
  });

  it("refuses bilibili links that are not a video", () => {
    for (const link of [
      "https://www.bilibili.com/",
      "https://space.bilibili.com/123456",
      "https://www.bilibili.com/video/av170001",
      "https://b23.tv/abcdef",
    ]) {
      expect(videoEmbedForUrl(link), link).toBeNull();
    }
  });

  it("has nothing to offer for other hosts, junk, or a missing address", () => {
    expect(videoEmbedForUrl("https://vimeo.com/12345")).toBeNull();
    expect(videoEmbedForUrl("not a url")).toBeNull();
    expect(videoEmbedForUrl("javascript:alert(1)")).toBeNull();
    expect(videoEmbedForUrl(null)).toBeNull();
  });

  it("never lets a link's own text into the embed address", () => {
    const embed = videoEmbedForUrl(
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ&next=https://evil.example.com",
    );
    expect(embed?.embedUrl).toBe("https://www.youtube.com/embed/dQw4w9WgXcQ");
  });
});
