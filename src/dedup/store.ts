import * as fs from 'fs'
import * as path from 'path'

// JSON-based fingerprint store — no native dependencies required.
// File structure: { fingerprints: { [fp]: { first_seen_at, last_seen_at, project, file_path, vuln_type, title, run_count } } }

interface SeenEntry {
  first_seen_at: string
  last_seen_at: string
  project: string
  file_path: string
  vuln_type: string
  title: string
  run_count: number
}

interface StoreData {
  fingerprints: Record<string, SeenEntry>
}

export interface UpsertData {
  fingerprint: string
  project: string
  filePath: string
  vulnType: string
  title: string
}

export class FingerprintStore {
  private data: StoreData
  private dbPath: string

  constructor(dbPath: string) {
    this.dbPath = dbPath
    const dir = path.dirname(dbPath)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

    if (fs.existsSync(dbPath)) {
      try {
        this.data = JSON.parse(fs.readFileSync(dbPath, 'utf-8')) as StoreData
      } catch {
        this.data = { fingerprints: {} }
      }
    } else {
      this.data = { fingerprints: {} }
    }
  }

  loadAll(): Set<string> {
    return new Set(Object.keys(this.data.fingerprints))
  }

  upsertMany(entries: UpsertData[]): void {
    const now = new Date().toISOString()
    for (const entry of entries) {
      const existing = this.data.fingerprints[entry.fingerprint]
      if (existing) {
        existing.last_seen_at = now
        existing.run_count += 1
      } else {
        this.data.fingerprints[entry.fingerprint] = {
          first_seen_at: now,
          last_seen_at: now,
          project: entry.project,
          file_path: entry.filePath,
          vuln_type: entry.vulnType,
          title: entry.title,
          run_count: 1,
        }
      }
    }
    this.flush()
  }

  private flush(): void {
    fs.writeFileSync(this.dbPath, JSON.stringify(this.data, null, 2), 'utf-8')
  }

  close(): void {
    // Nothing to close for JSON-based store
  }
}
