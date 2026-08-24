# Hirova AWS production backend

## Deployment record

This file is the operational source of truth for the AWS integration. Update it only after a step is verified.

| Item | Verified state |
| --- | --- |
| AWS account | `492715479070` |
| Region | `ap-south-1` (Mumbai) |
| AWS plan | Free plan, active |
| Promotional credits | USD 120 remaining at deployment start |
| Credit expiry | 24 February 2027 |
| Starting AWS spend | USD 0 |
| Cost budget | `Hirova-Zero-Spend`, USD 1 monthly alert |
| CLI profile | `hirova` |

The AWS Budget is an alert, not a hard spending cap. Resource creation is deliberately restricted to the approved serverless stack and must be followed by a cost check.

## Resource inventory

The following resources are created through `infra/aws/template.yaml` and the SAM deployment workflow. Record physical names and endpoints here after CloudFormation verifies them.

| Service | Purpose | Status |
| --- | --- | --- |
| Amazon ECR | `hirova-ai-lambda`; immutable ARM64 Lambda images, scan on push, newest five retained | Live |
| AWS Lambda | `hirova-production-ai-HirovaAiFunction-7FED6qNwjQNO`; authenticated FastAPI and LangGraph copilot | Live |
| Amazon API Gateway HTTP API | API `8k645msobi`; Supabase JWT authorizer and bounded ingress | Live |
| Amazon CloudWatch Logs | Lambda log group with 14-day retention | Live |
| Amazon CloudWatch Alarm | API 5xx production alarm | Live |
| AWS Secrets Manager | `hirova/production/ai-runtime`; Groq and Qdrant credentials | Live |
| AWS CloudFormation/SAM | `hirova-production-bootstrap` and `hirova-production-ai` stacks | Live |

Hirova keeps its public web experience and marketplace data on the existing edge and Supabase services. AWS hosts only the authenticated AI copilot API. This split avoids migrating working production data and prevents an idle server from running continuously.

## Request path

`hirova.in/api/copilot` verifies the browser session, forwards the Supabase access token to an AWS HTTP API, and returns the FastAPI response. API Gateway validates the JWT before Lambda runs. FastAPI verifies the current Supabase user again before executing the LangGraph workflow. Candidate-specific Qdrant collection names are derived from a one-way user identifier hash.

The public AWS URL is an integration detail. It is not linked from the Hirova interface and does not replace the `hirova.in` domain.

## Cost boundary

API Gateway throttles the API to one request per second with a burst of two, and logs expire after fourteen days. The new AWS account did not allow function-level reserved concurrency because AWS requires at least ten unreserved account executions, so ingress throttling provides the compatible early-stage cost boundary. Secrets Manager, ECR image storage, API Gateway, Lambda, and CloudWatch can consume AWS credits or become billable after credits expire. No NAT gateway, load balancer, EC2 instance, RDS database, or custom KMS key belongs in this stack.

## Secret contract

The deployment references one existing Secrets Manager JSON secret with two keys: `groq_api_key` and `qdrant_api_key`. Secret values must never be committed, printed, entered as CloudFormation parameters, or included in build arguments. CloudFormation resolves the references during deployment.

## Deployment and rollback

1. Build and test the Lambda image locally.
2. Run template syntax, schema, and compliance checks.
3. Create a CloudFormation change set for pre-deployment validation. Do not execute it without explicit approval.
4. Deploy the stack and verify the health endpoint, unauthenticated rejection, authenticated copilot response, logs, and alarm state.
5. Configure `HIROVA_AI_API_URL` in the hosted edge environment and redeploy the site.
6. Roll back by restoring the previous edge environment value. CloudFormation retains the prior Lambda version only when a versioned deployment strategy is added; until then, image tags and deployment commits are the rollback record.

## Verified deployment log

1. AWS CLI authentication verified with STS for account `492715479070`.
2. AWS Free Tier API verified an active FREE plan with USD 120 remaining credits.
3. AWS Budgets API verified `Hirova-Zero-Spend` is healthy and starting actual spend is USD 0.
4. Application tests passed before resource creation: nine backend tests, eight frontend tests, Ruff, and the frontend production build.
5. Bootstrap stack reached `CREATE_COMPLETE`; ECR and the retained runtime secret are managed by CloudFormation.
6. ARM64 Lambda container passed a local Lambda Runtime API smoke test with health HTTP 200.
7. ECR image `20260824-2` was pushed as a Lambda-compatible single manifest and pinned by digest in CloudFormation.
8. Application stack reached `CREATE_COMPLETE` in Mumbai.
9. Production health endpoint returned HTTP 200 with `environment=production`.
10. An unauthenticated copilot request returned HTTP 401 before Lambda application logic was exposed.
11. Sites runtime environment revision 5 connects the Hirova edge route to the AWS API; a new public Site version is required to activate it.
