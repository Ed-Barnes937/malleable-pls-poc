// Usage: node scripts/with-db-url.mts <command> [args...]
// Runs the command with DATABASE_URL resolved by e2e/db-url.mts (an exported
// DATABASE_URL wins, else built from PG_PORT / PG_DB). Signals are forwarded to
// the child and the child's exit status (or fatal signal) is propagated.
import { spawn } from 'node:child_process'
import { resolveDatabaseUrl } from '../e2e/db-url.mts'

const [cmd, ...args] = process.argv.slice(2)
if (!cmd) {
  console.error('usage: with-db-url <command> [args...]')
  process.exit(2)
}

const child = spawn(cmd, args, {
  stdio: 'inherit',
  // Own process group, so a signal reaches the whole tree (pnpm does not
  // reliably forward SIGTERM to the tsx watcher and server below it).
  detached: true,
  env: { ...process.env, DATABASE_URL: resolveDatabaseUrl() },
})

for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
  process.on(sig, () => {
    try {
      process.kill(-child.pid!, sig)
    } catch {
      child.kill(sig)
    }
  })
}

child.on('error', (err) => {
  console.error(`with-db-url: failed to run ${cmd}: ${err.message}`)
  process.exit(127)
})

child.on('exit', (code, signal) => {
  // Sweep any descendants the direct child left behind.
  try {
    process.kill(-child.pid!, 'SIGTERM')
  } catch {}
  if (signal) {
    process.removeAllListeners(signal)
    process.kill(process.pid, signal)
  } else {
    process.exit(code ?? 1)
  }
})
