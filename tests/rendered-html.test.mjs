import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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

test("keeps application links behind authentication", async () => {
  // 4. The public UI never renders an outbound application URL.
  const portal = await readFile(new URL("../app/public-portal.tsx", import.meta.url), "utf8");
  assert.match(portal, /Sign in to apply/);
  assert.doesNotMatch(portal, /href=\{selected\.sourceUrl\}/);

  // 5. The database boundary also removes source_url and revokes anonymous table access.
  const migration = await readFile(new URL("../supabase/migrations/20260820094500_gate_application_links_and_local_search.sql", import.meta.url), "utf8");
  assert.match(migration, /revoke select on public\.job_market from anon/i);
  assert.match(migration, /to_jsonb\(p\) - 'search_document' - 'source_url'/i);
  assert.match(migration, /search_public_job_market/i);

  const hardening = await readFile(new URL("../supabase/migrations/20260820103000_harden_public_job_search_permissions.sql", import.meta.url), "utf8");
  assert.match(hardening, /security invoker/i);
  assert.doesNotMatch(hardening.match(/grant select \([\s\S]*?\) on public\.job_market to anon/i)?.[0] || "", /source_url/i);
});

test("loads India-first jobs from local employer boards", async () => {
  // 6. Public discovery starts in India and the scheduled sync includes India-focused sources.
  const portal = await readFile(new URL("../app/public-portal.tsx", import.meta.url), "utf8");
  const sync = await readFile(new URL("../supabase/functions/sync-jobs/index.ts", import.meta.url), "utf8");
  assert.match(portal, /useState\("India"\)/);
  for (const token of ["acceldata", "saviynt", "100ms", "neuron7", "fampay", "hevodata", "gushwork", "paytm"]) assert.match(sync, new RegExp(`"${token}"`));
});
