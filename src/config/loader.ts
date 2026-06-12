import * as fs from 'fs'
import * as path from 'path'
import * as yaml from 'js-yaml'
import { PipelineConfig, DEFAULT_CONFIG } from './types'

function deepMerge<T>(base: T, override: Partial<T>): T {
  const result = { ...base }
  for (const key of Object.keys(override) as (keyof T)[]) {
    const val = override[key]
    if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
      result[key] = deepMerge(base[key] as object, val as object) as T[keyof T]
    } else if (val !== undefined) {
      result[key] = val as T[keyof T]
    }
  }
  return result
}

/**
 * Load configuration. Looks for `config.yaml` and `config.local.yaml` in the
 * given directory (the current working directory by default). Missing files
 * are fine — built-in defaults are used. An explicit `configPath` overrides
 * the lookup of `config.yaml`.
 */
export function loadConfig(cwd: string, configPath?: string): PipelineConfig {
  const mainPath = configPath
    ? path.resolve(cwd, configPath)
    : path.join(cwd, 'config.yaml')
  const localPath = path.join(cwd, 'config.local.yaml')

  let config = { ...DEFAULT_CONFIG }

  if (fs.existsSync(mainPath)) {
    const raw = yaml.load(fs.readFileSync(mainPath, 'utf-8')) as Partial<PipelineConfig>
    if (raw) config = deepMerge(config, raw)
  }

  if (fs.existsSync(localPath)) {
    const raw = yaml.load(fs.readFileSync(localPath, 'utf-8')) as Partial<PipelineConfig>
    if (raw) config = deepMerge(config, raw)
  }

  return config
}

export function applyCliOverrides(
  config: PipelineConfig,
  args: {
    path?: string
    include?: string
    exclude?: string
    includeExtra?: string
    excludeExtra?: string
    backends?: string
    categories?: string
    concurrency?: number
    outputDir?: string
  }
): PipelineConfig {
  const result = {
    ...config,
    target: { ...config.target },
    ai: { ...config.ai },
    scan: { ...config.scan },
    output: { ...config.output },
  }

  const split = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean)

  if (args.path) {
    result.target.roots = split(args.path)
  }
  if (args.include) {
    result.target.include = split(args.include)
  }
  if (args.exclude) {
    result.target.exclude = split(args.exclude)
  }
  if (args.includeExtra) {
    result.target.includeExtra = split(args.includeExtra)
  }
  if (args.excludeExtra) {
    result.target.excludeExtra = split(args.excludeExtra)
  }
  if (args.backends) {
    result.ai.backends = split(args.backends) as PipelineConfig['ai']['backends']
  }
  if (args.categories) {
    result.scan.categories = split(args.categories)
  }
  if (args.concurrency !== undefined) {
    result.ai.concurrency = { claude: args.concurrency, gemini: args.concurrency, qwen: args.concurrency, codex: args.concurrency, opencode: args.concurrency }
  }
  if (args.outputDir) {
    result.output.reportsDir = args.outputDir
  }

  return result
}
