// `pnpm db:reseed` - restore the dev-user-1 seed data in the dev database
// (the same reseed e2e global setup runs). Honours DATABASE_URL / PG_PORT / PG_DB.
// Priya's week is built around now; SEED_NOW (an ISO instant) pins it instead,
// e.g. to rehearse the demo for a given day.
import { reseed } from './reseed'

const seedNow = process.env.SEED_NOW
const now = seedNow ? Date.parse(seedNow) : undefined
if (now !== undefined && Number.isNaN(now)) {
  console.error(`SEED_NOW is not a valid date: ${seedNow}`)
  process.exit(1)
}

reseed({ now })
  .then(() => console.log('Reseeded dev-user-1'))
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
