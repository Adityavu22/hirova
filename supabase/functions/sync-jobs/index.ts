import "jsr:@supabase/functions-js/edge-runtime.d.ts";

type NormalizedJob = Record<string, unknown> & { id: string; source: string; source_url: string };
type RawJob = {
  id: string; title: string; company: string; location: string; url: string; postedAt: string;
  description: string; skills: string[]; employmentType: string; source: string; remote: boolean; salary?: string;
};

const GREENHOUSE_BOARDS = [
  ["Stripe", "stripe"], ["Figma", "figma"], ["Cloudflare", "cloudflare"], ["Airbnb", "airbnb"],
  ["Datadog", "datadog"], ["Discord", "discord"], ["Ripple", "ripple"], ["Postman", "postman"],
  ["PhonePe", "phonepe"], ["Groww", "groww"], ["Slice", "slice"], ["Rubrik", "rubrik"],
  ["MongoDB", "mongodb"], ["InMobi", "inmobi"],
] as const;

const LEVER_BOARDS = [
  ["Palantir", "palantir"], ["Acceldata", "acceldata"], ["Saviynt", "saviynt"], ["100ms", "100ms"],
  ["Neuron7", "neuron7"], ["Fam", "fampay"], ["Hevo Data", "hevodata"], ["Gushwork", "gushwork"], ["Paytm", "paytm"],
  ["Meesho", "meesho"], ["CRED", "cred"], ["Porter", "porter"],
] as const;

const ASHBY_BOARDS = [
  ["OpenAI", "openai"], ["Notion", "notion"], ["Cursor", "cursor"], ["Airwallex", "airwallex"],
  ["SpotDraft", "spotdraft"], ["Sarvam AI", "sarvam"], ["Ashby", "ashby"], ["Ramp", "ramp"],
  ["Linear", "linear"], ["Supabase", "supabase"], ["Perplexity", "perplexity"], ["Plaid", "plaid"],
  ["Zapier", "zapier"],
] as const;

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const secretKey = getSecretKey();
  if (!supabaseUrl || !secretKey) return json({ error: "Supabase runtime credentials unavailable" }, 500);

  const startedAt = new Date().toISOString();
  const run = await rest<{ id: string }[]>(supabaseUrl, secretKey, "job_sync_runs", {
    method: "POST", body: JSON.stringify({ status: "running", started_at: startedAt }),
    headers: { Prefer: "return=representation" },
  });
  const runId = run[0]?.id;

  try {
    // 1. Fetch documented feeds concurrently; one failed publisher does not discard healthy sources.
    const loaders = [
      ["Arbeitnow", loadArbeitnow()], ["Remotive", loadRemotive()],
      ...GREENHOUSE_BOARDS.map(([company, token]) => [`${company} careers`, loadGreenhouse(company, token)] as const),
      ...LEVER_BOARDS.map(([company, token]) => [`${company} careers`, loadLever(company, token)] as const),
      ...ASHBY_BOARDS.map(([company, token]) => [`${company} careers`, loadAshby(company, token)] as const),
    ] as const;
    const settled = await Promise.allSettled(loaders.map(([, promise]) => promise));
    const jobs = dedupe(settled.flatMap((result) => result.status === "fulfilled" ? result.value : []));
    const failures = settled.flatMap((result, index) => result.status === "rejected" ? [loaders[index][0]] : []);
    const succeeded = loaders.length - failures.length;
    if (!jobs.length) throw new Error("Every configured job source failed");

    // 2. Upsert in bounded batches using the function-only secret key; browsers never receive it.
    for (let index = 0; index < jobs.length; index += 250) {
      await rest(supabaseUrl, secretKey, "job_market?on_conflict=id", {
        method: "POST",
        body: JSON.stringify(jobs.slice(index, index + 250).map((job) => ({ ...job, active: true, last_seen_at: startedAt, ingested_at: startedAt }))),
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      });
    }

    // 3. Expire missing jobs only after every source succeeded; partial outages preserve prior listings for 72 hours.
    if (!failures.length) {
      await rest(supabaseUrl, secretKey, `job_market?origin=eq.aggregated&active=eq.true&last_seen_at=lt.${encodeURIComponent(startedAt)}`, {
        method: "PATCH", body: JSON.stringify({ active: false }), headers: { Prefer: "return=minimal" },
      });
    }

    const status = failures.length ? "partial" : "succeeded";
    if (runId) await finishRun(supabaseUrl, secretKey, runId, status, jobs.length, succeeded, failures);
    return json({ status, jobs: jobs.length, sourcesSucceeded: succeeded, sourcesFailed: failures });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown sync failure";
    if (runId) await finishRun(supabaseUrl, secretKey, runId, "failed", 0, 0, [message]);
    return json({ status: "failed", error: message }, 503);
  }
});

