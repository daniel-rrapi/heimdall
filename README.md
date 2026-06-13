# 🔱 Heimdall

<img width="1365" height="768" alt="heimdall" src="https://github.com/user-attachments/assets/5c555ed9-034f-4507-a230-dc76633a454b" />

> In Norse mythology, _Heimdall_ is the all-seeing, all-hearing Guardian of Asgard.

AI-powered security scanner for **any codebase**. Heimdall walks your source
files, sends each one to one or more locally-installed AI CLIs (Claude, Gemini, Codex, Qwen, OpenCode), and aggregates their findings into structured, deduplicated reports
(JSON, Markdown, SARIF).

It is language-agnostic — TypeScript, JavaScript, Python, Go, Java, Kotlin,
Rust, Ruby, PHP, C#, C/C++, and more — and looks for general application
security issues (injection, broken access control, secrets, SSRF, weak crypto,
vulnerable dependencies, …) rather than being tied to any one framework.

> This project is under development, any feedback is appreciated.

> Heimdall is a triage aid, not a guarantee. Treat findings as leads to review,
> not as proof. Like any LLM-based tool it can produce false positives and miss
> real issues.

## 📹 Preview

https://github.com/user-attachments/assets/68a77957-d472-4254-959f-35b76b116adc

## ☑️ Prerequisites

