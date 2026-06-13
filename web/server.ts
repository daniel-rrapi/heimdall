#!/usr/bin/env node
import * as http from 'node:http'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import * as yaml from 'js-yaml'

const PORT = Number(process.env.PORT ?? 4040)
const CWD = process.cwd()

// ─── helpers ────────────────────────────────────────────────────────────────

// Global data dir — mirrors src/config/paths.ts (web compiles with a separate
// rootDir and can't import from src/). Keep in sync.
function globalDataDir(): string {
  if (process.env.HEIMDALL_DATA_DIR) return process.env.HEIMDALL_DATA_DIR
  const base = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share')
  return path.join(base, 'heimdall')
}

// Effective reports directory — mirrors the scanner: an explicit
// output.reportsDir in config wins (absolute as-is, relative to cwd); otherwise
// the global default (~/.local/share/heimdall/reports).
function reportsDir(): string {
  const cfg = loadMergedConfig() as { output?: { reportsDir?: unknown } }
  const configured = cfg?.output?.reportsDir
  if (typeof configured === 'string' && configured.length > 0) {
    return path.isAbsolute(configured) ? configured : path.join(CWD, configured)
  }
  return path.join(globalDataDir(), 'reports')
}

function configPath(filename: string): string {
  return path.join(CWD, filename)
}

function readJsonFile(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
}

function loadMergedConfig(): unknown {
  const base = fs.existsSync(configPath('config.yaml'))
    ? (yaml.load(fs.readFileSync(configPath('config.yaml'), 'utf-8')) ?? {})
    : {}
  const local = fs.existsSync(configPath('config.local.yaml'))
    ? (yaml.load(fs.readFileSync(configPath('config.local.yaml'), 'utf-8')) ?? {})
    : {}
  // shallow-ish merge: local overrides base (same logic as loader.ts)
  return deepMerge(base as Record<string, unknown>, local as Record<string, unknown>)
}

function deepMerge(base: Record<string, unknown>, override: Record<string, unknown>): Record<string, unknown> {
  const result = { ...base }
  for (const key of Object.keys(override)) {
    const val = override[key]
    if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
      result[key] = deepMerge((base[key] ?? {}) as Record<string, unknown>, val as Record<string, unknown>)
    } else if (val !== undefined) {
      result[key] = val
    }
  }
  return result
}

function listReportMeta(): unknown[] {
  const dir = reportsDir()
  if (!fs.existsSync(dir)) return []

  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .reverse()
    .map((filename) => {
      try {
        const report = readJsonFile(path.join(dir, filename)) as {
          runId?: string
          startedAt?: string
          completedAt?: string
          statistics?: unknown
          notes?: unknown
          config?: { ai?: { backends?: string[] }; target?: { roots?: string[] } }
        }
        return {
          filename,
          runId: report.runId,
          startedAt: report.startedAt,
          completedAt: report.completedAt,
          statistics: report.statistics,
          notes: report.notes,
          backends: report.config?.ai?.backends ?? [],
          roots: report.config?.target?.roots ?? [],
        }
      } catch {
        return { filename, error: 'Could not parse report' }
      }
    })
}

// ─── routing ────────────────────────────────────────────────────────────────

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

function sendJson(res: http.ServerResponse, status: number, data: unknown): void {
  const body = JSON.stringify(data, null, 2)
  res.writeHead(status, { 'Content-Type': 'application/json', ...CORS_HEADERS })
  res.end(body)
}

function sendHtml(res: http.ServerResponse, filePath: string): void {
  try {
    const html = fs.readFileSync(filePath, 'utf-8')
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(html)
  } catch {
    res.writeHead(404)
    res.end('Not found')
  }
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`)
  const pathname = url.pathname

  // preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS)
    res.end()
    return
  }

  if (pathname === '/' || pathname === '/index.html') {
    sendHtml(res, path.join(__dirname, 'index.html'))
    return
  }

  if (pathname === '/api/config') {
    try {
      const cfg = loadMergedConfig() as Record<string, unknown>
      // Surface the *effective* reports dir (incl. the global default) so the
      // dashboard shows where these reports actually come from.
      const output = { ...((cfg.output as Record<string, unknown>) ?? {}), reportsDir: reportsDir() }
      sendJson(res, 200, { ...cfg, output })
    } catch (err) {
      sendJson(res, 500, { error: String(err) })
    }
    return
  }

  if (pathname === '/api/reports') {
    try {
      sendJson(res, 200, listReportMeta())
    } catch (err) {
      sendJson(res, 500, { error: String(err) })
    }
    return
  }

  // /api/reports/:filename
  const reportMatch = pathname.match(/^\/api\/reports\/([^/]+\.json)$/)
  if (reportMatch) {
    const filename = reportMatch[1]
    const filePath = path.join(reportsDir(), filename)
    if (!fs.existsSync(filePath)) {
      sendJson(res, 404, { error: 'Report not found' })
      return
    }
    try {
      sendJson(res, 200, readJsonFile(filePath))
    } catch (err) {
      sendJson(res, 500, { error: String(err) })
    }
    return
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' })
  res.end('Not found')
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`\nHeimdall web UI → http://localhost:${PORT}\n`)
  console.log('  API endpoints:')
  console.log(`    GET /api/config          — merged config.yaml`)
  console.log(`    GET /api/reports         — list of past scans (metadata only)`)
  console.log(`    GET /api/reports/:file   — full report JSON`)
  console.log('\nCtrl+C to stop.\n')
})
