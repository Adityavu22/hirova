"use client";

import { ReactNode, createContext, useContext, useEffect, useMemo, useState } from "react";
import { getBrowserSupabase, useHirovaAuth } from "./auth";
import type { Job } from "./product-data";

export type CareerLevel = "intern" | "early" | "mid" | "senior";
export type CandidateProfile = {
  name: string; email: string; phone: string; headline: string; location: string;
  careerLevel: CareerLevel; experienceYears: string; bio: string; skills: string[];
  preferredRoles: string[]; preferredLocations: string[]; expectedSalary: string;
  noticePeriod: string; openToWork: boolean; profileComplete: boolean;
};

export type ApplicationStatus = "Applied" | "Screening" | "Interview" | "Offer" | "Rejected" | "Withdrawn";
export type Application = {
  id?: string; jobId: string; recruiterJobId?: string | null; status: ApplicationStatus;
  appliedAt: string; note: string; native: boolean;
};
export type ResumeRecord = { id?: string; name: string; uploadedAt: string; score: number; skills: string[] } | null;
export type JobAlert = { id: string; name: string; frequency: "daily" | "weekly"; enabled: boolean };
export type JobAlertDraft = {
  name: string; query: string; location: string; company: string; category: string;
  careerLevel: string; workMode: string; employmentType: string; frequency: "daily" | "weekly";
};

type ProductState = {
  profile: CandidateProfile; saved: string[]; applications: Application[]; resume: ResumeRecord; alerts: JobAlert[];
  setProfile: (profile: CandidateProfile) => Promise<void>;
  toggleSaved: (jobId: string) => Promise<void>;
  apply: (job: Job) => Promise<void>;
  updateApplication: (jobId: string, status: ApplicationStatus, note?: string) => Promise<void>;
  setResume: (resume: ResumeRecord) => void;
  saveAlert: (draft: JobAlertDraft) => Promise<void>;
};

const StoreContext = createContext<ProductState | null>(null);

