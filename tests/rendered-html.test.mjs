import assert from "node:assert/strict";
import test from "node:test";

let cachedWorker;

async function productionWorker() {
  if (cachedWorker) return cachedWorker;
  // 1. Import the production worker exactly as the hosting runtime will.
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  cachedWorker = worker;
  return worker;
}

async function render(url = "http://localhost/") {
  const worker = await productionWorker();
  return worker.fetch(new Request(url, { headers: { accept: "text/html" } }), { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });
}

test("server-renders the Hirova public marketplace", async () => {
  // 2. Supabase-enabled builds verify the session before showing the login methods.
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>Hirova — Get hired smarter\.<\/title>/i);
  assert.match(html, /Preparing your workspace|Hirova/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("redirects www traffic to the canonical Hirova domain", async () => {
  // 3. Preserve the complete path and query while consolidating SEO signals.
  const response = await render("https://www.hirova.in/jobs?role=designer");
  assert.equal(response.status, 308);
  assert.equal(response.headers.get("location"), "https://hirova.in/jobs?role=designer");
});
