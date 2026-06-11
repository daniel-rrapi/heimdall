import * as fs from 'fs'
import * as path from 'path'
import { ProjectMeta } from './types'

/**
 * Resolve the configured scan roots into concrete projects.
 *
 * Each root is a directory; relative roots are resolved against `cwd`.
 * The project name is the basename of the resolved directory (or the basename
 * of `cwd` when scanning ".").
 */
export function discoverProjects(roots: string[], cwd: string): ProjectMeta[] {
  const projects: ProjectMeta[] = []
  const seen = new Set<string>()

  for (const root of roots) {
    const rootDir = path.resolve(cwd, root)

    if (seen.has(rootDir)) continue
    seen.add(rootDir)

    if (!fs.existsSync(rootDir) || !fs.statSync(rootDir).isDirectory()) {
      console.warn(`[discovery] Skipping "${root}" — not a directory: ${rootDir}`)
      continue
    }

    const name = path.basename(rootDir) || rootDir

    projects.push({ name, rootDir })
  }

  return projects.sort((a, b) => a.name.localeCompare(b.name))
}