async function loadArbeitnow(): Promise<NormalizedJob[]> {
  const data = await fetchJson<{ data?: Array<Record<string, unknown>> }>("https://www.arbeitnow.com/api/job-board-api");
  return (data.data || []).map((job) => normalize({
    id: `arbeitnow:${job.slug}`, title: text(job.title), company: text(job.company_name), location: text(job.location) || (job.remote ? "Remote" : "Europe"),
    url: text(job.url), postedAt: text(job.created_at), description: decodeHtml(text(job.description)), skills: strings(job.tags),
    employmentType: strings(job.job_types)[0] || "Full-time", source: "Arbeitnow", remote: Boolean(job.remote),
  }));
}

async function loadRemotive(): Promise<NormalizedJob[]> {
  const data = await fetchJson<{ jobs?: Array<Record<string, unknown>> }>("https://remotive.com/api/remote-jobs");
  return (data.jobs || []).map((job) => normalize({
    id: `remotive:${job.id}`, title: text(job.title), company: text(job.company_name), location: text(job.candidate_required_location) || "Remote",
    url: text(job.url), postedAt: text(job.publication_date), description: stripHtml(text(job.description)), skills: [text(job.category)].filter(Boolean),
    employmentType: text(job.job_type) || "Full-time", salary: text(job.salary), source: "Remotive", remote: true,
  }));
}

async function loadGreenhouse(company: string, token: string): Promise<NormalizedJob[]> {
  const data = await fetchJson<{ jobs?: Array<Record<string, unknown>> }>(`https://boards-api.greenhouse.io/v1/boards/${token}/jobs`);
  return (data.jobs || []).map((job) => normalize({
    id: `greenhouse:${token}:${job.id}`, title: text(job.title), company, location: text((job.location as { name?: unknown })?.name) || "Location in job post",
    url: text(job.absolute_url), postedAt: text(job.updated_at), description: `Direct opening published on ${company}'s careers page. Open the original listing for complete requirements and application.`,
    skills: inferSkills(text(job.title)), employmentType: "Full-time", source: `${company} careers`, remote: /remote/i.test(text((job.location as { name?: unknown })?.name)),
  }));
}

async function loadLever(company: string, token: string): Promise<NormalizedJob[]> {
  const postings: Array<Record<string, unknown>> = [];
  for (let skip = 0; skip < 500; skip += 100) {
    const page = await fetchJson<Array<Record<string, unknown>>>(`https://api.lever.co/v0/postings/${token}?mode=json&limit=100&skip=${skip}`);
    postings.push(...page);
    if (page.length < 100) break;
  }
  return postings.map((job) => { const categories = (job.categories || {}) as Record<string, unknown>; return normalize({
    id: `lever:${token}:${job.id}`, title: text(job.text), company, location: text(categories.location) || "Location in job post", url: text(job.hostedUrl),
    postedAt: typeof job.createdAt === "number" ? new Date(job.createdAt).toISOString() : new Date().toISOString(), description: stripHtml(text(job.descriptionPlain) || text(job.description)),
    skills: inferSkills(`${text(job.text)} ${text(categories.team)}`), employmentType: text(categories.commitment) || "Full-time", source: `${company} careers`, remote: /remote/i.test(text(categories.location)),
  }); });
}

async function loadAshby(company: string, token: string): Promise<NormalizedJob[]> {
  const data = await fetchJson<{ jobs?: Array<Record<string, unknown>> }>(`https://api.ashbyhq.com/posting-api/job-board/${token}?includeCompensation=true`);
  return (data.jobs || []).filter((job) => job.isListed !== false).map((job) => {
    const compensation = (job.compensation || {}) as Record<string, unknown>;
    return normalize({
      id: `ashby:${token}:${text(job.id) || text(job.jobUrl)}`, title: text(job.title), company,
      location: text(job.location) || "Location in job post", url: text(job.applyUrl) || text(job.jobUrl),
      postedAt: text(job.publishedAt) || text(job.updatedAt) || new Date().toISOString(),
      description: stripHtml(text(job.descriptionHtml) || text(job.descriptionPlain) || text(job.description)),
      skills: inferSkills(`${text(job.title)} ${text(job.department)} ${text(job.team)}`),
      employmentType: text(job.employmentType) || "Full-time", salary: text(compensation.compensationTierSummary),
      source: `${company} careers`, remote: Boolean(job.isRemote) || /remote/i.test(text(job.location)),
    });
  });
}

