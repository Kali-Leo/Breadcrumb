/**
 * Purpose: unit tests for the feed text repairs, including the cases that decide whether junk
 * reaches a card: script bodies inside descriptions, non-http link schemes, unreadable dates, and
 * truncated documents of each XML feed family.
 */
import { describe, expect, it } from "vitest";
import {
  firstNonEmptyText,
  repairTruncatedFeed,
  resolveAbsoluteUrl,
  stripHtmlToPlainText,
  toIsoInstant,
} from "./feedText";

describe("stripHtmlToPlainText", () => {
  it("drops script and style bodies rather than reading them out", () => {
    expect(stripHtmlToPlainText("<p>Real</p><script>alert(1)</script>")).toBe("Real");
    expect(stripHtmlToPlainText("<style>.a{color:red}</style><p>Real</p>")).toBe("Real");
  });

  it("keeps words apart across block tags and collapses whitespace", () => {
    expect(stripHtmlToPlainText("<li>one</li><li>two</li>")).toBe("one two");
    expect(stripHtmlToPlainText("a<br/>b")).toBe("a b");
    expect(stripHtmlToPlainText("  spaced   \n out ")).toBe("spaced out");
  });

  it("returns an empty string for null and undefined", () => {
    expect(stripHtmlToPlainText(null)).toBe("");
    expect(stripHtmlToPlainText(undefined)).toBe("");
  });
});

describe("resolveAbsoluteUrl", () => {
  it("resolves relative links against the feed address", () => {
    expect(resolveAbsoluteUrl("/a/b", "https://example.com/feed.xml")).toBe(
      "https://example.com/a/b",
    );
  });

  it("refuses schemes a reader must never be sent to", () => {
    expect(resolveAbsoluteUrl("javascript:alert(1)", "https://example.com/feed.xml")).toBeNull();
    expect(resolveAbsoluteUrl("data:text/html,hi", "https://example.com/feed.xml")).toBeNull();
  });

  it("returns null for empty and unparseable values", () => {
    expect(resolveAbsoluteUrl("   ", "https://example.com/feed.xml")).toBeNull();
    expect(resolveAbsoluteUrl("http://", "https://example.com/feed.xml")).toBeNull();
  });
});

describe("toIsoInstant", () => {
  it("reads RFC 822 and RFC 3339 alike", () => {
    expect(toIsoInstant("Sat, 16 Aug 2026 08:30:00 GMT")).toBe("2026-08-16T08:30:00.000Z");
    expect(toIsoInstant("2026-08-16T08:30:00Z")).toBe("2026-08-16T08:30:00.000Z");
  });

  it("returns null for junk and for nothing", () => {
    expect(toIsoInstant("last tuesday")).toBeNull();
    expect(toIsoInstant(null)).toBeNull();
  });
});

describe("repairTruncatedFeed", () => {
  it("closes an RSS document after the last complete item", () => {
    const repaired = repairTruncatedFeed("<rss><channel><item>a</item><item>b");
    expect(repaired).toBe("<rss><channel><item>a</item></channel></rss>");
  });

  it("closes an Atom document after the last complete entry", () => {
    const repaired = repairTruncatedFeed('<feed xmlns="x"><entry>a</entry><entry>b');
    expect(repaired).toBe('<feed xmlns="x"><entry>a</entry></feed>');
  });

  it("closes an RDF document after the last complete item", () => {
    const repaired = repairTruncatedFeed("<rdf:RDF><channel/><item>a</item><item>b");
    expect(repaired).toBe("<rdf:RDF><channel/><item>a</item></rdf:RDF>");
  });

  it("gives up when nothing complete arrived or the payload is not XML", () => {
    expect(repairTruncatedFeed("<rss><channel><item>hal")).toBeNull();
    expect(repairTruncatedFeed('{"items":[{"id":"1"')).toBeNull();
  });
});

describe("firstNonEmptyText", () => {
  it("skips blanks and returns the first real value", () => {
    expect(firstNonEmptyText(null, "  ", undefined, " kept ", "later")).toBe("kept");
    expect(firstNonEmptyText(null, undefined)).toBeNull();
  });
});
