import { ScanContext } from '../../chunking/contextBuilder'
import { VulnCategory } from '../../config/types'
import { SYSTEM_PROMPT } from './systemPrompt'

// Checklists keyed by file type. Language-agnostic — they describe what to look
// for, not how any specific framework spells it.
const FILE_TYPE_CHECKLISTS: Record<string, string> = {
  source: `## Analysis Checklist
- [ ] Injection: Is untrusted input concatenated into SQL/NoSQL queries, shell commands, eval, or dynamic code/template execution instead of being parameterized/escaped?
- [ ] Broken access control: Are there exposed operations (endpoints, handlers, RPCs, CLI commands, public APIs) missing authentication or authorization checks, or checks that can be bypassed?
- [ ] IDOR: Does code fetch or mutate a resource by an ID from the request without verifying the caller owns or may access it?
- [ ] Secrets: Are API keys, passwords, tokens, or private keys hardcoded in source?
- [ ] Sensitive data exposure: Is PII or are credentials logged, returned to unauthorized callers, or stored without protection?
- [ ] Cryptography: Are weak/broken algorithms (MD5, SHA1 for passwords, ECB, static IV/keys) or insecure randomness used for security purposes?
- [ ] SSRF: Is a server-side request built from user-controlled URLs/hosts without an allowlist?
- [ ] Path traversal: Are filesystem paths built from user input without sanitization?
- [ ] Insecure deserialization: Is untrusted data deserialized (pickle, native serialization, unsafe YAML, etc.) without validation?
- [ ] Misconfiguration: Is TLS verification disabled, are permissive CORS/permissions set, or is debug mode enabled in a way that weakens security?`,

  manifest: `## Analysis Checklist for Dependency Manifests
- [ ] Identify dependencies pinned to versions with known CVEs.
- [ ] Flag packages that are severely outdated (major version behind) and known to have security issues.
- [ ] Note any packages associated with known prototype pollution, ReDoS, deserialization, or injection vulnerabilities.
- [ ] Focus on dependencies that ship to production. Report the package name and the affected version.`,
}

const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  'injection': 'SQL, NoSQL, command, code, or template injection',
  'broken-access-control': 'missing or bypassable authentication / authorization controls',
  'idor': "insecure direct object reference (accessing another user's resources by ID)",
  'secrets': 'hardcoded credentials, API keys, tokens, or private keys',
  'sensitive-data-exposure': 'PII leakage, credential exposure, logging or returning sensitive data',
  'cryptography': 'weak/broken cryptography or insecure randomness for security purposes',
  'ssrf': 'server-side request forgery via user-controlled URLs/hosts',
  'path-traversal': 'filesystem path traversal from unsanitized input',
  'insecure-deserialization': 'deserialization of untrusted data without validation',
  'dependency': 'vulnerable third-party dependencies with known CVEs',
  'misconfiguration': 'insecure configuration (disabled TLS verification, permissive CORS, debug enabled, ...)',
}

function buildCategoryInstruction(categories: VulnCategory[]): string {
  const descriptions = categories
    .map((c) => `  - ${c}: ${CATEGORY_DESCRIPTIONS[c] ?? c}`)
    .join('\n')
  return `Focus ONLY on these vulnerability categories:\n${descriptions}`
}

export function buildPrompt(ctx: ScanContext, categories: VulnCategory[]): string {
  const { target, chunk } = ctx
  const { totalChunks, chunkIndex, startLine, endLine } = chunk

  const chunkHeader = totalChunks > 1
    ? `\n[CHUNK ${chunkIndex + 1}/${totalChunks} of ${target.relativePath}, lines ${startLine}-${endLine}]\n`
    : ''

  const checklist = FILE_TYPE_CHECKLISTS[target.fileType] ?? FILE_TYPE_CHECKLISTS.source
  const categoryInstruction = buildCategoryInstruction(categories)
  const fence = target.language || ''

  return `${SYSTEM_PROMPT}

---

Analyze the following file for security vulnerabilities.

## File
Project: ${target.project.name}
Path: ${target.relativePath}
Type: ${target.fileType}${target.language ? `\nLanguage: ${target.language}` : ''}
${chunkHeader}

${categoryInstruction}

## Code
\`\`\`${fence}
${chunk.content}
\`\`\`

${checklist}

Return your findings as JSON only.`
}
