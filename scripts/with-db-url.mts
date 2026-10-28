// Usage: node scripts/with-db-url.mts <command> [args...]
// Runs the command with DATABASE_URL resolved by e2e/db-url.mts (an exported
// DATABASE_URL wins, else built from PG_PORT / PG_DB). Signals are forwarded to
// the child's whole process tree and the child's exit status (or fatal signal)
// is propagated.
import { execFileSync, spawn } from 'node:child_process'
import { resolveDatabaseUrl } from '../e2e/db-url.mts'

const [cmd, ...args] = process.argv.slice(2)
if (!cmd) {
  console.error('usage: with-db-url <command> [args...]')
  process.exit(2)
}

// The child stays in our process group (so a group kill from a parent such as
// Playwright still reaches it), but pnpm does not reliably forward SIGTERM to
// the tsx watcher and server below it, so signal every descendant ourselves.
function descendants(pid: number): number[] {
  let out = ''
  try {
    out = execFileSync('pgrep', ['-P', String(pid)], { encoding: 'utf8' })
  } catch {
    return []
  }
  const kids = out.split('\n').filter(Boolean).map(Number)
  return kids.flatMap((k) => [...descendants(k), k])
}

const child = spawn(cmd, args, {
  stdio: 'inherit',
  env: { ...process.env, DATABASE_URL: resolveDatabaseUrl() },
})

for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
  process.on(sig, () => {
    for (const pid of [...descendants(child.pid!), child.pid!]) {
      try {
        process.kill(pid, sig)
      } catch {}
    }
  })
}

child.on('error', (err) => {
  console.error(`with-db-url: failed to run ${cmd}: ${err.message}`)
  process.exit(127)
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.removeAllListeners(signal)
    process.kill(process.pid, signal)
  } else {
    process.exit(code ?? 1)
  }
})
