"use client";

import { ReactNode, createContext, useContext, useEffect, useState } from "react";
import { useHirovaAuth } from "./auth";

export type CandidateProfile = {
  name: string;
  email: string;
  phone: string;
  headline: string;
  location: string;
  experienceYears: string;
  bio: string;
  skills: string[];
  preferredRoles: string[];
  preferredLocations: string[];
  expectedSalary: string;
  noticePeriod: string;
  openToWork: boolean;
  profileComplete: boolean;
};

export type ApplicationStatus = "Applied" | "Screening" | "Interview" | "Offer" | "Rejected";
export type Application = { id?: string; jobId: string; status: ApplicationStatus; appliedAt: string; note: string };
export type ResumeRecord = { name: string; uploadedAt: string; score: number; skills: string[] } | null;

type ProductState = {
  profile: CandidateProfile;
  saved: string[];
  applications: Application[];
  resume: ResumeRecord;
  setProfile: (profile: CandidateProfile) => void;
  toggleSaved: (jobId: string) => void;
  apply: (jobId: string) => void;
  updateApplication: (jobId: string, status: ApplicationStatus, note?: string) => void;
  setResume: (resume: ResumeRecord) => void;
};

const StoreContext = createContext<ProductState | null>(null);
const API_URL = process.env.NEXT_PUBLIC_API_URL || "/api";
const USES_FASTAPI = API_URL.includes("/api/v1");

export function ProductStore({ children }: { children: ReactNode }) {
  const identity = useHirovaAuth();
  const [ready, setReady] = useState(!identity.accessToken);
  const [profile, setProfileState] = useState<CandidateProfile>(() => blankProfile(identity.name, identity.email));
  const [saved, setSaved] = useState<string[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [resume, setResumeState] = useState<ResumeRecord>(null);

  // 1. A verified session hydrates durable state from the hosted API or FastAPI.
  useEffect(() => {
    if (!identity.accessToken) return;
    const controller = new AbortController();
    const hydration = USES_FASTAPI
      ? Promise.all([
          apiRequest("/workspace/me", identity.accessToken, { signal: controller.signal }),
          apiRequest("/workspace/saved", identity.accessToken, { signal: controller.signal }),
          apiRequest("/workspace/applications", identity.accessToken, { signal: controller.signal }),
        ]).then(([profileData, savedData, applicationData]) => ({ profile: profileData, saved: savedData, applications: applicationData, resume: null }))
      : apiRequest("/workspace", identity.accessToken, { signal: controller.signal }) as Promise<WorkspacePayload>;
    hydration.then((data) => {
      if (data.profile) setProfileState(profileFromApi(data.profile as Record<string, unknown>, identity.email));
      else setProfileState(blankProfile(identity.name, identity.email));
      setSaved((data.saved as string[]) || []);
      setApplications(((data.applications as ApiApplication[]) || []).map(applicationFromApi));
      if (data.resume) setResumeState(data.resume);
    }).catch(() => setProfileState(blankProfile(identity.name, identity.email))).finally(() => setReady(true));
    return () => controller.abort();
  }, [identity.accessToken, identity.email, identity.name]);

  function setProfile(next: CandidateProfile) {
    const complete = { ...next, email: identity.email, profileComplete: true };
    setProfileState(complete);
    if (identity.accessToken) {
      const request = USES_FASTAPI
        ? apiRequest("/workspace/me", identity.accessToken, { method: "PUT", body: JSON.stringify(profileToApi(complete)) })
        : apiRequest("/workspace", identity.accessToken, { method: "POST", body: JSON.stringify({ action: "save_profile", profile: profileToApi(complete) }) });
      request.catch(() => undefined);
    }
  }
  function toggleSaved(jobId: string) {
    setSaved((items) => {
      const exists = items.includes(jobId);
      if (identity.accessToken) {
        const request = USES_FASTAPI
          ? apiRequest(`/workspace/saved/${encodeURIComponent(jobId)}`, identity.accessToken, { method: exists ? "DELETE" : "PUT" })
          : apiRequest("/workspace", identity.accessToken, { method: "POST", body: JSON.stringify({ action: "toggle_saved", jobId, saved: !exists }) });
        request.catch(() => undefined);
      }
      return exists ? items.filter((id) => id !== jobId) : [jobId, ...items];
    });
  }
  function apply(jobId: string) {
    setApplications((items) => {
      if (items.some((item) => item.jobId === jobId)) return items;
      const optimistic = { jobId, status: "Applied" as const, appliedAt: new Date().toISOString(), note: "" };
      if (identity.accessToken) {
        const request = USES_FASTAPI
          ? apiRequest("/workspace/applications", identity.accessToken, { method: "POST", body: JSON.stringify({ external_job_id: jobId }) })
          : apiRequest("/workspace", identity.accessToken, { method: "POST", body: JSON.stringify({ action: "apply", jobId }) }).then((data) => (data as { application: ApiApplication }).application);
        request.then((data) => setApplications((current) => current.map((item) => item.jobId === jobId ? applicationFromApi(data as ApiApplication) : item))).catch(() => undefined);
      }
      return [optimistic, ...items];
    });
  }
  function updateApplication(jobId: string, status: ApplicationStatus, note = "") {
    setApplications((items) => items.map((item) => {
      if (item.jobId !== jobId) return item;
      if (identity.accessToken && item.id) {
        const request = USES_FASTAPI
          ? apiRequest(`/workspace/applications/${item.id}`, identity.accessToken, { method: "PATCH", body: JSON.stringify({ status, note }) })
          : apiRequest("/workspace", identity.accessToken, { method: "POST", body: JSON.stringify({ action: "update_application", id: item.id, status, note }) });
        request.catch(() => undefined);
      }
      return { ...item, status, note };
    }));
  }

  const value = { profile, saved, applications, resume, setProfile, toggleSaved, apply, updateApplication, setResume: setResumeState };
  return <StoreContext.Provider value={value}>{ready ? children : <div className="auth-loading"><span>H</span><p>Loading your career workspace…</p></div>}</StoreContext.Provider>;
}

export function useProductStore() {
  const value = useContext(StoreContext);
  if (!value) throw new Error("useProductStore must be used inside ProductStore");
  return value;
}

function blankProfile(name: string, email: string): CandidateProfile {
  const safeName = humanize(name) || "Hirova member";
  return {
    name: safeName,
    email,
    phone: "",
    headline: "",
    location: "",
    experienceYears: "",
    bio: "",
    skills: [],
    preferredRoles: [],
    preferredLocations: [],
    expectedSalary: "",
    noticePeriod: "",
    openToWork: true,
    profileComplete: false,
  };
}

function humanize(value: string) {
  if (["arjun sharma", "preview member", "hirova member"].includes(value.toLowerCase())) return "";
  return value.replace(/[._-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()).trim();
}

type ApiApplication = { id: string; external_job_id: string; status: ApplicationStatus; applied_at: string; note: string };
type WorkspacePayload = { profile: Record<string, unknown> | null; saved: string[]; applications: ApiApplication[]; resume: ResumeRecord };

async function apiRequest(path: string, token: string, init: RequestInit = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...init.headers },
  });
  if (!response.ok) throw new Error(`Workspace request failed (${response.status})`);
  return response.json();
}