export function ProductStore({ children }: { children: ReactNode }) {
  const identity = useHirovaAuth();
  const supabase = useMemo(() => getBrowserSupabase(), []);
  const [ready, setReady] = useState(!identity.accessToken || !supabase);
  const [profile, setProfileState] = useState<CandidateProfile>(() => blankProfile(identity.name, identity.email));
  const [saved, setSaved] = useState<string[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [resume, setResumeState] = useState<ResumeRecord>(null);
  const [alerts, setAlerts] = useState<JobAlert[]>([]);

  // 1. All structured candidate state is hydrated from RLS-protected Supabase rows.
  useEffect(() => {
    if (!identity.accessToken || !supabase) return;
    let active = true;
    void Promise.all([
      supabase.from("candidate_profiles").select("*").eq("user_id", identity.userId).maybeSingle(),
      supabase.from("saved_jobs").select("job_id").eq("user_id", identity.userId).order("created_at", { ascending: false }),
      supabase.from("job_applications").select("id, external_job_id, recruiter_job_id, status, applied_at").eq("candidate_id", identity.userId).order("applied_at", { ascending: false }),
      supabase.from("application_notes").select("application_id, note").eq("candidate_id", identity.userId),
      supabase.from("resume_records").select("id, filename, score, skills, uploaded_at").eq("user_id", identity.userId).order("uploaded_at", { ascending: false }).limit(1),
      supabase.from("job_alerts").select("id, name, frequency, enabled").eq("user_id", identity.userId).order("created_at", { ascending: false }),
    ]).then(([profileResult, savedResult, applicationResult, noteResult, resumeResult, alertResult]) => {
      if (!active) return;
      setProfileState(profileResult.data ? profileFromDatabase(profileResult.data as Record<string, unknown>, identity.email) : blankProfile(identity.name, identity.email));
      setSaved((savedResult.data || []).map((row) => row.job_id));
      const notes = new Map((noteResult.data || []).map((row) => [row.application_id, row.note]));
      setApplications((applicationResult.data || []).map((row) => ({
        id: row.id, jobId: row.external_job_id, recruiterJobId: row.recruiter_job_id,
        status: row.status as ApplicationStatus, appliedAt: row.applied_at,
        note: notes.get(row.id) || "", native: Boolean(row.recruiter_job_id),
      })));
      const latest = resumeResult.data?.[0];
      setResumeState(latest ? { id: latest.id, name: latest.filename, score: latest.score, skills: latest.skills || [], uploadedAt: latest.uploaded_at } : null);
      setAlerts((alertResult.data || []) as JobAlert[]);
    }).finally(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, [identity.accessToken, identity.email, identity.name, identity.userId, supabase]);

  async function setProfile(next: CandidateProfile) {
    const complete = { ...next, email: identity.email, profileComplete: true };
    setProfileState(complete);
    if (!supabase || !identity.accessToken) return;
    const { error } = await supabase.from("candidate_profiles").upsert(profileToDatabase(complete, identity.userId), { onConflict: "user_id" });
    if (error) throw error;
  }

  async function toggleSaved(jobId: string) {
    const exists = saved.includes(jobId);
    setSaved((items) => exists ? items.filter((id) => id !== jobId) : [jobId, ...items]);
    if (!supabase || !identity.accessToken) return;
    const request = exists
      ? supabase.from("saved_jobs").delete().eq("user_id", identity.userId).eq("job_id", jobId)
      : supabase.from("saved_jobs").insert({ user_id: identity.userId, job_id: jobId });
    const { error } = await request;
    if (error) throw error;
  }

  async function apply(job: Job) {
    if (applications.some((item) => item.jobId === job.id)) return;
    const native = Boolean(job.recruiterJobId && (job.applicationMethod === "native" || job.applicationMethod === "both"));
    const optimistic: Application = { jobId: job.id, recruiterJobId: native ? job.recruiterJobId : null, status: "Applied", appliedAt: new Date().toISOString(), note: "", native };
    setApplications((items) => [optimistic, ...items]);
    if (!supabase || !identity.accessToken) return;
    const { data, error } = await supabase.from("job_applications").insert({
      candidate_id: identity.userId, recruiter_job_id: native ? job.recruiterJobId : null,
      external_job_id: job.id, status: "Applied",
    }).select("id, applied_at").single();
    if (error) { setApplications((items) => items.filter((item) => item.jobId !== job.id)); throw error; }
    setApplications((items) => items.map((item) => item.jobId === job.id ? { ...item, id: data.id, appliedAt: data.applied_at } : item));
  }

  async function updateApplication(jobId: string, status: ApplicationStatus, note = "") {
    const application = applications.find((item) => item.jobId === jobId);
    if (!application) return;
    const effectiveStatus = application.native ? application.status : status;
    setApplications((items) => items.map((item) => item.jobId === jobId ? { ...item, status: effectiveStatus, note } : item));
    if (!supabase || !identity.accessToken || !application.id) return;
    const { error: noteError } = await supabase.from("application_notes").upsert({ application_id: application.id, candidate_id: identity.userId, note, updated_at: new Date().toISOString() }, { onConflict: "application_id" });
    if (noteError) throw noteError;
    if (!application.native) {
      const { error: statusError } = await supabase.from("job_applications").update({ status: effectiveStatus, updated_at: new Date().toISOString() }).eq("id", application.id).eq("candidate_id", identity.userId);
      if (statusError) throw statusError;
    }
  }

  async function saveAlert(draft: JobAlertDraft) {
    if (!supabase || !identity.accessToken) return;
    const { data, error } = await supabase.from("job_alerts").insert({
      user_id: identity.userId, name: draft.name, query: draft.query, location: draft.location,
      company: draft.company, category: draft.category, career_level: draft.careerLevel,
      work_mode: draft.workMode, employment_type: draft.employmentType, frequency: draft.frequency,
    }).select("id, name, frequency, enabled").single();
    if (error) throw error;
    setAlerts((items) => [data as JobAlert, ...items]);
  }

  const value = { profile, saved, applications, resume, alerts, setProfile, toggleSaved, apply, updateApplication, setResume: setResumeState, saveAlert };
  return <StoreContext.Provider value={value}>{ready ? children : <div className="auth-loading"><span>H</span><p>Loading your career workspace…</p></div>}</StoreContext.Provider>;
}

export function useProductStore() {
  const value = useContext(StoreContext);
  if (!value) throw new Error("useProductStore must be used inside ProductStore");
  return value;
}

function blankProfile(name: string, email: string): CandidateProfile {
  return { name: humanize(name), email, phone: "", headline: "", location: "", careerLevel: "early", experienceYears: "", bio: "", skills: [], preferredRoles: [], preferredLocations: [], expectedSalary: "", noticePeriod: "", openToWork: true, profileComplete: false };
}

function humanize(value: string) {
  if (["arjun sharma", "preview member", "hirova member"].includes(value.toLowerCase())) return "";
  return value.replace(/[._-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()).trim();
}

function profileToDatabase(profile: CandidateProfile, userId: string) {
  return {
    user_id: userId, name: profile.name, phone: profile.phone, headline: profile.headline,
    location: profile.location, career_level: profile.careerLevel, experience_years: profile.experienceYears,
    bio: profile.bio, skills: profile.skills, preferred_roles: profile.preferredRoles,
    preferred_locations: profile.preferredLocations, expected_salary: profile.expectedSalary,
    notice_period: profile.noticePeriod, open_to_work: profile.openToWork,
    profile_complete: profile.profileComplete, updated_at: new Date().toISOString(),
  };
}

function profileFromDatabase(data: Record<string, unknown>, email: string): CandidateProfile {
  return {
    name: String(data.name || ""), email, phone: String(data.phone || ""), headline: String(data.headline || ""),
    location: String(data.location || ""), careerLevel: (data.career_level as CareerLevel) || "early",
    experienceYears: String(data.experience_years || ""), bio: String(data.bio || ""),
    skills: (data.skills as string[]) || [], preferredRoles: (data.preferred_roles as string[]) || [],
    preferredLocations: (data.preferred_locations as string[]) || [], expectedSalary: String(data.expected_salary || ""),
    noticePeriod: String(data.notice_period || ""), openToWork: Boolean(data.open_to_work ?? true),
    profileComplete: Boolean(data.profile_complete),
  };
}
