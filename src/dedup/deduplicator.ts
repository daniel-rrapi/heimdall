import { v4 as uuidv4 } from 'uuid'
import { RawFinding } from '../ai/types'
import { ScanTarget } from '../discovery/types'
import { Finding } from '../report/types'
import { computeFingerprint } from './fingerprint'
import { VulnCategory } from '../config/types'

export interface RawScanResult {
  finding: RawFinding
  target: ScanTarget
  backend: string
}

export class Deduplicator {
  // fingerprint → Finding (in-memory, current run)
  private inMemory = new Map<string, Finding>()

  constructor(private seenInDb: Set<string>) {}

  add(result: RawScanResult): void {
    const { finding, target, backend } = result

    const fingerprint = computeFingerprint({
      project: target.project.name,
      filePath: target.relativePath,
      lineStart: finding.lineStart ?? 0,
      lineEnd: finding.lineEnd ?? 0,
      vulnerabilityType: finding.vulnerabilityType as VulnCategory,
      title: finding.title,
    })

    const existing = this.inMemory.get(fingerprint)

    if (existing) {
      // Merge: add backend to detectedBy if not already present
      if (!existing.detectedBy.includes(backend)) {
        existing.detectedBy.push(backend)
      }
      // Upgrade confidence if the new backend is more confident
      const confidenceOrder = { high: 3, medium: 2, low: 1 }
      if ((confidenceOrder[finding.confidence] ?? 0) > (confidenceOrder[existing.confidence] ?? 0)) {
        existing.confidence = finding.confidence
      }
      // Upgrade severity to the most severe rating across backends (never under-report)
      const severityOrder = { critical: 5, high: 4, medium: 3, low: 2, info: 1 }
      if ((severityOrder[finding.severity] ?? 0) > (severityOrder[existing.severity] ?? 0)) {
        existing.severity = finding.severity
      }
    } else {
      const isNew = !this.seenInDb.has(fingerprint)

      this.inMemory.set(fingerprint, {
        id: uuidv4(),
        fingerprint,
        project: target.project.name,
        filePath: target.relativePath,
        fileType: target.fileType,
        language: target.language,
        vulnerabilityType: finding.vulnerabilityType as VulnCategory,
        severity: finding.severity,
        title: finding.title,
        description: finding.description,
        recommendation: finding.recommendation,
        lineStart: finding.lineStart,
        lineEnd: finding.lineEnd,
        codeSnippet: finding.codeSnippet,
        confidence: finding.confidence,
        detectedBy: [backend],
        detectedAt: new Date().toISOString(),
        isNew,
      })
    }
  }

  getFindings(): Finding[] {
    const severityOrder = { critical: 5, high: 4, medium: 3, low: 2, info: 1 }
    return Array.from(this.inMemory.values()).sort((a, b) => {
      const severityDiff = (severityOrder[b.severity] ?? 0) - (severityOrder[a.severity] ?? 0)
      if (severityDiff !== 0) return severityDiff
      return a.project.localeCompare(b.project) || a.filePath.localeCompare(b.filePath)
    })
  }

  getNewFingerprints(): Array<{ fingerprint: string; project: string; filePath: string; vulnType: string; title: string }> {
    return Array.from(this.inMemory.entries())
      .filter(([, f]) => f.isNew)
      .map(([fingerprint, f]) => ({
        fingerprint,
        project: f.project,
        filePath: f.filePath,
        vulnType: f.vulnerabilityType,
        title: f.title,
      }))
  }
}
