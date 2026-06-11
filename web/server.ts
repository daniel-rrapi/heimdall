#!/usr/bin/env node
import * as http from 'node:http'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as yaml from 'js-yaml'

const PORT = Number(process.env.PORT ?? 4040)
const CWD = process.cwd()

// ─── helpers ────────────────────────────────────────────────────────────────

function reportsDir(): string {
  return path.join(CWD, '.security', 'reports')
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
          config?: { ai?: { backends?: string[] } }
        }
        return {
          filename,
          runId: report.runId,
          startedAt: report.startedAt,
          completedAt: report.completedAt,
          statistics: report.statistics,
          notes: report.notes,
          backends: report.config?.ai?.backends ?? [],
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
      sendJson(res, 200, loadMergedConfig())
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
