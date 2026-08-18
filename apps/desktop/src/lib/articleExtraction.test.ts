// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { type ArticleExtractionDependencies, extractArticleAt } from "./articleExtraction";

type FetchImpl = ArticleExtractionDependencies["fetchImpl"];

const ARTICLE_HTML = `<!doctype html>
<html><head><title>为什么闭包能记住变量</title><meta name="author" content="张三"></head>
<body>
  <nav><a href="/">首页</a><a href="/about">关于</a></nav>
  <article>
    <h1>为什么闭包能记住变量</h1>
    <p>一个函数被创建的时候，它会把自己所在的那一层作用域一起带走，这就是闭包最朴素的解释，也是它能记住变量的原因。</p>
    <p>换句话说，闭包不是一种特殊语法，而是函数和它出生环境之间那条一直没有断掉的连接，只要函数还在，环境就还在。</p>
    <p>后面还有一段用来凑够正文的字数，让抽取器确信这一块是真正的文章内容，而不是页面上的导航或者广告。</p>
    <p>See <a href="/next">the next part</a>.</p>
  </article>
  <footer>版权所有</footer>
</body></html>`;

function respondWith(
  body: string,
  init: { status?: number; contentType?: string | null; contentLength?: string } = {},
) {
  const headers = new Headers();
  if (init.contentType !== null)
    headers.set("content-type", init.contentType ?? "text/html; charset=utf-8");
  if (init.contentLength !== undefined) headers.set("content-length", init.contentLength);
  return new Response(body, { status: init.status ?? 200, headers });
}

function fetchReturning(response: Response): FetchImpl {
  return vi.fn(async () => response) as unknown as FetchImpl;
}

describe("extractArticleAt", () => {
  it("keeps the article text and drops the navigation and footer", async () => {
    const result = await extractArticleAt("https://example.com/posts/closures", {
      fetchImpl: fetchReturning(respondWith(ARTICLE_HTML)),
    });
    expect(result.kind).toBe("extracted");
    if (result.kind !== "extracted") return;
    expect(result.markdown).toContain("闭包最朴素的解释");
    expect(result.markdown).not.toContain("版权所有");
    expect(result.markdown).not.toContain("首页");
    expect(result.title).toBe("为什么闭包能记住变量");
    expect(result.author).toBe("张三");
  });

  it("resolves the page's own relative links against its address", async () => {
    const result = await extractArticleAt("https://example.com/posts/closures", {
      fetchImpl: fetchReturning(respondWith(ARTICLE_HTML)),
    });
    if (result.kind !== "extracted") throw new Error("expected an extracted article");
    expect(result.markdown).toContain("https://example.com/next");
  });

  it("gives up when the site refuses the request", async () => {
    const result = await extractArticleAt("https://example.com/posts/closures", {
      fetchImpl: fetchReturning(respondWith("nope", { status: 403 })),
    });
    expect(result.kind).toBe("failed");
  });

  it("gives up when the address is not a web page", async () => {
    const result = await extractArticleAt("https://example.com/file.pdf", {
      fetchImpl: fetchReturning(respondWith("%PDF-1.7", { contentType: "application/pdf" })),
    });
    expect(result.kind).toBe("failed");
  });

  it("gives up before downloading a page that announces itself as huge", async () => {
    const result = await extractArticleAt("https://example.com/huge", {
      fetchImpl: fetchReturning(respondWith(ARTICLE_HTML, { contentLength: "9000000" })),
    });
    expect(result.kind).toBe("failed");
  });

  it("gives up when the page holds nothing worth opening a reader for", async () => {
    const thin = "<html><body><div>登录后继续</div></body></html>";
    const result = await extractArticleAt("https://example.com/wall", {
      fetchImpl: fetchReturning(respondWith(thin)),
    });
    expect(result.kind).toBe("failed");
  });

  it("gives up quietly when the site cannot be reached at all", async () => {
    const failing = vi.fn(async () => {
      throw new Error("network unreachable");
    }) as unknown as FetchImpl;
    const result = await extractArticleAt("https://unreachable.example", { fetchImpl: failing });
    expect(result.kind).toBe("failed");
  });
});

/**
 * FIXED (2026-08-17, spec 053 T10b). Defuddle works the page's domain out of the page's own
 * og:url / canonical declaration when the document carries no address of its own — which a
 * DOMParser document never does — and warns to the console when that declaration is relative.
 * The URL option we pass does not reach its metadata extractor, and Document.location cannot be
 * given one, so every article the reader opened wrote those lines into the console and the dev
 * overlay mirrored them as failures. They are dropped around the parse call and nothing else is.
 */
describe("extractArticleAt and Defuddle's console", () => {
  const PAGE_WITH_RELATIVE_CANONICAL = ARTICLE_HTML.replace(
    '<meta name="author" content="张三">',
    '<meta name="author" content="张三"><link rel="canonical" href="/posts/closures">',
  );

  it("says nothing about a page whose canonical address is relative", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await extractArticleAt("https://example.com/posts/closures", {
      fetchImpl: fetchReturning(respondWith(PAGE_WITH_RELATIVE_CANONICAL)),
    });
    expect(result.kind).toBe("extracted");
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("leaves the console alone the moment the parse is over", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await extractArticleAt("https://example.com/posts/closures", {
      fetchImpl: fetchReturning(respondWith(PAGE_WITH_RELATIVE_CANONICAL)),
    });
    // Anything else, from anyone else, still reaches the console — including a line that only
    // starts like the one we drop.
    console.warn("Failed to parse URL: something of ours");
    console.warn("Defuddle: Failed to process stylesheet:", new Error("x"));
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
});

/**
 * FIXED (2026-08-17, spec 053 T10). The request carried `AbortSignal.timeout(20_000)`, which
 * stays armed for its full twenty seconds however the request ended. Tauri's HTTP plugin frees a
 * request's resource as soon as its body is read, so the late abort reached a freed id and came
 * back as a rejection nobody was waiting on: every article the reader opened put an unhandled
 * rejection in the console twenty seconds after it had finished loading.
 */
describe("extractArticleAt after it has finished", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  /** A fetch that records how many cancellable timers were pending while it was in flight. */
  function recordingFetch(response: Response) {
    const seen = { signals: [] as AbortSignal[], timersInFlight: [] as number[] };
    const fetchImpl = vi.fn(async (_url: string, init: { signal: AbortSignal }) => {
      seen.signals.push(init.signal);
      seen.timersInFlight.push(vi.getTimerCount());
      return response;
    }) as unknown as FetchImpl;
    return { fetchImpl, seen };
  }

  it("arms a timer for the request and disarms it the moment the page is read", async () => {
    vi.useFakeTimers();
    const { fetchImpl, seen } = recordingFetch(respondWith(ARTICLE_HTML));

    const result = await extractArticleAt("https://example.com/posts/closures", { fetchImpl });
    expect(result.kind).toBe("extracted");

    // One clearable timer while the request was open — AbortSignal.timeout, which is what this
    // used to arm, is not clearable and would show none here.
    expect(seen.timersInFlight).toEqual([1]);
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(seen.signals[0]?.aborted).toBe(false);
  });

  it("disarms the timer on a page it refused as well", async () => {
    vi.useFakeTimers();
    const { fetchImpl, seen } = recordingFetch(
      respondWith("%PDF-1.7", { contentType: "application/pdf" }),
    );
    const result = await extractArticleAt("https://example.com/file.pdf", { fetchImpl });
    expect(result.kind).toBe("failed");
    expect(seen.timersInFlight).toEqual([1]);
    expect(vi.getTimerCount()).toBe(0);
  });
});
