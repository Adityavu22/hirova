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
  category?: string;
  careerLevel?: "intern" | "early" | "mid" | "senior";
  minExperienceYears?: number | null;
  maxExperienceYears?: number | null;
  experienceConfidence?: "low" | "medium" | "high";
  applicationMethod?: "native" | "external" | "both";
  origin?: "aggregated" | "recruiter";
  recruiterJobId?: string | null;
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
  const company = clean(url.searchParams.get("company") || "").toLowerCase();
  const category = clean(url.searchParams.get("category") || "All");
  const careerLevel = clean(url.searchParams.get("careerLevel") || "All");
  const employmentType = clean(url.searchParams.get("employmentType") || "All");
  const postedWithinDays = Math.min(30, Math.max(1, Number(url.searchParams.get("postedWithinDays")) || 30));
  const sort = clean(url.searchParams.get("sort") || "relevance");
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const pageSize = Math.min(250, Math.max(12, Number(url.searchParams.get("limit")) || 30));
  const start = (page - 1) * pageSize;

  // 2. Serve the durable daily index first; public callers never receive application URLs.
  const indexed = await loadIndexedFeed(request, {
    query, location, mode, company, category, careerLevel, employmentType,
    postedWithinDays, sort, pageSize, start,
  });
  if (indexed) return Response.json(indexed, { headers: { "Cache-Control": hasSession ? "private, no-store" : "public, max-age=300, s-maxage=900, stale-while-revalidate=21600", Vary: "Authorization" } });

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
  const currentJobs = jobs.filter((job) => Date.parse(job.postedAt) >= Date.now() - 30 * 86400000);
  const filtered = currentJobs.filter((job) => {
    const text = `${job.title} ${job.company} ${job.skills.join(" ")} ${job.description}`.toLowerCase();
    const matchesQuery = !query || text.includes(query) || query.split(/\s+/).every((term) => text.includes(term));
    const matchesLocation = !location || job.location.toLowerCase().includes(location) || (isIndiaQuery(location) && isIndiaLocation(job.location)) || (location.includes("remote") && job.mode === "Remote");
    const matchesMode = mode === "All" || job.mode === mode;
    const matchesCompany = !company || job.company.toLowerCase() === company;
    const matchesCategory = category === "All" || (job.category || inferCategory(job.title)) === category;
    const matchesCareer = careerLevel === "All" || (job.careerLevel || inferExperienceMeta(`${job.title} ${job.experience}`).careerLevel) === careerLevel;
    const matchesType = employmentType === "All" || job.employmentType === employmentType;
    const matchesDate = Date.parse(job.postedAt) >= Date.now() - postedWithinDays * 86400000;
    return matchesQuery && matchesLocation && matchesMode && matchesCompany && matchesCategory && matchesCareer && matchesType && matchesDate;
  }).sort((a, b) => sort === "newest" ? Date.parse(b.postedAt) - Date.parse(a.postedAt) : Date.parse(b.postedAt) - Date.parse(a.postedAt));
  return Response.json({
    jobs: filtered.slice(start, start + pageSize).map((job) => hasSession ? job : withoutApplicationUrl(job)),
    total: filtered.length,
    marketTotal: currentJobs.length,
    companies: [...new Set(currentJobs.map((job) => job.company))].sort(),
    categories: [...new Set(currentJobs.map((job) => job.category || inferCategory(job.title)))].sort(),
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

async function loadIndexedFeed(request: Request, input: { query: string; location: string; mode: string; company: string; category: string; careerLevel: string; employmentType: string; postedWithinDays: number; sort: string; pageSize: number; start: number }) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !key) return null;
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const rpc = token ? "search_job_market_v2" : "search_public_job_market_v2";
  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${rpc}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${token || key}` },
      body: JSON.stringify({
        p_query: input.query, p_location: input.location, p_mode: input.mode,
        p_company: input.company, p_category: input.category, p_career_level: input.careerLevel,
        p_employment_type: input.employmentType, p_posted_within_days: input.postedWithinDays,
        p_sort: input.sort, p_limit: input.pageSize, p_offset: input.start,
      }),
    });
    if (!response.ok) return null;
    const raw = await response.json() as Record<string, unknown> | Array<Record<string, unknown>>;
    const feed = (Array.isArray(raw) ? raw[0] : raw) || {};
    const jobs = Array.isArray(feed.jobs) ? feed.jobs.map(fromIndexedJob) : [];
    const total = Number(feed.total || 0);
    return {
      ...feed, jobs, total, page: Math.floor(input.start / input.pageSize) + 1, pageSize: input.pageSize,
      hasMore: input.start + jobs.length < total, usingSnapshot: false,
      updatedAt: typeof feed.updatedAt === "string" ? feed.updatedAt : new Date().toISOString(),
      sourceNotice: "Daily job index",
    };
  } catch { return null; }
}

function fromIndexedJob(value: Record<string, unknown>): PublicJob {
  const { posted_at, source_url, employment_type, career_level, min_experience_years, max_experience_years, experience_confidence, application_method, recruiter_job_id, ...job } = value;
  return {
    ...job,
    postedAt: text(posted_at), sourceUrl: text(source_url) || undefined,
    employmentType: text(employment_type), careerLevel: career_level as PublicJob["careerLevel"],
    minExperienceYears: typeof min_experience_years === "number" ? min_experience_years : null,
    maxExperienceYears: typeof max_experience_years === "number" ? max_experience_years : null,
    experienceConfidence: experience_confidence as PublicJob["experienceConfidence"],
    applicationMethod: application_method as PublicJob["applicationMethod"],
    recruiterJobId: typeof recruiter_job_id === "string" ? recruiter_job_id : null,
  } as PublicJob;
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
  const experienceMeta = inferExperienceMeta(`${input.title} ${input.description}`);
  return {
    id: input.id, title: input.title || "Open role", company: input.company || "Employer", location: input.location || "See listing", salary: input.salary || "Salary not disclosed",
    mode, experience: experienceMeta.label, match: 70, logo: (input.company || "H").slice(0, 1).toUpperCase(), color: colorFor(input.company),
    posted: relativeDate(postedAt), postedAt, skills: skills.length ? skills : ["Role-specific skills"], missing: ["Review full requirements"],
    why: "Match score is calculated from your profile, skills, preferences, and the available listing details.", description: compact(input.description) || "Open the employer listing for complete details.",
    responsibilities: ["Review the complete responsibilities on the employer's original posting"], benefits: [], applicants: 0, source: input.source, sourceUrl: input.url,
    employmentType: input.employmentType || "Full-time", category: inferCategory(input.title),
    careerLevel: experienceMeta.careerLevel, minExperienceYears: experienceMeta.min,
    maxExperienceYears: experienceMeta.max, experienceConfidence: experienceMeta.confidence,
    applicationMethod: "external", origin: "aggregated", recruiterJobId: null,
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
function inferSkills(value: string) { const bank = ["Python","JavaScript","TypeScript","React","Node.js","Java","Go","SQL","AWS","Azure","GCP","Kubernetes","Machine learning","Product management","Product design","Figma","Data analysis","Sales","Marketing","Finance","Operations","Security"]; return bank.filter((skill) => new RegExp(`\\b${skill.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+")}\\b`, "i").test(value)); }
function inferExperienceMeta(value: string) {
  const match = value.match(/(\d+)\+?\s*(?:-|–|to)?\s*(\d+)?\s*years?/i);
  const min = match ? Number(match[1]) : null;
  const max = match?.[2] ? Number(match[2]) : null;
  const title = value.toLowerCase();
  const careerLevel = /\b(intern|internship|trainee)\b/.test(title) ? "intern" : /\b(principal|director|head|staff|lead|vp|vice president)\b/.test(title) || (min !== null && min > 10) ? "senior" : /\b(senior|manager)\b/.test(title) || (min !== null && min >= 5) ? "mid" : "early";
  return { label: match ? `${match[1]}${match[2] ? `-${match[2]}` : "+"} yrs` : "Experience not specified", min, max, careerLevel: careerLevel as "intern" | "early" | "mid" | "senior", confidence: match ? "high" as const : /\b(intern|junior|associate|senior|manager|lead|staff|principal|director|head)\b/.test(title) ? "medium" as const : "low" as const };
}
function inferCategory(value: string) { const title = value.toLowerCase(); if (/\b(product manager|product owner)\b/.test(title)) return "Product"; if (/\b(designer|design|ux|ui)\b/.test(title)) return "Design"; if (/\b(sales|business development|account executive)\b/.test(title)) return "Sales"; if (/\b(marketing|growth|content|brand)\b/.test(title)) return "Marketing"; if (/\b(finance|accountant|audit|tax)\b/.test(title)) return "Finance"; if (/\b(human resources|recruiter|talent|people)\b/.test(title)) return "Human Resources"; if (/\b(operations|supply chain|customer support|customer success)\b/.test(title)) return "Operations"; if (/\b(software|developer|engineer|devops|cloud|security|data|machine learning|ai)\b/.test(title)) return "Technology"; return "Other"; }
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
