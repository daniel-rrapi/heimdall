import { AIBackend } from '../types'
import { spawnWithTimeout } from './spawn'

export const opencodeBackend: AIBackend = {
  name: 'opencode',

  async invoke(prompt: string, _inputText: string, timeoutMs: number): Promise<string> {
    // `opencode run` executes a one-shot non-interactive task and exits.
    // The prompt is self-contained (the pipeline embeds the code in the prompt),
    // so we do NOT pipe inputText — opencode would append it as extra context,
    // doubling the tokens.
    const result = await spawnWithTimeout('opencode', ['run', prompt], {
      timeoutMs,
    })
    return result.stdout
  },

  async isAvailable(): Promise<boolean> {
    try {
      const result = await spawnWithTimeout('opencode', ['--version'], { timeoutMs: 5000 })
      return result.code === 0
    } catch {
      return false
    }
  },
}
