import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { availableMigrations, compareMigrations, schemaMismatchMessage } from './schema-guard'

const migrate = { action: 'migrate', allowPending: true }
const reseed = { action: 'reseed', allowPending: false }

describe('compareMigrations', () => {
  it('finds no drift when the database is at this checkout', () => {
    expect(compareMigrations(['001_a.sql', '002_b.sql'], ['001_a.sql', '002_b.sql'])).toEqual({ unknown: [], pending: [] })
  })

  it('reports migrations the database has and this checkout does not as unknown', () => {
    expect(compareMigrations(['001_a.sql', '024_other_branch.sql'], ['001_a.sql'])).toEqual({
      unknown: ['024_other_branch.sql'],
      pending: [],
    })
  })

  it('reports migrations this checkout has and the database does not as pending', () => {
    expect(compareMigrations(['001_a.sql'], ['002_b.sql', '001_a.sql'])).toEqual({
      unknown: [],
      pending: ['002_b.sql'],
    })
  })

  it('reports both at once, sorted', () => {
    expect(compareMigrations(['003_z.sql', '001_a.sql', '002_y.sql'], ['001_a.sql', '002_b.sql'])).toEqual({
      unknown: ['002_y.sql', '003_z.sql'],
      pending: ['002_b.sql'],
    })
  })

  it('treats a fresh database (nothing applied) as all pending', () => {
    expect(compareMigrations([], ['001_a.sql', '002_b.sql'])).toEqual({ unknown: [], pending: ['001_a.sql', '002_b.sql'] })
  })
})

describe('schemaMismatchMessage', () => {
  it('lets a matching database through for both migrate and reseed', () => {
    const drift = { unknown: [], pending: [] }
    expect(schemaMismatchMessage(drift, 'malleable_pls_t5', migrate)).toBeNull()
    expect(schemaMismatchMessage(drift, 'malleable_pls_t5', reseed)).toBeNull()
  })

  it('refuses unknown migrations, naming them, the database and the PG_DB way out', () => {
    const drift = { unknown: ['024_x.sql', '025_y.sql'], pending: [] }
    for (const options of [migrate, reseed]) {
      const message = schemaMismatchMessage(drift, 'malleable_pls', options)
      expect(message).toContain(`Refusing to ${options.action} database "malleable_pls"`)
      expect(message).toContain('024_x.sql, 025_y.sql')
      expect(message).toContain('PG_DB=malleable_pls_<name>')
      expect(message).toContain('e2e/README.md')
    }
  })

  it('refuses unknown migrations even when some are also pending', () => {
    expect(schemaMismatchMessage({ unknown: ['024_x.sql'], pending: ['024_y.sql'] }, 'db', migrate)).toContain('024_x.sql')
  })

  it('lets migrate apply pending migrations', () => {
    expect(schemaMismatchMessage({ unknown: [], pending: ['023_z.sql'] }, 'db', migrate)).toBeNull()
  })

  it('refuses to reseed a database with pending migrations, saying to migrate first', () => {
    const message = schemaMismatchMessage({ unknown: [], pending: ['023_z.sql'] }, 'db', reseed)
    expect(message).toContain('Refusing to reseed database "db"')
    expect(message).toContain('023_z.sql')
    expect(message).toContain('pnpm dev:migrate')
  })

  it('shortens a long pending list (a never-migrated database)', () => {
    const pending = ['001_a.sql', '002_b.sql', '003_c.sql', '004_d.sql', '005_e.sql']
    expect(schemaMismatchMessage({ unknown: [], pending }, 'db', reseed)).toContain('(001_a.sql, 002_b.sql, 003_c.sql and 2 more)')
  })
})

describe('availableMigrations', () => {
  it('lists only .sql files, in filename order', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'migrations-'))
    try {
      for (const name of ['002_b.sql', 'README.md', '001_a.sql']) await writeFile(join(dir, name), '')
      expect(await availableMigrations(dir)).toEqual(['001_a.sql', '002_b.sql'])
    } finally {
      await rm(dir, { recursive: true })
    }
  })
})
