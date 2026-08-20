"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useHirovaAuth } from "./auth";
import { JOBS, Job } from "./product-data";
import { ApplicationStatus, CandidateProfile, useProductStore } from "./product-store";
import { fetchMarketJobs } from "./job-service";

type View = "overview" | "jobs" | "applications" | "resume" | "skills" | "interview" | "profile";
const API_URL = process.env.NEXT_PUBLIC_API_URL || "/api";
const USES_FASTAPI = API_URL.includes("/api/v1");

export default function CareerDashboard() {
  const { signOut, accessToken } = useHirovaAuth();
  const store = useProductStore();
  const [view, setView] = useState<View>(store.profile.profileComplete ? "overview" : "profile");
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("");
  const [mode, setMode] = useState("All");
  const [savedOnly, setSavedOnly] = useState(false);
  const [busy, setBusy] = useState(false);
  const [chat, setChat] = useState("");
  const [answer, setAnswer] = useState("");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [marketJobs, setMarketJobs] = useState<Job[]>(JOBS);
  const [marketTotal, setMarketTotal] = useState(JOBS.length);
  const [jobsLive, setJobsLive] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // 1. Live public listings replace seeds; the seeds remain only as an offline fallback.
  useEffect(() => {
    const controller = new AbortController();
    fetchMarketJobs({ limit: 60, accessToken })
      .then((data: { jobs?: Job[]; marketTotal?: number }) => {
        if (!data.jobs?.length) return;
        setMarketJobs(personalizeJobs(data.jobs, store.profile));
        setMarketTotal(data.marketTotal || data.jobs.length);
        setJobsLive(true);
      }).catch(() => undefined);
    return () => controller.abort();
  }, [accessToken, store.profile]);

  const visibleJobs = useMemo(() => marketJobs.filter((job) => {
    const needle = query.toLowerCase().trim();
    const place = location.toLowerCase().trim();
    const matchesQuery = !needle || `${job.title} ${job.company} ${job.skills.join(" ")}`.toLowerCase().includes(needle);
    const matchesLocation = !place || job.location.toLowerCase().includes(place) || (place.includes("remote") && job.mode === "Remote");
    const matchesMode = mode === "All" || job.mode === mode;
    return matchesQuery && matchesLocation && matchesMode && (!savedOnly || store.saved.includes(job.id));
  }), [location, marketJobs, mode, query, savedOnly, store.saved]);
  const topJob = marketJobs[0] || JOBS[0];

  function navigate(next: View) { setView(next); setNotificationsOpen(false); window.scrollTo({ top: 0, behavior: "smooth" }); }

  async function askCopilot(event: FormEvent) {
    event.preventDefault();
    if (!chat.trim()) return;
    setBusy(true); setAnswer("");
    try {
      const response = await fetch(`${API_URL}${USES_FASTAPI ? "/copilot/ask" : "/copilot"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
        body: JSON.stringify(USES_FASTAPI ? { question: chat, candidate_id: store.profile.email } : { question: chat, profile: store.profile, jobs: marketJobs.slice(0, 5) }),
      });
      if (!response.ok) throw new Error("Copilot service unavailable");
      const data = await response.json();
      setAnswer(data.answer);
    } catch {
      const top = topJob;
      setAnswer(`${top.company} is your strongest current match at ${top.match}%. Add evidence for ${top.missing[0]} before applying, then tailor your summary to ${top.skills.slice(0, 2).join(" and ")}.`);
    } finally { setBusy(false); }
  }

  async function handleResume(file?: File) {
    if (!file) return;
    setBusy(true);
    let score = 78;
    let skills = store.profile.skills.length ? store.profile.skills : ["Communication", "Problem solving", "Collaboration"];
    try {
      const body = new FormData(); body.append("file", file);
      const response = await fetch(`${API_URL}${USES_FASTAPI ? "/resumes/upload" : "/resume"}`, { method: "POST", headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined, body });
      if (response.ok) {
        const data = await response.json();
        score = Math.round(data.analysis?.score || data.score || score);
        skills = data.analysis?.skills || data.skills || skills;
      }
    } catch { /* The device workspace still records the upload when the API is offline. */ }
    store.setResume({ name: file.name, uploadedAt: new Date().toISOString(), score, skills });
    setBusy(false);
  }

  const incomplete = !store.profile.profileComplete;
  const profileScore = scoreProfile(store.profile, store.resume !== null);

  return <main className="shell">
    <aside className="rail">
      <button className="brand" onClick={() => navigate("overview")}><span>H</span> Hirova</button>
      <nav aria-label="Primary navigation">
        <NavButton icon="OV" label="Overview" active={view === "overview"} onClick={() => navigate("overview")} />
        <NavButton icon="JB" label="Find jobs" active={view === "jobs"} badge={marketTotal > 999 ? `${Math.floor(marketTotal / 100) / 10}k` : String(marketTotal)} onClick={() => navigate("jobs")} />
        <NavButton icon="AP" label="Applications" active={view === "applications"} badge={store.applications.length ? String(store.applications.length) : undefined} onClick={() => navigate("applications")} />
        <NavButton icon="CV" label="Resume" active={view === "resume"} onClick={() => navigate("resume")} />
        <NavButton icon="SK" label="Skill gaps" active={view === "skills"} onClick={() => navigate("skills")} />
        <NavButton icon="IV" label="Interview prep" active={view === "interview"} onClick={() => navigate("interview")} />
      </nav>
      <button className="rail-help" onClick={() => navigate("skills")}><i>{profileScore}</i><div><b>Career readiness</b><small>{profileScore}% profile strength</small></div></button>
      <button className="rail-foot" onClick={() => navigate("profile")}><div className="avatar">{initials(store.profile.name)}</div><div><b>{store.profile.name}</b><small>View & edit profile</small></div><span>›</span></button>
    </aside>

    <section className="workspace">
      <header className="topbar">
        <div><span className="eyebrow">{todayLabel()}</span><h1>{view === "overview" ? `Welcome${store.profile.name && store.profile.name !== "Hirova member" ? `, ${firstName(store.profile.name)}` : ""}.` : titleFor(view)}</h1></div>
        <div className="top-actions"><button className="profile-shortcut" onClick={() => navigate("profile")}><span className="avatar">{initials(store.profile.name)}</span><b>{store.profile.name}</b></button><button className="icon-button" onClick={() => setNotificationsOpen(!notificationsOpen)} aria-label="Notifications">••<i /></button></div>
        {notificationsOpen && <div className="notifications"><div><b>Notifications</b><button onClick={() => setNotificationsOpen(false)}>×</button></div><p><i className="green-dot" /> New roles match your preferences.<small>12 minutes ago</small></p><p><i className="amber-dot" /> Complete your profile to improve ranking.<small>Today</small></p><button onClick={() => navigate("profile")}>Open profile →</button></div>}
      </header>

      {incomplete && view !== "profile" && <div className="setup-banner"><span>01</span><div><b>Finish your profile to unlock personal matches</b><p>Add your role, skills, location, and preferences. It takes about 3 minutes.</p></div><button onClick={() => navigate("profile")}>Complete profile →</button></div>}
      {view === "overview" && <Overview profile={store.profile} profileScore={profileScore} saved={store.saved} applications={store.applications.length} jobs={marketJobs} marketTotal={marketTotal} jobsLive={jobsLive} onNavigate={navigate} onSave={store.toggleSaved} />}
      {view === "jobs" && <JobsView jobs={visibleJobs} marketTotal={marketTotal} jobsLive={jobsLive} query={query} location={location} mode={mode} savedOnly={savedOnly} setQuery={setQuery} setLocation={setLocation} setMode={setMode} setSavedOnly={setSavedOnly} saved={store.saved} applications={store.applications.map((item) => item.jobId)} onSave={store.toggleSaved} onApply={(job) => { store.apply(job.id); if (job.sourceUrl) window.open(job.sourceUrl, "_blank", "noopener,noreferrer"); navigate("applications"); }} />}
      {view === "applications" && <ApplicationsView applications={store.applications} jobs={marketJobs} onUpdate={store.updateApplication} onFind={() => navigate("jobs")} />}
      {view === "resume" && <ResumeView busy={busy} resume={store.resume} fileRef={fileRef} onFile={handleResume} />}
      {view === "skills" && <SkillsView profile={store.profile} onInterview={() => navigate("interview")} />}
      {view === "interview" && <InterviewView applications={store.applications.map((item) => item.jobId)} jobs={marketJobs} />}
      {view === "profile" && <ProfileView profile={store.profile} onSave={(profile) => { store.setProfile(profile); navigate("overview"); }} onSignOut={signOut} />}
    </section>

    <aside className="insights">
      <div className="insights-head"><span className="spark">AI</span><div><span className="eyebrow">CAREER ASSISTANT</span><h3>Ask Hirova</h3></div></div>
      <div className="insight-card"><span className="label">NEXT BEST ACTION</span><p>{store.resume ? <>Tailor your resume for <b>{topJob.company}</b> before applying.</> : <>Upload your resume to calculate <b>evidence-based matches</b>.</>}</p><button onClick={() => navigate("resume")}>{store.resume ? "Tailor resume" : "Upload resume"} <span>→</span></button></div>
      <form className="copilot-chat" onSubmit={askCopilot}><label htmlFor="copilot-question">ASK ABOUT YOUR CAREER</label><textarea id="copilot-question" value={chat} onChange={(event) => setChat(event.target.value)} placeholder="Which role should I prioritise?" /><button disabled={busy || !chat.trim()}>{busy ? "Reviewing…" : "Ask Hirova"} <span>→</span></button>{answer && <div className="ai-answer"><i>→</i><p>{answer}</p></div>}</form>
      <div className="activity-card"><span className="label">YOUR ACTIVITY</span><div><b>{store.saved.length}</b><small>Saved</small><b>{store.applications.length}</b><small>Applied</small></div><button onClick={() => navigate("applications")}>View application tracker →</button></div>
    </aside>
  </main>;
}

function NavButton({ icon, label, active, badge, onClick }: { icon: string; label: string; active: boolean; badge?: string; onClick: () => void }) {
  return <button className={active ? "active" : ""} onClick={onClick}><i>{icon}</i><span>{label}</span>{badge && <small>{badge}</small>}</button>;
}

function Overview({ profile, profileScore, saved, applications, jobs, marketTotal, jobsLive, onNavigate, onSave }: { profile: CandidateProfile; profileScore: number; saved: string[]; applications: number; jobs: Job[]; marketTotal: number; jobsLive: boolean; onNavigate: (view: View) => void; onSave: (id: string) => void }) {
  return <>
    <div className="hero"><div><span className="status"><i /> LIVE CAREER WORKSPACE</span><h2>{profile.headline ? <>Your next <em>{profile.headline.toLowerCase()}</em> role starts here.</> : <>Build a profile recruiters<br/><em>can believe in.</em></>}</h2><p>{profile.preferredLocations.length ? `Tracking opportunities in ${profile.preferredLocations.join(", ")}.` : "Set your role and location preferences to improve recommendations."}</p></div><div className="hero-score"><span>Profile strength</span><strong>{profileScore}<small>%</small></strong><div className="meter"><i style={{ width: `${profileScore}%` }} /></div><small>{profileScore < 80 ? "Complete key sections to stand out" : "Your profile is recruiter-ready"}</small></div></div>
    <div className="search-card"><button className="search-field" onClick={() => onNavigate("jobs")}><span>⌕</span><div><small>ROLE OR SKILL</small><b>{profile.preferredRoles[0] || "Search all opportunities"}</b></div></button><button className="search-field" onClick={() => onNavigate("jobs")}><span>⌖</span><div><small>LOCATION</small><b>{profile.preferredLocations[0] || "India · Remote"}</b></div></button><button onClick={() => onNavigate("jobs")}>Explore jobs <span>→</span></button></div>
    <div className="metric-row"><article><span>Live market roles</span><b>{marketTotal.toLocaleString("en-IN")}</b><small>{jobsLive ? "Refreshed from verified sources" : "Offline preview listings"}</small></article><article><span>Saved jobs</span><b>{saved.length}</b><small>Review shortlist</small></article><article><span>Applications</span><b>{applications}</b><small>Track progress</small></article><article><span>Profile views</span><b>—</b><small>Available after recruiter launch</small></article></div>
    <section className="section-head"><div><span className="eyebrow">RECOMMENDED FOR YOUR PROFILE</span><h3>Jobs worth exploring</h3></div><button onClick={() => onNavigate("jobs")}>View live jobs →</button></section>
    <div className="job-grid">{jobs.slice(0, 3).map((job) => <JobCard key={job.id} job={job} saved={saved.includes(job.id)} onSave={onSave} onOpen={() => onNavigate("jobs")} />)}</div>
    <div className="progress-strip"><div><span className="progress-icon">↗</span><p><b>{profile.profileComplete ? "Your workspace is ready." : "Your profile needs a few details."}</b><small>{profile.profileComplete ? "Save roles and track every application in one place." : "Complete your profile before sending applications."}</small></p></div><button onClick={() => onNavigate(profile.profileComplete ? "applications" : "profile")}>{profile.profileComplete ? "Track applications" : "Complete profile"}</button></div>
  </>;
}

function JobsView({ jobs, marketTotal, jobsLive, query, location, mode, savedOnly, setQuery, setLocation, setMode, setSavedOnly, saved, applications, onSave, onApply }: { jobs: Job[]; marketTotal: number; jobsLive: boolean; query: string; location: string; mode: string; savedOnly: boolean; setQuery: (value: string) => void; setLocation: (value: string) => void; setMode: (value: string) => void; setSavedOnly: (value: boolean) => void; saved: string[]; applications: string[]; onSave: (id: string) => void; onApply: (job: Job) => void }) {
  const [selectedId, setSelectedId] = useState(jobs[0]?.id || "");
  const selected = jobs.find((job) => job.id === selectedId) || jobs[0];
  return <div className="view-stack"><div className="page-intro"><span className="eyebrow">SEARCH · COMPARE · APPLY</span><h2>Find work that moves you forward.</h2><p>Search by role, skill, company, location, or work mode. Match explanations show what fits and what is missing.</p></div>
    <div className="filter-row"><label>⌕<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Role, company, or skill" /></label><label>⌖<input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="City or remote" /></label><select value={mode} onChange={(event) => setMode(event.target.value)} aria-label="Work mode"><option>All</option><option>Remote</option><option>Hybrid</option><option>On-site</option></select><button className={savedOnly ? "filter-active" : ""} onClick={() => setSavedOnly(!savedOnly)}>♡ Saved <span>{saved.length}</span></button></div>
    <div className="job-browser"><div className="job-list"><small>{jobs.length} SHOWN · {marketTotal.toLocaleString("en-IN")} INDEXED · {jobsLive ? "LIVE SOURCES" : "OFFLINE FALLBACK"}</small>{jobs.length ? jobs.map((job) => <button key={job.id} className={`list-job ${selected?.id === job.id ? "selected" : ""}`} onClick={() => setSelectedId(job.id)}><span className={`company-logo ${job.color}`}>{job.logo}</span><div><b>{job.title}</b><small>{job.company} · {job.location}</small><span>{job.salary} · {job.mode} · {job.posted}</span></div><em>{job.match}%</em></button>) : <div className="empty-inline"><b>No matching jobs</b><p>Clear a filter or try a broader role.</p></div>}</div>
      {selected ? <div className="job-detail"><div className="detail-top"><span className={`company-logo large ${selected.color}`}>{selected.logo}</span><button onClick={() => onSave(selected.id)}>{saved.includes(selected.id) ? "♥ Saved" : "♡ Save"}</button></div><span className="match">{selected.match}% PROFILE MATCH</span><h2>{selected.title}</h2><p className="muted">{selected.company} · {selected.location} · {selected.posted}</p><div className="detail-facts"><span><small>SALARY</small>{selected.salary}</span><span><small>WORK MODE</small>{selected.mode}</span><span><small>EXPERIENCE</small>{selected.experience}</span></div><h4>Why this fits you</h4><p>{selected.why}</p><div className="fit-columns"><div><small>SKILLS THAT MATCH</small>{selected.skills.map((skill) => <span className="fit-chip good" key={skill}>✓ {skill}</span>)}</div><div><small>GAPS TO ADDRESS</small>{selected.missing.map((skill) => <span className="fit-chip gap" key={skill}>+ {skill}</span>)}</div></div><h4>About the role</h4><p>{selected.description}</p><ul>{selected.responsibilities.map((item) => <li key={item}>{item}</li>)}</ul><button className="primary wide" disabled={applications.includes(selected.id)} onClick={() => onApply(selected)}>{applications.includes(selected.id) ? "Application tracked ✓" : selected.sourceUrl ? `Apply on ${selected.source || "original listing"}` : "Apply & track"} <span>↗</span></button><small className="applicant-note">{selected.source ? `Source: ${selected.source} · opens the original application` : "Review company details before applying"}</small></div> : <div className="job-detail empty-state"><span>⌕</span><h3>No job selected</h3><p>Adjust your search to see role details.</p></div>}
    </div></div>;
}

function ApplicationsView({ applications, jobs, onUpdate, onFind }: { applications: ReturnType<typeof useProductStore>["applications"]; jobs: Job[]; onUpdate: (jobId: string, status: ApplicationStatus, note?: string) => void; onFind: () => void }) {
  const statuses: ApplicationStatus[] = ["Applied", "Screening", "Interview", "Offer", "Rejected"];
  if (!applications.length) return <EmptyState icon="◷" title="No applications yet" text="When you apply to a role, it appears here with notes and status tracking." action="Find matching jobs" onAction={onFind} />;
  return <div className="view-stack"><div className="page-intro"><span className="eyebrow">YOUR JOB SEARCH PIPELINE</span><h2>Every application, under control.</h2><p>Update progress after recruiter conversations and keep important notes beside each role.</p></div><div className="pipeline-summary">{statuses.slice(0, 4).map((status) => <article key={status}><span>{status}</span><b>{applications.filter((item) => item.status === status).length}</b></article>)}</div><div className="application-list">{applications.map((application) => { const job = jobs.find((item) => item.id === application.jobId) || JOBS.find((item) => item.id === application.jobId); if (!job) return null; return <article key={application.jobId}><span className={`company-logo ${job.color}`}>{job.logo}</span><div className="application-main"><b>{job.title}</b><small>{job.company} · Applied {new Date(application.appliedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</small><input value={application.note} onChange={(event) => onUpdate(job.id, application.status, event.target.value)} placeholder="Add recruiter name, follow-up date, or notes" /></div><label>STATUS<select value={application.status} onChange={(event) => onUpdate(job.id, event.target.value as ApplicationStatus, application.note)}>{statuses.map((status) => <option key={status}>{status}</option>)}</select></label></article>; })}</div></div>;
}

function ResumeView({ busy, resume, fileRef, onFile }: { busy: boolean; resume: ReturnType<typeof useProductStore>["resume"]; fileRef: React.RefObject<HTMLInputElement | null>; onFile: (file?: File) => void }) {
  return <div className="view-stack"><div className="page-intro"><span className="eyebrow">RESUME INTELLIGENCE</span><h2>Make every line earn its place.</h2><p>Upload PDF, DOCX, or TXT. Hirova extracts evidence, scores clarity, and prepares role-specific improvements.</p></div><button className={`upload-zone ${resume ? "uploaded" : ""}`} onClick={() => fileRef.current?.click()} onDrop={(event) => { event.preventDefault(); onFile(event.dataTransfer.files[0]); }} onDragOver={(event) => event.preventDefault()}><input ref={fileRef} type="file" accept=".pdf,.docx,.txt" hidden onChange={(event) => onFile(event.target.files?.[0])} /><span>{busy ? "…" : resume ? "✓" : "⇧"}</span><h3>{busy ? "Reading your resume…" : resume ? resume.name : "Drop your resume here"}</h3><p>{resume ? `Uploaded ${new Date(resume.uploadedAt).toLocaleDateString("en-IN")} · click to replace` : "or click to browse · maximum 10 MB"}</p></button>{resume && <div className="analysis-grid"><article className="score-panel"><span className="label">RESUME SCORE</span><strong>{resume.score}<small>/100</small></strong><div className="meter"><i style={{ width: `${resume.score}%` }} /></div><p>Good foundation. Focus on evidence, scope, and measurable outcomes.</p></article><AnalysisCard number="01" title="Quantify outcomes" text="Replace task descriptions with adoption, conversion, revenue, quality, or time-saved evidence." tag="High impact" /><AnalysisCard number="02" title="Clarify ownership" text="State what you personally decided, led, shipped, and measured in each major project." tag="High impact" /><AnalysisCard number="03" title="Tailor to each role" text="Mirror the role’s critical language only where your experience genuinely supports it." tag="Recommended" /></div>}</div>;
}

function AnalysisCard({ number, title, text, tag }: { number: string; title: string; text: string; tag: string }) { return <article className="analysis-card"><span className="number">{number}</span><div><b>{title}</b><p>{text}</p></div><em>{tag}</em></article>; }

function SkillsView({ profile, onInterview }: { profile: CandidateProfile; onInterview: () => void }) {
  const skills = profile.skills.length ? profile.skills.slice(0, 5) : ["Add profile skills", "Communication", "Problem solving"];
  return <div className="view-stack"><div className="page-intro"><span className="eyebrow">SKILL-GAP ANALYSIS</span><h2>Build what your target roles demand.</h2><p>Your roadmap compares profile evidence with requirements across the roles you want.</p></div><div className="skill-map"><article><span className="label">AVERAGE ROLE READINESS</span><strong>{profile.skills.length ? "81%" : "42%"}</strong><div className="ring"/><p>{profile.skills.length ? "You have a strong base for the roles in your preference set." : "Add skills and a resume for an evidence-based score."}</p></article><div className="skill-rows">{skills.map((name, index) => { const value = profile.skills.length ? 91 - index * 9 : 42 - index * 6; return <div className="skill-row" key={name}><div><b>{name}</b><span>{value > 70 ? "Strong" : "Build next"}</span></div><div className="track"><i style={{ width: `${value}%` }}/></div><strong>{value}%</strong></div>; })}</div></div><section className="learning-plan"><div><span className="eyebrow">PERSONALISED 14-DAY SPRINT</span><h3>Close your highest-impact evidence gap</h3><p>Finish three focused tasks and leave with a portfolio-ready interview story.</p></div><ol><li><span>01</span>Map a real product problem and success metric<small>45 min</small></li><li><span>02</span>Prototype the critical workflow and fallbacks<small>90 min</small></li><li><span>03</span>Write a STAR-format decision story<small>60 min</small></li></ol><button className="primary" onClick={onInterview}>Practise this story →</button></section></div>;
}

function InterviewView({ applications, jobs }: { applications: string[]; jobs: Job[] }) {
  const roles = applications.length ? jobs.filter((job) => applications.includes(job.id)) : jobs.slice(0, 3);
  const [roleId, setRoleId] = useState(roles[0]?.id || jobs[0]?.id || JOBS[0].id);
  const [started, setStarted] = useState(false);
  const [typed, setTyped] = useState("");
  const [feedback, setFeedback] = useState("");
  const role = jobs.find((job) => job.id === roleId) || jobs[0] || JOBS[0];
  return <div className="view-stack"><div className="page-intro"><span className="eyebrow">ADAPTIVE INTERVIEW COACH</span><h2>Practise for the role you actually want.</h2><p>Questions are grounded in the selected job, your profile, and the likely evidence gaps.</p></div><div className="interview-layout"><div className="prep-card"><label>TARGET ROLE<select value={roleId} onChange={(event) => { setRoleId(event.target.value); setStarted(false); setFeedback(""); }}>{roles.map((job) => <option value={job.id} key={job.id}>{job.company} · {job.title}</option>)}</select></label><span className="match">{role.match}% MATCH</span><h3>{role.title}</h3><p>6-question adaptive mock · about 25 minutes</p><div className="prep-list"><span>01 <b>Product judgement</b><small>2 questions</small></span><span>02 <b>{role.skills[0]}</b><small>2 questions</small></span><span>03 <b>Leadership & impact</b><small>2 questions</small></span></div><button className="primary wide" onClick={() => setStarted(true)}>{started ? "Session in progress" : "Start mock interview"} →</button></div><div className="coach-card"><div className="coach-head"><i>✦</i><div><b>Hirova interview coach</b><small>{started ? "Question 1 of 6" : "Ready when you are"}</small></div></div><p className="question">“Tell me about a complex product decision you led. What trade-offs did you make, and how did you measure success?”</p><textarea disabled={!started} value={typed} onChange={(event) => setTyped(event.target.value)} placeholder={started ? "Structure your answer with situation, decision, action, and measurable result…" : "Start the interview to answer"}/><div className="coach-actions"><span>{typed.trim().split(/\s+/).filter(Boolean).length} words</span><button className="primary" disabled={!typed.trim()} onClick={() => setFeedback("Strong structure. Add one measurable result and make your personal decision clearer before discussing the team’s work.")}>Evaluate answer →</button></div>{feedback && <div className="coach-feedback"><b>Coach feedback</b><p>{feedback}</p></div>}</div></div></div>;
}

function ProfileView({ profile, onSave, onSignOut }: { profile: CandidateProfile; onSave: (profile: CandidateProfile) => void; onSignOut: () => Promise<void> }) {
  const [draft, setDraft] = useState(profile);
  const [skillInput, setSkillInput] = useState("");
  function field<K extends keyof CandidateProfile>(key: K, value: CandidateProfile[K]) { setDraft((current) => ({ ...current, [key]: value })); }
  function addSkill() { const value = skillInput.trim(); if (value && !draft.skills.includes(value)) field("skills", [...draft.skills, value]); setSkillInput(""); }
  function submit(event: FormEvent) { event.preventDefault(); if (!draft.name.trim() || !draft.headline.trim() || !draft.location.trim()) return; onSave(draft); }
  return <div className="view-stack profile-view"><div className="profile-cover"><div className="profile-avatar">{initials(draft.name)}</div><div><span className="eyebrow">CANDIDATE PROFILE</span><h2>{draft.name || "Your name"}</h2><p>{draft.headline || "Add a professional headline"}</p></div><label className="open-toggle"><input type="checkbox" checked={draft.openToWork} onChange={(event) => field("openToWork", event.target.checked)} /><span /> Open to work</label></div><form className="profile-form" onSubmit={submit}><section><div className="form-section-head"><div><b>Personal details</b><p>Recruiters use these details to understand your current direction.</p></div><span>Required fields *</span></div><div className="form-grid"><label>FULL NAME *<input value={draft.name} onChange={(event) => field("name", event.target.value)} placeholder="Your full name" required /></label><label>EMAIL<input value={draft.email} disabled /></label><label>PHONE NUMBER<input value={draft.phone} onChange={(event) => field("phone", event.target.value)} placeholder="+91 98765 43210" /></label><label>CURRENT LOCATION *<input value={draft.location} onChange={(event) => field("location", event.target.value)} placeholder="Bengaluru" required /></label><label className="wide">PROFESSIONAL HEADLINE *<input value={draft.headline} onChange={(event) => field("headline", event.target.value)} placeholder="e.g. Senior Product Designer · Fintech & Design Systems" required /></label><label>EXPERIENCE<select value={draft.experienceYears} onChange={(event) => field("experienceYears", event.target.value)}><option value="">Select experience</option><option>0–2 years</option><option>3–5 years</option><option>6–8 years</option><option>9–12 years</option><option>13+ years</option></select></label><label>NOTICE PERIOD<select value={draft.noticePeriod} onChange={(event) => field("noticePeriod", event.target.value)}><option value="">Select notice period</option><option>Immediate</option><option>15 days</option><option>30 days</option><option>60 days</option><option>90 days</option></select></label><label className="wide">ABOUT YOU<textarea value={draft.bio} onChange={(event) => field("bio", event.target.value)} placeholder="Summarise the problems you solve, the teams you work with, and the outcomes you create." /></label></div></section><section><div className="form-section-head"><div><b>Skills</b><p>Add skills you can support with real work evidence.</p></div><span>{draft.skills.length} added</span></div><div className="skill-editor"><div>{draft.skills.map((skill) => <button type="button" key={skill} onClick={() => field("skills", draft.skills.filter((item) => item !== skill))}>{skill} ×</button>)}</div><label><input value={skillInput} onChange={(event) => setSkillInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addSkill(); } }} placeholder="Type a skill and press Enter"/><button type="button" onClick={addSkill}>Add</button></label></div></section><section><div className="form-section-head"><div><b>Job preferences</b><p>These settings shape recommendations and alerts.</p></div></div><div className="form-grid"><label className="wide">TARGET ROLES<input value={draft.preferredRoles.join(", ")} onChange={(event) => field("preferredRoles", splitList(event.target.value))} placeholder="Product Designer, UX Designer" /></label><label>PREFERRED LOCATIONS<input value={draft.preferredLocations.join(", ")} onChange={(event) => field("preferredLocations", splitList(event.target.value))} placeholder="Bengaluru, Remote" /></label><label>EXPECTED SALARY<input value={draft.expectedSalary} onChange={(event) => field("expectedSalary", event.target.value)} placeholder="e.g. ₹30–40L" /></label></div></section><div className="profile-actions"><button type="button" className="danger-text" onClick={onSignOut}>Sign out</button><button className="primary" disabled={!draft.name.trim() || !draft.headline.trim() || !draft.location.trim()}>Save profile →</button></div></form></div>;
}

function JobCard({ job, saved, onSave, onOpen }: { job: Job; saved: boolean; onSave: (id: string) => void; onOpen: () => void }) { return <article className={`job-card ${job.match > 90 ? "featured" : ""}`}><div className="job-top"><button className={`company-logo ${job.color}`} onClick={onOpen}>{job.logo}</button><button className="save-heart" aria-label={saved ? "Unsave job" : "Save job"} onClick={() => onSave(job.id)}>{saved ? "♥" : "♡"}</button></div><button className="job-card-link" onClick={onOpen}><span className="match">{job.match}% MATCH</span><h4>{job.title}</h4><p>{job.company} · {job.location}</p><div className="tags"><span>{job.salary}</span><span>{job.mode}</span><span>{job.experience}</span></div><div className="job-foot"><span>{job.posted}</span><b>View role →</b></div></button></article>; }

function EmptyState({ icon, title, text, action, onAction }: { icon: string; title: string; text: string; action: string; onAction: () => void }) { return <div className="empty-state full"><span>{icon}</span><h2>{title}</h2><p>{text}</p><button className="primary" onClick={onAction}>{action} →</button></div>; }

function titleFor(view: View) { return ({ jobs: "Find your next role.", applications: "Your application tracker.", resume: "Your resume, upgraded.", skills: "Build what matters next.", interview: "Walk in prepared.", profile: "Your professional profile.", overview: "Welcome." })[view]; }
function firstName(name: string) { return name.trim().split(/\s+/)[0] || "there"; }
function initials(name: string) { return name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "H"; }
function splitList(value: string) { return value.split(",").map((item) => item.trim()).filter(Boolean); }
function todayLabel() { return new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long" }).format(new Date()).toUpperCase(); }
function scoreProfile(profile: CandidateProfile, hasResume: boolean) { return Math.min(100, 20 + (profile.name ? 8 : 0) + (profile.headline ? 14 : 0) + (profile.location ? 8 : 0) + (profile.phone ? 6 : 0) + (profile.bio ? 10 : 0) + Math.min(profile.skills.length * 3, 15) + (profile.preferredRoles.length ? 7 : 0) + (profile.preferredLocations.length ? 5 : 0) + (profile.experienceYears ? 4 : 0) + (hasResume ? 13 : 0)); }

// 2. Explainable ranking rewards role, skill, and location overlap without inventing requirements.
function personalizeJobs(jobs: Job[], profile: CandidateProfile): Job[] {
  const roles = profile.preferredRoles.map((value) => value.toLowerCase());
  const skills = profile.skills.map((value) => value.toLowerCase());
  const locations = profile.preferredLocations.map((value) => value.toLowerCase());
  const hasProfile = roles.length + skills.length + locations.length > 0;
  return jobs.map((job) => {
    if (!hasProfile) return job;
    const title = job.title.toLowerCase();
    const text = `${job.title} ${job.company} ${job.description} ${job.skills.join(" ")}`.toLowerCase();
    const roleHits = roles.filter((role) => title.includes(role) || role.split(/\s+/).every((term) => text.includes(term)));
    const skillHits = skills.filter((skill) => text.includes(skill));
    const locationHit = locations.some((place) => job.location.toLowerCase().includes(place) || (place.includes("remote") && job.mode === "Remote"));
    const score = Math.min(97, 55 + Math.min(22, roleHits.length * 14) + Math.min(15, skillHits.length * 4) + (locationHit ? 7 : 0));
    const missing = job.skills.filter((skill) => !skills.includes(skill.toLowerCase())).slice(0, 3);
    const evidence = [...roleHits.slice(0, 1), ...skillHits.slice(0, 2)].filter(Boolean);
    const why = evidence.length
      ? `Your profile overlaps on ${evidence.join(", ")}${locationHit ? " and your location preference" : ""}. Review the original requirements before applying.`
      : "This is a current opening near your broader preferences. Add more profile skills and target roles to sharpen the ranking.";
    return { ...job, match: score, missing: missing.length ? missing : ["Review full requirements"], why };
  }).sort((a, b) => b.match - a.match || Date.parse(b.postedAt || "") - Date.parse(a.postedAt || ""));
}
