# Hirova — AI Job Marketplace and Career Copilot

Hirova is a Naukri/Indeed-style job marketplace with an AI career layer. It discovers real, source-linked openings, ingests resumes and job descriptions, explains job matches, finds skill gaps, creates interview preparation, and answers grounded career questions through an agentic RAG workflow.

The public marketplace aggregates documented feeds from Arbeitnow and Remotive plus direct Greenhouse/Lever employer career boards. Every listing keeps its original source and application URL. A Supabase Edge Function refreshes the normalized job index every day at 06:45 IST; failed sources are reported without deleting the last healthy index.

The project runs without a paid AI API in local preview mode. Groq is the default live AI provider; Gemini is a configuration-only switch. Production users require Supabase Auth plus a deployed FastAPI/PostgreSQL stack.

## What is included

- Polished responsive frontend: overview, job explorer, resume intelligence, skill gaps, interview practice, saved roles, and AI Copilot
- Phone OTP, email/password, and Google OAuth authentication through Supabase
- First-time onboarding and a complete editable candidate profile
- Per-user saved jobs, job preferences, applications, notes, and pipeline statuses
- FastAPI backend with versioned endpoints and OpenAPI docs
- PDF, DOCX, TXT, and Markdown ingestion
- Explainable hybrid job matching: explicit skill coverage + semantic similarity
- LangGraph parent workflow with resume and interview subgraphs
- Agentic RAG: rewrite → retrieve → grade → retry → grounded answer
- Qdrant integration with a free in-memory fallback
- SQLAlchemy async data layer, SQLite locally, PostgreSQL in Docker/production
- Alembic migration, Docker Compose, tests, offline evals, LangSmith hooks, and GitHub Actions
- Supabase/Postgres job index with RLS, full-text search, refresh telemetry, and daily scheduled ingestion

## Architecture

```text
Browser / Cloudflare frontend
          │
          ▼
FastAPI routes ─────────────── PostgreSQL
          │                 candidates, jobs,
          │                 resumes, matches
          ▼
LangGraph parent workflow
  ├── Resume-analysis subgraph
  ├── Skill-gap node
  └── Interview-prep subgraph
          │
          ├── Groq / Gemini / demo fallback
          ├── Qdrant vector search
          └── LangSmith tracing (optional)
```

## Run locally — concise Hinglish

### Option A: zero-cost local preview

1. Frontend dependencies install karo:

   ```bash
   npm install
   ```

2. Backend environment banao:

   ```bash
   cd backend
   python -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   ```

3. Do terminals mein services chalao:

   ```bash
   npm run dev
   ```

   ```bash
   cd backend
   uvicorn app.main:app --reload
   ```

4. App: `http://localhost:3000` · API docs: `http://localhost:8000/docs`

Local preview mein external AI call nahi hota. Without Supabase configuration, phone preview OTP `123456` hai and the other login methods create a device-only preview session. Profile, saved jobs, applications, resume state, matching, graphs, RAG retrieval, and UI sab test kar sakte ho.

### Production authentication

Supabase project create karke `.env` mein public client values add karo:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_publishable_key
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_PUBLISHABLE_KEY=your_publishable_key
```

Then Supabase mein:

1. Email/password provider enable karo.
2. Phone provider enable karke supported SMS provider configure karo.
3. Google OAuth provider configure karo.
4. Local and production URLs ko redirect allowlist mein add karo.

Frontend access token FastAPI ko bhejta hai. Backend Supabase `/auth/v1/user` se token verify karta hai and production mein missing auth configuration par fail closed karta hai.

### Option B: Groq free tier

```bash
cp .env.example .env
```

`.env` mein:

```dotenv
LLM_PROVIDER=groq
GROQ_API_KEY=your_key_here
```

Key ko commit mat karo. Gemini ke liye `LLM_PROVIDER=gemini` and `GEMINI_API_KEY` use karo.

### Option C: full stack with Docker

```bash
docker compose up --build
```

This starts frontend, FastAPI, PostgreSQL, and Qdrant.

Mac par pehle Docker Desktop install/start karo. Ye commands successful hone chahiye:

```bash
docker version
docker compose version
```

Uske baad `docker compose up --build` run karo. The complete Compose stack has been built and smoke-tested locally with healthy frontend, FastAPI, PostgreSQL, and Qdrant services.

## Important API endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/v1/health` | Deployment health check |
| `GET/POST` | `/api/v1/jobs` | Search or ingest normalized JDs |
| `POST` | `/api/v1/jobs/match` | Explainable resume-to-job ranking |
| `POST` | `/api/v1/resumes/upload` | Parse and score PDF/DOCX/TXT |
| `POST` | `/api/v1/analysis/skill-gap` | Run resume + skill-gap workflow |
| `POST` | `/api/v1/analysis/interview-prep` | Generate grounded questions/rubrics |
| `POST` | `/api/v1/copilot/ask` | Agentic RAG career answer |
| `GET/PUT` | `/api/v1/workspace/me` | Authenticated candidate profile |
| `GET/POST/PATCH` | `/api/v1/workspace/applications` | Candidate application pipeline |
| `GET/PUT/DELETE` | `/api/v1/workspace/saved` | Candidate job shortlist |

