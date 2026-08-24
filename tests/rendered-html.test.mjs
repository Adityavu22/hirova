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

  const generatedHost = await render("https://orbit-career-copilot-aditya.sheebu-shivam.chatgpt.site/profile?tab=resume");
  assert.equal(generatedHost.status, 308);
  assert.equal(generatedHost.headers.get("location"), "https://hirova.in/profile?tab=resume");
});

test("keeps application links behind authentication", async () => {
  // 4. The public UI never renders an outbound application URL.
  const portal = await readFile(new URL("../app/public-portal.tsx", import.meta.url), "utf8");
  assert.match(portal, /Log in to apply/);
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
  for (const token of ["acceldata", "saviynt", "100ms", "neuron7", "fampay", "hevodata", "gushwork", "paytm", "meesho", "cred", "porter", "slice", "inmobi", "spotdraft", "sarvam", "kraftonindia", "sigmoid", "capco", "zinnov", "alphasenseindia", "rapidai", "sitetracker", "bolna", "libra"]) assert.match(sync, new RegExp(`"${token}"`));
  assert.match(sync, /const ASHBY_BOARDS/);
  assert.match(sync, /settleInBatches\(loaders\.map/);
  assert.match(sync, /Previous worker terminated before completion/);
  assert.equal((sync.match(/\["[^"]+",\s*"[^"]+"\]/g) || []).length, 54);
});

test("deploys the AI backend through keyless GitHub OIDC", async () => {
  const workflow = await readFile(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
  const oidc = await readFile(new URL("../infra/aws/github-actions.yaml", import.meta.url), "utf8");
  assert.match(workflow, /id-token:\s*write/);
  assert.match(workflow, /configure-aws-credentials@v4/);
  assert.match(workflow, /--provenance=false/);
  assert.match(workflow, /lambda update-function-code/);
  assert.match(oidc, /token\.actions\.githubusercontent\.com:sub/);
  assert.match(oidc, /repo:\$\{GitHubOrganization\}@\$\{GitHubOrganizationId\}\/\$\{GitHubRepository\}@\$\{GitHubRepositoryId\}:ref:refs\/heads\/main/);
  assert.doesNotMatch(workflow, /AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY/);
});

test("protects recruiter-owned company listings", async () => {
  // 7. Account roles are persisted, recruiter writes are owner-scoped, and guest search never receives apply_url.
  const auth = await readFile(new URL("../app/auth.tsx", import.meta.url), "utf8");
  const dashboard = await readFile(new URL("../app/recruiter-dashboard.tsx", import.meta.url), "utf8");
  const migration = await readFile(new URL("../supabase/migrations/20260820143000_recruiter_marketplace.sql", import.meta.url), "utf8");
  assert.match(auth, /job_seeker.*recruiter|recruiter.*job_seeker/s);
  assert.match(dashboard, /Post a job/);
  assert.match(migration, /account_profiles/);
  assert.match(migration, /recruiter_id = \(select auth\.uid\(\)\)/);
  assert.match(migration, /sync_recruiter_job_to_market/);
  assert.doesNotMatch(migration.match(/grant select \([\s\S]*?\) on public\.job_market to anon/i)?.[0] || "", /source_url|apply_url/i);
});

test("uses email and Google authentication without a phone login flow", async () => {
  // 8. Authentication intentionally offers only email and Google.
  const auth = await readFile(new URL("../app/auth.tsx", import.meta.url), "utf8");
  const exampleEnv = await readFile(new URL("../.env.example", import.meta.url), "utf8");
  assert.match(auth, /Continue with Google/);
  assert.match(auth, /EMAIL ADDRESS/);
  assert.match(auth, /PASSWORD/);
  assert.match(auth, /const publicSiteUrl = "https:\/\/hirova\.in"/);
  assert.match(auth, /emailRedirectTo: authReturnUrl\(\)/);
  assert.match(auth, /redirectTo: authReturnUrl\(\)/);
  assert.doesNotMatch(auth, /signInWithOtp\(\{\s*phone|phoneTab|PHONE_AUTH_ENABLED/i);
  assert.doesNotMatch(exampleEnv, /phone OTP|PHONE_AUTH_ENABLED/i);
});

test("supports focused job discovery and native applicant management", async () => {
  // 9. Discovery is limited to fresh jobs and includes marketplace-grade filters.
  const portal = await readFile(new URL("../app/public-portal.tsx", import.meta.url), "utf8");
  const recruiter = await readFile(new URL("../app/recruiter-dashboard.tsx", import.meta.url), "utf8");
  const jobsApi = await readFile(new URL("../app/api/jobs/route.ts", import.meta.url), "utf8");
  const migration = await readFile(new URL("../supabase/migrations/20260820095226_unify_marketplace_data.sql", import.meta.url), "utf8");
  for (const token of ["24 hours", "7 days", "30 days", "Browse by category"]) assert.match(portal, new RegExp(token, "i"));
  assert.doesNotMatch(portal, /Companies hiring/i);
  assert.match(migration, /least\(greatest\(p_posted_within_days, 1\), 30\)/i);
  assert.match(migration, /create table public\.job_applications/i);
  assert.match(migration, /create table public\.application_notes/i);
  assert.match(jobsApi, /search_public_job_market_v2/);
  assert.doesNotMatch(jobsApi, /Bearer \$\{token \|\| key\}/);
  assert.match(jobsApi, /Serve the durable daily index first/);
  assert.match(jobsApi, /map\(enrichSnapshotJob\)/);
  assert.match(recruiter, /ApplicantManager/);
  assert.match(recruiter, /Resume ·/);
  assert.match(recruiter, /Interview/);
});

test("keeps candidate profiles optional and durable", async () => {
  const dashboard = await readFile(new URL("../app/career-dashboard.tsx", import.meta.url), "utf8");
  const store = await readFile(new URL("../app/product-store.tsx", import.meta.url), "utf8");
  assert.match(dashboard, /useState<View>\("overview"\)/);
  assert.match(dashboard, /All fields optional/);
  assert.doesNotMatch(dashboard, /\brequired\b/);
  assert.match(store, /candidate_profiles"\)\.upsert/);
  assert.match(store, /if \(error\) throw error;[\s\S]*setProfileState\(complete\)/);
});
