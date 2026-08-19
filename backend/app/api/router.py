from fastapi import APIRouter

from app.api.routes import analysis, copilot, health, jobs, resumes, workspace

api_router = APIRouter()
api_router.include_router(health.router, tags=["health"])
api_router.include_router(jobs.router, prefix="/jobs", tags=["jobs"])
api_router.include_router(resumes.router, prefix="/resumes", tags=["resumes"])
api_router.include_router(analysis.router, prefix="/analysis", tags=["analysis"])
api_router.include_router(copilot.router, prefix="/copilot", tags=["copilot"])
api_router.include_router(workspace.router, prefix="/workspace", tags=["candidate workspace"])
