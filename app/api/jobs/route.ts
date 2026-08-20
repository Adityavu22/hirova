import snapshot from "../../job-snapshot.json";
import { jsonError, requireUser } from "../_shared";

type PublicJob = {
  id: string;
  title: string;
  company: string;
  location: string;
  salary: string;
  mode: "Remote" | "Hybrid" | "On-site";
  experience: string;
  match: number;
  logo: string;
  color: string;
  posted: string;
  postedAt: string;
  skills: string[];
  missing: string[];
  why: string;
  description: string;
  responsibilities: string[];
  benefits: string[];
  applicants: number;
  source: string;
  sourceUrl: string;
  employmentType: string;
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

// 1. Aggregate only documented public feeds and direct employer job-board APIs.
export async function GET(request: Request) {
  const hasSession = Boolean(request.headers.get("authorization"));
  if (hasSession) {
    try { await requireUser(request); }
    catch (error) { return jsonError(error); }
  }
  const url = new URL(request.url);
  const query = clean(url.searchParams.get("query") || "").toLowerCase();
  const location = clean(url.searchParams.get("location") || "").toLowerCase();
  const mode = clean(url.searchParams.get("mode") || "All");
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const pageSize = Math.min(2500, Math.max(12, Number(url.searchParams.get("limit")) || 30));

  const forceSnapshot = url.searchParams.get("snapshot") === "1" || process.env.JOB_FEED_MODE === "snapshot";
  const sources = forceSnapshot ? [] : [
    loadArbeitnow(),
    loadRemotive(),
    ...GREENHOUSE_BOARDS.map(([company, token]) => loadGreenhouse(company, token)),
    ...LEVER_BOARDS.map(([company, token]) => loadLever(company, token)),
    ...ASHBY_BOARDS.map(([company, token]) => loadAshby(company, token)),
  ];
  const sourceLabels = ["Arbeitnow", "Remotive", ...GREENHOUSE_BOARDS.map(([company]) => `${company} careers`), ...LEVER_BOARDS.map(([company]) => `${company} careers`), ...ASHBY_BOARDS.map(([company]) => `${company} careers`)];
  const settled = await Promise.allSettled(sources);
  const liveJobs = dedupe(settled.flatMap((result) => result.status === "fulfilled" ? result.value : []));
  const usingSnapshot = forceSnapshot || liveJobs.length === 0;
  const jobs = usingSnapshot ? snapshot.jobs as PublicJob[] : liveJobs;
  const unavailable = settled.flatMap((result, index) => result.status === "rejected" ? [sourceLabels[index]] : []);
  const filtered = jobs.filter((job) => {
    const text = `${job.title} ${job.company} ${job.skills.join(" ")} ${job.description}`.toLowerCase();
    const matchesQuery = !query || text.includes(query) || query.split(/\s+/).every((term) => text.includes(term));
    const matchesLocation = !location || job.location.toLowerCase().includes(location) || (isIndiaQuery(location) && isIndiaLocation(job.location)) || (location.includes("remote") && job.mode === "Remote");
    const matchesMode = mode === "All" || job.mode === mode;
    return matchesQuery && matchesLocation && matchesMode;
  }).sort((a, b) => Date.parse(b.postedAt) - Date.parse(a.postedAt));
  const start = (page - 1) * pageSize;

  return Response.json({
    jobs: filtered.slice(start, start + pageSize).map((job) => hasSession ? job : withoutApplicationUrl(job)),
    total: filtered.length,
    marketTotal: jobs.length,
    page,
    pageSize,
    hasMore: start + pageSize < filtered.length,
    updatedAt: usingSnapshot ? snapshot.generatedAt : new Date().toISOString(),
    unavailable,
    usingSnapshot,
    sourceNotice: usingSnapshot
      ? "Showing the last successful verified-source index. Applications open on the original source."
      : "Listings come from documented public feeds and employer career pages. Applications open on the original source.",
  }, { headers: { "Cache-Control": hasSession ? "private, no-store" : "public, max-age=300, s-maxage=900, stale-while-revalidate=21600", Vary: "Authorization" } });
}

async function loadArbeitnow(): Promise<PublicJob[]> {
  const data = await cachedJson<{ data?: Array<Record<string, unknown>> }>("https://www.arbeitnow.com/api/job-board-api", 1800);
  return (data.data || []).map((job) => normalize({
    id: `arbeitnow:${job.slug}`, title: text(job.title), company: text(job.company_name), location: text(job.location) || (job.remote ? "Remote" : "Europe"),
    url: text(job.url), postedAt: text(job.created_at), description: decodeHtml(text(job.description)), skills: strings(job.tags),
    employmentType: strings(job.job_types)[0] || "Full-time", source: "Arbeitnow", remote: Boolean(job.remote),
  }));
}

async function loadRemotive(): Promise<PublicJob[]> {
  const data = await cachedJson<{ jobs?: Array<Record<string, unknown>> }>("https://remotive.com/api/remote-jobs", 21600);
  return (data.jobs || []).map((job) => normalize({
    id: `remotive:${job.id}`, title: text(job.title), company: text(job.company_name), location: text(job.candidate_required_location) || "Remote",
    url: text(job.url), postedAt: text(job.publication_date), description: stripHtml(text(job.description)), skills: [text(job.category)].filter(Boolean),
    employmentType: text(job.job_type) || "Full-time", salary: text(job.salary), source: "Remotive", remote: true,
  }));
}

async function loadGreenhouse(company: string, token: string): Promise<PublicJob[]> {
  const data = await cachedJson<{ jobs?: Array<Record<string, unknown>> }>(`https://boards-api.greenhouse.io/v1/boards/${token}/jobs`, 1800);
  return (data.jobs || []).map((job) => normalize({
    id: `greenhouse:${token}:${job.id}`, title: text(job.title), company, location: text((job.location as { name?: unknown })?.name) || "Location in job post",
    url: text(job.absolute_url), postedAt: text(job.updated_at), description: `Direct opening published on ${company}'s careers page. Open the original listing for the complete role requirements and application form.`,
    skills: inferSkills(text(job.title)), employmentType: "Full-time", source: `${company} careers`, remote: /remote/i.test(text((job.location as { name?: unknown })?.name)),
  }));
}

async function loadLever(company: string, token: string): Promise<PublicJob[]> {
  const postings: Array<Record<string, unknown>> = [];
  for (let skip = 0; skip < 500; skip += 100) {
    const page = await cachedJson<Array<Record<string, unknown>>>(`https://api.lever.co/v0/postings/${token}?mode=json&limit=100&skip=${skip}`, 1800);
    if (!Array.isArray(page)) break;
    postings.push(...page);
    if (page.length < 100) break;
  }
  return postings.map((job) => {
    const categories = (job.categories || {}) as Record<string, unknown>;
    return normalize({
      id: `lever:${token}:${job.id}`, title: text(job.text), company, location: text(categories.location) || "Location in job post", url: text(job.hostedUrl),
      postedAt: typeof job.createdAt === "number" ? new Date(job.createdAt).toISOString() : new Date().toISOString(), description: stripHtml(text(job.descriptionPlain) || text(job.description)), skills: inferSkills(`${text(job.text)} ${text(categories.team)}`),
      employmentType: text(categories.commitment) || "Full-time", source: `${company} careers`, remote: /remote/i.test(text(categories.location)),
    });
  });
}

async function loadAshby(company: string, token: string): Promise<PublicJob[]> {
  const data = await cachedJson<{ jobs?: Array<Record<string, unknown>> }>(`https://api.ashbyhq.com/posting-api/job-board/${token}?includeCompensation=true`, 1800);
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

// 2. Source-independent normalization provides one stable product contract.
function normalize(input: { id: string; title: string; company: string; location: string; url: string; postedAt: string; description: string; skills: string[]; employmentType: string; source: string; remote: boolean; salary?: string }): PublicJob {
  const mode = input.remote || /remote|anywhere|distributed/i.test(input.location) ? "Remote" : /hybrid/i.test(input.location) ? "Hybrid" : "On-site";
  const postedAt = validDate(input.postedAt);
  const skills = [...new Set([...input.skills, ...inferSkills(`${input.title} ${input.description}`)])].slice(0, 7);
  return {
    id: input.id, title: input.title || "Open role", company: input.company || "Employer", location: input.location || "See listing", salary: input.salary || "Salary not disclosed",
    mode, experience: inferExperience(`${input.title} ${input.description}`), match: 70, logo: (input.company || "H").slice(0, 1).toUpperCase(), color: colorFor(input.company),
    posted: relativeDate(postedAt), postedAt, skills: skills.length ? skills : ["Role-specific skills"], missing: ["Review full requirements"],
    why: "Match score is calculated from your profile, skills, preferences, and the available listing details.", description: compact(input.description) || "Open the employer listing for complete details.",
    responsibilities: ["Review the complete responsibilities on the employer's original posting"], benefits: [], applicants: 0, source: input.source, sourceUrl: input.url,
    employmentType: input.employmentType || "Full-time",
  };
}

async function cachedJson<T>(url: string, ttl: number): Promise<T> {
  const edgeCache = typeof caches === "undefined" ? null : (caches as CacheStorage & { default: Cache }).default;
  const cacheKey = new Request(`https://hirova-cache.invalid/${encodeURIComponent(url)}`);
  const cached = edgeCache ? await edgeCache.match(cacheKey) : null;
  if (cached) return cached.json() as Promise<T>;
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`Job source returned ${response.status}`);
  const body = await response.text();
  if (edgeCache) await edgeCache.put(cacheKey, new Response(body, { headers: { "Cache-Control": `public, s-maxage=${ttl}` } }));
  return JSON.parse(body) as T;
}

function dedupe(jobs: PublicJob[]) {
  const seen = new Set<string>();
  return jobs.filter((job) => { const key = `${job.company}|${job.title}|${job.location}`.toLowerCase().replace(/\s+/g, " "); if (seen.has(key)) return false; seen.add(key); return true; });
}
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
function isIndiaQuery(value: string) { return value === "in" || value.includes("india"); }
function isIndiaLocation(value: string) { return /india|bengaluru|bangalore|mumbai|delhi|noida|gurugram|gurgaon|hyderabad|pune|chennai|kolkata|ahmedabad|jaipur|kochi|cochin|chandigarh|indore/i.test(value); }
function withoutApplicationUrl(job: PublicJob) { const publicJob = { ...job } as Partial<PublicJob>; delete publicJob.sourceUrl; return publicJob; }
