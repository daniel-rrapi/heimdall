#!/usr/bin/env node
import * as path from 'path'
import * as fs from 'fs'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import { loadConfig, applyCliOverrides } from './config/loader'
import { runPipeline } from './pipeline/orchestrator'
import { writeMarkdownReport } from './report/markdownReporter'
import { writeSarifReport } from './report/sarifReporter'
import { Report } from './report/types'

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .option('path', { type: 'string', description: 'Comma-separated directories to scan (default: current directory)' })
    .option('include', { type: 'string', description: 'Comma-separated glob patterns of files to scan' })
    .option('exclude', { type: 'string', description: 'Comma-separated glob patterns to exclude' })
    .option('backends', { type: 'string', description: 'Comma-separated AI backend names (claude,gemini,qwen)' })
    .option('categories', { type: 'string', description: 'Comma-separated vulnerability categories' })
    .option('concurrency', { type: 'number', description: 'Override per-backend concurrency (applies to all)' })
    .option('output-dir', { type: 'string', description: 'Override output directory for reports' })
    .option('config', { type: 'string', description: 'Path to a config file (default: ./config.yaml)' })
    .option('dry-run', { type: 'boolean', default: false, description: 'Discover files but do not call AI' })
    .option('report-only', { type: 'boolean', default: false, description: 'Re-generate reports from the last JSON scan' })
    .option('no-dedup', { type: 'boolean', default: false, description: 'Ignore the state DB (treat all findings as new)' })
    .help()
    .parseAsync()

  const cwd = process.cwd()
  const config = loadConfig(cwd, argv.config)
  const finalConfig = applyCliOverrides(config, {
    path: argv.path,
    include: argv.include,
    exclude: argv.exclude,
    backends: argv.backends,
    categories: argv.categories,
    concurrency: argv.concurrency,
    outputDir: argv['output-dir'],
  })

  // --report-only: find the last JSON report and regenerate the other formats
  if (argv['report-only']) {
    const reportsDir = path.isAbsolute(finalConfig.output.reportsDir)
      ? finalConfig.output.reportsDir
      : path.join(cwd, finalConfig.output.reportsDir)

    if (!fs.existsSync(reportsDir)) {
      console.error('[report-only] No reports directory found. Run a scan first.')
      process.exit(1)
    }

    const jsonFiles = fs.readdirSync(reportsDir)
      .filter((f) => f.endsWith('.json'))
      .sort()
      .reverse()

    if (jsonFiles.length === 0) {
      console.error('[report-only] No JSON reports found. Run a scan first.')
      process.exit(1)
    }

    const latestJson = path.join(reportsDir, jsonFiles[0])
    console.log(`[report-only] Loading: ${latestJson}`)
    const report: Report = JSON.parse(fs.readFileSync(latestJson, 'utf-8'))

    for (const format of finalConfig.output.formats) {
      let outPath: string
      if (format === 'json') {
        console.log('[report-only] Skipping JSON (already exists)')
        continue
      } else if (format === 'markdown') {
        outPath = writeMarkdownReport(report, reportsDir)
      } else {
        outPath = writeSarifReport(report, reportsDir)
      }
      console.log(`[report-only] ${format.toUpperCase()} → ${outPath}`)
    }
    return
  }

  await runPipeline(finalConfig, {
    dryRun: argv['dry-run'],
    noDedup: argv['no-dedup'],
    cwd,
  })
}

main().catch((err) => {
  console.error('[fatal]', err instanceof Error ? err.message : err)
  process.exit(1)
})
