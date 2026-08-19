from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Candidate, Job

SEED_JOBS = [
    {"external_id":"seed-mercury","title":"Senior Product Designer","company":"Mercury Labs","location":"Bengaluru","work_mode":"Hybrid","salary_min":32,"salary_max":42,"seniority":"Senior","skills":["design systems","figma","product strategy","fintech"],"description":"Lead end-to-end fintech product design, evolve a multi-product design system, partner with research and engineering, and measure adoption outcomes."},
    {"external_id":"seed-zepto","title":"Lead UX Designer","company":"Zepto","location":"Bengaluru","work_mode":"On-site","salary_min":28,"salary_max":36,"seniority":"Lead","skills":["ux research","mobile design","leadership","experimentation"],"description":"Lead high-frequency consumer journeys, mentor designers, run research, and improve conversion through experiments."},
    {"external_id":"seed-razorpay","title":"Product Designer III","company":"Razorpay","location":"Remote · India","work_mode":"Remote","salary_min":30,"salary_max":38,"seniority":"Senior","skills":["b2b saas","prototyping","analytics","design systems"],"description":"Design complex B2B payment workflows, prototype with product teams, use product analytics, and contribute to the design system."},
    {"external_id":"seed-atlas","title":"Staff Product Designer","company":"Atlas AI","location":"Remote · India","work_mode":"Remote","salary_min":38,"salary_max":48,"seniority":"Staff","skills":["ai product design","systems thinking","mentoring","evaluation"],"description":"Shape trustworthy AI workflows, define evaluation criteria, mentor designers, and drive platform-level product strategy."},
]


async def seed_database(session: AsyncSession) -> None:
    """1. Idempotent seed data supports demos, tests, and interviewer walkthroughs."""

    if not await session.scalar(select(Candidate).limit(1)):
        session.add(Candidate(id="demo-user", name="Sample Candidate", email="sample@hirova.local", headline="Senior Product Designer", skills=["design systems","figma","product strategy","ux research","fintech"]))
    if not await session.scalar(select(Job).limit(1)):
        session.add_all([Job(**job) for job in SEED_JOBS])
    await session.commit()
