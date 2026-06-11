import { AIBackend } from './types'
import { claudeBackend } from './backends/claude'
import { geminiBackend } from './backends/gemini'
import { qwenBackend } from './backends/qwen'
import { AIBackendName } from '../config/types'

const REGISTRY: Record<AIBackendName, AIBackend> = {
  claude: claudeBackend,
  gemini: geminiBackend,
  qwen: qwenBackend,
}

export async function resolveBackends(names: AIBackendName[]): Promise<AIBackend[]> {
  const available: AIBackend[] = []

  for (const name of names) {
    const backend = REGISTRY[name]
    if (!backend) {
      console.warn(`[registry] Unknown backend: ${name}`)
      continue
    }
    const ok = await backend.isAvailable()
    if (ok) {
      available.push(backend)
      console.log(`[registry] Backend available: ${name}`)
    } else {
      console.warn(`[registry] Backend not available (skipping): ${name}`)
    }
  }

  return available
}