## Interview-ready constructs

### 1. Hybrid matching

Keyword matching alone misses synonyms and transferable work. Pure embeddings can be hard to explain. Hirova combines:

- explicit skill coverage for auditability;
- hashed semantic similarity for local/no-cost behavior;
- deterministic sorting for reproducible tests.

Production mein local embedding function ko a stronger embedding model se replace kar sakte ho without changing the API contract.

### 2. LangGraph

- **State:** typed shared data passed between steps.
- **Node:** one unit of work, such as resume analysis or document grading.
- **Edge:** determines execution order.
- **Conditional edge:** chooses the next node using current state.
- **Subgraph:** reusable workflow embedded as one parent node.

Hirova uses resume and interview subgraphs so each workflow remains independently testable. This follows LangGraph’s shared-state subgraph pattern.

### 3. Agentic RAG

Normal RAG retrieves once and answers. Agentic RAG adds control logic:

1. Rewrite the user question for retrieval.
2. Retrieve context from Qdrant or memory.
3. Grade document relevance.
4. Retry once when context is weak.
5. Answer with source metadata and a safe fallback.

This reduces blind answering and makes retrieval failures observable.

### 4. PostgreSQL-ready data layer

Routes never contain raw persistence logic. Repositories use an async SQLAlchemy session. Local development defaults to SQLite; Docker uses `postgresql+asyncpg` with the same models. Alembic owns production schema changes.

### 5. Reliability and LLMOps

- timeouts, bounded retries, exponential backoff, and deterministic fallbacks;
- request correlation IDs and latency headers;
- no resume body or secrets in application logs;
- optional LangSmith tracing through environment variables;
- offline regression cases in `backend/evals`;
- frontend, backend, and container checks in CI.

## Verification

```bash
npm test
cd backend && pytest -q
cd backend && python evals/run_evals.py
```

## Deployment shape

- Frontend: Cloudflare-compatible vinext build (`npm run build`)
- Backend: any container platform that supports FastAPI
- Database: managed PostgreSQL
- Vector database: Qdrant Cloud or self-hosted Qdrant
- Secrets: deployment secret manager only
- Health probe: `/api/v1/health`

Before high-scale production launch, enable Supabase leaked-password protection, configure Google/SMS providers, deploy FastAPI with managed PostgreSQL/Qdrant, add malware scanning for resume bytes, configure retention/consent policies, and enable per-user rate limiting. The checked-in app contains real source-linked inventory but never invents listings or provider credentials.

## Source map

```text
app/                         frontend product UI
backend/app/api/             FastAPI routes
backend/app/agents/          LangGraph state, tools, graphs, subgraphs
backend/app/services/        ingestion, LLM gateway, matching, vectors
backend/app/db/              models, sessions, repositories, seeds
backend/alembic/             database migrations
backend/evals/               offline AI regression cases
tests/ + backend/tests/      frontend and backend verification
.github/workflows/ci.yml     CI/CD quality gate
docker-compose.yml           complete local production-like stack
supabase/functions/          daily compliant job ingestion
supabase/migrations/         RLS search index and scheduler
```

## Daily job refresh

The `sync-jobs` Edge Function reads documented public feeds and employer career APIs, normalizes records, deduplicates by source ID, and preserves each original application URL. Supabase Cron invokes it at `15 1 * * *` UTC (06:45 IST). Public clients can only read active jobs seen in the last 72 hours; sync telemetry and write privileges remain service-only.

If every source succeeds, stale records are safely expired. If even one source fails, the last healthy records remain visible and the failed source is captured in telemetry for diagnosis.

## Security

Never commit `.env` files or service-role keys. The browser uses only a Supabase publishable key. Database writes from the ingestion function use Supabase's server-side secret environment. Please report vulnerabilities privately as described in `SECURITY.md`.

## License

Released under the MIT License. See `LICENSE`.
