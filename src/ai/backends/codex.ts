import { AIBackend } from '../types'
import { spawnWithTimeout } from './spawn'

export const codexBackend: AIBackend = {
  name: 'codex',

  async invoke(prompt: string, _inputText: string, timeoutMs: number): Promise<string> {
    // `codex exec` runs the OpenAI Codex CLI non-interactively and prints the
    // agent's final message to stdout (the lenient parser tolerates preamble).
    // - The prompt is self-contained (it already embeds the code), so we do NOT
    //   pipe inputText: codex would otherwise append it as a duplicate `<stdin>`
    //   block, doubling the tokens.
    // - `--sandbox read-only` keeps this a pure analysis — codex is an agent and
    //   must not be able to modify the code it is scanning.
    const result = await spawnWithTimeout('codex', ['exec', '--sandbox', 'read-only', prompt], {
      timeoutMs,
    })
    return result.stdout
  },

  async isAvailable(): Promise<boolean> {
    try {
      const result = await spawnWithTimeout('codex', ['--version'], { timeoutMs: 5000 })
      return result.code === 0
    } catch {
      return false
    }
  },
}
