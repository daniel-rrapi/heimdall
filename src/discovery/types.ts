export interface ProjectMeta {
  name: string     // display name (basename of the root directory)
  rootDir: string  // absolute path to the project root
}

// 'source'   — application/library source code
// 'manifest' — a dependency manifest (package.json, go.mod, requirements.txt, ...)
export type FileType = 'source' | 'manifest'

export interface ScanTarget {
  project: ProjectMeta
  filePath: string      // absolute path
  relativePath: string  // relative to the project root
  fileType: FileType
  language?: string     // detected from the file extension (for code fences)
  lineCount: number
}
