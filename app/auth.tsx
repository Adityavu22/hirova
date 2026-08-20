"use client";

import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { FormEvent, ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import PublicPortal from "./public-portal";

export type AccountType = "job_seeker" | "recruiter";
type AuthIdentity = { userId: string; name: string; email: string; mode: "supabase" | "demo"; accountType: AccountType; accessToken?: string };
type AuthContextValue = AuthIdentity & { signOut: () => Promise<void>; switchWorkspace: (accountType: AccountType) => Promise<void> };
type AuthMethod = "phone" | "email";

const AuthContext = createContext<AuthContextValue | null>(null);
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const googleEnabled = process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === "true";
const phoneEnabled = process.env.NEXT_PUBLIC_PHONE_AUTH_ENABLED === "true";
const pendingRoleKey = "hirova:pending-account-type";
let browserClient: SupabaseClient | null | undefined;

export function getBrowserSupabase() {
  if (browserClient !== undefined) return browserClient;
  browserClient = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;
  return browserClient;
}

export function AuthGate({ children }: { children: ReactNode }) {
  const [identity, setIdentity] = useState<AuthIdentity | null>(null);
  const [checking, setChecking] = useState(Boolean(supabaseUrl && supabaseKey));
  const [showAuth, setShowAuth] = useState<AccountType | null>(null);

  // 1. A real auth client is created only when public Supabase configuration exists.
  const supabase = useMemo(() => getBrowserSupabase(), []);

  const establishIdentity = useCallback(async (session: Session, requestedType?: AccountType): Promise<AuthIdentity> => {
    if (!supabase) throw new Error("Authentication is unavailable.");
    const pending = requestedType || readPendingRole();
    const { data: current } = await supabase.from("account_profiles").select("account_type").eq("user_id", session.user.id).maybeSingle();
    const accountType = pending || (current?.account_type as AccountType | undefined) || "job_seeker";
    if (!current || pending) {
      const { error } = await supabase.from("account_profiles").upsert({
        user_id: session.user.id,
        account_type: accountType,
        display_name: session.user.user_metadata?.full_name || session.user.email?.split("@")[0] || "",
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
      if (error) throw error;
    }
    clearPendingRole();
    return identityFromUser(session.user.email, session.user.user_metadata?.full_name, session.access_token, session.user.id, accountType);
  }, [supabase]);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    supabase.auth.getSession().then(({ data }) => data.session ? establishIdentity(data.session) : null)
      .then((next) => { if (active && next) setIdentity(next); })
      .finally(() => { if (active) setChecking(false); });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) { setIdentity(null); setChecking(false); return; }
      window.setTimeout(() => void establishIdentity(session).then((next) => { if (active) setIdentity(next); }).finally(() => { if (active) setChecking(false); }), 0);
    });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, [establishIdentity, supabase]);

  async function completeSignIn(next: AuthIdentity, accountType: AccountType) {
    if (!supabase || next.mode === "demo") { setIdentity({ ...next, accountType }); return; }
    const { data } = await supabase.auth.getSession();
    if (data.session) setIdentity(await establishIdentity(data.session, accountType));
  }

  async function signOut() {
    if (supabase) await supabase.auth.signOut();
    setIdentity(null);
  }

  async function switchWorkspace(accountType: AccountType) {
    if (!identity) return;
    if (supabase && identity.mode === "supabase") {
      const { error } = await supabase.from("account_profiles").update({ account_type: accountType, updated_at: new Date().toISOString() }).eq("user_id", identity.userId);
      if (error) throw error;
    }
    setIdentity({ ...identity, accountType });
  }

  if (checking) return <div className="auth-loading"><span>H</span><p>Preparing your workspace…</p></div>;
  if (!identity && !showAuth) return <PublicPortal onSignIn={(accountType = "job_seeker") => setShowAuth(accountType)} />;
  if (!identity) return <AuthScreen supabase={supabase} initialRole={showAuth || "job_seeker"} onSignedIn={completeSignIn} onBack={() => setShowAuth(null)} />;

  return <AuthContext.Provider value={{ ...identity, signOut, switchWorkspace }}>{children}</AuthContext.Provider>;
}

export function useHirovaAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useHirovaAuth must be used inside AuthGate");
  return value;
}

