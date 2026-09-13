/**
 * Purpose: the two response headers that let this page use more than one processor core.
 *
 * WebAssembly threads need SharedArrayBuffer, and a browser only hands out SharedArrayBuffer
 * to a document that is cross-origin isolated — which means the document was served with
 * Cross-Origin-Opener-Policy and Cross-Origin-Embedder-Policy. A static host (GitHub Pages)
 * sends neither and cannot be told to. A service worker can add them on the way past, which is
 * the standard workaround, and the difference it makes is not marginal: on one thread,
 * indexing a book is measured in tens of minutes.
 *
 * This is imported by the app's own service worker (vite.pwa.ts, workbox.importScripts) rather
 * than registered as a second worker of its own. Two service workers on one scope is a race
 * over who answers a request, and the loser's caching simply stops happening.
 *
 * TWO kinds of request are intercepted, and the second one is not optional. An isolated
 * document may only start a dedicated worker whose *own script response* also carries
 * Cross-Origin-Embedder-Policy — same origin is not enough. Headers on the navigation alone
 * therefore isolate the page and then block every worker in it: measured on the real build,
 * the SQLite worker failed with ERR_BLOCKED_BY_RESPONSE and the app came up with no database
 * at all. Nothing announces this; the page simply has no data.
 *
 * Everything else falls through untouched to the Workbox routes that follow, so the font,
 * language-pack and model caches behave exactly as they did.
 *
 * Plain JavaScript, no build step: this file is published verbatim from public/.
 */

const SHELL = new URL("index.html", self.location).href;
const WORKER_DESTINATIONS = new Set(["worker", "sharedworker"]);

/** Same headers on both kinds of response — one policy, stated once. */
function isolated(response) {
	// A redirect for a navigation cannot be rebuilt (the browser needs the original to follow
	// it) and carries no document to isolate anyway.
	if (response.type === "opaqueredirect" || response.redirected)
		return response;
	const headers = new Headers(response.headers);
	headers.set("Cross-Origin-Opener-Policy", "same-origin");
	// require-corp rather than credentialless: credentialless is the friendlier of the two for
	// third-party images, and Safari does not implement it — which on an iPad is the whole
	// browser. The cover images this app loads from other origins carry crossorigin="anonymous"
	// so that they are fetched with CORS and satisfy require-corp on every browser instead.
	headers.set("Cross-Origin-Embedder-Policy", "require-corp");
	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
}

/** Network first, then the precached shell — a navigation has to work offline. */
async function navigation(request) {
	try {
		return isolated(await fetch(request));
	} catch {
		const shell = await caches.match(SHELL, { ignoreSearch: true });
		return shell === undefined
			? new Response("offline", { status: 503, statusText: "offline" })
			: isolated(shell);
	}
}

/** Cache first, because every worker script this app starts is a precached, content-hashed
 * asset: going to the network for it would undo the precache for exactly the files an offline
 * launch needs earliest. */
async function workerScript(request) {
	const cached = await caches.match(request, { ignoreSearch: true });
	return isolated(cached ?? (await fetch(request)));
}

self.addEventListener("fetch", (event) => {
	const { request } = event;
	if (request.mode === "navigate") {
		event.respondWith(navigation(request));
		return;
	}
	if (WORKER_DESTINATIONS.has(request.destination)) {
		event.respondWith(workerScript(request));
	}
});
