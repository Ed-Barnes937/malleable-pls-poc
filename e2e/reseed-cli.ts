// `pnpm db:reseed` - restore the dev-user-1 seed data in the dev database
// (the same reseed e2e global setup runs). Honours DATABASE_URL / PG_PORT.
import { reseed } from './reseed'

reseed()
  .then(() => console.log('Reseeded dev-user-1'))
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
