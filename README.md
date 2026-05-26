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
LLM_MAX_TOOL_CALLS=8
LLM_REQUEST_TIMEOUT_MS=300000
ABUSE_PROTECTION_ENABLED=true
ABUSE_RATE_LIMIT_WINDOW_SECONDS=900
ABUSE_RATE_LIMIT_MAX=5
ABUSE_CONCURRENT_MAX=1
ABUSE_LIMIT_SALT=required_in_production
LEADERBOARD_DATABASE_PATH=.data/leaderboard.sqlite
COMPARISON_CACHE_DATABASE_PATH=.data/comparison-cache.sqlite
```

`GITHUB_TOKEN` is optional. Without it, the app still uses public REST endpoints and public events, but contribution confidence is lower.
`LLM_MAX_TOOL_CALLS` controls the maximum total GitHub tool calls the model can make during one comparison. The default is 8 and runtime values are clamped to 4-20.
`LLM_REQUEST_TIMEOUT_MS` controls the timeout for each provider request. The default is 300000 milliseconds.

## Abuse protection

Compare requests are protected before expensive GitHub and LLM calls run. The default guard allows five valid compare requests per client every 15 minutes and one in-flight compare request per client. Invalid JSON and validation failures return `400` before consuming rate-limit capacity.

Set `ABUSE_LIMIT_SALT` to a stable secret value in production so client identifiers are hashed before they are used as in-memory keys. This lightweight guard is suitable as a first line of defense; for multi-instance serverless deployments, replace the in-memory store in `src/lib/abuse.ts` with Redis, KV, or another shared store.

## Leaderboard

Compared users are saved to SQLite with system-only scores, per-dimension scores, update time, and scoring version. Historical snapshots are retained, while the leaderboard ranks each user by their latest snapshot only. The UI shows up to the top 1,000 users and loads 100 users per page. Set `LEADERBOARD_DATABASE_PATH` to choose the SQLite file location; it defaults to `.data/leaderboard.sqlite`.

## Comparison result cache

Comparison results are cached in SQLite for up to 30 days. User pairs are stored as unordered groups, so `a` vs `b` and `b` vs `a` reuse the same cached result. Set `COMPARISON_CACHE_DATABASE_PATH` to choose the SQLite file location; it defaults to `.data/comparison-cache.sqlite`.

## Scripts

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```
