import { RawFinding } from './types'

// Extract the first {...} block from text using a depth counter (handles prose before JSON)
function extractJsonBlock(text: string): string | null {
  const start = text.indexOf('{')
  if (start === -1) return null

  let depth = 0
  let inString = false
  let escape = false

  for (let i = start; i < text.length; i++) {
    const ch = text[i]

    if (escape) { escape = false; continue }
    if (ch === '\\' && inString) { escape = true; continue }
    if (ch === '"') { inString = !inString; continue }
    if (inString) continue

    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return text.slice(start, i + 1)
    }
  }

  return null
}

export function parseAIResponse(rawOutput: string): RawFinding[] {
  if (!rawOutput.trim()) return []

  // Strategy 1: direct JSON parse
  try {
    const parsed = JSON.parse(rawOutput.trim())
    if (parsed.findings && Array.isArray(parsed.findings)) {
      return normalizeFindings(parsed.findings)
    }
  } catch {
    // continue to strategy 2
  }

  // Strategy 2: extract first JSON block
  const block = extractJsonBlock(rawOutput)
  if (block) {
    try {
      const parsed = JSON.parse(block)
      if (parsed.findings && Array.isArray(parsed.findings)) {
        return normalizeFindings(parsed.findings)
      }
    } catch {
      // continue to strategy 3
    }
  }

  // Strategy 3: log and return empty
  const preview = rawOutput.slice(0, 200).replace(/\n/g, ' ')
  console.warn(`[parser] Could not parse AI response: ${preview}...`)
  return []
}

const VALID_SEVERITIES = new Set(['critical', 'high', 'medium', 'low', 'info'])
const VALID_CONFIDENCES = new Set(['high', 'medium', 'low'])

// Categories are free-form (user-configurable), so we accept whatever the model
// returns, normalized to a kebab-case slug.
function normalizeVulnType(raw: unknown): string {
  if (typeof raw === 'string' && raw.trim()) {
    return raw.trim().toLowerCase().replace(/\s+/g, '-')
  }
  return 'misconfiguration'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeFindings(raw: any[]): RawFinding[] {
  const findings: RawFinding[] = []

  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    if (!item.title || !item.description) continue

    const vulnType = normalizeVulnType(item.vulnerabilityType)

    const severity = VALID_SEVERITIES.has(item.severity) ? item.severity : 'info'
    const confidence = VALID_CONFIDENCES.has(item.confidence) ? item.confidence : 'low'

    findings.push({
      vulnerabilityType: vulnType,
      severity,
      title: String(item.title).slice(0, 120),
      description: String(item.description || ''),
      recommendation: String(item.recommendation || ''),
      lineStart: typeof item.lineStart === 'number' ? item.lineStart : undefined,
      lineEnd: typeof item.lineEnd === 'number' ? item.lineEnd : undefined,
      codeSnippet: item.codeSnippet ? String(item.codeSnippet).slice(0, 500) : undefined,
      confidence,
    })
  }

  return findings
}
