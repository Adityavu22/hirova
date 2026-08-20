"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { getBrowserSupabase, useHirovaAuth } from "./auth";

type RecruiterView = "overview" | "jobs" | "applicants" | "company";
type Company = {
  id: string; owner_user_id: string; name: string; website: string | null; industry: string;
  location: string; description: string; verification_status: "unverified" | "pending" | "verified";
};
type RecruiterJob = {
  id: string; company_id: string; recruiter_id: string; title: string; location: string;
  mode: "Remote" | "Hybrid" | "On-site"; employment_type: string; experience: string;
  salary: string; description: string; responsibilities: string[]; skills: string[]; benefits: string[];
  apply_url: string | null; status: "draft" | "published" | "closed"; published_at: string | null;
  expires_at: string; created_at: string;
  category: string; min_experience_years: number | null; max_experience_years: number | null;
  career_level: "intern" | "early" | "mid" | "senior";
  application_method: "native" | "external" | "both"; closing_at: string | null;
};
type Applicant = {
  id: string; candidate_id: string; recruiter_job_id: string; status: "Applied" | "Screening" | "Interview" | "Offer" | "Rejected" | "Withdrawn"; applied_at: string;
  candidate: { name: string; headline: string; location: string; career_level: string; experience_years: string; skills: string[]; phone: string } | null;
  resume: { id: string; filename: string; score: number } | null;
};

const blankCompany = { name: "", website: "", industry: "", location: "", description: "" };
type JobDraft = {
  title: string; location: string; mode: RecruiterJob["mode"]; employment_type: string; experience: string;
  salary: string; description: string; responsibilities: string; skills: string; benefits: string; apply_url: string;
  category: string; min_experience_years: string; max_experience_years: string; career_level: RecruiterJob["career_level"];
  application_method: RecruiterJob["application_method"]; closing_at: string;
};
const blankJob: JobDraft = {
  title: "", location: "", mode: "On-site", employment_type: "Full-time", experience: "",
  salary: "", description: "", responsibilities: "", skills: "", benefits: "", apply_url: "",
  category: "Technology", min_experience_years: "", max_experience_years: "", career_level: "early" as const,
  application_method: "native" as const, closing_at: "",
};

