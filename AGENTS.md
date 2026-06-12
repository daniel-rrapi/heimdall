# AGENTS.md

Guidance for AI coding agents and human contributors working in this repository.
For user-facing usage, see [README.md](README.md).

## What this project is

Heimdall (`heimdall-cli`) is a language-agnostic, AI-driven security scanner. It
discovers source files in one or more target directories, sends each file (or
chunk) to one or more locally-installed AI CLIs, parses their JSON findings,
deduplicates them, and writes JSON / Markdown / SARIF reports.

Design principle: **stay generic.** Nothing here should assume a specific
language, framework, or organization. File discovery is glob-driven, categories
are plain strings, and the prompt asks for general application-security issues.
If you find yourself hardcoding a framework concept (resolvers, controllers,
"services", a particular ORM), make it configurable instead.

## Tech stack & conventions

- **TypeScript**, CommonJS, strict mode. Run with `tsx` in dev; `tsc` to build.
- No runtime framework. Dependencies: `fast-glob`, `js-yaml`, `uuid`, `yargs`.
- AI backends are external CLIs invoked as child processes — there is no network
  SDK and no API key handling in this codebase.
- Vocabulary: a scanned directory is a **project** (never a "service"). A
  vulnerability kind is a **category** (a free-form string, `VulnCategory =
  string`). Avoid reintroducing closed enums for categories.
- Two file types only: `source` and `manifest` (a dependency manifest).

## Commands

```bash
npm install            # install deps
npm run typecheck      # tsc --noEmit  ← run this after any change
npm run build          # compile to dist/ (also produces the `heimdall` binary)

npm run scan:dry-run -- --path .     # discovery only, no AI calls (fast, free)
npm run scan -- --path ../my-app     # full scan
npm run report:last                  # regenerate md/sarif from the latest JSON
npm run reset-state                  # delete the dedup state DB
```

`--dry-run` is the cheapest way to test discovery/chunking changes — it never
calls an AI. Real scans cost time and tokens, so prefer dry-run while iterating.

## Architecture & data flow

```
CLI (index.ts)
  → config: loadConfig(cwd) + applyCliOverrides
  → orchestrator.runPipeline
      → discovery.discoverProjects(roots, cwd)        → ProjectMeta[]
      → discovery.collectTargets(project, config)     → ScanTarget[]  (fast-glob)
      → prioritizeTargets                              (source first, biggest first)
      → ai.resolveBackends(config.ai.backends)         → only installed backends
      → per file × backend (orchestrator.ts acquires/releases a per-backend Semaphore):
          runner.runFileScan
            → chunking.buildContexts → chunker.chunkFile   (split big files)
            → ai.prompts.buildPrompt(ctx, categories)
            → backend.invoke(prompt, chunkContent, timeout)  (spawns the CLI)
            → ai.parser.parseAIResponse                      (lenient JSON)
          → dedup.Deduplicator.add(finding, target, backend)
      → dedup.FingerprintStore persists new fingerprints
      → report.{json,markdown,sarif}Reporter
```

### Subsystems

