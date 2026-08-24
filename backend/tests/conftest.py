import os

# 1. Configure isolated, no-key test mode before importing the application.
os.environ["ENVIRONMENT"] = "test"
os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///./test-hirova.db"
os.environ["LLM_PROVIDER"] = "demo"
# 2. Protected routes must fail closed in CI even though no real auth request is sent.
os.environ["SUPABASE_URL"] = "https://test.supabase.co"
os.environ["SUPABASE_PUBLISHABLE_KEY"] = "sb_publishable_test_only_000000000000"
