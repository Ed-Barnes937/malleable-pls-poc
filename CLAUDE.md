# Agent notes

## Database

Never migrate or reseed the default `malleable_pls` database: it is Ed's dev data, and every checkout and worktree shares the one Postgres container. Create a database of your own and export `PG_DB` (plus your own `API_PORT` / `WEB_PORT` / `CT_PORT`) for every `dev:migrate`, `db:reseed`, `dev:server`, `e2e:server` and `test:e2e` run, and drop it when done:

```sh
docker exec malleable-plc-poc-postgres-1 createdb -U pls malleable_pls_<name>
export PG_DB=malleable_pls_<name>
```

An exported `DATABASE_URL` wins over `PG_DB`. Migrate and reseed refuse a database another branch migrated (`_migrations` rows this checkout lacks): use your own database, never work around the refusal. `e2e/README.md` ("Isolation") is the authority for the naming and port conventions.
