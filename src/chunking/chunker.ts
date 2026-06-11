import * as fs from 'fs'

export interface FileChunk {
  content: string
  startLine: number
  endLine: number
  chunkIndex: number
  totalChunks: number
}

// Language-agnostic declaration boundaries. Matches the start of a top-level
// (or lightly-indented) function/class/method declaration across common
// languages, so large files are split at sensible points.
const DECLARATION_RE = new RegExp(
  '^(?:' +
    // top-level / lightly-indented declarations (<=4 leading spaces)
    '\\s{0,4}' +
    '(?:export\\s+|public\\s+|private\\s+|protected\\s+|internal\\s+|static\\s+|final\\s+|abstract\\s+|async\\s+|pub\\s+|open\\s+)*' +
    '(?:function\\b|func\\b|fn\\b|def\\b|class\\b|interface\\b|struct\\b|enum\\b|trait\\b|impl\\b|' +
      'module\\b|namespace\\b|type\\b|const\\b|let\\b|var\\b|val\\b)' +
  '|' +
    // method-like members: "  name(" / "  name:" / "  async name(" (2-4 spaces)
    '\\s{2,4}(?:async\\s+)?[A-Za-z_$][\\w$]*\\s*[:(]' +
  '|' +
    // shell/bash top-level function: "name() {"
    '[A-Za-z_][\\w]*\\s*\\(\\s*\\)' +
  ')'
)

// Lines that look like imports/usings/includes at the top of a file.
const IMPORT_RE = /^\s*(?:import\b|from\b|require\b|use\b|using\b|#include\b|package\b|@import\b)/

function findBoundaries(lines: string[]): number[] {
  const boundaries: number[] = [0]
  for (let i = 1; i < lines.length; i++) {
    if (DECLARATION_RE.test(lines[i])) {
      boundaries.push(i)
    }
  }
  return boundaries
}

export function chunkFile(filePath: string, maxLines: number): FileChunk[] {
  const content = fs.readFileSync(filePath, 'utf-8')
  const lines = content.split('\n')

  if (lines.length <= maxLines) {
    return [{ content, startLine: 1, endLine: lines.length, chunkIndex: 0, totalChunks: 1 }]
  }

  // Extract the leading import/comment block so each continuation chunk keeps context.
  let importEnd = 0
  for (let i = 0; i < Math.min(lines.length, 40); i++) {
    const line = lines[i].trim()
    if (
      line === '' ||
      IMPORT_RE.test(line) ||
      line.startsWith('//') ||
      line.startsWith('#') ||
      line.startsWith('/*') ||
      line.startsWith('*')
    ) {
      importEnd = i + 1
    } else {
      break
    }
  }
  const importBlock = lines.slice(0, importEnd).join('\n')

  const boundaries = findBoundaries(lines)

  const chunks: FileChunk[] = []
  let start = 0

  while (start < lines.length) {
    let end = start + maxLines
    if (end >= lines.length) {
      end = lines.length
    } else {
      // Snap to the nearest declaration boundary before `end`.
      const nearBoundary = boundaries.filter((b) => b > start && b < end).pop()
      if (nearBoundary !== undefined) {
        end = nearBoundary
      }
    }

    const chunkLines = lines.slice(start, end)
    const chunkContent = start === 0
      ? chunkLines.join('\n')
      : `${importBlock}\n\n// ... [continues from line ${start + 1}]\n\n${chunkLines.join('\n')}`

    chunks.push({
      content: chunkContent,
      startLine: start + 1,
      endLine: end,
      chunkIndex: chunks.length,
      totalChunks: -1, // filled below
    })

    start = end
  }

  const totalChunks = chunks.length
  for (const chunk of chunks) {
    chunk.totalChunks = totalChunks
  }

  return chunks
}
