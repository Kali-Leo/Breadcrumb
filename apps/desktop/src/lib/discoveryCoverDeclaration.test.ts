/**
 * Purpose: unit tests for the page-head side of cover enrichment — which declaration a head is
 * read as the page's picture (present, absent, relative, protocol-relative, malformed, and the
 * ones that are not pictures at all), and that the head read stops where it promises to: at the
 * closing tag, or at the byte ceiling on a page that never closes it.
 */
import { describe, expect, it } from "vitest";
import {
  HEAD_READ_CAP_BYTES,
  readCoverDeclaration,
  readHeadSection,
} from "./discoveryCoverDeclaration";

const PAGE = "https://blog.example/posts/2026/closures";

function head(...tags: string[]): string {
  return `<!doctype html><html><head><title>标题</title>${tags.join("")}</head>`;
}

describe("readCoverDeclaration", () => {
  it("takes the og:image a page declares", () => {
    const html = head(`<meta property="og:image" content="https://cdn.example/a.png">`);
    expect(readCoverDeclaration(html, PAGE)).toBe("https://cdn.example/a.png");
  });

  it("says nothing when the head declares no picture", () => {
    const html = head(`<meta name="description" content="一篇讲闭包的文章">`);
    expect(readCoverDeclaration(html, PAGE)).toBeNull();
  });

  it("resolves a relative address against the page it was declared on", () => {
    const html = head(`<meta property="og:image" content="/static/cover.jpg">`);
    expect(readCoverDeclaration(html, PAGE)).toBe("https://blog.example/static/cover.jpg");
  });

  it("resolves a protocol-relative address to the page's own scheme", () => {
    const html = head(`<meta property="og:image" content="//cdn.example/a.png">`);
    expect(readCoverDeclaration(html, PAGE)).toBe("https://cdn.example/a.png");
  });

  it("reads og:image:secure_url and twitter:image too", () => {
    expect(
      readCoverDeclaration(head(`<meta property="og:image:secure_url" content="/s.png">`), PAGE),
    ).toBe("https://blog.example/s.png");
    expect(readCoverDeclaration(head(`<meta name="twitter:image" content="/t.png">`), PAGE)).toBe(
      "https://blog.example/t.png",
    );
  });

  it("skips a declaration it cannot use and keeps looking", () => {
    const html = head(
      `<meta property="og:image" content="">`,
      `<meta property="og:image" content="   ">`,
      `<meta name="twitter:image" content="https://cdn.example/t.png">`,
    );
    expect(readCoverDeclaration(html, PAGE)).toBe("https://cdn.example/t.png");
  });

  it("refuses an address that is not a picture anybody should load", () => {
    expect(
      readCoverDeclaration(head(`<meta property="og:image" content="javascript:alert(1)">`), PAGE),
    ).toBeNull();
    expect(
      readCoverDeclaration(
        head(`<meta property="og:image" content="data:image/png;base64,AA">`),
        PAGE,
      ),
    ).toBeNull();
  });

  it("survives markup written by hand: single quotes, no quotes, attributes reversed", () => {
    expect(readCoverDeclaration(head(`<meta property='og:image' content='/a.png'>`), PAGE)).toBe(
      "https://blog.example/a.png",
    );
    expect(readCoverDeclaration(head(`<meta property=og:image content=/b.png>`), PAGE)).toBe(
      "https://blog.example/b.png",
    );
    expect(readCoverDeclaration(head(`<meta content="/c.png" property="OG:IMAGE" />`), PAGE)).toBe(
      "https://blog.example/c.png",
    );
  });

  it("returns nothing for a page that is not markup at all", () => {
    expect(readCoverDeclaration("", PAGE)).toBeNull();
    expect(readCoverDeclaration('{"error":"forbidden"}', PAGE)).toBeNull();
    expect(readCoverDeclaration('<meta property="og:image"', PAGE)).toBeNull();
  });
});

describe("readHeadSection", () => {
  it("stops at the closing head tag and never reads the body's meta tags", async () => {
    const page = `${head(`<meta property="og:image" content="/head.png">`)}<body><meta property="og:image" content="/body.png"></body></html>`;
    const section = await readHeadSection(new Response(page));
    expect(section).not.toContain("body.png");
    expect(readCoverDeclaration(section, PAGE)).toBe("https://blog.example/head.png");
  });

  it("stops at the byte ceiling on a page that never closes its head", async () => {
    const endless = `<html><head>${"<!-- padding -->".repeat(40_000)}`;
    expect(endless.length).toBeGreaterThan(HEAD_READ_CAP_BYTES * 2);
    const section = await readHeadSection(new Response(endless));
    expect(section.length).toBeLessThanOrEqual(HEAD_READ_CAP_BYTES);
  });

  it("reads a page served without a stream", async () => {
    const response = new Response(head(`<meta property="og:image" content="/a.png">`));
    Object.defineProperty(response, "body", { value: null });
    expect(readCoverDeclaration(await readHeadSection(response), PAGE)).toBe(
      "https://blog.example/a.png",
    );
  });
});
