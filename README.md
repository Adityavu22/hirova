# Hirova

> **Get hired smarter.**

[![CI](https://github.com/Adityavu22/hirova/actions/workflows/ci.yml/badge.svg)](https://github.com/Adityavu22/hirova/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Hirova is an AI-first job marketplace and career companion. It helps candidates discover source-linked job openings, build a professional profile, understand job matches, identify skill gaps, improve resumes, prepare for interviews, and manage applications from one workspace.

Jobs are collected from documented public feeds and employer career pages. Every listing retains its original source and application link; Hirova does not generate fictional vacancies.

## Access Hirova

- [Launch Hirova](https://hirova.in)
- [View the source on GitHub](https://github.com/Adityavu22/hirova)

## Technology

Hirova uses React, TypeScript, vinext, FastAPI, PostgreSQL, Supabase Auth, LangGraph, Qdrant, Docker, and GitHub Actions. Groq is the default optional AI provider, with Gemini supported through configuration. A no-cost deterministic mode is available for local development.

## Access the source from the terminal

Using GitHub CLI:

```bash
gh repo clone Adityavu22/hirova
cd hirova
```

Using Git:

```bash
git clone https://github.com/Adityavu22/hirova.git
cd hirova
```

## Build from source

### Prerequisites

- Node.js 22 or newer
- Python 3.12 or newer
- npm
- Git
- Docker Desktop, only for the containerised setup

### Frontend

```bash
npm install
cp .env.example .env
npm run dev
```

### FastAPI backend

From the repository root, open a second terminal:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

FastAPI exposes its interactive request and response reference at `/docs`.

On Windows PowerShell, activate the virtual environment with:

```powershell
.venv\Scripts\Activate.ps1
```

### Complete stack with Docker

```bash
cp .env.example .env
docker compose up --build
```

This starts the frontend, FastAPI backend, PostgreSQL, and Qdrant.

## Configuration

The project runs locally without a paid AI API. To enable live AI responses, add one provider to `.env`.

### Groq

```dotenv
LLM_PROVIDER=groq
GROQ_API_KEY=your_key_here
```

### Gemini

```dotenv
LLM_PROVIDER=gemini
GEMINI_API_KEY=your_key_here
```

For production authentication and user data, configure Supabase:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_publishable_key
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_PUBLISHABLE_KEY=your_publishable_key
```

Never commit `.env`, service-role keys, API keys, or other secrets.

## API endpoints

| Endpoint | Purpose |
|---|---|
| `/api/v1/health` | Check API and deployment health |
| `/api/v1/jobs` | Search or ingest normalized job descriptions |
| `/api/v1/jobs/match` | Rank jobs against candidate evidence and explain the match |
| `/api/v1/resumes/upload` | Parse and analyse PDF, DOCX, or TXT resumes |
| `/api/v1/analysis/skill-gap` | Compare candidate skills with a target role |
| `/api/v1/analysis/interview-prep` | Generate role-specific interview preparation |
| `/api/v1/copilot/ask` | Answer grounded career questions through agentic retrieval |
| `/api/v1/workspace/me` | Read or update the authenticated candidate profile |
| `/api/v1/workspace/applications` | Manage the candidate application pipeline |
| `/api/v1/workspace/saved` | Manage shortlisted jobs |

The complete request and response schemas are available through FastAPI at `/docs` and `/redoc`.

## Job data and refresh schedule

The job index uses documented public feeds and employer career APIs. Records are normalized, deduplicated, and stored with their original application URLs. A scheduled Supabase Edge Function refreshes the index daily at 06:45 IST.

If a source temporarily fails, Hirova retains the last healthy records and reports the failed source instead of replacing the marketplace with incomplete data.

## Testing

Frontend checks:

```bash
npm run lint
npm test
```

Backend checks and offline AI evaluations:

```bash
cd backend
pytest -q
python evals/run_evals.py
```

Container build:

```bash
docker compose build
```

GitHub Actions runs frontend, backend, evaluation, and container checks on pushes and pull requests.

## Deployment

- Frontend: Cloudflare-compatible vinext build
- Backend: FastAPI-compatible container platform
- Database: PostgreSQL or Supabase Postgres
- Vector search: Qdrant Cloud or self-hosted Qdrant
- Authentication: Supabase Auth
- Observability: optional LangSmith tracing

Production secrets should be stored in the hosting provider's secret manager, never in the repository.

## Contributing

Contributions and well-scoped bug reports are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

## Security

Do not disclose vulnerabilities in public issues. Follow the private reporting process in [SECURITY.md](SECURITY.md).

## License

Hirova is released under the [MIT License](LICENSE).
