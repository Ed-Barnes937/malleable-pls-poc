import { describe, expect, it } from 'vitest'
import { resolveDatabaseUrl } from './db-url'

describe('resolveDatabaseUrl', () => {
  it('defaults to the dev database on 5433', () => {
    expect(resolveDatabaseUrl({})).toBe('postgres://pls:pls@localhost:5433/malleable_pls')
  })

  it('builds from PG_PORT and PG_DB', () => {
    expect(resolveDatabaseUrl({ PG_PORT: '5500', PG_DB: 'malleable_pls_t5' })).toBe(
      'postgres://pls:pls@localhost:5500/malleable_pls_t5',
    )
  })

  it('prefers DATABASE_URL over PG_*', () => {
    expect(
      resolveDatabaseUrl({ DATABASE_URL: 'postgres://u:p@h:1/x', PG_DB: 'other', PG_PORT: '1' }),
    ).toBe('postgres://u:p@h:1/x')
  })

  it('treats an empty DATABASE_URL as unset', () => {
    expect(resolveDatabaseUrl({ DATABASE_URL: '', PG_DB: 'a' })).toBe(
      'postgres://pls:pls@localhost:5433/a',
    )
  })
})
