#!/usr/bin/env node
import * as path from 'path'
import * as fs from 'fs'
import { spawn } from 'child_process'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import { loadConfig, applyCliOverrides } from './config/loader'
import { runPipeline } from './pipeline/orchestrator'
import { writeMarkdownReport } from './report/markdownReporter'
import { writeSarifReport } from './report/sarifReporter'
import { Report } from './report/types'

// Options shared by the `scan` and `report` commands.
function commonOptions(y: yargs.Argv) {
  return y
    .option('output-dir', { type: 'string', description: 'Override output directory for reports' })
    .option('config', { type: 'string', description: 'Path to a config file (default: ./config.yaml)' })
}

// `heimdall scan`: discover files and run them through the AI backends.
async function runScan(argv: {
  path?: string
  include?: string
  exclude?: string
  'include-extra'?: string
  'exclude-extra'?: string
  backends?: string
  categories?: string
  concurrency?: number
  'output-dir'?: string
  config?: string
  'dry-run'?: boolean
  'no-dedup'?: boolean
}) {
  const cwd = process.cwd()
  const config = loadConfig(cwd, argv.config)
  const finalConfig = applyCliOverrides(config, {
    path: argv.path,
    include: argv.include,
    exclude: argv.exclude,
    includeExtra: argv['include-extra'],
    excludeExtra: argv['exclude-extra'],
    backends: argv.backends,
    categories: argv.categories,
    concurrency: argv.concurrency,
    outputDir: argv['output-dir'],
  })

  await runPipeline(finalConfig, {
    dryRun: argv['dry-run'],
    noDedup: argv['no-dedup'],
    cwd,
  })
}

// `heimdall report`: find the last JSON report and regenerate the other formats.
function runReport(argv: { 'output-dir'?: string; config?: string }) {
  const cwd = process.cwd()
  const config = loadConfig(cwd, argv.config)
  const finalConfig = applyCliOverrides(config, { outputDir: argv['output-dir'] })

  const reportsDir = path.isAbsolute(finalConfig.output.reportsDir)
    ? finalConfig.output.reportsDir
    : path.join(cwd, finalConfig.output.reportsDir)

  if (!fs.existsSync(reportsDir)) {
    console.error('[report] No reports directory found. Run a scan first.')
    process.exit(1)
  }

  const jsonFiles = fs.readdirSync(reportsDir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .reverse()

  if (jsonFiles.length === 0) {
    console.error('[report] No JSON reports found. Run a scan first.')
    process.exit(1)
  }

  const latestJson = path.join(reportsDir, jsonFiles[0])
  console.log(`[report] Loading: ${latestJson}`)
  const report: Report = JSON.parse(fs.readFileSync(latestJson, 'utf-8'))

  for (const format of finalConfig.output.formats) {
    let outPath: string
    if (format === 'json') {
      console.log('[report] Skipping JSON (already exists)')
      continue
    } else if (format === 'markdown') {
      outPath = writeMarkdownReport(report, reportsDir)
    } else {
      outPath = writeSarifReport(report, reportsDir)
    }
    console.log(`[report] ${format.toUpperCase()} → ${outPath}`)
  }
}

// `heimdall web`: launch the compiled web dashboard as a child process.
// (For development without a build, use `npm run web` instead.)
async function runWeb() {
  const serverPath = path.join(__dirname, 'web', 'server.js')
  if (!fs.existsSync(serverPath)) {
    console.error(`[web] Compiled server not found at ${serverPath}.`)
    console.error('[web] Run "npm run build" first, or use "npm run web" for development.')
    process.exit(1)
  }
  const child = spawn(process.execPath, [serverPath], { stdio: 'inherit' })
  const code: number = await new Promise((resolve) => {
    child.on('close', (c) => resolve(c ?? 0))
    child.on('error', (err) => {
      console.error('[web]', err instanceof Error ? err.message : err)
      resolve(1)
    })
  })
  process.exit(code)
}

// Top-level help. Commands are registered with a `false` description so they
// stay out of yargs' flat auto-generated list; instead they're grouped by
// category here. Keep each line under ~78 chars so it renders on one row.
const TOP_LEVEL_USAGE = [
  '🔱 Heimdall — AI-powered security scanner for any codebase',
  '',
  'Usage: heimdall <command> [options]',
  '',
  'Scanning:',
  '  heimdall scan [options]      Run the AI backends over a codebase',
  '',
  'Reports:',
  '  heimdall report [options]    Rebuild reports from the most recent scan',
  '',
  'Dashboard:',
  '  heimdall web                 Open the local web dashboard (port 4040)',
  '',
  'Run "heimdall <command> --help" to see the options for a command.',
].join('\n')

async function main() {
  await yargs(hideBin(process.argv))
    .scriptName('heimdall')
    .usage(TOP_LEVEL_USAGE)
    // Disable cliui wrapping: it otherwise strips the leading indentation from
    // the categorized command lines in TOP_LEVEL_USAGE.
    .wrap(null)
    // Treat `--no-dedup` as a literal flag name (set no-dedup=true), not as a
    // negation of a `dedup` option.
    .parserConfiguration({ 'boolean-negation': false })
    .command(
      'scan',
      // Hidden from the auto command list — grouped by category in TOP_LEVEL_USAGE.
      false,
      (y) =>
        commonOptions(y)
          .usage('Usage: heimdall scan [options]\n\nScan a codebase for security vulnerabilities: walk the source files,\nsend each to the configured AI backends, and write deduplicated reports.')
          .option('path', { type: 'string', description: 'Comma-separated directories to scan (default: current directory)' })
          .option('include', { type: 'string', description: 'Comma-separated glob patterns of files to scan (replaces the defaults)' })
          .option('exclude', { type: 'string', description: 'Comma-separated glob patterns to exclude (replaces the defaults)' })
          .option('include-extra', { type: 'string', description: 'Comma-separated globs to ADD to the default include set' })
          .option('exclude-extra', { type: 'string', description: 'Comma-separated globs to ADD to the default exclusions' })
          .option('backends', { type: 'string', description: 'Comma-separated AI backend names (claude,gemini,qwen,codex,opencode)' })
          .option('categories', { type: 'string', description: 'Comma-separated vulnerability categories' })
          .option('concurrency', { type: 'number', description: 'Override per-backend concurrency (applies to all)' })
          .option('dry-run', { type: 'boolean', default: false, description: 'Discover files but do not call AI' })
          .option('no-dedup', { type: 'boolean', default: false, description: 'Ignore the state DB (treat all findings as new)' }),
      (argv) => runScan(argv),
    )
    .command(
      'report',
      false,
      (y) =>
        commonOptions(y).usage('Usage: heimdall report [options]\n\nRe-generate Markdown/SARIF reports from the most recent JSON scan, without any AI calls.'),
      (argv) => runReport(argv),
    )
    .command(
      'web',
      false,
      (y) => y.usage('Usage: heimdall web\n\nStart the local web dashboard at http://localhost:4040.'),
      () => runWeb(),
    )
    .example('heimdall scan --path ./my-app', 'Scan a project with the default backend')
    .example('heimdall scan --dry-run --path ./my-app', 'List files only, no AI calls')
    .example('heimdall report', 'Rebuild reports from the most recent scan')
    .demandCommand(1, 'Devi specificare un comando (scan, report, web). Usa "heimdall --help" per l\'elenco.')
    .strict()
    .help()
    .alias('h', 'help')
    .parseAsync()
}

main().catch((err) => {
  console.error('[fatal]', err instanceof Error ? err.message : err)
  process.exit(1)
})
