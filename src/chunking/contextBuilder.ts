import { ScanTarget } from '../discovery/types'
import { FileChunk, chunkFile } from './chunker'

export interface ScanContext {
  target: ScanTarget
  chunk: FileChunk
}

export function buildContexts(target: ScanTarget, maxLines: number): ScanContext[] {
  const chunks = chunkFile(target.filePath, maxLines)
  return chunks.map((chunk) => ({ target, chunk }))
}
