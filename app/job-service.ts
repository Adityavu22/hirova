import type { Job } from "./product-data";

export type JobFeed = {
  jobs: Job[];
  total: number;
  marketTotal: number;
  updatedAt: string;
  usingSnapshot: boolean;
  sourceNotice: string;
  companies: string[];
  categories: string[];
};

type DatabaseJob = Omit<Job, "postedAt" | "sourceUrl" | "employmentType"> & {
  posted_at: string;
  source_url?: string | null;
  employment_type: string;
  category?: string;
  career_level?: Job["careerLevel"];
  min_experience_years?: number | null;
  max_experience_years?: number | null;
  experience_confidence?: Job["experienceConfidence"];
  application_method?: Job["applicationMethod"];
  recruiter_job_id?: string | null;
};

export type JobSearchInput = {
  query?: string;
  location?: string;
  mode?: string;
  company?: string;
  category?: string;
  careerLevel?: string;
  employmentType?: string;
  postedWithinDays?: number;
  sort?: "relevance" | "newest";
  limit?: number;
  accessToken?: string;
};

// 1. Browsers read the RLS-protected Supabase index; the secret sync key never reaches this code.
export async function fetchMarketJobs(input: JobSearchInput = {}): Promise<JobFeed> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return fetchFallback(input);

  try {
    const requested = Math.min(60, Math.max(12, input.limit || 60));
    const rpc = input.accessToken ? "search_job_market_v2" : "search_public_job_market_v2";
    const response = await fetch(`${url}/rest/v1/rpc/${rpc}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${input.accessToken || key}` },
      body: JSON.stringify({
        p_query: input.query || "",
        p_location: input.location || "",
        p_mode: input.mode || "All",
        p_company: input.company || "",
        p_category: input.category || "All",
        p_career_level: input.careerLevel || "All",
        p_employment_type: input.employmentType || "All",
        p_posted_within_days: Math.min(30, Math.max(1, input.postedWithinDays || 30)),
        p_sort: input.sort || "relevance",
        p_limit: 250,
        p_offset: 0,
      }),
    });
    if (!response.ok) throw new Error(`Daily job index returned ${response.status}`);
    const raw = await response.json();
    const data = (Array.isArray(raw) ? raw[0] : raw) as { jobs?: DatabaseJob[]; total?: number; marketTotal?: number; updatedAt?: string; companies?: string[]; categories?: string[] };
    const jobs = interleaveSources((data.jobs || []).map(fromDatabase)).slice(0, requested);
    if (!jobs.length && !input.query && !input.location && (!input.mode || input.mode === "All")) throw new Error("Daily job index is empty");
    return {
      jobs,
      total: Number(data.total || 0),
      marketTotal: Number(data.marketTotal || 0),
      updatedAt: data.updatedAt || new Date().toISOString(),
      usingSnapshot: false,
      sourceNotice: "Updated daily from documented public feeds and employer career pages. Applications open on the original source.",
      companies: data.companies || [],
      categories: data.categories || [],
    };
  } catch {
    return fetchFallback(input);
  }
}

// 2. The deployed snapshot remains a safe fallback during a temporary Supabase outage.
async function fetchFallback(input: JobSearchInput): Promise<JobFeed> {
  const params = new URLSearchParams({
    query: input.query || "", location: input.location || "", mode: input.mode || "All",
    company: input.company || "", category: input.category || "All",
    careerLevel: input.careerLevel || "All", employmentType: input.employmentType || "All",
    postedWithinDays: String(Math.min(30, Math.max(1, input.postedWithinDays || 30))),
    sort: input.sort || "relevance", limit: String(input.limit || 60), index: "hirova-v3",
  });
  const response = await fetch(`/api/jobs?${params}`, { headers: input.accessToken ? { Authorization: `Bearer ${input.accessToken}` } : undefined });
  if (!response.ok) throw new Error("Job market temporarily unavailable");
  return response.json() as Promise<JobFeed>;
}

function fromDatabase(job: DatabaseJob): Job {
  return {
    ...job,
    postedAt: job.posted_at,
    sourceUrl: job.source_url || undefined,
    employmentType: job.employment_type,
    careerLevel: job.career_level,
    minExperienceYears: job.min_experience_years,
    maxExperienceYears: job.max_experience_years,
    experienceConfidence: job.experience_confidence,
    applicationMethod: job.application_method,
    recruiterJobId: job.recruiter_job_id,
  };
}

function interleaveSources(jobs: Job[]) {
  const groups = new Map<string, Job[]>();
  for (const job of jobs) groups.set(job.source || "Other", [...(groups.get(job.source || "Other") || []), job]);
  const result: Job[] = [];
  while (result.length < jobs.length) for (const group of groups.values()) { const next = group.shift(); if (next) result.push(next); }
  return result;
}
