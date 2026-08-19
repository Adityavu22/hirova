.PHONY: dev frontend backend test lint compose

# 1. Start each process in a separate terminal for local development.
frontend:
	npm run dev

backend:
	cd backend && uvicorn app.main:app --reload

# 2. Verification commands mirror CI.
test:
	npm test
	cd backend && pytest -q

lint:
	npm run lint
	cd backend && ruff check .

compose:
	docker compose up --build
