import { spawn } from 'child_process'

export interface SpawnResult {
  stdout: string
  stderr: string
  code: number
}

export function spawnWithTimeout(
  command: string,
  args: string[],
  options: { stdin?: string; timeoutMs?: number; cwd?: string }
): Promise<SpawnResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (data: Buffer) => { stdout += data.toString() })
    child.stderr.on('data', (data: Buffer) => { stderr += data.toString() })

    if (options.stdin) {
      child.stdin.write(options.stdin, 'utf-8')
    }
    child.stdin.end()

    let timedOut = false
    let timer: ReturnType<typeof setTimeout> | undefined

    if (options.timeoutMs) {
      timer = setTimeout(() => {
        timedOut = true
        child.kill('SIGTERM')
        setTimeout(() => { try { child.kill('SIGKILL') } catch { /* ignore */ } }, 3000)
      }, options.timeoutMs)
    }

    child.on('close', (code) => {
      if (timer) clearTimeout(timer)
      if (timedOut) {
        reject(new Error(`Command timed out after ${options.timeoutMs}ms: ${command}`))
      } else {
        resolve({ stdout, stderr, code: code ?? 1 })
      }
    })

    child.on('error', (err) => {
      if (timer) clearTimeout(timer)
      reject(err)
    })
  })
}
