import { jsonError, requireUser } from "../_shared";

// 1. The hosted assistant remains useful without leaking an external model key.
export async function POST(request: Request) {
  try {
    await requireUser(request);
    const { question = "", profile = {}, jobs = [] } = await request.json() as { question?: string; profile?: { skills?: string[]; preferredRoles?: string[] }; jobs?: Array<{ company: string; title: string; match: number; missing?: string[] }> };
    const top = jobs.sort((a, b) => b.match - a.match)[0];
    if (!question.trim()) return Response.json({ error: "Ask a career question" }, { status: 400 });
    const role = profile.preferredRoles?.[0] || top?.title || "your target role";
    const answer = top
      ? `${top.company}'s ${top.title} role is your strongest current match at ${top.match}%. Before applying, add one concrete example for ${top.missing?.[0] || "measurable impact"} and tailor your opening summary toward ${role}.`
      : `Start by completing your profile and uploading a resume. I’ll then compare your evidence with ${role} requirements and prioritise the highest-impact gap.`;
    return Response.json({ answer });
  } catch (error) { return jsonError(error); }
}
