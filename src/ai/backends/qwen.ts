import { AIBackend } from '../types'
import { spawnWithTimeout } from './spawn'

// Qwen Code CLI — try 'qwen-code' first, fallback to 'qwen'
async function findQwenCommand(): Promise<string | null> {
  for (const cmd of ['qwen-code', 'qwen']) {
    try {
      const result = await spawnWithTimeout(cmd, ['--version'], { timeoutMs: 5000 })
      if (result.code === 0) return cmd
    } catch {
      // try next
    }
  }
  return null
}

export const qwenBackend: AIBackend = {
  name: 'qwen',

  async invoke(prompt: string, inputText: string, timeoutMs: number): Promise<string> {
    const cmd = await findQwenCommand()
    if (!cmd) throw new Error('Qwen CLI not found')

    // qwen-code accepts prompt as positional arg, reads stdin for file content
    const result = await spawnWithTimeout(cmd, ['--print', prompt], {
      stdin: inputText,
      timeoutMs,
    })
    return result.stdout
  },

  async isAvailable(): Promise<boolean> {
    const cmd = await findQwenCommand()
    return cmd !== null
  },
}