- Node.js 18+
- Git
- At least one of the following AI CLIs installed and authenticated:
  - [Claude Code](https://claude.com/claude-code) — `claude`
  - [Gemini CLI](https://github.com/google-gemini/gemini-cli) — `gemini`
  - [OpenAI Codex CLI](https://github.com/openai/codex) — `codex`
  - [OpenCode](https://opencode.ai) — `opencode`
  - [Qwen Code](https://github.com/QwenLM/qwen-code) — `qwen-code` or `qwen`

Heimdall shells out to whichever of these is available; backends that aren't
installed are skipped with a warning instead of failing the run.

## 🛠️ Install

**Option A — one-line install (macOS / Linux):**

```bash
curl -fsSL https://raw.githubusercontent.com/daniel-rrapi/heimdall/main/install.sh | bash
```

This clones heimdall into `~/.heimdall`, builds it, and links a `heimdall`
command into `~/.local/bin` (no sudo, adds it to your PATH if needed). **Re-run
the same command to update.** Override the location/branch with the
`HEIMDALL_HOME` / `HEIMDALL_REF` env vars.

Then use it from any directory (open a new terminal first if PATH was updated):

```bash
heimdall scan --path ../my-app --backends codex
heimdall web          # local dashboard at http://localhost:4040
```

Uninstall (works regardless of how it was installed):

```bash
rm -f ~/.local/bin/heimdall   # the CLI command
rm -rf ~/.heimdall            # the cloned source (one-line install only)
```

**Option B — run from the source:**

```bash
git clone https://github.com/daniel-rrapi/heimdall.git

cd heimdall

npm install

npm run build         # optional; only needed for the compiled binary / dashboard
```

Run it via the npm scripts (which use `tsx`) — see Quick start below.

## 🚀 Quick start

Heimdall is driven by three subcommands — **`scan`**, **`report`**, and
**`web`**. Run `heimdall --help` to list them, or `heimdall scan --help` for the
full set of scan flags.

```bash
# See which files would be scanned, without calling any AI
heimdall scan --dry-run --path ./my-app

# Scan a project (default backend: claude)
heimdall scan --path ./my-app

# Use several backends in parallel (findings are merged)
heimdall scan --path ./my-app --backends claude,gemini

# Scan only a subset of categories
heimdall scan --path ./my-app --categories injection,secrets,idor

# Re-generate Markdown/SARIF from the most recent JSON report (no AI calls)
heimdall report
```

Running from the source tree instead of the installed CLI? Use the npm scripts —
they call the same subcommands: `npm run scan -- --path ../my-app`,
`npm run scan:dry-run -- --path ../my-app`, and `npm run report:last`.

## 🌐 Web dashboard

Heimdall includes a lightweight local UI to browse the active configuration
and past scan reports.

```bash
heimdall web      # if installed via ./install.sh
npm run web       # from the repo (dev)
# → Heimdall web UI: http://localhost:4040
```

By default the dashboard reads reports from the **global** reports directory
(`~/.local/share/heimdall/reports`), so it shows your scans no matter which
directory you launch it from. `config.yaml` / `config.local.yaml` are still read
from the current directory. (If a project pins `output.reportsDir` to a relative
path, run `heimdall web` from that project to see those reports.)

The dashboard shows:

- **Configuration** — merged values from `config.yaml` + `config.local.yaml`,
  including the effective reports directory
- **Past scans** — each report in the active reports directory, with severity
  breakdown and statistics at a glance
- **Findings** — click any scan to see findings grouped by severity, with file
  location, description, recommendation, and code snippet

The server exposes three read-only JSON endpoints:

| Endpoint                     | Description                        |
| ---------------------------- | ---------------------------------- |
| `GET /api/config`            | Merged active configuration        |
| `GET /api/reports`           | List of past scans (metadata only) |
| `GET /api/reports/:filename` | Full report JSON                   |

## Commands

Heimdall uses explicit subcommands — running `heimdall` on its own (or with an
unknown command/flag) prints help and exits instead of scanning.

| Command           | Description                                                                 |
| ----------------- | --------------------------------------------------------------------------- |
| `heimdall scan`   | Scan a codebase for security vulnerabilities (see flags below)              |
| `heimdall report` | Re-generate Markdown/SARIF from the most recent JSON scan, without AI calls |
| `heimdall web`    | Start the local web dashboard at http://localhost:4040                      |

Run `heimdall <command> --help` to see a command's flags.

## CLI options

The flags below apply to `heimdall scan`. (`--config` / `--output-dir` are also
accepted by `heimdall report`.)

| Flag              | Type      | Description                                                                           |
| ----------------- | --------- | ------------------------------------------------------------------------------------- |
| `--path`          | `string`  | Comma-separated directories to scan (default: current directory)                      |
| `--include`       | `string`  | Glob patterns of files to scan — **replaces** the defaults (comma-separated)          |
| `--exclude`       | `string`  | Glob patterns to exclude — **replaces** the defaults (comma-separated)                |
| `--include-extra` | `string`  | Globs to **add** to the default include set, keeping the defaults (comma-separated)   |
| `--exclude-extra` | `string`  | Globs to **add** to the default exclusions, keeping the defaults (comma-separated)    |
| `--backends`      | `string`  | AI backends to use: `claude`, `gemini`, `qwen`, `codex`, `opencode` (comma-separated) |
| `--categories`    | `string`  | Vulnerability categories to look for (comma-separated)                                |
| `--concurrency`   | `number`  | Override per-backend concurrency (applies to all backends)                            |
| `--output-dir`    | `string`  | Output directory for reports                                                          |
| `--config`        | `string`  | Path to a config file (default: `./config.yaml`)                                      |
| `--dry-run`       | `boolean` | List the files that would be scanned, without calling any AI                          |
| `--no-dedup`      | `boolean` | Ignore the state DB and treat every finding as new                                    |

## Configuration

Configuration is read from the **current working directory**: `config.yaml`
first, then `config.local.yaml` (gitignored) deep-merged on top, then any CLI
flags. Use `--config` to point at a different file. Every field is optional —
sensible defaults are built in.

Create a local override:

```bash
cp config.local.yaml.example config.local.yaml
```

Example `config.yaml`:

```yaml
target:
  roots:
    - . # directories to scan (each becomes a "project")
  # include / exclude REPLACE the language-agnostic defaults — use for full control:
  # include:
  #   - "**/*.{ts,js,py,go,java}"
  # exclude:
  #   - "**/legacy/**"
  # includeExtra / excludeExtra ADD to the defaults — use to scan/skip a few extra paths:
  # excludeExtra:
  #   - "**/fixtures/**"

ai:
  backends:
    - claude
  concurrency:
    claude: 2 # parallel AI calls per backend
    gemini: 1
    qwen: 1
    codex: 1
    opencode: 1
  timeoutMs: 120000

scan:
  categories:
    - injection
    - broken-access-control
    - idor
    - secrets
    - sensitive-data-exposure
    - cryptography
    - ssrf
    - path-traversal
    - insecure-deserialization
    - dependency
    - misconfiguration
  chunkSizeLines: 300 # large files are split into chunks of this size

output:
  formats: # any of: json, markdown, sarif
    - json
    - markdown
  # Default: ~/.local/share/heimdall/{reports,state.db} (global, shared across
  # projects). Set relative paths to keep them per-project instead:
  # reportsDir: .security/reports
  # stateDbPath: .security/state.db
```

## Change AI models

Heimdall uses the default AI model for all AI coding tools. To switch models, open the AI coding tool and select your preferred model manually. Once set, Heimdall will automatically use that model.

## Vulnerability categories

The built-in categories below are OWASP-flavoured. They are just strings, so you
can also use your own — anything listed under `scan.categories` is fed to the AI
as a focus area.

| Category                   | Description                                                               |
| -------------------------- | ------------------------------------------------------------------------- |
| `injection`                | SQL, NoSQL, command, code, or template injection                          |
| `broken-access-control`    | Missing or bypassable authentication / authorization                      |
| `idor`                     | Insecure Direct Object Reference (accessing other users' resources by ID) |
| `secrets`                  | Hardcoded credentials, API keys, tokens, or private keys                  |
| `sensitive-data-exposure`  | PII leakage, credential exposure, logging or returning sensitive data     |
| `cryptography`             | Weak/broken crypto or insecure randomness used for security purposes      |
| `ssrf`                     | Server-side request forgery via user-controlled URLs/hosts                |
| `path-traversal`           | Filesystem path traversal from unsanitized input                          |
| `insecure-deserialization` | Deserialization of untrusted data without validation                      |
| `dependency`               | Vulnerable third-party dependencies with known CVEs                       |
| `misconfiguration`         | Insecure configuration (disabled TLS verification, permissive CORS, …)    |

## What gets scanned

Each entry in `target.roots` is treated as a separate **project** (named after
its directory). Within each project, Heimdall collects every file matching the
`include` globs and skips anything matching `exclude`.

**Default includes** — common source extensions:

```
ts, tsx, js, jsx, mjs, cjs, py, pyx, go, rb, java, kt, kts, rs,
php, cs, c, cc, cpp, cxx, h, hpp, hxx, m, mm, scala, swift, sh, bash
```

**Default excludes** — dependencies, build output, generated and test files:

```
node_modules, .git, dist, build, out, target, obj, vendor,
.venv, venv, __pycache__, .next, .nuxt, coverage, generated,
*.generated.*, *.min.js, *.d.ts,
*.test.*, *.spec.*, *_test.go, test_*.py, *_test.py,
*Test.java, *Tests.java, src/test/, test/, tests/, __tests__/, spec/
```

**Customizing what's scanned.** Setting `include` or `exclude` (in `config.yaml`,
`config.local.yaml`, or via `--include` / `--exclude`) **replaces** the defaults
above entirely — handy for full control, but you lose the smart defaults unless
you re-list them. To just add a few paths while keeping the defaults, use
`includeExtra` / `excludeExtra` (or `--include-extra` / `--exclude-extra`):

```yaml
target:
  excludeExtra:
    - "**/fixtures/**" # skipped *in addition to* node_modules, dist, …
  includeExtra:
    - "**/*.yaml" # scanned *on top of* the default source extensions
```

When the `dependency` category is enabled, known dependency manifests
(`package.json`, `requirements.txt`, `Pipfile`, `pyproject.toml`, `setup.py`,
`go.mod`, `Cargo.toml`, `pom.xml`, `build.gradle`, `build.gradle.kts`,
`Gemfile`, `*.gemspec`, `composer.json`, `packages.config`, `*.csproj`,
`Package.swift`, `Podfile`, `conanfile.txt`, `vcpkg.json`) are additionally
scanned for vulnerable dependencies.

Large files are split into chunks (`scan.chunkSizeLines`) at language-agnostic
declaration boundaries so they fit comfortably in a single AI call.

## Reports

Reports are written as `scan_YYYY-MM-DD_HH-MM-SS.{ext}` to the global reports
directory `~/.local/share/heimdall/reports/` by default (shared across projects,
so `heimdall web` finds them from anywhere). Override the location with the
`HEIMDALL_DATA_DIR` / `XDG_DATA_HOME` env vars, or per-project by setting a
relative `output.reportsDir` (or `--output-dir`) — e.g. `.security/reports`.

**JSON** — complete data, ideal for CI/CD integrations and scripts:

```json
{
  "runId": "…",
  "startedAt": "…",
  "statistics": { "findingsNew": 3, "findingsTotal": 12, "findingsByCategory": { … } },
  "findings": [
    {
      "severity": "high",
      "vulnerabilityType": "idor",
      "title": "Missing ownership check",
      "project": "my-app",
      "filePath": "src/users/handler.go",
      "language": "go",
      "lineStart": 45,
      "detectedBy": ["claude", "gemini"],
      "isNew": true
    }
  ],
  "notes": []
}
```

**Markdown** — a human-readable report grouped by project and severity.

**SARIF 2.1.0** — the standard interchange format for security tools, compatible
with GitHub Code Scanning, GitLab SAST, and editors such as VS Code (via the
SARIF Viewer extension).

## Deduplication

Heimdall avoids reporting the same issue twice:

- **Cross-backend (same run):** if Claude and Gemini flag the same issue in the
  same place, it appears once with `detectedBy: ["claude", "gemini"]`.
- **Cross-run:** issues seen in a previous run are marked `isNew: false` and not
  counted as new. State is persisted to `~/.local/share/heimdall/state.db` (a
  JSON file) by default, alongside the reports.

A finding's fingerprint is a SHA-256 hash of: project + file path + vulnerability
type + normalized title + line range (bucketed to ±20 lines so small edits don't
break dedup).

Reset and start from scratch:

```bash
npm run reset-state
```

## Architecture

```
src/
├── index.ts                 ← CLI entry point (yargs)
├── config/                  ← config loading, merging, defaults
├── discovery/               ← resolve scan roots into projects, collect target files
├── chunking/                ← split large files into chunks
├── ai/
│   ├── backends/            ← claude.ts, gemini.ts, qwen.ts, codex.ts, opencode.ts
│   ├── prompts/             ← system prompt + per-file prompt builder
│   ├── registry.ts          ← resolve which backends are installed
│   └── parser.ts            ← lenient JSON extraction from AI output
├── dedup/                   ← fingerprinting, JSON state store, deduplicator
├── pipeline/
│   ├── scheduler.ts         ← per-backend concurrency semaphore
│   ├── runner.ts            ← scan a single file
│   └── orchestrator.ts      ← full run orchestration
└── report/                  ← json, markdown, sarif reporters
```

AI backends are pluggable: each implements the `AIBackend` interface
(`invoke()` + `isAvailable()`). A backend that isn't installed is skipped with a
warning without stopping the run.

See [AGENTS.md](AGENTS.md) for a deeper guide to the codebase aimed at
contributors and AI coding agents.

## TODO

- Proper error handling of AI code tools
- Change between AI models from the same backend
- Add scan from commit diff
- Add AI SDK for CI/CD compability

## License

[MIT](LICENSE)
