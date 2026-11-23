// E4 coverage meta-contract (phase 1: video-agent family).
// Invariant: every product-source path read by a family source-contract test must be
// covered by a ci_scope whose selected commands actually run that test. Pure static
// check; reuses selectAffectedCommands (no duplicated selection logic).
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ALL_POST_PARSER_CASES } from '@/tests/registry/postParserCases'
import { SOURCE_CONTRACT_READ_MANIFEST } from '@/tests/registry/sourceContractReadManifest'
import { readContract, selectAffectedCommands } from '../../../scripts/collaboration-contract.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const FAMILY_PREFIXES = ['videoagent.', 'toolbar.importurl.videodownload']
const FAMILY_EXACT_IDS = ['strybldr.runall.videosourcewritesvideoagentanalysispacket']

const isFamilyId = (id: string): boolean => {
  const lower = id.toLowerCase()
  return FAMILY_PREFIXES.some(prefix => lower.startsWith(prefix)) || FAMILY_EXACT_IDS.includes(lower)
}

const ARGS = String.raw`(?:'[^']*'|"[^"]*")(?:\s*,\s*(?:'[^']*'|"[^"]*"))*`
const parseArgs = (raw: string): string[] => raw.split(',').map(part => part.trim().slice(1, -1))
const fromCwd = (parts: string[]): string =>
  parts[0] === 'src' ? `canvas/src/${parts.slice(1).join('/')}` : `canvas/${parts.join('/')}`
const fromRootDir = (parts: string[]): string => path.posix.normalize(`canvas/${parts.join('/')}`)
const isAutoExcluded = (rel: string): boolean => rel.startsWith('docs/') || rel.startsWith('..')

type ExtractedReads = { paths: Set<string>; literalReadSites: number; totalReadSites: number; helperForwardSites: number }

const extractReads = (text: string): ExtractedReads => {
  const paths = new Set<string>()
  let literalReadSites = 0
  const collect = (regex: RegExp, map: (args: string[]) => string, isReadCall: boolean) => {
    for (const match of text.matchAll(regex)) {
      paths.add(map(parseArgs(match[1])))
      if (isReadCall) literalReadSites += 1
    }
  }
  // readSource('a','b',...) -> canvas/src/a/b
  collect(new RegExp(String.raw`\breadSource\(\s*(${ARGS})\s*\)`, 'g'), args => `canvas/src/${args.join('/')}`, true)
  // readFileSync(resolve(process.cwd(),'src',...),'utf8')
  collect(new RegExp(String.raw`\breadFileSync\(\s*resolve\(\s*process\.cwd\(\)\s*,\s*(${ARGS})\s*\)`, 'g'), fromCwd, true)
  // literal path.join(process.cwd(),'src',...) expressions (incl. const-assigned paths read via variable)
  collect(new RegExp(String.raw`\bpath\.join\(\s*process\.cwd\(\)\s*,\s*(${ARGS})\s*\)`, 'g'), fromCwd, false)
  // readFileSync(path.resolve(rootDir,...),'utf8') with rootDir = process.cwd() = canvas
  collect(new RegExp(String.raw`\breadFileSync\(\s*path\.resolve\(\s*rootDir\s*,\s*(${ARGS})\s*\)`, 'g'), fromRootDir, true)
  // readFileSync(new URL('../x', import.meta.url),'utf8') relative to canvas/src/__tests__
  for (const match of text.matchAll(/\breadFileSync\(\s*new URL\(\s*'([^']+)'\s*,\s*import\.meta\.url\s*\)/g)) {
    paths.add(path.posix.normalize(`canvas/src/__tests__/${match[1]}`))
    literalReadSites += 1
  }
  // resolveRepoSourcePath(path.join('docs/...')) -> repo-relative (docs auto-excluded)
  collect(new RegExp(String.raw`\bresolveRepoSourcePath\(\s*path\.join\(\s*(${ARGS})\s*\)\s*\)`, 'g'), args => args.join('/'), false)
  const totalReadSites = [...text.matchAll(/\b(?:readSource|readFileSync)\s*\(/g)].length
  const helperForwardSites = [...text.matchAll(/\b(?:readSource|readFileSync)\([^\n]*\.\.\.(?:parts|segments)\b/g)].length
  return { paths, literalReadSites, totalReadSites, helperForwardSites }
}

const commandRunsAnyId = (command: unknown, ids: readonly string[]): boolean => {
  if (!Array.isArray(command)) return false
  const args = command.map(String)
  const separator = args.indexOf('--')
  if (!args.includes('test:ci:unit') || separator < 0) return false
  const filters = args.slice(separator + 1).filter(arg => !arg.startsWith('-'))
  return ids.some(id => filters.some(filter => id.toLowerCase().includes(filter.toLowerCase())))
}

export async function testCiCoverageSourceContractScopeBinding() {
  const contract = await readContract()
  const fileIds = new Map<string, string[]>()
  for (const tuple of ALL_POST_PARSER_CASES) {
    const [id, modulePath] = tuple
    if (!isFamilyId(id)) continue
    const rel = `canvas/src/${modulePath.replace(/^@\//, '')}.ts`
    const ids = fileIds.get(rel) ?? []
    ids.push(id)
    fileIds.set(rel, ids)
  }
  if (fileIds.size === 0) throw new Error('coverage meta-contract: video-agent family is empty (registry drift)')

  const manifestByFile = new Map<string, (typeof SOURCE_CONTRACT_READ_MANIFEST)[number]>()
  for (const entry of SOURCE_CONTRACT_READ_MANIFEST) {
    if (!fileIds.has(entry.file)) throw new Error(`coverage meta-contract: manifest file not in family: ${entry.file}`)
    if (!entry.reason.trim()) throw new Error(`coverage meta-contract: manifest entry lacks reason: ${entry.file}`)
    if (manifestByFile.has(entry.file)) throw new Error(`coverage meta-contract: duplicate manifest entry: ${entry.file}`)
    if (entry.kind === 'declared') {
      if (!entry.paths?.length) throw new Error(`coverage meta-contract: declared entry lacks paths: ${entry.file}`)
      for (const declared of entry.paths) {
        if (!existsSync(path.join(repoRoot, declared))) throw new Error(`coverage meta-contract: declared path missing: ${declared}`)
      }
    }
    manifestByFile.set(entry.file, entry)
  }

  const failures: string[] = []
  for (const [file, ids] of fileIds) {
    const text = readFileSync(path.join(repoRoot, file), 'utf8')
    const extracted = extractReads(text)
    const entry = manifestByFile.get(file)
    const dynamicSites = extracted.totalReadSites - extracted.literalReadSites - extracted.helperForwardSites
    if (dynamicSites > 0 && !entry) {
      failures.push(`${file}: ${dynamicSites} unclassified dynamic read site(s); add a manifest entry (fail-loud)`)
    }
    const toCheck = new Set<string>()
    for (const rel of extracted.paths) if (!isAutoExcluded(rel)) toCheck.add(rel)
    if (entry?.kind === 'declared') for (const rel of entry.paths ?? []) toCheck.add(rel)
    for (const rel of toCheck) {
      const plan = selectAffectedCommands([rel], contract)
      if (plan.unmatchedPaths.length > 0) {
        failures.push(`${file}: ${rel} is not covered by any ci_scope`)
        continue
      }
      if (!plan.commands.some(command => commandRunsAnyId(command, ids))) {
        failures.push(`${file}: ${rel} is covered but no selected command runs its contract tests`)
      }
    }
  }
  if (failures.length > 0) {
    throw new Error(`coverage meta-contract violations (${failures.length}):\n${failures.join('\n')}`)
  }
}