export default function RecruiterDashboard() {
  const { userId, name, email, accessToken, signOut, switchWorkspace } = useHirovaAuth();
  const supabase = useMemo(() => getBrowserSupabase(), []);
  const [view, setView] = useState<RecruiterView>("overview");
  const [company, setCompany] = useState<Company | null>(null);
  const [jobs, setJobs] = useState<RecruiterJob[]>([]);
  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [loading, setLoading] = useState(true);
  const [jobEditorOpen, setJobEditorOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<RecruiterJob | null>(null);
  const [message, setMessage] = useState("");

  const loadWorkspace = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }
    const [{ data: companyData, error: companyError }, { data: jobData, error: jobError }] = await Promise.all([
      supabase.from("companies").select("*").eq("owner_user_id", userId).maybeSingle(),
      supabase.from("recruiter_jobs").select("*").eq("recruiter_id", userId).order("created_at", { ascending: false }),
    ]);
    if (companyError || jobError) setMessage(companyError?.message || jobError?.message || "Unable to load the hiring workspace.");
    setCompany(companyData as Company | null);
    const recruiterJobs = (jobData || []) as RecruiterJob[];
    setJobs(recruiterJobs);
    const jobIds = recruiterJobs.map((job) => job.id);
    if (jobIds.length) {
      const { data: applicationData, error: applicationError } = await supabase.from("job_applications").select("id, candidate_id, recruiter_job_id, status, applied_at").in("recruiter_job_id", jobIds).order("applied_at", { ascending: false });
      if (applicationError) setMessage(applicationError.message);
      const candidateIds = [...new Set((applicationData || []).map((item) => item.candidate_id))];
      const [profileResult, resumeResult] = candidateIds.length ? await Promise.all([
        supabase.from("candidate_profiles").select("user_id, name, headline, location, career_level, experience_years, skills, phone").in("user_id", candidateIds),
        supabase.from("resume_records").select("id, user_id, filename, score, uploaded_at").in("user_id", candidateIds).order("uploaded_at", { ascending: false }),
      ]) : [{ data: [] }, { data: [] }];
      const profiles = new Map((profileResult.data || []).map((item) => [item.user_id, item]));
      const resumes = new Map<string, { id: string; filename: string; score: number }>();
      for (const item of resumeResult.data || []) if (!resumes.has(item.user_id)) resumes.set(item.user_id, item);
      setApplicants((applicationData || []).map((item) => ({ ...item, candidate: profiles.get(item.candidate_id) || null, resume: resumes.get(item.candidate_id) || null })) as Applicant[]);
    } else setApplicants([]);
    setLoading(false);
  }, [supabase, userId]);

  useEffect(() => { const timer = window.setTimeout(() => void loadWorkspace(), 0); return () => window.clearTimeout(timer); }, [loadWorkspace]);

  async function saveCompany(draft: typeof blankCompany) {
    if (!supabase) return;
    setMessage("");
    const payload = { ...draft, website: draft.website || null, owner_user_id: userId, updated_at: new Date().toISOString() };
    const request = company
      ? supabase.from("companies").update(payload).eq("id", company.id).select().single()
      : supabase.from("companies").insert(payload).select().single();
    const { data, error } = await request;
    if (error) { setMessage(error.message); return; }
    setCompany(data as Company); setMessage("Company profile saved."); setView("overview");
  }

  async function saveJob(draft: JobDraft, publish: boolean) {
    if (!supabase || !company) return;
    setMessage("");
    const payload = {
      company_id: company.id, recruiter_id: userId, title: draft.title.trim(), location: draft.location.trim(),
      mode: draft.mode, employment_type: draft.employment_type, experience: draft.experience.trim() || "See listing",
      salary: draft.salary.trim() || "Salary not disclosed", description: draft.description.trim(),
      responsibilities: splitItems(draft.responsibilities), skills: splitItems(draft.skills), benefits: splitItems(draft.benefits),
      status: publish ? "published" : "draft",
      category: draft.category, min_experience_years: draft.min_experience_years ? Number(draft.min_experience_years) : null,
      max_experience_years: draft.max_experience_years ? Number(draft.max_experience_years) : null,
      career_level: draft.career_level, application_method: draft.application_method,
      apply_url: draft.application_method === "native" ? null : draft.apply_url.trim(),
      closing_at: draft.closing_at ? new Date(`${draft.closing_at}T23:59:59`).toISOString() : null,
      published_at: publish ? editingJob?.published_at || new Date().toISOString() : editingJob?.published_at || null,
      updated_at: new Date().toISOString(),
    };
    const request = editingJob
      ? supabase.from("recruiter_jobs").update(payload).eq("id", editingJob.id).select().single()
      : supabase.from("recruiter_jobs").insert(payload).select().single();
    const { error } = await request;
    if (error) { setMessage(error.message); return; }
    setMessage(publish ? "Job is live on Hirova." : "Draft saved."); setJobEditorOpen(false); setEditingJob(null);
    await loadWorkspace(); setView("jobs");
  }

  async function changeStatus(job: RecruiterJob, status: RecruiterJob["status"]) {
    if (!supabase) return;
    const { error } = await supabase.from("recruiter_jobs").update({ status, published_at: status === "published" ? job.published_at || new Date().toISOString() : job.published_at, updated_at: new Date().toISOString() }).eq("id", job.id);
    if (error) { setMessage(error.message); return; }
    setMessage(status === "published" ? "Job published." : status === "closed" ? "Job closed and removed from search." : "Job moved to drafts.");
    await loadWorkspace();
  }

  async function updateApplicantStatus(applicationId: string, status: Applicant["status"]) {
    if (!supabase) return;
    const { error } = await supabase.from("job_applications").update({ status, updated_at: new Date().toISOString() }).eq("id", applicationId);
    if (error) { setMessage(error.message); return; }
    setApplicants((items) => items.map((item) => item.id === applicationId ? { ...item, status } : item));
  }

  async function downloadResume(resume: NonNullable<Applicant["resume"]>) {
    if (!accessToken) return;
    const response = await fetch(`/api/resume?id=${encodeURIComponent(resume.id)}`, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!response.ok) { setMessage("Resume download is unavailable."); return; }
    const blob = await response.blob(); const url = URL.createObjectURL(blob); const anchor = document.createElement("a");
    anchor.href = url; anchor.download = resume.filename; anchor.click(); URL.revokeObjectURL(url);
  }

  function edit(job: RecruiterJob) { setEditingJob(job); setJobEditorOpen(true); setView("jobs"); }
  const liveCount = jobs.filter((job) => job.status === "published").length;
  const draftCount = jobs.filter((job) => job.status === "draft").length;

  if (loading) return <div className="auth-loading"><span>H</span><p>Loading your hiring workspace…</p></div>;

  return <main className="recruiter-shell">
    <aside className="recruiter-rail">
      <button className="brand recruiter-brand" onClick={() => setView("overview")}><span>H</span> Hirova <small>FOR EMPLOYERS</small></button>
      <nav><button className={view === "overview" ? "active" : ""} onClick={() => setView("overview")}><i>OV</i>Overview</button><button className={view === "jobs" ? "active" : ""} onClick={() => setView("jobs")}><i>JB</i>Job listings <small>{jobs.length}</small></button><button className={view === "applicants" ? "active" : ""} onClick={() => setView("applicants")}><i>AP</i>Applicants <small>{applicants.length}</small></button><button className={view === "company" ? "active" : ""} onClick={() => setView("company")}><i>CO</i>Company profile</button></nav>
      <div className="recruiter-account"><span>{initials(name)}</span><div><b>{name}</b><small>{email}</small></div></div>
      <button className="workspace-switch" onClick={() => void switchWorkspace("job_seeker")}>Switch to job seeker →</button>
      <button className="recruiter-signout" onClick={() => void signOut()}>Sign out</button>
    </aside>

    <section className="recruiter-workspace">
      <header className="recruiter-topbar"><div><span className="eyebrow">HIROVA RECRUITER</span><h1>{view === "company" ? "Your company profile." : view === "jobs" ? "Manage job listings." : view === "applicants" ? "Review your applicants." : `Good to see you, ${firstName(name)}.`}</h1></div>{company && view !== "applicants" && <button className="primary" onClick={() => { setEditingJob(null); setJobEditorOpen(true); setView("jobs"); }}>+ Post a job</button>}</header>
      {message && <div className="recruiter-message">{message}<button onClick={() => setMessage("")}>×</button></div>}

      {!company && view !== "company" ? <section className="company-onboarding"><span>01</span><h2>Create your company workspace</h2><p>Add verified company information before publishing a job. Candidates will see the company name beside every direct listing.</p><button className="primary" onClick={() => setView("company")}>Create company profile →</button></section> : null}

      {view === "overview" && company && <><section className="recruiter-hero"><div><span className="status"><i /> COMPANY WORKSPACE ACTIVE</span><h2>Hire for <em>{company.name}</em> with a clear, direct candidate experience.</h2><p>Post roles, receive applications and move candidates through your hiring pipeline.</p></div><div className="company-badge"><b>{company.name.slice(0, 1).toUpperCase()}</b><span>{company.name}</span><small>{company.location || "Add company location"}</small></div></section><div className="recruiter-metrics"><article><span>Live jobs</span><b>{liveCount}</b><small>Visible in search</small></article><article><span>Applicants</span><b>{applicants.length}</b><small>Across your roles</small></article><article><span>Interviews</span><b>{applicants.filter((item) => item.status === "Interview").length}</b><small>In progress</small></article><article><span>Offers</span><b>{applicants.filter((item) => item.status === "Offer").length}</b><small>Offer stage</small></article></div><section className="recruiter-section-head"><div><span className="eyebrow">RECENT LISTINGS</span><h2>Your hiring activity</h2></div><button onClick={() => setView("jobs")}>View all jobs →</button></section><JobTable jobs={jobs.slice(0, 5)} onEdit={edit} onStatus={changeStatus} /></>}

      {view === "jobs" && <>{jobEditorOpen ? <JobEditor job={editingJob} company={company} onCancel={() => { setJobEditorOpen(false); setEditingJob(null); }} onSave={saveJob} /> : <><div className="recruiter-list-heading"><div><p>{jobs.length} company listing{jobs.length === 1 ? "" : "s"}</p><div><span><i className="live-dot" /> {liveCount} live</span><span>{draftCount} drafts</span></div></div>{company && <button className="primary" onClick={() => { setEditingJob(null); setJobEditorOpen(true); }}>+ Create listing</button>}</div><JobTable jobs={jobs} onEdit={edit} onStatus={changeStatus} /></>}</>}

      {view === "applicants" && <ApplicantManager applicants={applicants} jobs={jobs} onStatus={updateApplicantStatus} onResume={downloadResume} />}

      {view === "company" && <CompanyEditor company={company} onSave={saveCompany} />}
    </section>
  </main>;
}

