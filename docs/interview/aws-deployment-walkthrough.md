# Hirova AWS deployment: interview walkthrough

## Short answer

Hirova ka public web application existing edge hosting aur Supabase par chalta hai. Maine AI copilot ko AWS par ek separate serverless backend ke roop mein deploy kiya. User ka request pehle Hirova ke authenticated edge route par aata hai, phir Supabase access token ke saath API Gateway tak forward hota hai. API Gateway JWT validate karta hai aur sirf valid request par Lambda invoke hoti hai. Lambda ke andar FastAPI, LangGraph workflow, Groq LLM aur Qdrant retrieval execute hote hain.

## Maine ye architecture kyun choose kiya

- Early-stage traffic predictable nahi tha, isliye always-running EC2 ke badle Lambda use ki.
- API Gateway HTTP API REST API se simpler aur lower-cost ingress deta hai.
- Existing Supabase authentication aur marketplace database ko migrate nahi kiya, jisse risk aur duplicate data avoid hua.
- Groq aur Qdrant credentials source code, Docker image aur CloudFormation parameters se bahar Secrets Manager mein rakhe.
- API Gateway ko `1 request/second` aur burst `2` par throttle kiya, taaki unexpected traffic se credit consumption bounded rahe.
- Logs ko 14 days baad expire kiya, taaki storage indefinitely grow na kare.

## End-to-end request flow

1. User `hirova.in` par Supabase ke through sign in karta hai.
2. Frontend `/api/copilot` ko request bhejta hai.
3. Edge route active user session aur access token verify karta hai.
4. Request bearer token ke saath AWS API Gateway HTTP API ko forward hoti hai.
5. API Gateway Supabase issuer aur `authenticated` audience ke against JWT validate karta hai.
6. Valid request Lambda container ko invoke karti hai; invalid request Lambda cost create kiye bina reject hoti hai.
7. FastAPI user ko dobara verify karta hai, phir LangGraph agentic workflow chalata hai.
8. Qdrant candidate-specific retrieval context deta hai aur Groq model grounded response generate karta hai.
9. Response same secure path se browser tak return hota hai.

## AWS resources aur unka role

| Resource | Interview explanation |
| --- | --- |
| ECR | Lambda ka versioned Docker image store karta hai. |
| Lambda | FastAPI AI endpoint ko request ke time run karta hai; idle server cost nahi hoti. |
| API Gateway | HTTPS endpoint, CORS aur Supabase JWT authorization handle karta hai. |
| Secrets Manager | Groq aur Qdrant credentials securely store karta hai. |
| CloudWatch Logs | Runtime errors, latency investigation aur operational debugging ke liye logs rakhta hai. |
| CloudWatch Alarm | Repeated 5xx errors ko deployment/rollback signal banata hai. |
| CloudFormation/SAM | Infrastructure ko repeatable, reviewable aur version-controlled banata hai. |

## Security points

- Apply/copilot operation authenticated hai; public route sirf read-only health check hai.
- Secret values GitHub, Docker build arguments aur application logs mein nahi jaate.
- Candidate Qdrant collections raw email/user ID ke badle one-way hash se isolate hoti hain.
- CORS sirf `hirova.in` aur `www.hirova.in` allow karta hai.
- Production deployment root credentials ko application runtime mein use nahi karta.

## Cost-control points

- AWS Free plan aur remaining credits deploy se pehle API se verify kiye.
- API Gateway request rate aur burst limited hain. New free account quota ne function-level reserved concurrency allow nahi ki, kyunki AWS minimum ten unreserved executions require karta hai.
- No EC2, RDS, NAT Gateway, load balancer ya custom KMS key.
- CloudWatch log retention bounded hai.
- USD 1 monthly AWS Budget alert configured hai; ye alert hai, hard spending stop nahi.

## Interview-ready one-minute answer

“Maine Hirova ko hybrid production architecture mein build kiya. Frontend aur job marketplace Supabase-backed edge application par hain, jabki authenticated AI copilot AWS serverless stack par hai. Frontend Supabase access token ke saath API Gateway HTTP API ko call karta hai. API Gateway JWT verify karke Lambda-based FastAPI service invoke karta hai. Lambda mein LangGraph workflow user context ko Qdrant se retrieve karta hai aur Groq LLM se grounded career response generate karta hai. Container image ECR mein store hoti hai, secrets Secrets Manager mein hain, aur CloudWatch logs plus 5xx alarm observability dete hain. Infrastructure SAM/CloudFormation se version-controlled hai. Cost control ke liye API rate one request per second, burst two, logs fourteen days, aur no EC2, NAT, RDS or load balancer rakha.”

## Deployment diary

1. AWS root account par MFA enabled tha; temporary CLI authorization browser passkey se complete hua.
2. STS se correct AWS account identity verify ki.
3. Free Tier API se FREE plan, USD 120 credits aur 24 February 2027 expiry verify ki.
4. Budgets API se `Hirova-Zero-Spend` healthy aur current spend USD 0 verify kiya.
5. SAM template mein ECR-backed Lambda, HTTP API JWT authorizer, CloudWatch logs/alarm aur Secrets Manager references prepare kiye.
6. Local Lambda runtime smoke test ne unnecessary eager resume-parser import catch kiya; import lazy karke minimal container health check HTTP 200 verify kiya.
7. Initial Buildx image attestation manifest Lambda-compatible nahi tha. Image ko `--provenance=false` se single manifest mein rebuild kiya aur CloudFormation rollback verify kiya.
8. New-account concurrency quota ne reserved concurrency reject ki. Compatible cost guardrail ke liye API Gateway throttle `1 request/second`, burst `2` configure kiya.
9. Corrected application stack Mumbai region mein `CREATE_COMPLETE` hui; health HTTP 200 aur unauthenticated AI request HTTP 401 verify hui.
10. Hirova hosting environment mein AWS API base URL configure karke edge proxy integration prepare ki.
11. Public Site version deploy karke `hirova.in` ko canonical URL ke roop mein HTTP 200 verify kiya; unauthenticated edge copilot HTTP 401 raha.
12. AWS MCP se independent post-deployment audit kiya: Lambda active, ECR scan complete with no findings, CloudWatch alarm OK, logs 14 days, AWS spend USD 0.
13. GitHub Actions ke liye OIDC trust banaya. Workflow mein long-lived AWS access keys nahi hain; sirf `main` branch temporary role assume karke Hirova ECR aur Lambda update kar sakti hai.
14. Daily job sync mein 56 parallel source requests Edge Function resource limit hit kar rahe the. Concurrency six par bound ki, stale telemetry cleanup add ki, version 6 deploy ki aur 6,865 jobs plus 56/56 sources ke saath HTTP 200 verify kiya.

Further verified deployment events will be appended here.