function normalize(input: RawJob): NormalizedJob {
  const mode = input.remote || /remote|anywhere|distributed/i.test(input.location) ? "Remote" : /hybrid/i.test(input.location) ? "Hybrid" : "On-site";
  const postedAt = validDate(input.postedAt);
  const skills = [...new Set([...input.skills, ...inferSkills(`${input.title} ${input.description}`)])].slice(0, 7);
  return {
    id: input.id, title: input.title || "Open role", company: input.company || "Employer", location: input.location || "See listing", salary: input.salary || "Salary not disclosed",
    mode, experience: inferExperience(`${input.title} ${input.description}`), match: 70, logo: (input.company || "H").slice(0, 1).toUpperCase(), color: colorFor(input.company),
    posted: relativeDate(postedAt), posted_at: postedAt, skills: skills.length ? skills : ["Role-specific skills"], missing: ["Review full requirements"],
    why: "Match score is calculated from your profile, skills, preferences, and the available listing details.", description: compact(input.description) || "Open the original listing for complete details.",
    responsibilities: ["Review complete responsibilities on the original posting"], benefits: [], applicants: 0, source: input.source, source_url: input.url, employment_type: input.employmentType || "Full-time",
  };
}

async function fetchJson<T>(url: string): Promise<T> {
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 20_000);
  try { const response = await fetch(url, { headers: { Accept: "application/json" }, signal: controller.signal }); if (!response.ok) throw new Error(`${url} returned ${response.status}`); return await response.json() as T; }
  finally { clearTimeout(timeout); }
}

async function rest<T = unknown>(url: string, key: string, path: string, init: RequestInit): Promise<T> {
  const response = await fetch(`${url}/rest/v1/${path}`, { ...init, headers: { "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${key}`, ...init.headers } });
  if (!response.ok) throw new Error(`Database ${init.method || "GET"} failed (${response.status}): ${await response.text()}`);
  return response.status === 204 || response.headers.get("content-length") === "0" ? undefined as T : await response.json() as T;
}

async function finishRun(url: string, key: string, id: string, status: string, jobs: number, succeeded: number, failures: string[]) {
  await rest(url, key, `job_sync_runs?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ completed_at: new Date().toISOString(), status, jobs_seen: jobs, sources_succeeded: succeeded, sources_failed: failures.length, error_summary: failures.join(", ") || null }), headers: { Prefer: "return=minimal" } });
}

function getSecretKey() { const modern = Deno.env.get("SUPABASE_SECRET_KEYS"); if (modern) { const keys = JSON.parse(modern); if (keys.default) return keys.default; } return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"); }
function dedupe(jobs: NormalizedJob[]) { const seen = new Set<string>(); return jobs.filter((job) => { const key = `${job.company}|${job.title}|${job.location}`.toLowerCase().replace(/\s+/g, " "); if (seen.has(key)) return false; seen.add(key); return true; }); }
function inferSkills(value: string) { const bank = ["Python","JavaScript","TypeScript","React","Node.js","Java","Go","SQL","AWS","Azure","GCP","Kubernetes","Machine learning","Product management","Product design","Figma","Data analysis","Sales","Marketing","Finance","Operations","Security"]; const lower = value.toLowerCase(); return bank.filter((skill) => lower.includes(skill.toLowerCase())); }
function inferExperience(value: string) { const match = value.match(/(\d+)\+?\s*(?:-|to)?\s*(\d+)?\s*years?/i); return match ? `${match[1]}${match[2] ? `-${match[2]}` : "+"} yrs` : "See listing"; }
function colorFor(value: string) { const colors = ["blue","plum","orange","green-logo","teal-logo","black-logo"]; return colors[Math.abs([...value].reduce((sum, char) => sum + char.charCodeAt(0), 0)) % colors.length]; }
function validDate(value: string) { const date = new Date(value); return Number.isNaN(date.valueOf()) ? new Date().toISOString() : date.toISOString(); }
function relativeDate(value: string) { const days = Math.max(0, Math.floor((Date.now() - Date.parse(value)) / 86400000)); return days === 0 ? "Today" : days === 1 ? "Yesterday" : `${days} days ago`; }
function compact(value: string) { return clean(value).slice(0, 900); }
function stripHtml(value: string) { return clean(value.replace(/<[^>]+>/g, " ")); }
function decodeHtml(value: string) { return stripHtml(value.replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#39;/g,"'")); }
function clean(value: string) { return value.replace(/\s+/g, " ").trim(); }
function text(value: unknown) { return typeof value === "string" || typeof value === "number" ? String(value) : ""; }
function strings(value: unknown) { return Array.isArray(value) ? value.map(text).filter(Boolean) : []; }
function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } }); }
