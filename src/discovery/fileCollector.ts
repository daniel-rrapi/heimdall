import * as fs from 'fs'
import * as path from 'path'
import fg from 'fast-glob'
import { ProjectMeta, ScanTarget, FileType } from './types'
import { PipelineConfig } from '../config/types'

const EXT_TO_LANGUAGE: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'tsx',
  '.js': 'javascript',
  '.jsx': 'jsx',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.py': 'python',
  '.go': 'go',
  '.rb': 'ruby',
  '.java': 'java',
  '.kt': 'kotlin',
  '.kts': 'kotlin',
  '.rs': 'rust',
  '.php': 'php',
  '.cs': 'csharp',
  '.c': 'c',
  '.h': 'c',
  '.cc': 'cpp',
  '.cpp': 'cpp',
  '.hpp': 'cpp',
  '.m': 'objectivec',
  '.mm': 'objectivec',
  '.scala': 'scala',
  '.swift': 'swift',
  '.sh': 'bash',
  '.bash': 'bash',
  '.json': 'json',
  '.xml': 'xml',
  '.toml': 'toml',
  '.gradle': 'groovy',
}

const FILENAME_TO_LANGUAGE: Record<string, string> = {
  gemfile: 'ruby',
  dockerfile: 'dockerfile',
  'go.mod': 'go',
  'go.sum': 'go',
}

export function detectLanguage(filePath: string): string {
  const base = path.basename(filePath).toLowerCase()
  if (FILENAME_TO_LANGUAGE[base]) return FILENAME_TO_LANGUAGE[base]
  const ext = path.extname(filePath).toLowerCase()
  return EXT_TO_LANGUAGE[ext] ?? ''
}

function countLines(filePath: string): number {
  try {
    return fs.readFileSync(filePath, 'utf-8').split('\n').length
  } catch {
    return 0
  }
}

function toTarget(
  filePath: string,
  fileType: FileType,
  project: ProjectMeta
): ScanTarget {
  return {
    project,
    filePath,
    relativePath: path.relative(project.rootDir, filePath),
    fileType,
    language: detectLanguage(filePath),
    lineCount: countLines(filePath),
  }
}

/**
 * Collect every file to scan for a single project, applying the configured
 * include/exclude globs. When the `dependency` category is enabled, known
 * dependency manifests are added as `manifest` targets.
 */
export async function collectTargets(
  project: ProjectMeta,
  config: PipelineConfig
): Promise<ScanTarget[]> {
  const targets: ScanTarget[] = []
  const seen = new Set<string>()

  // Extra globs are appended so the built-in defaults are preserved; set
  // include/exclude in config to replace the defaults entirely instead.
  const include = [...config.target.include, ...config.target.includeExtra]
  const exclude = [...config.target.exclude, ...config.target.excludeExtra]

  // 1. Source files matching the include globs.
  const sourceFiles = await fg(include, {
    cwd: project.rootDir,
    absolute: true,
    ignore: exclude,
    followSymbolicLinks: false,
    dot: false,
  })

  for (const filePath of sourceFiles) {
    if (seen.has(filePath)) continue
    seen.add(filePath)
    targets.push(toTarget(filePath, 'source', project))
  }

  // 2. Dependency manifests (only when dependency scanning is enabled).
  if (config.scan.categories.includes('dependency') && config.scan.manifestFiles.length > 0) {
    const manifestGlobs = config.scan.manifestFiles.map((f) => `**/${f}`)
    const manifests = await fg(manifestGlobs, {
      cwd: project.rootDir,
      absolute: true,
      ignore: exclude,
      followSymbolicLinks: false,
      dot: false,
    })

    for (const filePath of manifests) {
      if (seen.has(filePath)) continue
      seen.add(filePath)
      targets.push(toTarget(filePath, 'manifest', project))
    }
  }

  // Larger files first so the slowest work starts earliest.
  return targets.sort((a, b) => b.lineCount - a.lineCount)
}
