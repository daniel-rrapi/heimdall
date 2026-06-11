import * as fs from 'fs'
import * as path from 'path'
import { Report } from './types'

export function writeJsonReport(report: Report, reportsDir: string): string {
  fs.mkdirSync(reportsDir, { recursive: true })
  const timestamp = report.startedAt.replace(/[:.]/g, '-').replace('T', '_').slice(0, 19)
  const outPath = path.join(reportsDir, `scan_${timestamp}.json`)
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf-8')
  return outPath
}