function AuthScreen({ supabase, initialRole, onSignedIn, onBack }: { supabase: SupabaseClient | null; initialRole: AccountType; onSignedIn: (identity: AuthIdentity, accountType: AccountType) => Promise<void>; onBack: () => void }) {
  const [role, setRole] = useState<AccountType>(initialRole);
  const [method, setMethod] = useState<AuthMethod>("email");
  const [phone, setPhone] = useState("+91 ");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [createAccount, setCreateAccount] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const isDemo = !supabase;

  function chooseRole(accountType: AccountType) {
    setRole(accountType); setMessage("");
    if (typeof window !== "undefined") window.localStorage.setItem(pendingRoleKey, accountType);
  }

  // 2. Phone authentication uses the provider's SMS OTP flow; demo code is intentionally explicit.
  async function handlePhone(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      chooseRole(role);
      if (!phoneEnabled && supabase) throw new Error("Phone login will be available after SMS delivery is connected.");
      const normalized = phone.replace(/\s/g, "");
      if (!otpSent) {
        if (!/^\+[1-9]\d{7,14}$/.test(normalized)) throw new Error("Enter a valid phone number with country code.");
        if (supabase) {
          const { error } = await supabase.auth.signInWithOtp({ phone: normalized });
          if (error) throw error;
        } else await pause(450);
        setOtpSent(true);
        setMessage(isDemo ? "Preview OTP sent. Use 123456." : "OTP sent. Check your phone.");
      } else {
        if (isDemo) {
          if (otp !== "123456") throw new Error("For the private preview, enter 123456.");
          await onSignedIn(identityFromUser(undefined, "Hirova member", undefined, "demo-phone", role), role);
        } else {
          const { data, error } = await supabase.auth.verifyOtp({ phone: normalized, token: otp, type: "sms" });
          if (error) throw error;
          if (data.user) await onSignedIn(identityFromUser(data.user.email, data.user.user_metadata?.full_name, data.session?.access_token, data.user.id, role), role);
        }
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to continue."); }
    finally { setBusy(false); }
  }

  // 3. Email supports both existing-user login and intentional account creation.
  async function handleEmail(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      chooseRole(role);
      if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("Enter a valid email address.");
      if (password.length < 8) throw new Error("Password must contain at least 8 characters.");
      if (!supabase) {
        await pause(450);
        await onSignedIn(identityFromUser(email, email.split("@")[0].replace(/[._-]/g, " "), undefined, "demo-email", role), role);
      } else if (createAccount) {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        if (data.session && data.user) await onSignedIn(identityFromUser(data.user.email, undefined, data.session.access_token, data.user.id, role), role);
        else setMessage("Account created. Confirm the link sent to your email, then sign in.");
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        if (data.user) await onSignedIn(identityFromUser(data.user.email, data.user.user_metadata?.full_name, data.session.access_token, data.user.id, role), role);
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to continue."); }
    finally { setBusy(false); }
  }

  // 4. Google uses OAuth redirect in production and a reversible in-memory identity in preview mode.
  async function handleGoogle() {
    setBusy(true); setMessage("");
    try {
      chooseRole(role);
      if (!googleEnabled && supabase) throw new Error("Google login is not enabled yet. Use email for now.");
      if (!supabase) {
        await pause(450);
        await onSignedIn(identityFromUser("preview@hirova.local", "Preview member", undefined, "demo-google", role), role);
      } else {
        const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin } });
        if (error) throw error;
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to continue with Google."); setBusy(false); }
  }

  async function handlePasswordReset() {
    setMessage("");
    if (!/^\S+@\S+\.\S+$/.test(email)) { setMessage("Enter your email address first."); return; }
    if (!supabase) { setMessage("Password reset email is available after production authentication is connected."); return; }
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
    setBusy(false);
    setMessage(error ? error.message : "Password reset link sent. Check your email.");
  }

  return <main className="auth-shell">
    <section className="auth-story">
        <button className="auth-brand" aria-label="Hirova home" onClick={onBack}><span>H</span> Hirova</button>
      <div className="auth-copy"><span className="auth-kicker">{role === "recruiter" ? "HIRING WORKSPACE" : "CAREER WORKSPACE"}</span><h1>{role === "recruiter" ? <>Hire with clarity<br/>from one workspace.</> : <>Run your job search<br/>from one clear place.</>}</h1><p>{role === "recruiter" ? "Create your company profile, publish openings, and manage every listing from Hirova." : "Build your profile, compare roles, improve your resume, and keep every application organised."}</p><ul>{role === "recruiter" ? <><li><b>Company profile</b><span>Give candidates a clear view of your team and workplace.</span></li><li><b>Direct job posting</b><span>Publish, pause, edit, and close company openings.</span></li><li><b>Source visibility</b><span>Reach candidates alongside verified employer feeds.</span></li></> : <><li><b>Relevant jobs</b><span>Search and compare roles with clear match reasons.</span></li><li><b>Application tracker</b><span>Keep status, recruiter details, and follow-ups together.</span></li><li><b>Practical preparation</b><span>Turn resume gaps into focused interview practice.</span></li></>}</ul></div>
      <footer><span>Hirova</span><div>Private workspace&nbsp;&nbsp;·&nbsp;&nbsp;Your data stays under your account</div></footer>
    </section>

    <section className="auth-panel">
      <div className="auth-card">
        <button className="auth-back" onClick={onBack}>← Back to jobs</button>
        <div className="auth-heading"><span className="mini-mark">H</span><p className="auth-status"><i /> {isDemo ? "LOCAL PREVIEW" : "SECURE SIGN IN"}</p><h2>Choose your Hirova workspace</h2><p>Use one secure account and continue in the workspace you need.</p></div>
        <div className="account-type-picker" aria-label="Account type"><button type="button" className={role === "job_seeker" ? "active" : ""} onClick={() => chooseRole("job_seeker")}><span>◎</span><b>Job seeker</b><small>Find jobs and manage your career</small></button><button type="button" className={role === "recruiter" ? "active" : ""} onClick={() => chooseRole("recruiter")}><span>▣</span><b>Recruiter</b><small>Post jobs for your company</small></button></div>
        <button className="google-button" type="button" onClick={handleGoogle} disabled={busy || (!googleEnabled && !isDemo)}><span className="google-g">G</span> {googleEnabled || isDemo ? "Continue with Google" : "Google sign-in · setup pending"}</button>
        <div className="auth-divider"><span>or continue with</span></div>
        <div className="auth-tabs" role="tablist"><button className={method === "email" ? "active" : ""} onClick={() => { setMethod("email"); setMessage(""); }} role="tab">Email</button><button className={method === "phone" ? "active" : ""} onClick={() => { if (phoneEnabled || isDemo) setMethod("phone"); setMessage(phoneEnabled || isDemo ? "" : "Phone login needs an SMS provider. Email sign-in is available now."); }} role="tab">Phone <small>{phoneEnabled || isDemo ? "" : "Soon"}</small></button></div>

        {method === "phone" ? <form className="auth-form" onSubmit={handlePhone}>
          <label htmlFor="phone">MOBILE NUMBER</label><div className="auth-input"><span>◉</span><input id="phone" type="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={otpSent} placeholder="+91 98765 43210" /></div>
          {otpSent && <><label htmlFor="otp">6-DIGIT OTP</label><div className="auth-input otp-input"><span>⌁</span><input id="otp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))} placeholder="••••••"/><button type="button" onClick={() => { setOtpSent(false); setOtp(""); setMessage(""); }}>Change</button></div></>}
          <button className="auth-primary" disabled={busy}>{busy ? "Please wait…" : otpSent ? "Verify & continue" : "Send OTP"}<span>→</span></button>
        </form> : <form className="auth-form" onSubmit={handleEmail}>
          <label htmlFor="email">EMAIL ADDRESS</label><div className="auth-input"><span>@</span><input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" /></div>
          <div className="password-label"><label htmlFor="password">PASSWORD</label>{!createAccount && <button type="button" onClick={handlePasswordReset}>Forgot password?</button>}</div><div className="auth-input"><span>⌾</span><input id="password" type="password" autoComplete={createAccount ? "new-password" : "current-password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" /></div>
          <button className="auth-primary" disabled={busy}>{busy ? "Please wait…" : createAccount ? "Create account" : "Sign in"}<span>→</span></button>
          <p className="switch-auth">{createAccount ? "Already have an account?" : "New to Hirova?"} <button type="button" onClick={() => { setCreateAccount(!createAccount); setMessage(""); }}>{createAccount ? "Sign in" : "Create an account"}</button></p>
        </form>}
        {message && <p className={`auth-message ${message.toLowerCase().includes("sent") || message.toLowerCase().includes("created") ? "success" : ""}`}>{message}</p>}
        <p className="auth-terms">By continuing, you agree to Hirova&apos;s <a href="#terms">Terms</a> and <a href="#privacy">Privacy Policy</a>.</p>
      </div>
      <p className="auth-help">Need help? <button type="button" onClick={onBack}>Return to job search</button></p>
    </section>
  </main>;
}

function identityFromUser(email?: string, fullName?: string, accessToken?: string, userId = "member", accountType: AccountType = "job_seeker"): AuthIdentity {
  const safeEmail = email || `${userId || "member"}@phone.hirova`;
  return { userId, name: fullName || safeEmail.split("@")[0].replace(/[._-]/g, " "), email: safeEmail, mode: userId.startsWith("demo-") ? "demo" : "supabase", accountType, accessToken };
}

function pause(ms: number) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function readPendingRole(): AccountType | undefined { const value = typeof window === "undefined" ? null : window.localStorage.getItem(pendingRoleKey); return value === "recruiter" || value === "job_seeker" ? value : undefined; }
function clearPendingRole() { if (typeof window !== "undefined") window.localStorage.removeItem(pendingRoleKey); }
