"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { getBrowserSupabase, useHirovaAuth } from "./auth";

type RecruiterView = "overview" | "jobs" | "company";
type Company = {
  id: string; owner_user_id: string; name: string; website: string | null; industry: string;
  location: string; description: string; verification_status: "unverified" | "pending" | "verified";
};
type RecruiterJob = {
  id: string; company_id: string; recruiter_id: string; title: string; location: string;
  mode: "Remote" | "Hybrid" | "On-site"; employment_type: string; experience: string;
  salary: string; description: string; responsibilities: string[]; skills: string[]; benefits: string[];
  apply_url: string; status: "draft" | "published" | "closed"; published_at: string | null;
  expires_at: string; created_at: string;
};

const blankCompany = { name: "", website: "", industry: "", location: "", description: "" };
const blankJob = {
  title: "", location: "", mode: "On-site" as const, employment_type: "Full-time", experience: "",
  salary: "", description: "", responsibilities: "", skills: "", benefits: "", apply_url: "",
};

export default function RecruiterDashboard() {
  const { userId, name, email, signOut, switchWorkspace } = useHirovaAuth();
  const supabase = useMemo(() => getBrowserSupabase(), []);
  const [view, setView] = useState<RecruiterView>("overview");
  const [company, setCompany] = useState<Company | null>(null);
  const [jobs, setJobs] = useState<RecruiterJob[]>([]);
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
    setJobs((jobData || []) as RecruiterJob[]);
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

  async function saveJob(draft: typeof blankJob, publish: boolean) {
    if (!supabase || !company) return;
    setMessage("");
    const payload = {
      company_id: company.id, recruiter_id: userId, title: draft.title.trim(), location: draft.location.trim(),
      mode: draft.mode, employment_type: draft.employment_type, experience: draft.experience.trim() || "See listing",
      salary: draft.salary.trim() || "Salary not disclosed", description: draft.description.trim(),
      responsibilities: splitItems(draft.responsibilities), skills: splitItems(draft.skills), benefits: splitItems(draft.benefits),
      apply_url: draft.apply_url.trim(), status: publish ? "published" : "draft",
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

  function edit(job: RecruiterJob) { setEditingJob(job); setJobEditorOpen(true); setView("jobs"); }
  const liveCount = jobs.filter((job) => job.status === "published").length;
  const draftCount = jobs.filter((job) => job.status === "draft").length;

  if (loading) return <div className="auth-loading"><span>H</span><p>Loading your hiring workspace…</p></div>;

  return <main className="recruiter-shell">
    <aside className="recruiter-rail">
      <button className="brand recruiter-brand" onClick={() => setView("overview")}><span>H</span> Hirova <small>FOR EMPLOYERS</small></button>
      <nav><button className={view === "overview" ? "active" : ""} onClick={() => setView("overview")}><i>OV</i>Overview</button><button className={view === "jobs" ? "active" : ""} onClick={() => setView("jobs")}><i>JB</i>Job listings <small>{jobs.length}</small></button><button className={view === "company" ? "active" : ""} onClick={() => setView("company")}><i>CO</i>Company profile</button></nav>
      <div className="recruiter-account"><span>{initials(name)}</span><div><b>{name}</b><small>{email}</small></div></div>
      <button className="workspace-switch" onClick={() => void switchWorkspace("job_seeker")}>Switch to job seeker →</button>
      <button className="recruiter-signout" onClick={() => void signOut()}>Sign out</button>
    </aside>

    <section className="recruiter-workspace">
      <header className="recruiter-topbar"><div><span className="eyebrow">HIROVA RECRUITER</span><h1>{view === "company" ? "Your company profile." : view === "jobs" ? "Manage job listings." : `Good to see you, ${firstName(name)}.`}</h1></div>{company && <button className="primary" onClick={() => { setEditingJob(null); setJobEditorOpen(true); setView("jobs"); }}>+ Post a job</button>}</header>
      {message && <div className="recruiter-message">{message}<button onClick={() => setMessage("")}>×</button></div>}

      {!company && view !== "company" ? <section className="company-onboarding"><span>01</span><h2>Create your company workspace</h2><p>Add verified company information before publishing a job. Candidates will see the company name beside every direct listing.</p><button className="primary" onClick={() => setView("company")}>Create company profile →</button></section> : null}

      {view === "overview" && company && <><section className="recruiter-hero"><div><span className="status"><i /> COMPANY WORKSPACE ACTIVE</span><h2>Hire for <em>{company.name}</em> with a clear, direct candidate experience.</h2><p>Publish your own openings alongside Hirova&apos;s verified employer feeds.</p></div><div className="company-badge"><b>{company.name.slice(0, 1).toUpperCase()}</b><span>{company.name}</span><small>{company.location || "Add company location"}</small></div></section><div className="recruiter-metrics"><article><span>Live jobs</span><b>{liveCount}</b><small>Visible in search</small></article><article><span>Drafts</span><b>{draftCount}</b><small>Only your team can see</small></article><article><span>Closed</span><b>{jobs.length - liveCount - draftCount}</b><small>Removed from search</small></article><article><span>Company status</span><b className="verification-text">{company.verification_status}</b><small>Verification workflow</small></article></div><section className="recruiter-section-head"><div><span className="eyebrow">RECENT LISTINGS</span><h2>Your hiring activity</h2></div><button onClick={() => setView("jobs")}>View all jobs →</button></section><JobTable jobs={jobs.slice(0, 5)} onEdit={edit} onStatus={changeStatus} /></>}

      {view === "jobs" && <>{jobEditorOpen ? <JobEditor job={editingJob} company={company} onCancel={() => { setJobEditorOpen(false); setEditingJob(null); }} onSave={saveJob} /> : <><div className="recruiter-list-heading"><div><p>{jobs.length} company listing{jobs.length === 1 ? "" : "s"}</p><div><span><i className="live-dot" /> {liveCount} live</span><span>{draftCount} drafts</span></div></div>{company && <button className="primary" onClick={() => { setEditingJob(null); setJobEditorOpen(true); }}>+ Create listing</button>}</div><JobTable jobs={jobs} onEdit={edit} onStatus={changeStatus} /></>}</>}

      {view === "company" && <CompanyEditor company={company} onSave={saveCompany} />}
    </section>
  </main>;
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

function JobEditor({ job, company, onCancel, onSave }: { job: RecruiterJob | null; company: Company | null; onCancel: () => void; onSave: (draft: typeof blankJob, publish: boolean) => Promise<void> }) {
  const [draft, setDraft] = useState(() => job ? { title: job.title, location: job.location, mode: job.mode, employment_type: job.employment_type, experience: job.experience, salary: job.salary, description: job.description, responsibilities: job.responsibilities.join("\n"), skills: job.skills.join(", "), benefits: job.benefits.join("\n"), apply_url: job.apply_url } : blankJob);
  const [busy, setBusy] = useState(false);
  function field(key: keyof typeof draft, value: string) { setDraft((current) => ({ ...current, [key]: value } as typeof current)); }
  async function submit(event: FormEvent) { event.preventDefault(); const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null; setBusy(true); await onSave(draft, submitter?.value === "published"); setBusy(false); }
  return <form className="job-editor" onSubmit={(event) => void submit(event)}><header><button type="button" onClick={onCancel}>← Back to listings</button><span className="eyebrow">{job ? "EDIT LISTING" : "NEW JOB LISTING"}</span><h2>{job ? job.title : `Post a role for ${company?.name || "your company"}.`}</h2><p>Clear requirements improve candidate quality. Hirova will show the listing as recruiter-posted and preserve your application destination.</p></header><div className="recruiter-form-grid"><label className="full">JOB TITLE *<input value={draft.title} onChange={(event) => field("title", event.target.value)} minLength={2} required placeholder="e.g. Senior Backend Engineer" /></label><label>LOCATION *<input value={draft.location} onChange={(event) => field("location", event.target.value)} minLength={2} required placeholder="e.g. Bengaluru, India" /></label><label>WORK MODE<select value={draft.mode} onChange={(event) => field("mode", event.target.value)}><option>On-site</option><option>Hybrid</option><option>Remote</option></select></label><label>EMPLOYMENT TYPE<select value={draft.employment_type} onChange={(event) => field("employment_type", event.target.value)}><option>Full-time</option><option>Part-time</option><option>Contract</option><option>Internship</option><option>Temporary</option></select></label><label>EXPERIENCE<input value={draft.experience} onChange={(event) => field("experience", event.target.value)} placeholder="e.g. 3–5 years" /></label><label>SALARY / RANGE<input value={draft.salary} onChange={(event) => field("salary", event.target.value)} placeholder="e.g. ₹18–24L or Salary not disclosed" /></label><label>APPLICATION LINK *<input type="url" pattern="https://.*" value={draft.apply_url} onChange={(event) => field("apply_url", event.target.value)} required placeholder="https://company.com/careers/apply" /></label><label className="full">JOB DESCRIPTION *<textarea className="large" value={draft.description} onChange={(event) => field("description", event.target.value)} minLength={40} maxLength={6000} required placeholder="Describe the role, team, scope, and the outcomes this person will own." /></label><label className="full">KEY RESPONSIBILITIES<textarea value={draft.responsibilities} onChange={(event) => field("responsibilities", event.target.value)} placeholder="One responsibility per line" /></label><label>SKILLS<input value={draft.skills} onChange={(event) => field("skills", event.target.value)} placeholder="Java, Spring Boot, PostgreSQL" /></label><label>BENEFITS<input value={draft.benefits} onChange={(event) => field("benefits", event.target.value)} placeholder="Health insurance, Hybrid work" /></label></div><footer><button type="button" className="secondary-button" onClick={onCancel}>Cancel</button><div><button type="submit" value="draft" disabled={busy} className="secondary-button">Save draft</button><button type="submit" value="published" disabled={busy} className="primary">{busy ? "Saving…" : "Publish job →"}</button></div></footer></form>;
}

function splitItems(value: string) { return value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean).slice(0, 30); }
function initials(value: string) { return value.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "H"; }
function firstName(value: string) { return value.trim().split(/\s+/)[0] || "there"; }
