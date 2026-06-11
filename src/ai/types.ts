import { VulnCategory } from '../config/types'

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info'
export type Confidence = 'high' | 'medium' | 'low'

export interface RawFinding {
  vulnerabilityType: VulnCategory
  severity: Severity
  title: string
  description: string
  recommendation: string
  lineStart?: number
  lineEnd?: number
  codeSnippet?: string
  confidence: Confidence
}

export interface AIBackend {
  name: string
  invoke(prompt: string, inputText: string, timeoutMs: number): Promise<string>
  isAvailable(): Promise<boolean>
}
