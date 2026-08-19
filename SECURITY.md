# Security policy

## Supported version

Security fixes target the latest `main` branch.

## Reporting a vulnerability

Do not open a public issue containing credentials, personal resume data, authentication bypasses, or exploitable details. Contact the repository owner privately through their GitHub profile and include a concise reproduction, impact, and suggested mitigation.

## Security baseline

- Service-role, AI-provider, database, and tracing credentials are server-only.
- Browser clients receive only publishable Supabase configuration.
- Candidate data is account-scoped and production authentication fails closed.
- Public job reads use row-level security; ingestion telemetry and mutations are service-only.
- Resume contents and access tokens must not be written to logs.

Before a public high-scale launch, complete an independent security review, enable leaked-password protection in Supabase Auth, and configure retention, deletion, abuse reporting, and incident response.