function applicationFromApi(data: ApiApplication): Application {
  const record = data as ApiApplication & { job_id?: string };
  return { id: data.id, jobId: data.external_job_id || record.job_id || "", status: data.status, appliedAt: data.applied_at, note: data.note };
}

function profileToApi(profile: CandidateProfile) {
  return {
    name: profile.name, phone: profile.phone, headline: profile.headline, location: profile.location,
    experience_years: profile.experienceYears, bio: profile.bio, skills: profile.skills,
    preferred_roles: profile.preferredRoles, preferred_locations: profile.preferredLocations,
    expected_salary: profile.expectedSalary, notice_period: profile.noticePeriod,
    open_to_work: profile.openToWork, profile_complete: profile.profileComplete,
  };
}

function profileFromApi(data: Record<string, unknown>, email: string): CandidateProfile {
  return {
    name: String(data.name || "Hirova member"), email, phone: String(data.phone || ""),
    headline: String(data.headline || ""), location: String(data.location || ""),
    experienceYears: String(data.experience_years || ""), bio: String(data.bio || ""),
    skills: (data.skills as string[]) || [], preferredRoles: (data.preferred_roles as string[]) || [],
    preferredLocations: (data.preferred_locations as string[]) || [], expectedSalary: String(data.expected_salary || ""),
    noticePeriod: String(data.notice_period || ""), openToWork: Boolean(data.open_to_work ?? true),
    profileComplete: Boolean(data.profile_complete),
  };
}
