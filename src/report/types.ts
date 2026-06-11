import { VulnCategory, PipelineConfig } from '../config/types'
import { Severity, Confidence } from '../ai/types'
import { FileType } from '../discovery/types'

export interface Finding {
  id: string
  fingerprint: string
  project: string
  filePath: string       // relative to the project root
  fileType: FileType
  language?: string
  vulnerabilityType: VulnCategory
  severity: Severity
  title: string
  description: string
  recommendation: string
  lineStart?: number
  lineEnd?: number
  codeSnippet?: string
  confidence: Confidence
  detectedBy: string[]   // backend names
  detectedAt: string     // ISO8601
  isNew: boolean         // false if seen in a previous run
}

export interface RunStats {
  projectsScanned: number
  filesScanned: number
  aiCallsTotal: number
  aiCallsFailed: number
  findingsTotal: number
  findingsNew: number
  findingsBySeverity: Record<string, number>
  findingsByProject: Record<string, number>
  findingsByCategory: Record<string, number>
}

export interface Report {
  runId: string
  startedAt: string
  completedAt: string
  config: Partial<PipelineConfig>
  statistics: RunStats
  findings: Finding[]
  notes: string[]
}
