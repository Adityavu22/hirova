# Hirova functionality coverage

This is the honest production map against the supplied 52-area Naukri/Indeed functionality document. “Operational” means the user can complete the workflow now. “Partial” means a real foundation exists but the full document scope is not yet present. Buttons are not counted as features unless their workflow works.

| # | Capability | Status | Current implementation / required next step |
|---:|---|---|---|
| 1 | Authentication and accounts | Partial | Supabase email works; Google and SMS require provider credentials and must be enabled. |
| 2 | Job-seeker profile | Operational | Editable personal details, headline, skills, preferences, notice period and open-to-work state. |
| 3 | Resume management | Partial | Upload, durable object storage and analysis exist; version history and profile-resume variants remain. |
| 4 | Job search and discovery | Operational | Public role/company/skill/location/mode search over current source feeds. |
| 5 | Recommendations | Operational | Signed-in, explainable ranking from profile roles, skills and locations. |
| 6 | Job details | Partial | Source, employer, location, work mode and extracted summary; full fields remain on original listing. |
| 7 | Save jobs | Operational | Account-scoped durable shortlist. |
| 8 | Apply flow | Partial | Verified original apply link plus Hirova tracking; native employer application forms remain. |
| 9 | Application tracking | Operational | Status pipeline, dates and candidate notes. |
| 10 | Job alerts | Not yet | Needs saved-search rules, delivery scheduler, unsubscribe and email/push provider. |
| 11 | Recruiter discovery | Not yet | Requires recruiter product and candidate visibility controls. |
| 12 | Messaging | Not yet | Requires verified employer identities, threads, spam protection and notifications. |
| 13 | Company pages | Partial | Employer/source identity is shown; dedicated profiles, follows and media remain. |
| 14 | Company reviews | Not yet | Requires moderation, anonymity, dispute and abuse workflows. |
| 15 | Salary tools | Partial | Publisher salary is displayed when supplied; estimates and benchmarking remain. |
| 16 | Career content | Not yet | Needs editorial CMS, taxonomy and moderation. |
| 17 | AI career assistant | Partial | Grounded profile/job Q&A exists; conversation history and citations need expansion. |
| 18 | AI matching | Partial | Explainable profile matching works; embeddings, feedback calibration and eval gates remain. |
| 19 | Recruiter dashboard | Not yet | Separate employer workspace required. |
| 20 | Job posting | Not yet | Separate verified-employer authoring, preview and lifecycle required. |
| 21 | AI-assisted posting | Not yet | Must follow real employer posting and approval workflow. |
| 22 | Applicant dashboard | Not yet | Requires native job applications and employer ownership. |
| 23 | Screening | Not yet | Requires consent, configurable questions and auditable decision support. |
| 24 | Candidate search | Not yet | Requires recruiter entitlements and privacy-aware indexing. |
| 25 | AI sourcing | Not yet | Requires recruiter controls, fairness evaluation and outreach limits. |
| 26 | Invitations | Not yet | Requires verified employers, messaging and anti-spam controls. |
| 27 | ATS pipeline | Not yet | Requires employer pipeline stages, audit logs and permissions. |
| 28 | Scheduling | Not yet | Requires calendar integrations and timezone-safe availability. |
| 29 | Virtual interviews | Not yet | Requires video provider, consent, storage and accessibility. |
| 30 | Recruiter collaboration | Not yet | Requires organisation roles, notes, mentions and audit logs. |
| 31 | Employer branding | Not yet | Requires verified organisation pages and asset moderation. |
| 32 | Sponsored jobs | Not yet | Requires billing, disclosure, ranking policy and reporting. |
| 33 | Candidate paid services | Not yet | Requires catalogue, checkout, fulfilment and refund policy. |
| 34 | Recruiter analytics | Not yet | Depends on native posting/applicant events. |
| 35 | Candidate analytics | Partial | Saved/applied/profile-strength summaries exist; search and funnel analytics remain. |
| 36 | Notifications | Partial | In-app surface exists; event-driven inbox, preferences, email and push remain. |
| 37 | Search/recommendation infrastructure | Partial | Durable Supabase/Postgres full-text index, filters, cache and explainable ranking; vector reranking and feedback calibration remain. |
| 38 | Aggregation/feed management | Operational | Twenty-one documented feeds/employer boards, including India-focused employers, with dedupe, authenticated source links, daily refresh, failure telemetry and safe stale-record handling. |
| 39 | Moderation | Not yet | Requires queues, policy enforcement, appeals and auditability. |
| 40 | Trust/fraud | Partial | Only documented sources are accepted; reporting, employer verification and fraud scoring remain. |
| 41 | Admin | Not yet | Requires role-based operational console. |
| 42 | Billing | Not yet | Requires product catalogue, payment provider, invoices and tax/refund handling. |
| 43 | Integrations | Partial | Supabase and public job-source APIs exist; ATS, calendars, email and HRIS remain. |
| 44 | APIs/import/export | Partial | Normalized jobs API exists; partner auth, quotas, webhooks and data export remain. |
| 45 | Mobile | Partial | Responsive web works; PWA/native apps, offline and push remain. |
| 46 | Localization | Not yet | Needs locale, translated taxonomy, currency/date and regional policy support. |
| 47 | Accessibility | Partial | Semantic controls, labels, focus and responsive layout; formal WCAG audit remains. |
| 48 | Privacy | Partial | Account-scoped storage exists; consent centre, export/delete automation and retention controls remain. |
| 49 | Security | Partial | Supabase sessions, token verification, validation and secret separation; formal threat model/audit remain. |
| 50 | Support | Not yet | Requires help centre, ticketing, case status and escalation policy. |
| 51 | Analytics/operations | Partial | Tests, CI and deployment structure exist; product analytics, SLOs, alerting and incident runbooks remain. |
| 52 | Journeys and NFRs | Partial | Core candidate discover→profile→match→apply→track→prepare journey works; full recruiter/admin journeys and scale validation remain. |

## Release priorities

1. P0 candidate marketplace: continue adding compliant feeds, alerts, privacy/export/delete, and operational monitoring.
2. P0 employer marketplace: verified employer onboarding, posting, native apply, applicant pipeline, messaging and audit logs.
3. P1 trust and monetisation: moderation, fraud operations, billing/sponsored disclosure, reviews and salary quality.
4. P1 scale: dedicated search index, event system, analytics, SLOs, localization and accessibility audit.
