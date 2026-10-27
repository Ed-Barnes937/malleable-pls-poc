# e2e and parallel checkouts

## Running

`pnpm test:e2e` boots Postgres (if needed), migrates, starts the API (`e2e:server`, always `AI_MODE=mock`) and the web app, reseeds `dev-user-1` (`global-setup.ts`), then runs the `*.e2e.ts` journeys.

## Seed data

`reseed()` (`e2e/reseed.ts`, also `pnpm db:reseed`) restores `dev-user-1`: the SQL seeds (lectures, tags, study boards, automations) plus Priya's week from `e2e/seed-week.ts`, built around the current date in London time: weekly Biology and Chemistry lectures, two cafe shifts (Tue and Thu evening), a Biology quiz on Thursday, a Chemistry lab report on Friday, two blocks from yesterday that didn't happen, 12 hours of unscheduled to-dos, and study already planned later in the week, sized at reseed time so that Help me plan reads "About 9 hours of study time left this week. Your to-dos need 12." on any Mon-Wed daytime (`e2e/journey-demo.e2e.ts` takes `DEMO_NOW` to pin another time). It also adds the done reviews of the seeded lectures' confusing moments (`seededReviews`), so Weak topics reads like the live demo. Once a deadline has passed it (and the to-do due with it) moves to next week, so both are always ahead. `reseed({ now })` builds the seed as if it were that instant; e2e journeys that depend on the day also freeze the browser clock (`page.clock.setFixedTime`) at the same instant. `SEED_NOW=2026-10-28T09:00:00Z pnpm db:reseed` does the same for the seed only: the app still runs on the real clock, so a `SEED_NOW` in another week puts the deadlines outside the week the calendar opens on. The CT backend simulator deliberately starts with no plan items.

## Cost guardrail

Playwright reuses any server already listening on its ports. The e2e defaults differ from the dev defaults (3001 / 5173) so a running `dev:server` is not picked up, and `global-setup.ts` fails the run unless the API's `/health` reports `aiMode: "mock"`. `scripts/browse.mts` checks the same.

## Isolation: one database and port pair per checkout

Every checkout and worktree shares the one Postgres container (`docker-compose.yml` pins the project name; localhost:5433, user/pass `pls`/`pls`). Parallel work isolates by **database** and **ports**:

| Variable | Default | Used by |
|---|---|---|
| `PG_DB` | `malleable_pls` | `dev:migrate`, `dev:server`, `e2e:server`, `db:reseed`, e2e global setup |
| `API_PORT` | e2e `3901`, browse `3001` | Playwright e2e config (`e2e/ports.ts`), `scripts/browse.mts` |
| `WEB_PORT` | e2e `5901`, browse `5173` | Playwright e2e config (`e2e/ports.ts`), `scripts/browse.mts` |
| `CT_PORT` | `3100` | Playwright component tests (`pnpm test:ct`) |

The default `malleable_pls` database is Ed's dev data: never reseed or migrate it from a ticket branch. For ticket `T<N>` use database `malleable_pls_t<N>` and ports `31<NN>` (API) / `52<NN>` (web) / `33<NN>` (CT), NN = two-digit ticket number, so T5 is 3105 / 5205 / 3305:

```sh
docker exec malleable-plc-poc-postgres-1 createdb -U pls malleable_pls_t5
PG_DB=malleable_pls_t5 API_PORT=3105 WEB_PORT=5205 pnpm test:e2e
CT_PORT=3305 pnpm test:ct
# when the ticket is merged:
docker exec malleable-plc-poc-postgres-1 dropdb -U pls malleable_pls_t5
```

## Browser verification

To drive the app by hand (mock AI, no `.env`), start the same two servers Playwright does, then use `scripts/browse.mts`:

```sh
export PG_DB=malleable_pls_t5 API_PORT=3105 WEB_PORT=5205
pnpm db:reseed   # after the first migrate; e2e:server migrates on start
PORT=$API_PORT ALLOWED_ORIGINS=http://localhost:$WEB_PORT DISABLE_RATE_LIMIT=1 pnpm e2e:server &
VITE_API_URL=http://localhost:$API_PORT VITE_USER_ID=dev-user-1 pnpm --filter @pls/web run dev --port $WEB_PORT --strictPort &

node scripts/browse.mts --board "In Lecture" --out /path/to/scratchpad/in-lecture.png
```

`scripts/browse.mts` also exports `bootCheck`, `launch` (headless Chromium, 1440x900, fake microphone), `openBoard` and `screenshot` for throwaway scripts. Keep those scripts and screenshots out of the repo, and stop the servers when done.
