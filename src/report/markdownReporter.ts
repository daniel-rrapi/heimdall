import * as fs from 'fs'
import * as path from 'path'
import { Report, Finding } from './types'

const SEVERITY_LABEL: Record<string, string> = {
  critical: 'CRITICAL',
  high: 'HIGH',
  medium: 'MEDIUM',
  low: 'LOW',
  info: 'INFO',
}

function severityBadge(s: string): string {
  return `[${SEVERITY_LABEL[s] ?? s.toUpperCase()}]`
}

function buildSummaryTable(report: Report): string {
  const { findingsBySeverity } = report.statistics
  const severities = ['critical', 'high', 'medium', 'low', 'info']
  const rows = severities
    .map((s) => {
      const total = findingsBySeverity[s] ?? 0
      if (total === 0) return null
      const newCount = report.findings.filter((f) => f.severity === s && f.isNew).length
      return `| ${s.charAt(0).toUpperCase() + s.slice(1)} | ${newCount} | ${total} |`
    })
    .filter(Boolean)

  if (rows.length === 0) return '_No findings._'

  return [
    '| Severity | New | Total |',
    '|----------|-----|-------|',
    ...rows,
  ].join('\n')
}

function buildFindingBlock(finding: Finding): string {
  const lines: string[] = []

  const locationParts: string[] = [`\`${finding.filePath}\``]
  if (finding.lineStart) {
    locationParts.push(
      finding.lineEnd && finding.lineEnd !== finding.lineStart
        ? `lines ${finding.lineStart}-${finding.lineEnd}`
        : `line ${finding.lineStart}`
    )
  }

  lines.push(`#### ${severityBadge(finding.severity)} ${finding.title}`)
  lines.push('')
  lines.push(`**File:** ${locationParts.join(' — ')}  `)
  lines.push(`**Category:** ${finding.vulnerabilityType} | **Detected by:** ${finding.detectedBy.join(', ')} | **Confidence:** ${finding.confidence}${finding.isNew ? '' : ' *(previously seen)*'}`)
  lines.push('')
  lines.push(`**Description:** ${finding.description}`)
  lines.push('')
  lines.push(`**Recommendation:** ${finding.recommendation}`)

  if (finding.codeSnippet) {
    lines.push('')
    lines.push('```' + (finding.language ?? ''))
    lines.push(finding.codeSnippet)
    lines.push('```')
  }

  return lines.join('\n')
}

export function writeMarkdownReport(report: Report, reportsDir: string): string {
  fs.mkdirSync(reportsDir, { recursive: true })

  const timestamp = report.startedAt.replace(/[:.]/g, '-').replace('T', '_').slice(0, 19)
  const outPath = path.join(reportsDir, `scan_${timestamp}.md`)

  const lines: string[] = []
  const date = new Date(report.startedAt).toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' })

  lines.push(`# Security Scan Report — ${date}`)
  lines.push('')
  lines.push(`**Run ID:** \`${report.runId}\`  `)
  lines.push(`**Projects scanned:** ${report.statistics.projectsScanned}  `)
  lines.push(`**Files analyzed:** ${report.statistics.filesScanned}  `)
  lines.push(`**AI backends:** ${(report.config.ai?.backends ?? []).join(', ')}  `)
  lines.push(`**AI calls:** ${report.statistics.aiCallsTotal} (${report.statistics.aiCallsFailed} failed)`)
  lines.push('')
  lines.push('---')
  lines.push('')
  lines.push('## Executive Summary')
  lines.push('')
  lines.push(buildSummaryTable(report))
  lines.push('')

  if (report.notes.length > 0) {
    lines.push('## Notes')
    lines.push('')
    for (const note of report.notes) {
      lines.push(`> ${note}`)
      lines.push('')
    }
  }

  // Group findings by project
  const byProject = new Map<string, Finding[]>()
  for (const finding of report.findings) {
    const arr = byProject.get(finding.project) ?? []
    arr.push(finding)
    byProject.set(finding.project, arr)
  }

  if (byProject.size > 0) {
    lines.push('## Findings by Project')

    for (const [project, findings] of [...byProject.entries()].sort()) {
      lines.push('')
      lines.push(`### ${project}`)
      lines.push('')

      // Sort by severity within project
      const severityOrder: Record<string, number> = { critical: 5, high: 4, medium: 3, low: 2, info: 1 }
      const sorted = [...findings].sort((a, b) => (severityOrder[b.severity] ?? 0) - (severityOrder[a.severity] ?? 0))

      for (const finding of sorted) {
        lines.push(buildFindingBlock(finding))
        lines.push('')
        lines.push('---')
        lines.push('')
      }
    }
  } else {
    lines.push('## Findings')
    lines.push('')
    lines.push('_No findings in this scan._')
  }

  fs.writeFileSync(outPath, lines.join('\n'), 'utf-8')
  return outPath
}
