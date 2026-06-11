// A vulnerability category. The built-in set below is OWASP-flavoured, but any
// string is accepted so users can define their own categories in config.
export type VulnCategory = string

export const BUILTIN_CATEGORIES = [
  'injection',
  'broken-access-control',
  'idor',
  'secrets',
  'sensitive-data-exposure',
  'cryptography',
  'ssrf',
  'path-traversal',
  'insecure-deserialization',
  'dependency',
  'misconfiguration',
] as const

export type AIBackendName = 'claude' | 'gemini' | 'qwen'

export type ReportFormat = 'json' | 'markdown' | 'sarif'

export interface PipelineConfig {
  target: {
    // Directories to scan. Each root is treated as a separate "project".
    // Relative paths are resolved against the current working directory.
    roots: string[]
    // Glob patterns (relative to each root) for files to scan.
    include: string[]
    // Glob patterns to exclude from scanning.
    exclude: string[]
  }
  ai: {
    backends: AIBackendName[]
    concurrency: Record<AIBackendName, number>
    timeoutMs: number
  }
  scan: {
    categories: VulnCategory[]
    chunkSizeLines: number
    // Dependency manifest filenames scanned for vulnerable dependencies
    // (only when the `dependency` category is enabled).
    manifestFiles: string[]
  }
  output: {
    formats: ReportFormat[]
    reportsDir: string
    stateDbPath: string
  }
}

export const DEFAULT_INCLUDE = [
  '**/*.{ts,tsx,js,jsx,mjs,cjs,py,pyx,go,rb,java,kt,kts,rs,php,cs,c,cc,cpp,cxx,h,hpp,hxx,m,mm,scala,swift,sh,bash}',
]

export const DEFAULT_EXCLUDE = [
  '**/node_modules/**',
  '**/.git/**',
  '**/dist/**',
  '**/build/**',
  '**/out/**',
  '**/target/**',
  '**/obj/**',
  '**/vendor/**',
  '**/.venv/**',
  '**/venv/**',
  '**/__pycache__/**',
  '**/.next/**',
  '**/.nuxt/**',
  '**/coverage/**',
  '**/generated/**',
  '**/*.generated.*',
  '**/*.min.js',
  '**/*.d.ts',
  // common test files/dirs across ecosystems (override if you want to scan them)
  '**/*.test.*',
  '**/*.spec.*',
  '**/*_test.go',
  '**/test_*.py',
  '**/*_test.py',
  '**/*Test.java',
  '**/*Tests.java',
  '**/src/test/**',
  '**/test/**',
  '**/tests/**',
  '**/__tests__/**',
  '**/spec/**',
]

export const DEFAULT_MANIFEST_FILES = [
  'package.json',
  'requirements.txt',
  'Pipfile',
  'pyproject.toml',
  'setup.py',
  'go.mod',
  'Cargo.toml',
  'pom.xml',
  'build.gradle',
  'build.gradle.kts',
  'Gemfile',
  '*.gemspec',
  'composer.json',
  'packages.config',
  '*.csproj',
  'Package.swift',
  'Podfile',
  'conanfile.txt',
  'vcpkg.json',
]

export const DEFAULT_CONFIG: PipelineConfig = {
  target: {
    roots: ['.'],
    include: DEFAULT_INCLUDE,
    exclude: DEFAULT_EXCLUDE,
  },
  ai: {
    backends: ['claude'],
    concurrency: { claude: 2, gemini: 1, qwen: 1 },
    timeoutMs: 120_000,
  },
  scan: {
    categories: [...BUILTIN_CATEGORIES],
    chunkSizeLines: 300,
    manifestFiles: DEFAULT_MANIFEST_FILES,
  },
  output: {
    formats: ['json', 'markdown'],
    reportsDir: '.security/reports',
    stateDbPath: '.security/state.db',
  },
}
