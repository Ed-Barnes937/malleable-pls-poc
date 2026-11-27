/**
 * Vitest global setup (`vitest.config.ts`), only with TEST_DATABASE_URL: a
 * database migrated up to just before the lectures migration, built once per
 * run, for lectures-migration.db.test.ts to clone (`CREATE DATABASE ...
 * TEMPLATE`) instead of running every earlier migration in its hook, which
 * under load took most of the hook timeout. Named uniquely per run, so
 * parallel runs on one server never share one, and dropped at teardown.
 */
import { randomUUID } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postgres from 'postgres'
import type { TestProject } from 'vitest/node'

declare module 'vitest' {
  export interface ProvidedContext {
    /** The pre-lectures template database's name; unset without TEST_DATABASE_URL. */
    preLecturesTemplate?: string
  }
}

const MIGRATIONS_DIR = resolve(__dirname, '../../../../packages/db/src/migrations')
/** Every migration file, in the order they run. */
export const MIGRATIONS = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()
/** The lectures migration (NNN_lectures.sql). */
export const LECTURES = MIGRATIONS.find((f) => /^\d+_lectures\.sql$/.test(f))!
/** A migration file's SQL. */
export const readMigration = (file: string) => readFileSync(resolve(MIGRATIONS_DIR, file), 'utf-8')

/** `url` with another database name. */
export function databaseUrl(url: string, dbName: string): string {
  const u = new URL(url)
  u.pathname = `/${dbName}`
  return u.toString()
}

export default async function setup(project: TestProject): Promise<(() => Promise<void>) | void> {
  const url = process.env.TEST_DATABASE_URL
  if (!url) return
  const name = `pls_pre_lectures_tpl_${randomUUID().replace(/-/g, '').slice(0, 12)}`
  const asAdmin = async (statement: string) => {
    const admin = postgres(url, { max: 1, onnotice: () => {} })
    try {
      await admin.unsafe(statement)
    } finally {
      await admin.end()
    }
  }
  const drop = () => asAdmin(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`)
  try {
    await asAdmin(`CREATE DATABASE ${name}`)
    const db = postgres(databaseUrl(url, name), { max: 1, onnotice: () => {} })
    try {
      for (const file of MIGRATIONS.filter((f) => f < LECTURES)) await db.unsafe(readMigration(file))
    } finally {
      // A template can't be cloned while anything is connected to it.
      await db.end()
    }
  } catch (err) {
    await drop()
    throw err
  }
  project.provide('preLecturesTemplate', name)
  return drop
}
