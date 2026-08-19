# Contributing to Hirova

Thanks for helping improve Hirova. Keep contributions focused, tested, and safe for job seekers.

## Development workflow

1. Fork the repository and create a descriptive branch.
2. Copy `.env.example` to `.env`; never commit credentials.
3. Run `npm install` and install `backend/requirements.txt` in a Python virtual environment.
4. Run `npm test`, `npm run lint`, and `cd backend && ruff check . && pytest -q`.
5. Open a pull request explaining the user impact, implementation, and verification.

## Job-source requirements

Only add sources with documented public feeds/APIs or explicit permission. Preserve the original source and application URL, respect terms and rate limits, and never bypass anti-bot controls. A source failure must not delete the last healthy index.

## AI changes

Add deterministic fallbacks and regression cases for prompt, model, retrieval, or ranking changes. AI-generated recommendations must remain explainable and must not invent employment facts.

## Code style

- Keep frontend code typed and accessible.
- Keep FastAPI routes thin; business logic belongs in services/repositories.
- Add numbered comments where they materially clarify execution flow.
- Include migrations for schema changes and enforce RLS on public Supabase tables.
