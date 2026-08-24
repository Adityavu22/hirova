import { jsonError, requireUser } from "../_shared";

// 1. The hosted assistant remains useful without leaking an external model key.
export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const { question = "", profile = {}, jobs = [] } = await request.json() as { question?: string; profile?: { skills?: string[]; preferredRoles?: string[] }; jobs?: Array<{ company: string; title: string; match: number; missing?: string[] }> };
    if (!question.trim()) return Response.json({ error: "Ask a career question" }, { status: 400 });
    const backendUrl = process.env.HIROVA_AI_API_URL;
    if (backendUrl) {
      const knowledge = [
        {
          id: "candidate-profile",
          title: "Candidate profile",
          text: `Target roles: ${(profile.preferredRoles || []).join(", ") || "not provided"}. Skills: ${(profile.skills || []).join(", ") || "not provided"}.`,
        },
        ...jobs.slice(0, 10).map((job, index) => ({
          id: `job-${index}`,
          title: `${job.company} - ${job.title}`,
          text: `${job.company} ${job.title} has a ${job.match}% profile match. Missing evidence: ${(job.missing || []).join(", ") || "none identified"}.`,
        })),
      ];
      const response = await fetch(`${backendUrl.replace(/\/$/, "")}/api/v1/copilot/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${user.accessToken}` },
        body: JSON.stringify({ question, knowledge }),
      });
      const payload = await response.text();
      return new Response(payload, { status: response.status, headers: { "Content-Type": response.headers.get("content-type") || "application/json" } });
    }
    const top = jobs.sort((a, b) => b.match - a.match)[0];
    const role = profile.preferredRoles?.[0] || top?.title || "your target role";
    const answer = top
      ? `${top.company}'s ${top.title} role is your strongest current match at ${top.match}%. Before applying, add one concrete example for ${top.missing?.[0] || "measurable impact"} and tailor your opening summary toward ${role}.`
      : `Start by completing your profile and uploading a resume. I’ll then compare your evidence with ${role} requirements and prioritise the highest-impact gap.`;
    return Response.json({ answer });
  } catch (error) { return jsonError(error); }
}
