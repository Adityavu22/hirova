import os

# 1. Configure isolated, no-key test mode before importing the application.
os.environ["ENVIRONMENT"] = "test"
os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///./test-hirova.db"
os.environ["LLM_PROVIDER"] = "demo"
