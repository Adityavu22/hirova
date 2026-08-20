"use client";

import { FormEvent, useEffect, useState } from "react";
import type { Job } from "./product-data";
import { fetchMarketJobs } from "./job-service";

type JobsResponse = {
  jobs: Job[];
  total: number;
  marketTotal: number;
  hasMore: boolean;
  updatedAt: string;
  sourceNotice: string;
};

export default function PublicPortal({ onSignIn }: { onSignIn: () => void }) {
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("");
  const [mode, setMode] = useState("All");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selected, setSelected] = useState<Job | null>(null);
  const [meta, setMeta] = useState<JobsResponse | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    // 1. Load the daily market once without coupling the initial request to editable form state.
    let active = true;
    void fetchMarketJobs({ limit: 60 })
      .then((data) => {
        if (!active) return;
        setJobs(data.jobs); setMeta(data as JobsResponse); setSelected(data.jobs[0] || null);
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : "Unable to load live jobs.");
      })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, []);

  async function search(event?: FormEvent) {
    event?.preventDefault();
    setBusy(true); setError("");
    try {
      const data = await fetchMarketJobs({ query, location, mode, limit: 60 }) as JobsResponse;
      setJobs(data.jobs); setMeta(data); setSelected(data.jobs[0] || null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load live jobs.");
    } finally { setBusy(false); }
  }

  return <main className="public-shell">
    <header className="public-header">
      <button className="public-brand" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}><span>H</span> Hirova</button>
      <nav aria-label="Public navigation"><a href="#jobs">Jobs</a><a href="#how-it-works">How it works</a><button onClick={onSignIn}>Sign in</button><button className="public-join" onClick={onSignIn}>Create profile</button></nav>
    </header>

    <section className="public-hero">
      <div><span className="public-kicker"><i /> LIVE, SOURCE-VERIFIED OPENINGS</span><h1>Get hired<br/><em>smarter.</em></h1></div>
      <aside><b>{meta?.marketTotal ? meta.marketTotal.toLocaleString("en-IN") : "2,000+"}</b><span>live openings indexed</span><small>Updated from original sources—not generated listings</small></aside>
    </section>

    <form className="public-search" onSubmit={search} id="jobs">
      <label><span>ROLE, SKILL OR COMPANY</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="e.g. Product designer, Python" /></label>
      <label><span>LOCATION</span><input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="e.g. Bengaluru, Remote" /></label>
      <label><span>WORK MODE</span><select value={mode} onChange={(event) => setMode(event.target.value)}><option>All</option><option>Remote</option><option>Hybrid</option><option>On-site</option></select></label>
      <button disabled={busy}>{busy ? "Refreshing…" : "Search jobs"}</button>
    </form>

    <section className="public-results">
      <div className="public-result-head"><div><span className="public-kicker"><i /> LIVE MARKET</span><h2>{busy ? "Refreshing current openings…" : `${meta?.total?.toLocaleString("en-IN") || jobs.length} roles found`}</h2></div><p>{meta?.updatedAt ? `Last refreshed ${new Date(meta.updatedAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}` : "Direct employer and public job feeds"}</p></div>
      {error ? <div className="public-error"><b>We couldn’t refresh the market.</b><p>{error}</p><button onClick={() => search()}>Try again</button></div> : <div className="public-grid">
        <div className="public-list" aria-label="Job results">{jobs.map((job) => <button key={job.id} className={selected?.id === job.id ? "selected" : ""} onClick={() => setSelected(job)}><span className={`company-logo ${job.color}`}>{job.logo}</span><div><b>{job.title}</b><p>{job.company} · {job.location}</p><small>{job.mode} · {job.posted} · {job.source}</small></div><em>{job.match}%</em></button>)}</div>
        {selected && <article className="public-detail"><div className="public-detail-top"><span className={`company-logo large ${selected.color}`}>{selected.logo}</span><span className="source-pill">Verified source · {selected.source}</span></div><h2>{selected.title}</h2><p className="muted">{selected.company} · {selected.location}</p><div className="detail-facts"><span><small>COMPENSATION</small>{selected.salary}</span><span><small>WORK MODE</small>{selected.mode}</span><span><small>TYPE</small>{selected.employmentType || "See listing"}</span></div><h3>About this opening</h3><p>{selected.description}</p><div className="tags">{selected.skills.map((skill) => <span key={skill}>{skill}</span>)}</div><a className="public-apply" href={selected.sourceUrl} target="_blank" rel="noopener noreferrer">Apply on original listing <span>↗</span></a><button className="public-personalise" onClick={onSignIn}>Sign in to save and personalise</button><small className="source-note">Applications are completed on the employer or source website. Hirova never invents openings.</small></article>}
      </div>}
    </section>

    <section className="public-how" id="how-it-works"><span className="public-kicker">HOW HIROVA WORKS</span><h2>A serious job search, with useful AI in the background.</h2><div><article><b>01</b><h3>Build your profile</h3><p>Add your resume, skills, preferences, experience and target roles.</p></article><article><b>02</b><h3>Rank real openings</h3><p>Hirova compares your evidence with current, source-linked job listings.</p></article><article><b>03</b><h3>Apply and stay organised</h3><p>Apply at the original source, then track progress, notes and preparation here.</p></article></div></section>
    <footer className="public-footer"><b><span>H</span> Hirova</b><p>Get hired smarter.</p><small>{meta?.sourceNotice || "Job availability is controlled by original publishers."}</small></footer>
  </main>;
}
