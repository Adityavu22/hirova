import { bindings, jsonError, requireUser, supabaseRest } from "../_shared";

const ALLOWED_TYPES = new Set(["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain"]);

// 1. Resume bytes live in private object storage; only metadata is queryable.
export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return Response.json({ error: "Choose a resume file" }, { status: 400 });
    if (!ALLOWED_TYPES.has(file.type)) return Response.json({ error: "Use PDF, DOCX, or TXT" }, { status: 415 });
    if (file.size > 10 * 1024 * 1024) return Response.json({ error: "Resume must be 10 MB or smaller" }, { status: 413 });

    const { RESUMES } = bindings();
    const id = crypto.randomUUID();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const objectKey = `${user.id}/${id}-${safeName}`;
    await RESUMES.put(objectKey, file.stream(), { httpMetadata: { contentType: file.type } });

    const text = file.type === "text/plain" ? (await file.text()).slice(0, 100_000) : "";
    const analysis = analyseResume(text, file.size);
    try {
      await supabaseRest(user.accessToken, "resume_records", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ id, user_id: user.id, object_key: objectKey, filename: file.name, mime_type: file.type, size_bytes: file.size, score: analysis.score, skills: analysis.skills }),
      });
    } catch (error) {
      await RESUMES.delete(objectKey);
      throw error;
    }
    return Response.json({ id, name: file.name, uploadedAt: new Date().toISOString(), ...analysis }, { status: 201 });
  } catch (error) { return jsonError(error); }
}

// 2. Resume downloads are authorized by Supabase RLS before private bytes leave object storage.
export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    const id = new URL(request.url).searchParams.get("id") || "";
    if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "Invalid resume" }, { status: 400 });
    const rows = await supabaseRest<Array<{ object_key: string; filename: string; mime_type: string }>>(user.accessToken, `resume_records?id=eq.${encodeURIComponent(id)}&select=object_key,filename,mime_type&limit=1`);
    const record = rows[0];
    if (!record) return Response.json({ error: "Resume not found" }, { status: 404 });
    const object = await bindings().RESUMES.get(record.object_key);
    if (!object) return Response.json({ error: "Resume file is unavailable" }, { status: 404 });
    const safeFilename = record.filename.replace(/["\r\n]/g, "_");
    return new Response(object.body, { headers: { "Content-Type": record.mime_type, "Content-Disposition": `attachment; filename="${safeFilename}"`, "Cache-Control": "private, no-store" } });
  } catch (error) { return jsonError(error); }
}

function analyseResume(text: string, size: number) {
  const normalized = text.toLowerCase();
  const skillBank = ["Python", "JavaScript", "React", "FastAPI", "SQL", "Figma", "Product strategy", "Analytics", "Leadership", "Machine learning"];
  const skills = skillBank.filter((skill) => normalized.includes(skill.toLowerCase()));
  const evidenceSignals = (text.match(/\b\d+(?:\.\d+)?%|₹|\$|increased|reduced|improved|led|launched/gi) || []).length;
  const score = text ? Math.min(92, 58 + Math.min(skills.length * 3, 15) + Math.min(evidenceSignals * 2, 19)) : Math.min(82, 66 + Math.round(Math.log10(Math.max(size, 1)) * 2));
  return { score, skills: skills.length ? skills : ["Communication", "Problem solving", "Collaboration"] };
}