| Path                       | Responsibility |
| -------------------------- | -------------- |
| `src/index.ts`             | CLI parsing (yargs), `--report-only` shortcut, kicks off the run. Has a `#!/usr/bin/env node` shebang (keep it first line — it's the `bin`). |
| `src/config/`              | `types.ts` defines `PipelineConfig`, `DEFAULT_CONFIG`, and the default include/exclude/manifest lists + `BUILTIN_CATEGORIES`. `loader.ts` reads `config.yaml`/`config.local.yaml` from cwd, deep-merges, and applies CLI overrides. |
| `src/discovery/`           | `projectDiscovery.ts` resolves `target.roots` into `ProjectMeta` (name = dir basename). `fileCollector.ts` globs each project for source files (+ manifests when `dependency` is enabled), detects language from the extension. `types.ts` holds `ProjectMeta`, `ScanTarget`, `FileType`. |
| `src/chunking/`            | `chunker.ts` splits files over `chunkSizeLines` at language-agnostic declaration boundaries, prepending the import block to continuation chunks. `contextBuilder.ts` wraps chunks into `ScanContext`. |
| `src/ai/`                  | `types.ts` (`AIBackend`, `RawFinding`, `Severity`, `Confidence`). `registry.ts` maps names → backends and filters to installed ones. `backends/spawn.ts` runs a CLI with stdin + timeout; `claude.ts`/`gemini.ts`/`qwen.ts`/`codex.ts`/`opencode.ts` are thin adapters. `prompts/systemPrompt.ts` + `prompts/buildPrompt.ts` build the prompt. `parser.ts` extracts findings JSON leniently. |
| `src/dedup/`               | `fingerprint.ts` (SHA-256 over project + path + bucketed lines + category + normalized title). `store.ts` (JSON state DB). `deduplicator.ts` merges cross-backend duplicates and flags `isNew`. |
| `src/pipeline/`            | `scheduler.ts` (`Semaphore`), `runner.ts` (one file), `orchestrator.ts` (the whole run + stats). |
| `src/report/`             | `types.ts` (`Finding`, `RunStats`, `Report`), plus `jsonReporter`, `markdownReporter`, `sarifReporter`. |

### Key data shapes

- `ScanTarget`: `{ project, filePath, relativePath, fileType, language?, lineCount }`.
  `relativePath` is relative to the **project root**.
- `Finding` (report): carries `project`, `filePath`, `fileType`, `language`,
  `vulnerabilityType` (string), `severity`, `detectedBy[]`, `isNew`, `fingerprint`.
- `Report`: `{ runId, startedAt, completedAt, config, statistics, findings, notes }`.
  `notes` is a generic free-text array, currently empty by default.

## How to extend

- **Add an AI backend:** create `src/ai/backends/<name>.ts` implementing
  `AIBackend` (`invoke`, `isAvailable`), register it in `registry.ts`, add the
  name to the `AIBackendName` union and the `concurrency` defaults in
  `config/types.ts`.
- **Add a category:** categories are just strings, so config alone is enough.
  For a nicer prompt, add a one-line entry to `CATEGORY_DESCRIPTIONS` in
  `src/ai/prompts/buildPrompt.ts` and add the name to `BUILTIN_CATEGORIES` in
  `src/config/types.ts` (and to `config.yaml`).
- **Add a report format:** extend the `ReportFormat` union, write a reporter in
  `src/report/`, and wire it into `orchestrator.ts` (and the `report-only`
  branch in `index.ts`).
- **Change what gets discovered:** tune `DEFAULT_INCLUDE` / `DEFAULT_EXCLUDE` /
  `DEFAULT_MANIFEST_FILES` in `config/types.ts`. Per run, `include` / `exclude`
  (config or `--include` / `--exclude`) **replace** those defaults, while
  `includeExtra` / `excludeExtra` (or `--include-extra` / `--exclude-extra`)
  are **appended** to them — see `collectTargets` in `discovery/fileCollector.ts`.

## Gotchas

- Paths: `reportsDir` and `stateDbPath` resolve relative to the **cwd**;
  `relativePath` on targets/findings is relative to the **project root**.
- The dedup fingerprint buckets line numbers to ±20 lines. Changing the
  fingerprint formula invalidates existing `state.db` entries.
- Backends are spawned with `shell: false` and a timeout; never build a shell
  command string from untrusted input in `spawn.ts`.
- `parser.ts` must stay lenient — models wrap JSON in prose or code fences. Do
  not tighten it into a strict `JSON.parse` of the whole stdout.
- After any change, run `npm run typecheck`. For behavioural changes, a
  `npm run scan:dry-run -- --path .` is a fast sanity check.
- This repo is **not** under git here; there is no undo via VCS. Be deliberate
  with destructive edits.
