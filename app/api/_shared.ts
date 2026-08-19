import { env } from "cloudflare:workers";

export type AuthenticatedUser = { id: string; email: string };
type HirovaEnv = { DB: D1Database; RESUMES: R2Bucket };

// 1. Every write is tied to a Supabase-verified user, never a client-provided id.
export async function requireUser(request: Request): Promise<AuthenticatedUser> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new Response("Authentication required", { status: 401 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Response("Authentication is not configured", { status: 503 });

  const response = await fetch(`${url}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: key },
  });
  if (!response.ok) throw new Response("Session expired", { status: 401 });
  const user = await response.json() as { id?: string; email?: string; phone?: string };
  if (!user.id) throw new Response("Invalid session", { status: 401 });
  return { id: user.id, email: user.email || user.phone || "Hirova member" };
}

export function bindings(): HirovaEnv {
  return env as unknown as HirovaEnv;
}

export function jsonError(error: unknown) {
  if (error instanceof Response) return error;
  const message = error instanceof Error ? error.message : "Unexpected server error";
  return Response.json({ error: message }, { status: 500 });
}
