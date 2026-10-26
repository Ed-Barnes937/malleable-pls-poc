# @pls/server

tRPC API, `/upload`, and the workflow job runner.

## AI (`AI_MODE`)

All AI goes through `AiDeps` (`src/ai/deps.ts`): a `Transcriber` and an
`LlmClient`, created once in `src/index.ts` and passed to executors
(`createServerExecutors`) and routers (`ctx.ai`). Nothing else constructs a
provider client.

| `AI_MODE` | `OPENROUTER_API_KEY` | Result |
|---|---|---|
| `live` | set | OpenRouter Whisper transcription + OpenRouter LLM (`OPENROUTER_LLM_MODEL`, default in `src/ai/openrouter.ts`) |
| anything else, or unset (default `mock`) | any | Deterministic fakes: canned transcript, `fakeLlmFixtures` |
| `live` | missing or empty | Fakes (a startup line says why) |

The server logs which mode it is in at startup.

- **Env files:** only `pnpm dev:server` loads `apps/server/.env` (via `tsx --env-file-if-exists`). `start`, `migrate-and-start` and `e2e:server` never do.
- **Tests never hit a provider:** `vitest.setup.ts` and both Playwright configs force `AI_MODE=mock` and unset the key, `e2e:server` does the same, and `src/ai/deps.test.ts` asserts fakes are selected under test. Live clients are unit-tested with an injected `fetch`.
- **Adding an LLM call:** call `ai.llm.complete({ task, system, prompt, input, schema })` and add a fixture for `task` to `src/ai/fake-llm-fixtures.ts`. Make the fixture deterministic and derive its output from `input` so mock-mode screenshots look real. With a `schema` (zod), the reply is parsed and validated for both live and fake clients; prefer `.nullable()` over `.optional()` (strict structured output needs every key).
