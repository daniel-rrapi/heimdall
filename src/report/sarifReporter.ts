import * as fs from 'fs'
import * as path from 'path'
import { Report, Finding } from './types'

// SARIF 2.1.0 — https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html

const TOOL_NAME = 'heimdall'
const TOOL_VERSION = '1.0.0'

function ruleId(category: string): string {
  return category.toUpperCase().replace(/[^A-Z0-9]+/g, '_')
}

function toSarifLevel(severity: string): 'error' | 'warning' | 'note' | 'none' {
  switch (severity) {
    case 'critical':
    case 'high':
      return 'error'
    case 'medium':
      return 'warning'
    case 'low':
    case 'info':
      return 'note'
    default:
      return 'none'
  }
}

function toSarifResult(finding: Finding) {
  return {
    ruleId: ruleId(finding.vulnerabilityType),
    level: toSarifLevel(finding.severity),
    message: {
      text: `${finding.title}\n\n${finding.description}\n\nRecommendation: ${finding.recommendation}`,
    },
    locations: [
      {
        physicalLocation: {
          artifactLocation: {
            uri: finding.filePath.replace(/\\/g, '/'),
            uriBaseId: '%SRCROOT%',
          },
          ...(finding.lineStart
            ? {
                region: {
                  startLine: finding.lineStart,
                  endLine: finding.lineEnd ?? finding.lineStart,
                },
              }
            : {}),
        },
      },
    ],
    fingerprints: {
      'heimdall/v1': finding.fingerprint,
    },
    properties: {
      confidence: finding.confidence,
      detectedBy: finding.detectedBy,
      isNew: finding.isNew,
      category: finding.vulnerabilityType,
    },
  }
}

export function writeSarifReport(report: Report, reportsDir: string): string {
  fs.mkdirSync(reportsDir, { recursive: true })

  const timestamp = report.startedAt.replace(/[:.]/g, '-').replace('T', '_').slice(0, 19)
  const outPath = path.join(reportsDir, `scan_${timestamp}.sarif`)

  // Rules: configured categories plus any category that actually appears in findings.
  const categories = new Set<string>(report.config.scan?.categories ?? [])
  for (const f of report.findings) categories.add(f.vulnerabilityType)

  const sarif = {
    $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: TOOL_NAME,
            version: TOOL_VERSION,
            rules: [...categories].sort().map((cat) => ({
              id: ruleId(cat),
              name: cat,
              shortDescription: { text: cat.replace(/-/g, ' ') },
            })),
          },
        },
        results: report.findings.map(toSarifResult),
        properties: {
          runId: report.runId,
          startedAt: report.startedAt,
          completedAt: report.completedAt,
          statistics: report.statistics,
        },
      },
    ],
  }

  fs.writeFileSync(outPath, JSON.stringify(sarif, null, 2), 'utf-8')
  return outPath
}