function ApplicantManager({ applicants, jobs, onStatus, onResume }: { applicants: Applicant[]; jobs: RecruiterJob[]; onStatus: (id: string, status: Applicant["status"]) => Promise<void>; onResume: (resume: NonNullable<Applicant["resume"]>) => Promise<void> }) {
  const [query, setQuery] = useState("");
  const [jobId, setJobId] = useState("All");
  const [status, setStatus] = useState("All");
  const statuses: Applicant["status"][] = ["Applied", "Screening", "Interview", "Offer", "Rejected", "Withdrawn"];
  const visible = applicants.filter((item) => {
    const candidate = item.candidate;
    const text = `${candidate?.name || ""} ${candidate?.headline || ""} ${(candidate?.skills || []).join(" ")}`.toLowerCase();
    return (!query.trim() || text.includes(query.toLowerCase().trim())) && (jobId === "All" || item.recruiter_job_id === jobId) && (status === "All" || item.status === status);
  });
  if (!applicants.length) return <div className="recruiter-empty"><span>◎</span><h2>No applications yet</h2><p>Applicants who apply directly through Hirova will appear here.</p></div>;
  return <div className="applicant-manager"><div className="applicant-filters"><label>⌕<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Candidate name, title, or skill" /></label><select value={jobId} onChange={(event) => setJobId(event.target.value)}><option>All</option>{jobs.map((job) => <option value={job.id} key={job.id}>{job.title}</option>)}</select><select value={status} onChange={(event) => setStatus(event.target.value)}><option>All</option>{statuses.map((item) => <option key={item}>{item}</option>)}</select></div><div className="applicant-list"><header><span>{visible.length} candidate{visible.length === 1 ? "" : "s"}</span><small>Newest applications first</small></header>{visible.map((item) => { const job = jobs.find((entry) => entry.id === item.recruiter_job_id); const candidate = item.candidate; return <article key={item.id}><div className="applicant-avatar">{initials(candidate?.name || "Candidate")}</div><div className="applicant-identity"><b>{candidate?.name || "Hirova candidate"}</b><span>{candidate?.headline || careerLabel(candidate?.career_level)}</span><small>{candidate?.location || "Location not provided"} · {candidate?.experience_years || careerLabel(candidate?.career_level)}</small><div>{(candidate?.skills || []).slice(0, 5).map((skill) => <em key={skill}>{skill}</em>)}</div></div><div className="applicant-role"><small>APPLIED FOR</small><b>{job?.title || "Company role"}</b><span>{new Date(item.applied_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span></div><div className="applicant-actions"><select value={item.status} onChange={(event) => void onStatus(item.id, event.target.value as Applicant["status"])}>{statuses.map((entry) => <option key={entry}>{entry}</option>)}</select>{item.resume ? <button onClick={() => void onResume(item.resume!)}>Resume · {item.resume.score}%</button> : <span>No resume</span>}</div></article>; })}</div></div>;
}

