import { createHash } from 'crypto'
import { VulnCategory } from '../config/types'

export interface FingerprintInput {
  project: string
  filePath: string       // relative to the project root
  lineStart: number      // 0 if unknown
  lineEnd: number        // 0 if unknown
  vulnerabilityType: VulnCategory
  title: string
}

// Bucket line numbers into 20-line windows so minor edits don't break dedup
function bucketLine(line: number): number {
  if (line <= 0) return 0
  return Math.floor(line / 20) * 20
}

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function computeFingerprint(input: FingerprintInput): string {
  const normalized = [
    input.project,
    input.filePath.replace(/\\/g, '/').toLowerCase(),
    String(bucketLine(input.lineStart)),
    String(bucketLine(input.lineEnd)),
    input.vulnerabilityType,
    normalizeTitle(input.title),
  ].join('::')

  return createHash('sha256').update(normalized).digest('hex')
}
