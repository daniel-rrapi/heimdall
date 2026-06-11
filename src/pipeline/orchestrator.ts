import { v4 as uuidv4 } from 'uuid'
import * as path from 'path'
import { PipelineConfig, AIBackendName } from '../config/types'
import { discoverProjects } from '../discovery/projectDiscovery'
import { collectTargets } from '../discovery/fileCollector'
import { ScanTarget } from '../discovery/types'
import { AIBackend } from '../ai/types'
import { resolveBackends } from '../ai/registry'
import { Semaphore } from './scheduler'
import { runFileScan } from './runner'
import { Deduplicator } from '../dedup/deduplicator'
import { FingerprintStore } from '../dedup/store'
import { Report, RunStats } from '../report/types'
import { writeJsonReport } from '../report/jsonReporter'
import { writeMarkdownReport } from '../report/markdownReporter'
import { writeSarifReport } from '../report/sarifReporter'

// Sort targets: source files first, manifests last; larger files first within a type.
function prioritizeTargets(targets: ScanTarget[]): ScanTarget[] {
  const typeOrder: Record<string, number> = { source: 0, manifest: 1 }
  return [...targets].sort((a, b) => {
    const typeDiff = (typeOrder[a.fileType] ?? 9) - (typeOrder[b.fileType] ?? 9)
    if (typeDiff !== 0) return typeDiff
    return b.lineCount - a.lineCount
  })
}

interface RunOptions {
  dryRun?: boolean
  noDedup?: boolean
  cwd: string
}

function resolvePath(p: string, cwd: string): string {
  return path.isAbsolute(p) ? p : path.join(cwd, p)
}

export async function runPipeline(config: PipelineConfig, opts: RunOptions): Promise<Report> {
  const runId = uuidv4()
  const startedAt = new Date().toISOString()

  console.log(`\n[pipeline] Run ID: ${runId}`)
  console.log(`[pipeline] Discovering projects...`)

  // 1. Resolve projects from the configured scan roots
  const projects = discoverProjects(config.target.roots, opts.cwd)
  console.log(`[pipeline] Found ${projects.length} project(s): ${projects.map((p) => p.name).join(', ')}`)

  // 2. Collect targets per project
  const allTargets: ScanTarget[] = []
  for (const project of projects) {
    const targets = await collectTargets(project, config)
    allTargets.push(...targets)
    console.log(`[pipeline]   ${project.name}: ${targets.length} files`)
  }

  const prioritized = prioritizeTargets(allTargets)
  console.log(`[pipeline] Total scan targets: ${prioritized.length}`)

  if (opts.dryRun) {
    console.log('\n[dry-run] File list:')
    for (const t of prioritized) {
      console.log(`  [${t.fileType.padEnd(8)}] ${t.project.name}/${t.relativePath} (${t.lineCount} lines)`)
    }
    console.log(`\n[dry-run] Done. ${prioritized.length} files would be scanned.`)

    return {
      runId,
      startedAt,
      completedAt: new Date().toISOString(),
      config,
      statistics: {
        projectsScanned: projects.length,
        filesScanned: prioritized.length,
        aiCallsTotal: 0,
        aiCallsFailed: 0,
        findingsTotal: 0,
        findingsNew: 0,
        findingsBySeverity: {},
        findingsByProject: {},
        findingsByCategory: {},
      },
      findings: [],
      notes: [],
    }
  }

  // 3. Resolve AI backends
  const backends = await resolveBackends(config.ai.backends)
  if (backends.length === 0) {
    throw new Error('No AI backends available. Install the claude, gemini, or qwen CLI and try again.')
  }

  // 4. Load dedup state
  const dbPath = resolvePath(config.output.stateDbPath, opts.cwd)
  const store = opts.noDedup ? null : new FingerprintStore(dbPath)
  const seenInDb = store ? store.loadAll() : new Set<string>()
  const deduplicator = new Deduplicator(seenInDb)

  // 5. Fan out scans across backends with per-backend semaphores
  const semaphores: Record<string, Semaphore> = {}
  for (const backend of backends) {
    const concurrency = config.ai.concurrency[backend.name as AIBackendName] ?? 1
    semaphores[backend.name] = new Semaphore(concurrency)
  }

  let aiCallsTotal = 0
  let aiCallsFailed = 0

  const tasks: Promise<void>[] = []

  for (const target of prioritized) {
    for (const backend of backends) {
      const sem = semaphores[backend.name]

      tasks.push(
        (async (t: ScanTarget, b: AIBackend) => {
          const release = await sem.acquire()
          try {
            console.log(`[scan] ${b.name} → ${t.project.name}/${t.relativePath}`)
            aiCallsTotal++
            const result = await runFileScan(t, b, config)

            if (result.error) aiCallsFailed++

            for (const finding of result.findings) {
              deduplicator.add({ finding, target: t, backend: b.name })
            }

            const badge = result.findings.length > 0 ? ` → ${result.findings.length} finding(s)` : ' → clean'
            console.log(`[done]  ${b.name} → ${t.project.name}/${t.relativePath}${badge}`)
          } finally {
            release()
          }
        })(target, backend)
      )
    }
  }

  await Promise.allSettled(tasks)

  // 6. Collect findings
  const findings = deduplicator.getFindings()

  // 7. Persist new fingerprints
  if (store) {
    const newFps = deduplicator.getNewFingerprints()
    if (newFps.length > 0) {
      store.upsertMany(newFps)
    }
    store.close()
  }

  // 8. Build statistics
  const findingsBySeverity: Record<string, number> = {}
  const findingsByProject: Record<string, number> = {}
  const findingsByCategory: Record<string, number> = {}

  for (const f of findings) {
    findingsBySeverity[f.severity] = (findingsBySeverity[f.severity] ?? 0) + 1
    findingsByProject[f.project] = (findingsByProject[f.project] ?? 0) + 1
    findingsByCategory[f.vulnerabilityType] = (findingsByCategory[f.vulnerabilityType] ?? 0) + 1
  }

  const stats: RunStats = {
    projectsScanned: projects.length,
    filesScanned: prioritized.length,
    aiCallsTotal,
    aiCallsFailed,
    findingsTotal: findings.length,
    findingsNew: findings.filter((f) => f.isNew).length,
    findingsBySeverity,
    findingsByProject,
    findingsByCategory,
  }

  const completedAt = new Date().toISOString()
  const report: Report = {
    runId,
    startedAt,
    completedAt,
    config,
    statistics: stats,
    findings,
    notes: [],
  }

  // 9. Write reports
  const reportsDir = resolvePath(config.output.reportsDir, opts.cwd)

  for (const format of config.output.formats) {
    let outPath: string
    if (format === 'json') outPath = writeJsonReport(report, reportsDir)
    else if (format === 'markdown') outPath = writeMarkdownReport(report, reportsDir)
    else outPath = writeSarifReport(report, reportsDir)
    console.log(`[report] ${format.toUpperCase()} → ${outPath}`)
  }

  // Summary
  console.log('\n[pipeline] Scan complete.')
  console.log(`  Projects: ${stats.projectsScanned}  |  Files: ${stats.filesScanned}  |  AI calls: ${stats.aiCallsTotal} (${stats.aiCallsFailed} failed)`)
  console.log(`  Findings: ${stats.findingsTotal} total  |  ${stats.findingsNew} new`)
  for (const [sev, count] of Object.entries(stats.findingsBySeverity).sort()) {
    console.log(`    ${sev}: ${count}`)
  }

  return report
}
