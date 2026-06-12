# OpenCode Backend Implementation Plan

> **For Hermes:** Use subagent-driven-development to implement this plan task-by-task.

**Goal:** Add OpenCode (`opencode`) as a supported AI backend in Heimdall, following the same pluggable pattern as claude/gemini/qwen/codex.

**Architecture:** A thin adapter file (`src/ai/backends/opencode.ts`) implementing the `AIBackend` interface (`invoke` + `isAvailable`), registered in the backend registry and type system. OpenCode is invoked via `opencode run '<self-contained-prompt>'` — no stdin piping needed (the prompt already embeds the code, same pattern as the codex backend).

**Tech Stack:** TypeScript, CommonJS, child_process (via existing `spawnWithTimeout`), OpenCode CLI (`opencode`).

---

## Files to touch

| Action | Path |
|--------|------|
| **Create** | `src/ai/backends/opencode.ts` |
| **Modify** | `src/ai/registry.ts` — import + register |
| **Modify** | `src/config/types.ts` — add `'opencode'` to `AIBackendName` union + concurrency defaults |

---

## Task 1: Create the opencode backend adapter

**Objective:** Implement the `AIBackend` interface for OpenCode CLI.

**Files:**
- Create: `src/ai/backends/opencode.ts`

**Step 1: Write the adapter**

Create `src/ai/backends/opencode.ts`:

```typescript
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
```

**Step 2: Verify the file exists**

Run: `ls -la src/ai/backends/opencode.ts`
Expected: file exists, ~600 bytes

---

## Task 2: Register opencode in the backend registry

**Objective:** Import `opencodeBackend` and add it to the `REGISTRY` map.

**Files:**
- Modify: `src/ai/registry.ts`

**Step 1: Add the import**

After line 5 (`import { codexBackend } ...`), add:
```typescript
import { opencodeBackend } from './backends/opencode'
```

**Step 2: Add to the REGISTRY map**

After line 12 (`codex: codexBackend,`), add:
```typescript
  opencode: opencodeBackend,
```

**Step 3: Verify the changes**

Run: `head -15 src/ai/registry.ts`
Expected:
```
import { AIBackend } from './types'
import { claudeBackend } from './backends/claude'
import { geminiBackend } from './backends/gemini'
import { qwenBackend } from './backends/qwen'
import { codexBackend } from './backends/codex'
import { opencodeBackend } from './backends/opencode'
import { AIBackendName } from '../config/types'

const REGISTRY: Record<AIBackendName, AIBackend> = {
  claude: claudeBackend,
  gemini: geminiBackend,
  qwen: qwenBackend,
  codex: codexBackend,
  opencode: opencodeBackend,
}
```

---

## Task 3: Add opencode to the type system and defaults

**Objective:** Extend the `AIBackendName` union and the `concurrency` defaults so the config loader + CLI validation accept `'opencode'`.

**Files:**
- Modify: `src/config/types.ts`

**Step 1: Extend the AIBackendName union**

On line 19, replace:
```typescript
export type AIBackendName = 'claude' | 'gemini' | 'qwen' | 'codex'
```
With:
```typescript
export type AIBackendName = 'claude' | 'gemini' | 'qwen' | 'codex' | 'opencode'
```

**Step 2: Add opencode concurrency default**

On line 127, replace:
```typescript
    concurrency: { claude: 2, gemini: 1, qwen: 1, codex: 1 },
```
With:
```typescript
    concurrency: { claude: 2, gemini: 1, qwen: 1, codex: 1, opencode: 1 } as Record<AIBackendName, number>,
```

(Note: the `as Record<AIBackendName, number>` cast avoids a type error since the literal type won't include `'opencode'` until the union is updated — but since we update it in the same file, it should just work without the cast. Include it only if TypeScript complains.)

**Step 3: Run typecheck**

```bash
cd /home/dietpi/.hermes/projects/heimdall && npm run typecheck
```

Expected: `tsc --noEmit` exits with code 0, no errors.

---

## Task 4: Smoke-test the change

**Objective:** Confirm the backend is discovered and the code compiles + runs without crashing.

**Step 1: Verify full build**

```bash
cd /home/dietpi/.hermes/projects/heimdall && npm run build
```

Expected: compiles cleanly, `heimdall` binary produced in `dist/`.

---

## Summary

| # | Task | Files | Verification |
|---|------|-------|-------------|
| 1 | Create `src/ai/backends/opencode.ts` | Create: 1 file | `ls` confirms file |
| 2 | Register in `src/ai/registry.ts` | Modify: 1 file (2 lines added) | `head` shows import + entry |
| 3 | Extend types + defaults | Modify: 1 file (2 edits) | `npm run typecheck` passes |
| 4 | Smoke-test | — | `npm run build` passes, dry-run lists files |

Total: **4 tasks**, ~10 minutes of implementation.

## Verification (final)

After all tasks:

```bash
cd /home/dietpi/.hermes/projects/heimdall
npm run typecheck && npm run build && echo "READY"
```

Expected output: `READY`

To use the new backend (once OpenCode CLI is installed):
```bash
npm run scan -- --path ../my-app --backends opencode
```