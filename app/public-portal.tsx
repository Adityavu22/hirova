"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { Job } from "./product-data";
import { fetchMarketJobs, type JobFeed } from "./job-service";
import type { AccountType } from "./auth";

const CAREER_LEVELS = [
  ["intern", "Internship / Student"], ["early", "Early career · under 5 years"],
  ["mid", "Mid career · 5–10 years"], ["senior", "Senior level · over 10 years"],
] as const;
const FALLBACK_CATEGORIES = ["Technology", "Product", "Design", "Sales", "Marketing", "Finance", "Human Resources", "Operations"];

export default function PublicPortal({ onSignIn }: { onSignIn: (accountType?: AccountType) => void }) {
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("India");
  const [mode, setMode] = useState("All");
  const [category, setCategory] = useState("All");
  const [careerLevel, setCareerLevel] = useState("All");
  const [employmentType, setEmploymentType] = useState("All");
  const [postedWithinDays, setPostedWithinDays] = useState(30);
  const [sort, setSort] = useState<"relevance" | "newest">("relevance");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selected, setSelected] = useState<Job | null>(null);
  const [meta, setMeta] = useState<JobFeed | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void fetchMarketJobs({ location: "India", postedWithinDays: 30, limit: 80 })
      .then((data) => { if (active) { setJobs(data.jobs); setMeta(data); setSelected(data.jobs[0] || null); } })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Unable to load jobs."); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, []);

  async function search(event?: FormEvent) {
    event?.preventDefault();
    await runSearch();
    if (event) document.getElementById("jobs")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function runSearch(overrides: { category?: string } = {}) {
    setBusy(true); setError("");
    try {
      const data = await fetchMarketJobs({ query, location, mode, category: overrides.category ?? category, careerLevel, employmentType, postedWithinDays, sort, limit: 100 });
      setJobs(data.jobs); setMeta(data); setSelected(data.jobs[0] || null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load jobs."); }
    finally { setBusy(false); }
  }

  function chooseCategory(value: string) { setCategory(value); void runSearch({ category: value }); }
  const categories = useMemo(() => meta?.categories?.length ? meta.categories.filter((item) => item !== "Other").slice(0, 8) : FALLBACK_CATEGORIES, [meta]);

  return <main className="public-shell">
    <header className="public-header">
      <button className="public-brand" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}><span>H</span> Hirova</button>
      <nav aria-label="Public navigation"><a href="#jobs">Jobs</a><button onClick={() => onSignIn("recruiter")}>For employers</button><button onClick={() => onSignIn("job_seeker")}>Log in</button><button className="public-join" onClick={() => onSignIn("job_seeker")}>Register</button></nav>
    </header>

    <section className="public-hero">
      <div><span className="public-kicker"><i /> OPPORTUNITIES ACROSS INDIA AND WORLDWIDE</span><h1>Get hired<br/><em>smarter.</em></h1><p>Search roles by skills, location, experience and the way you want to work.</p></div>
      <aside><b>{meta?.marketTotal ? `${meta.marketTotal.toLocaleString("en-IN")}+` : "5,000+"}</b><span>live openings</span><small>Across India and worldwide</small></aside>
    </section>

    <form className="public-search public-search-primary" onSubmit={search}>
      <label><span>ROLE OR SKILL</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Software engineer, Java, product design" /></label>
      <label><span>LOCATION</span><input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Bengaluru, Mumbai, Remote" /></label>
      <label><span>EXPERIENCE LEVEL</span><select value={careerLevel} onChange={(event) => setCareerLevel(event.target.value)}><option value="All">All experience levels</option>{CAREER_LEVELS.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
      <button disabled={busy}>{busy ? "Searching…" : "Search jobs"}</button>
    </form>

    <section className="public-discovery" aria-label="Job search filters">
      <select value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Job category"><option>All</option>{categories.map((item) => <option key={item}>{item}</option>)}</select>
      <select value={mode} onChange={(event) => setMode(event.target.value)} aria-label="Work mode"><option>All</option><option>Remote</option><option>Hybrid</option><option>On-site</option></select>
      <select value={employmentType} onChange={(event) => setEmploymentType(event.target.value)} aria-label="Employment type"><option>All</option><option>Full-time</option><option>Part-time</option><option>Contract</option><option>Internship</option><option>Temporary</option></select>
      <select value={postedWithinDays} onChange={(event) => setPostedWithinDays(Number(event.target.value))} aria-label="Date posted"><option value={1}>Past 24 hours</option><option value={7}>Past 7 days</option><option value={30}>Past 30 days</option></select>
      <select value={sort} onChange={(event) => setSort(event.target.value as "relevance" | "newest")} aria-label="Sort jobs"><option value="relevance">Most relevant</option><option value="newest">Newest first</option></select>
      <button onClick={() => void search()}>Apply filters</button>
    </section>

    <section className="public-browse" id="categories"><div className="public-section-title"><span>Browse by category</span><button onClick={() => { setCategory("All"); void runSearch({ category: "All" }); }}>View all jobs →</button></div><div className="browse-grid">{categories.map((item) => <button key={item} onClick={() => chooseCategory(item)}><span>{categoryIcon(item)}</span><b>{item}</b><i>→</i></button>)}</div></section>

    <section className="public-results" id="jobs">
      <div className="public-result-head"><div><span className="public-kicker"><i /> JOBS</span><h2>{busy ? "Finding current openings…" : `${meta?.total?.toLocaleString("en-IN") || jobs.length} roles found`}</h2></div><p>Posted within the past {postedWithinDays === 1 ? "24 hours" : `${postedWithinDays} days`}</p></div>
      {error ? <div className="public-error"><b>Jobs are temporarily unavailable.</b><p>{error}</p><button onClick={() => void search()}>Try again</button></div> : <div className="public-grid">
        <div className="public-list" aria-label="Job results">{jobs.map((job) => <button key={job.id} className={selected?.id === job.id ? "selected" : ""} onClick={() => setSelected(job)}><span className={`company-logo ${job.color}`}>{job.logo}</span><div><b>{job.title}</b><p>{job.company} · {job.location}</p><small>{job.employmentType || "Full-time"} · {job.mode} · {job.posted}</small></div><em>{job.origin === "recruiter" ? "Hirova" : "View"}</em></button>)}</div>
        {selected && <article className="public-detail"><div className="public-detail-top"><span className={`company-logo large ${selected.color}`}>{selected.logo}</span><span className="source-pill">{selected.origin === "recruiter" ? "Posted on Hirova" : selected.source}</span></div><h2>{selected.title}</h2><p className="muted">{selected.company} · {selected.location}</p><div className="detail-facts"><span><small>COMPENSATION</small>{selected.salary}</span><span><small>WORK MODE</small>{selected.mode}</span><span><small>EXPERIENCE</small>{selected.experience}</span></div><h3>About this opening</h3><p>{selected.description}</p><div className="tags">{selected.skills.map((skill) => <span key={skill}>{skill}</span>)}</div><button className="public-apply" onClick={() => onSignIn("job_seeker")}>Log in to apply <span>→</span></button></article>}
      </div>}
    </section>

    <footer className="public-footer"><b><span>H</span> Hirova</b><p>Get hired smarter.</p><nav><a href="#privacy">Privacy</a><a href="#terms">Terms</a><button onClick={() => onSignIn("recruiter")}>Employers</button></nav></footer>
  </main>;
}

function categoryIcon(category: string) {
  if (category === "Technology") return "⌘"; if (category === "Product") return "◫";
  if (category === "Design") return "◇"; if (category === "Sales") return "↗";
  if (category === "Marketing") return "◎"; if (category === "Finance") return "₹";
  if (category === "Human Resources") return "◉"; return "▦";
}
