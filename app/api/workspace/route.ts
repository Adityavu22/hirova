import { bindings, jsonError, requireUser } from "../_shared";

type WorkspaceAction =
  | { action: "save_profile"; profile: Record<string, unknown> }
  | { action: "toggle_saved"; jobId: string; saved: boolean }
  | { action: "apply"; jobId: string }
  | { action: "update_application"; id: string; status: string; note: string };

// 1. One hydration request returns the complete signed-in workspace.
export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    const { DB } = bindings();
    const [profile, saved, applications, resume] = await Promise.all([
      DB.prepare("SELECT payload FROM profiles WHERE user_id = ?").bind(user.id).first<{ payload: string }>(),
      DB.prepare("SELECT job_id FROM saved_jobs WHERE user_id = ? ORDER BY created_at DESC").bind(user.id).all<{ job_id: string }>(),
      DB.prepare("SELECT id, job_id, status, note, applied_at FROM applications WHERE user_id = ? ORDER BY applied_at DESC").bind(user.id).all(),
      DB.prepare("SELECT filename, score, skills, uploaded_at FROM resumes WHERE user_id = ? ORDER BY uploaded_at DESC LIMIT 1").bind(user.id).first<{ filename: string; score: number; skills: string; uploaded_at: string }>(),
    ]);
    return Response.json({
      profile: profile ? JSON.parse(profile.payload) : null,
      saved: saved.results.map((row) => row.job_id),
      applications: applications.results,
      resume: resume ? { name: resume.filename, score: resume.score, skills: JSON.parse(resume.skills), uploadedAt: resume.uploaded_at } : null,
    });
  } catch (error) { return jsonError(error); }
}

// 2. Mutations use prepared statements and ownership predicates.
export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const body = await request.json() as WorkspaceAction;
    const { DB } = bindings();

    if (body.action === "save_profile") {
      await DB.prepare("INSERT INTO profiles (user_id, email, payload, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(user_id) DO UPDATE SET email = excluded.email, payload = excluded.payload, updated_at = CURRENT_TIMESTAMP")
        .bind(user.id, user.email, JSON.stringify(body.profile)).run();
      return Response.json({ ok: true });
    }
    if (body.action === "toggle_saved") {
      if (body.saved) await DB.prepare("INSERT OR IGNORE INTO saved_jobs (user_id, job_id) VALUES (?, ?)").bind(user.id, body.jobId).run();
      else await DB.prepare("DELETE FROM saved_jobs WHERE user_id = ? AND job_id = ?").bind(user.id, body.jobId).run();
      return Response.json({ ok: true });
    }
    if (body.action === "apply") {
      const id = crypto.randomUUID();
      await DB.prepare("INSERT OR IGNORE INTO applications (id, user_id, job_id) VALUES (?, ?, ?)").bind(id, user.id, body.jobId).run();
      const application = await DB.prepare("SELECT id, job_id, status, note, applied_at FROM applications WHERE user_id = ? AND job_id = ?").bind(user.id, body.jobId).first();
      return Response.json({ application }, { status: 201 });
    }
    if (body.action === "update_application") {
      const allowed = ["Applied", "Screening", "Interview", "Offer", "Rejected"];
      if (!allowed.includes(body.status)) return Response.json({ error: "Invalid status" }, { status: 400 });
      await DB.prepare("UPDATE applications SET status = ?, note = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?")
        .bind(body.status, body.note.slice(0, 2000), body.id, user.id).run();
      return Response.json({ ok: true });
    }
    return Response.json({ error: "Unsupported action" }, { status: 400 });
  } catch (error) { return jsonError(error); }
}
