import { AIBackend } from '../types'
import { spawnWithTimeout } from './spawn'

export const claudeBackend: AIBackend = {
  name: 'claude',

  async invoke(prompt: string, inputText: string, timeoutMs: number): Promise<string> {
    // claude --print reads stdin and uses the positional arg as the prompt
    // We pass the full prompt as the argument; input text goes to stdin
    const result = await spawnWithTimeout('claude', ['--print', prompt], {
      stdin: inputText,
      timeoutMs,
    })
    return result.stdout
  },

  async isAvailable(): Promise<boolean> {
    try {
      const result = await spawnWithTimeout('claude', ['--version'], { timeoutMs: 5000 })
      return result.code === 0
    } catch {
      return false
    }
  },
}
