import { ScanTarget } from '../discovery/types'
import { AIBackend, RawFinding } from '../ai/types'
import { buildContexts } from '../chunking/contextBuilder'
import { buildPrompt } from '../ai/prompts/buildPrompt'
import { parseAIResponse } from '../ai/parser'
import { PipelineConfig } from '../config/types'

export interface ScanResult {
  target: ScanTarget
  backend: string
  findings: RawFinding[]
  error?: string
}

export async function runFileScan(
  target: ScanTarget,
  backend: AIBackend,
  config: PipelineConfig
): Promise<ScanResult> {
  const contexts = buildContexts(target, config.scan.chunkSizeLines)
  const allFindings: RawFinding[] = []

  for (const ctx of contexts) {
    const prompt = buildPrompt(ctx, config.scan.categories)

    try {
      const rawOutput = await backend.invoke(prompt, ctx.chunk.content, config.ai.timeoutMs)
      const findings = parseAIResponse(rawOutput)
      allFindings.push(...findings)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(
        `[runner] ${backend.name} error on ${target.relativePath} chunk ${ctx.chunk.chunkIndex + 1}/${ctx.chunk.totalChunks}: ${msg}`
      )
      return { target, backend: backend.name, findings: allFindings, error: msg }
    }
  }

  return { target, backend: backend.name, findings: allFindings }
}
