import * as os from 'os'
import * as path from 'path'

/**
 * Root directory for heimdall's global data (scan reports + dedup state).
 * Defaults to the XDG data dir (`~/.local/share/heimdall`). Override the whole
 * location with `HEIMDALL_DATA_DIR`, or the base with `XDG_DATA_HOME`.
 *
 * NOTE: the same logic is duplicated in `web/server.ts` (it compiles with a
 * separate rootDir and cannot import from `src/`). Keep them in sync.
 */
export function globalDataDir(): string {
  if (process.env.HEIMDALL_DATA_DIR) return process.env.HEIMDALL_DATA_DIR
  const base = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share')
  return path.join(base, 'heimdall')
}

export function defaultReportsDir(): string {
  return path.join(globalDataDir(), 'reports')
}

export function defaultStateDbPath(): string {
  return path.join(globalDataDir(), 'state.db')
}