function JobTable({ jobs, onEdit, onStatus }: { jobs: RecruiterJob[]; onEdit: (job: RecruiterJob) => void; onStatus: (job: RecruiterJob, status: RecruiterJob["status"]) => Promise<void> }) {
  if (!jobs.length) return <div className="recruiter-empty"><span>▤</span><h2>No job listings yet</h2><p>Create a complete listing, save it as a draft, or publish it directly to Hirova search.</p></div>;
  return <div className="recruiter-job-table"><div className="recruiter-job-row table-head"><span>ROLE</span><span>LOCATION</span><span>STATUS</span><span>CREATED</span><span>ACTIONS</span></div>{jobs.map((job) => <article className="recruiter-job-row" key={job.id}><div><b>{job.title}</b><small>{job.employment_type} · {job.mode}</small></div><span>{job.location}</span><span className={`job-status ${job.status}`}>{job.status}</span><span>{new Date(job.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span><div className="listing-actions"><button onClick={() => onEdit(job)}>Edit</button>{job.status !== "published" && <button onClick={() => void onStatus(job, "published")}>Publish</button>}{job.status === "published" && <button onClick={() => void onStatus(job, "closed")}>Close</button>}</div></article>)}</div>;
}

function CompanyEditor({ company, onSave }: { company: Company | null; onSave: (draft: typeof blankCompany) => Promise<void> }) {
  const [draft, setDraft] = useState(() => company ? { name: company.name, website: company.website || "", industry: company.industry, location: company.location, description: company.description } : blankCompany);
  const [busy, setBusy] = useState(false);
  function field(key: keyof typeof draft, value: string) { setDraft((current) => ({ ...current, [key]: value })); }
  async function submit(event: FormEvent) { event.preventDefault(); setBusy(true); await onSave(draft); setBusy(false); }
  return <form className="company-editor" onSubmit={submit}><header><div><span className="eyebrow">COMPANY IDENTITY</span><h2>{company ? "Keep your company profile current." : "Tell candidates who you are."}</h2><p>This information is tied to your recruiter account and used on every direct listing.</p></div>{company && <span className={`verification-chip ${company.verification_status}`}>{company.verification_status}</span>}</header><div className="recruiter-form-grid"><label>COMPANY NAME *<input value={draft.name} onChange={(event) => field("name", event.target.value)} minLength={2} required placeholder="Company name" /></label><label>COMPANY WEBSITE<input type="url" pattern="https://.*" value={draft.website} onChange={(event) => field("website", event.target.value)} placeholder="https://company.com" /></label><label>INDUSTRY<input value={draft.industry} onChange={(event) => field("industry", event.target.value)} placeholder="e.g. SaaS, Fintech, Healthcare" /></label><label>HEADQUARTERS / LOCATION<input value={draft.location} onChange={(event) => field("location", event.target.value)} placeholder="e.g. Bengaluru, India" /></label><label className="full">ABOUT THE COMPANY<textarea value={draft.description} onChange={(event) => field("description", event.target.value)} placeholder="What does your company build, who does it serve, and what makes the team distinctive?" /></label></div><footer><small>Company verification can be requested after your public website and work email are available.</small><button className="primary" disabled={busy}>{busy ? "Saving…" : "Save company profile →"}</button></footer></form>;
}

function JobEditor({ job, company, onCancel, onSave }: { job: RecruiterJob | null; company: Company | null; onCancel: () => void; onSave: (draft: JobDraft, publish: boolean) => Promise<void> }) {
  const [draft, setDraft] = useState<JobDraft>(() => job ? {
    title: job.title, location: job.location, mode: job.mode, employment_type: job.employment_type,
    experience: job.experience, salary: job.salary, description: job.description,
    responsibilities: job.responsibilities.join("\n"), skills: job.skills.join(", "), benefits: job.benefits.join("\n"),
    apply_url: job.apply_url || "", category: job.category || "Other",
    min_experience_years: job.min_experience_years?.toString() || "", max_experience_years: job.max_experience_years?.toString() || "",
    career_level: job.career_level || "early", application_method: job.application_method || "native",
    closing_at: job.closing_at ? job.closing_at.slice(0, 10) : "",
  } : blankJob);
  const [busy, setBusy] = useState(false);
  function field(key: keyof typeof draft, value: string) { setDraft((current) => ({ ...current, [key]: value } as typeof current)); }
  async function submit(event: FormEvent) { event.preventDefault(); const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null; setBusy(true); await onSave(draft, submitter?.value === "published"); setBusy(false); }
  return <form className="job-editor" onSubmit={(event) => void submit(event)}><header><button type="button" onClick={onCancel}>← Back to listings</button><span className="eyebrow">{job ? "EDIT LISTING" : "NEW JOB LISTING"}</span><h2>{job ? job.title : `Post a role for ${company?.name || "your company"}.`}</h2><p>Create the listing and choose whether candidates apply directly on Hirova or on your company website.</p></header><div className="recruiter-form-grid">
    <label className="full">JOB TITLE *<input value={draft.title} onChange={(event) => field("title", event.target.value)} minLength={2} required placeholder="e.g. Senior Backend Engineer" /></label>
    <label>LOCATION *<input value={draft.location} onChange={(event) => field("location", event.target.value)} minLength={2} required placeholder="e.g. Bengaluru, India" /></label>
    <label>WORK MODE<select value={draft.mode} onChange={(event) => field("mode", event.target.value)}><option>On-site</option><option>Hybrid</option><option>Remote</option></select></label>
    <label>JOB CATEGORY<select value={draft.category} onChange={(event) => field("category", event.target.value)}><option>Technology</option><option>Product</option><option>Design</option><option>Sales</option><option>Marketing</option><option>Finance</option><option>Human Resources</option><option>Operations</option><option>Other</option></select></label>
    <label>EMPLOYMENT TYPE<select value={draft.employment_type} onChange={(event) => field("employment_type", event.target.value)}><option>Full-time</option><option>Part-time</option><option>Contract</option><option>Internship</option><option>Temporary</option></select></label>
    <label>EXPERIENCE LEVEL<select value={draft.career_level} onChange={(event) => field("career_level", event.target.value)}><option value="intern">Internship / Student</option><option value="early">Early career · under 5 years</option><option value="mid">Mid career · 5–10 years</option><option value="senior">Senior level · over 10 years</option></select></label>
    <label>MINIMUM YEARS<input type="number" min="0" max="60" value={draft.min_experience_years} onChange={(event) => field("min_experience_years", event.target.value)} placeholder="e.g. 3" /></label>
    <label>MAXIMUM YEARS<input type="number" min="0" max="60" value={draft.max_experience_years} onChange={(event) => field("max_experience_years", event.target.value)} placeholder="e.g. 5" /></label>
    <label>SALARY / RANGE<input value={draft.salary} onChange={(event) => field("salary", event.target.value)} placeholder="e.g. ₹18–24L or Salary not disclosed" /></label>
    <label>CLOSING DATE<input type="date" value={draft.closing_at} onChange={(event) => field("closing_at", event.target.value)} /></label>
    <label>APPLICATION METHOD<select value={draft.application_method} onChange={(event) => field("application_method", event.target.value)}><option value="native">Apply directly on Hirova</option><option value="external">Apply on company website</option><option value="both">Hirova and company website</option></select></label>
    {draft.application_method !== "native" && <label>APPLICATION LINK *<input type="url" pattern="https://.*" value={draft.apply_url} onChange={(event) => field("apply_url", event.target.value)} required placeholder="https://company.com/careers/apply" /></label>}
    <label className="full">JOB DESCRIPTION *<textarea className="large" value={draft.description} onChange={(event) => field("description", event.target.value)} minLength={40} maxLength={6000} required placeholder="Describe the role, team, scope, and the outcomes this person will own." /></label>
    <label className="full">KEY RESPONSIBILITIES<textarea value={draft.responsibilities} onChange={(event) => field("responsibilities", event.target.value)} placeholder="One responsibility per line" /></label>
    <label>SKILLS<input value={draft.skills} onChange={(event) => field("skills", event.target.value)} placeholder="Java, Spring Boot, PostgreSQL" /></label><label>BENEFITS<input value={draft.benefits} onChange={(event) => field("benefits", event.target.value)} placeholder="Health insurance, Hybrid work" /></label>
  </div><footer><button type="button" className="secondary-button" onClick={onCancel}>Cancel</button><div><button type="submit" value="draft" disabled={busy} className="secondary-button">Save draft</button><button type="submit" value="published" disabled={busy} className="primary">{busy ? "Saving…" : "Publish job →"}</button></div></footer></form>;
}

function splitItems(value: string) { return value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean).slice(0, 30); }
function initials(value: string) { return value.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "H"; }
function firstName(value: string) { return value.trim().split(/\s+/)[0] || "there"; }
function careerLabel(value?: string) { return ({ intern: "Internship / Student", early: "Early career", mid: "Mid career", senior: "Senior level" } as Record<string, string>)[value || ""] || "Experience not specified"; }
