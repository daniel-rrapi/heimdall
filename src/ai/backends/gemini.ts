import { AIBackend } from '../types'
import { spawnWithTimeout } from './spawn'

export const geminiBackend: AIBackend = {
  name: 'gemini',

  async invoke(prompt: string, inputText: string, timeoutMs: number): Promise<string> {
    // gemini -p "<prompt>" reads from stdin
    const result = await spawnWithTimeout('gemini', ['-p', prompt], {
      stdin: inputText,
      timeoutMs,
    })
    return result.stdout
  },

  async isAvailable(): Promise<boolean> {
    try {
      const result = await spawnWithTimeout('gemini', ['--version'], { timeoutMs: 5000 })
      return result.code === 0
    } catch {
      return false
    }
  },
}
