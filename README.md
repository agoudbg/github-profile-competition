# GitHub Profile Competition

A Next.js app that compares two GitHub accounts across public profile, repository, impact, contribution, and activity signals. It can call an OpenAI-compatible chat completion endpoint to generate Chinese analysis while keeping provider configuration on the server.

## Getting started

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000`.

## Environment

Copy `.env.example` to `.env.local` and fill the values you need.

```bash
GITHUB_TOKEN=optional_github_token
OPENAI_API_KEY=required_for_real_llm_analysis
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini
LLM_REQUEST_TIMEOUT_MS=300000
ABUSE_PROTECTION_ENABLED=true
ABUSE_RATE_LIMIT_WINDOW_SECONDS=900
ABUSE_RATE_LIMIT_MAX=5
ABUSE_CONCURRENT_MAX=1
ABUSE_LIMIT_SALT=required_in_production
```

`GITHUB_TOKEN` is optional. Without it, the app still uses public REST endpoints and public events, but contribution confidence is lower.
`LLM_REQUEST_TIMEOUT_MS` controls the timeout for each provider request. The default is 300000 milliseconds.

## Abuse protection

Compare requests are protected before expensive GitHub and LLM calls run. The default guard allows five valid compare requests per client every 15 minutes and one in-flight compare request per client. Invalid JSON and validation failures return `400` before consuming rate-limit capacity.

Set `ABUSE_LIMIT_SALT` to a stable secret value in production so client identifiers are hashed before they are used as in-memory keys. This lightweight guard is suitable as a first line of defense; for multi-instance serverless deployments, replace the in-memory store in `src/lib/abuse.ts` with Redis, KV, or another shared store.

## Scripts

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```
