import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildStoryboardBoardModel } from '@/components/StoryboardCanvas/storyboardModel'
import {
  buildAgenticGraphVdeoxplnRoutingPlan,
  AGENTIC_OS_VDEOXPLN_IDS,
} from '@/features/agent-ready/agentic-graph-vdeoxpln-contract.mjs'
import { loadGraphDataFromTextViaParser } from '@/features/parsers/loader'
import { buildStrybldrVideoHandoffFromGraphData } from '@/features/strybldr/strybldrStoryboard'
import { getNodeMediaSpec } from '@/lib/canvas/graph-elements/mediaSpec'
import { buildRichMediaPanelOverlayState, buildRichMediaPanelPreviewSpec } from '@/lib/render/richMediaSsot'

const SOURCE_EXTENSIONS = new Set(['.css', '.html', '.js', '.jsx', '.json', '.md', '.mdx', '.mjs', '.ts', '.tsx', '.yml', '.yaml'])
const SKIP_DIRS = new Set(['.git', '.next', '.turbo', '__pycache__', 'artifacts', 'coverage', 'data', 'dist', 'node_modules', 'outputs', 'test-report', 'tmp'])

const build = (codes: number[]): string => String.fromCharCode(...codes)

const PROTOTYPE_URL = build([104, 116, 116, 112, 115, 58, 47, 47, 112, 105, 120, 118, 101, 114, 115, 101, 45, 104, 97, 99, 107, 97, 116, 104, 111, 110, 46, 118, 101, 114, 99, 101, 108, 46, 97, 112, 112, 47, 115, 116, 111, 114, 121, 116, 114, 101, 101, 95, 99, 114, 101, 97, 116, 111, 114, 46, 104, 116, 109, 108])
const PROTOTYPE_COPY_LITERALS = [
  PROTOTYPE_URL,
  build([66, 114, 97, 110, 99, 104, 108, 121]),
  build([21095, 24773, 20849, 21019, 23431, 23449]),
  build([39318, 21457, 28909, 25773]),
  build([27491, 22312, 29983, 38271, 30340, 23431, 23449]),
  build([22905, 24403, 20247, 25749, 27585, 37027, 24352, 25903, 31080]),
]

const REFERENCE_INPUT_FORBIDDEN_LITERALS = [
  ...PROTOTYPE_COPY_LITERALS,
  build([80, 105, 120, 86, 101, 114, 115, 101]),
  build([112, 105, 120, 118, 101, 114, 115, 101, 45, 104, 97, 99, 107, 97, 116, 104, 111, 110]),
  build([115, 116, 111, 114, 121, 116, 114, 101, 101, 95, 99, 114, 101, 97, 116, 111, 114, 46, 104, 116, 109, 108]),
  build([83, 116, 97, 114, 114, 121, 121, 117, 55, 55]),
  build([80, 97, 112, 101, 114, 77, 111, 116, 105, 111, 110]),
  build([112, 97, 112, 101, 114, 109, 111, 116, 105, 111, 110]),
]

const STACK_DRIFT_FORBIDDEN_TERMS = [
  build([82, 101, 97, 99, 116, 32, 70, 108, 111, 119]),
  build([114, 101, 97, 99, 116, 102, 108, 111, 119]),
  build([64, 120, 121, 102, 108, 111, 119, 47, 114, 101, 97, 99, 116]),
  build([108, 105, 116, 101, 103, 114, 97, 112, 104]),
  build([83, 117, 112, 97, 98, 97, 115, 101]),
  build([64, 115, 117, 112, 97, 98, 97, 115, 101]),
  build([86, 101, 114, 99, 101, 108]),
  build([64, 118, 101, 114, 99, 101, 108]),
]

const normalizeInputPath = (raw: string): string => {
  const trimmed = String(raw || '').trim()
  return trimmed ? path.resolve(trimmed) : ''
}

const readConfiguredInputPath = (): string => normalizeInputPath(
  process.env.AGENTIC_OS_STRYTREE_DEMO_INPUT ||
  process.env.AGENTIC_OS_FORBID_HARDCODE_INPUT ||
  '',
)

const readVdeoxplnDemoInputPath = (): string => normalizeInputPath(
  process.env.AGENTIC_OS_VDEOXPLN_DEMO_INPUT ||
  '',
)

const walkFiles = (rootDir: string): string[] => {
  const out: string[] = []
  const stack = [rootDir]
  while (stack.length > 0) {
    const dir = stack.pop()!
    let entries: fs.Dirent[] = []
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) stack.push(full)
        continue
      }
      if (!entry.isFile()) continue
      if (!SOURCE_EXTENSIONS.has(path.extname(entry.name))) continue
      out.push(full)
    }
  }
  return out
}

const listRepoSourceFiles = (repoRoot: string): string[] => {
  const tracked = (() => {
    try {
      return execFileSync('git', ['ls-files'], { cwd: repoRoot, encoding: 'utf8' })
        .split(/\r?\n/)
        .map(file => file.trim())
        .filter(Boolean)
        .filter(file => SOURCE_EXTENSIONS.has(path.extname(file)))
        .map(file => path.join(repoRoot, file))
    } catch {
      return []
    }
  })()
  const seen = new Set(tracked.map(file => path.resolve(file)))
  const out = tracked.slice()
  for (const file of walkFiles(repoRoot)) {
    const resolved = path.resolve(file)
    if (seen.has(resolved)) continue
    seen.add(resolved)
    out.push(file)
  }
  return out
}

const readJsonFile = (file: string): Record<string, unknown> | null => {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null
  } catch {
    return null
  }
}

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const readDirectPackageDependencyNames = (repoRoot: string): string[] => {
  const packageFiles = [
    path.join(repoRoot, 'package.json'),
    path.join(repoRoot, 'canvas', 'package.json'),
    path.join(repoRoot, 'gympgrph', 'package.json'),
  ]
  const lockFiles = [
    path.join(repoRoot, 'package-lock.json'),
    path.join(repoRoot, 'canvas', 'package-lock.json'),
    path.join(repoRoot, 'gympgrph', 'package-lock.json'),
  ]
  const names = new Set<string>()
  const addDeps = (value: unknown): void => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return
    for (const name of Object.keys(value)) names.add(name)
  }
  for (const file of packageFiles) {
    const pkg = readJsonFile(file)
    if (!pkg) continue
    addDeps(pkg.dependencies)
    addDeps(pkg.devDependencies)
    addDeps(pkg.optionalDependencies)
  }
  for (const file of lockFiles) {
    const lock = readJsonFile(file)
    const rootPkg = lock?.packages && typeof lock.packages === 'object' && !Array.isArray(lock.packages)
      ? (lock.packages as Record<string, unknown>)['']
      : null
    if (!rootPkg || typeof rootPkg !== 'object' || Array.isArray(rootPkg)) continue
    const root = rootPkg as Record<string, unknown>
    addDeps(root.dependencies)
    addDeps(root.devDependencies)
    addDeps(root.optionalDependencies)
  }
  return [...names].sort()
}

const listStrytreeRuntimeFiles = (repoRoot: string): string[] => {
  const candidates = [
    path.join(repoRoot, 'canvas', 'src', 'features', 'strybldr'),
    path.join(repoRoot, 'canvas', 'src', 'components', 'StoryboardCanvas.tsx'),
    path.join(repoRoot, 'canvas', 'src', 'hooks', 'store', 'graph-data-slice', 'graphDataDocumentActions.ts'),
    path.join(repoRoot, 'cloudflare', 'workers', 'agentic-graph-payment', 'index.ts'),
    path.join(repoRoot, 'cloudflare', 'workers', 'agentic-graph-payment', 'strytreeApi.ts'),
    path.join(repoRoot, 'docs', 'documents', 'agentic-graph-strytree-prd-tad.md'),
  ]
  const out: string[] = []
  for (const candidate of candidates) {
    try {
      const st = fs.statSync(candidate)
      if (st.isDirectory()) {
        out.push(...walkFiles(candidate))
      } else if (st.isFile() && SOURCE_EXTENSIONS.has(path.extname(candidate))) {
        out.push(candidate)
      }
    } catch {
      void 0
    }
  }
  return out
    .filter(file => !file.includes(`${path.sep}__tests__${path.sep}`))
    .filter(file => !file.includes(`${path.sep}tests${path.sep}`))
}

const extractJsonFence = (text: string): Record<string, unknown> | null => {
  const match = /```json\s+strybldr-storyboard\s*\n([\s\S]*?)\n```/i.exec(text)
  if (!match?.[1]) return null
  try {
    const parsed = JSON.parse(match[1])
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null
  } catch {
    return null
  }
}

const addLiteral = (out: Set<string>, value: unknown): void => {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  if (text.length >= 8) out.add(text)
}

const readDemoForbiddenLiterals = (inputText: string): string[] => {
  const out = new Set<string>(PROTOTYPE_COPY_LITERALS)
  const prototypeUrl = /source_prototype_url:\s*"?([^"\n]+)"?/i.exec(inputText)?.[1] || ''
  addLiteral(out, prototypeUrl)
  const parsed = extractJsonFence(inputText)
  if (parsed) {
    addLiteral(out, parsed.runId)
    const storytree = parsed.storytree && typeof parsed.storytree === 'object' && !Array.isArray(parsed.storytree)
      ? parsed.storytree as Record<string, unknown>
      : null
    if (storytree) {
      addLiteral(out, storytree.storyId)
      addLiteral(out, storytree.title)
      const nodes = Array.isArray(storytree.nodes) ? storytree.nodes : []
      for (const node of nodes) {
        if (!node || typeof node !== 'object' || Array.isArray(node)) continue
        const rec = node as Record<string, unknown>
        addLiteral(out, rec.nodeId)
        addLiteral(out, rec.title)
        addLiteral(out, rec.synopsis)
        addLiteral(out, rec.prompt)
      }
      const candidateRuns = Array.isArray(storytree.candidateRuns) ? storytree.candidateRuns : []
      for (const run of candidateRuns) {
        if (!run || typeof run !== 'object' || Array.isArray(run)) continue
        const rec = run as Record<string, unknown>
        addLiteral(out, rec.candidateRunId)
        const candidates = Array.isArray(rec.candidates) ? rec.candidates : []
        for (const candidate of candidates) {
          if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue
          const candidateRec = candidate as Record<string, unknown>
          addLiteral(out, candidateRec.candidateId)
          addLiteral(out, candidateRec.title)
          addLiteral(out, candidateRec.synopsis)
          addLiteral(out, candidateRec.prompt)
          addLiteral(out, candidateRec.notes)
        }
      }
    }
    const explainerVideo = parsed.explainerVideo && typeof parsed.explainerVideo === 'object' && !Array.isArray(parsed.explainerVideo)
      ? parsed.explainerVideo as Record<string, unknown>
      : null
    if (explainerVideo) {
      addLiteral(out, explainerVideo.title)
      addLiteral(out, explainerVideo.summary)
      addLiteral(out, explainerVideo.transcriptMarkdown)
      addLiteral(out, explainerVideo.storyboardPrompt)
      addLiteral(out, explainerVideo.referenceImageUrl)
      addLiteral(out, explainerVideo.videoUrl)
      const panels = Array.isArray(explainerVideo.panels) ? explainerVideo.panels : []
      for (const panel of panels) {
        if (!panel || typeof panel !== 'object' || Array.isArray(panel)) continue
        const rec = panel as Record<string, unknown>
        addLiteral(out, rec.panelId)
        addLiteral(out, rec.title)
        addLiteral(out, rec.output)
        addLiteral(out, rec.outputSrcDoc)
        addLiteral(out, rec.imageUrl)
        addLiteral(out, rec.videoUrl)
        addLiteral(out, rec.summary)
        addLiteral(out, rec.prompt)
      }
    }
  }
  return [...out]
}

function assertCondition(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

const ensureInputAvoidsReferenceMentions = (inputText: string, label: string): void => {
  const lowerInput = inputText.toLowerCase()
  const matches = REFERENCE_INPUT_FORBIDDEN_LITERALS
    .filter(literal => literal && lowerInput.includes(literal.toLowerCase()))
  if (matches.length > 0) {
    throw new Error(`${label} contains forbidden reference mention(s): ${matches.join(', ')}`)
  }
}

const assertNoRepoCopyHardcodes = (args: {
  inputPath: string
  inputText: string
  label: string
}): void => {
  const forbidden = readDemoForbiddenLiterals(args.inputText)
  const self = fileURLToPath(import.meta.url)
  const repoRoot = path.resolve(path.dirname(self), '../../..')
  const matches: string[] = []
  for (const file of listRepoSourceFiles(repoRoot)) {
    const resolved = path.resolve(file)
    if (resolved === path.resolve(self)) continue
    if (resolved === path.resolve(args.inputPath)) continue
    let text = ''
    try {
      const stat = fs.statSync(file)
      if (stat.size > 2_000_000) continue
      text = fs.readFileSync(file, 'utf8')
    } catch {
      continue
    }
    const normalizedText = text.replace(/\s+/g, ' ')
    for (const literal of forbidden) {
      if (!literal || (!text.includes(literal) && !normalizedText.includes(literal))) continue
      matches.push(`${path.relative(repoRoot, file)} -> ${literal}`)
      break
    }
    if (matches.length >= 20) break
  }
  if (matches.length > 0) {
    throw new Error(`Forbidden ${args.label} copyhardcode found in: ${matches.join(', ')}`)
  }
}

export async function testForbidStrytreeDemoCopyHardcodes() {
  const inputPath = readConfiguredInputPath()
  if (!inputPath) return
  const inputText = fs.readFileSync(inputPath, 'utf8')
  if (inputText.includes(PROTOTYPE_URL)) {
    throw new Error('Forbidden Strytree prototype URL found in external validation input')
  }
  assertNoRepoCopyHardcodes({ inputPath, inputText, label: 'Strytree demo/prototype' })
}

export async function testStrytreeDemoInputRendersForkCompareCanvas() {
  const inputPath = readConfiguredInputPath()
  if (!inputPath) return
  const inputText = fs.readFileSync(inputPath, 'utf8')
  const parsedFence = extractJsonFence(inputText)
  assertCondition(parsedFence, 'expected Strytree demo to include a parseable strybldr-storyboard JSON fence')
  const storytree = parsedFence.storytree && typeof parsedFence.storytree === 'object' && !Array.isArray(parsedFence.storytree)
    ? parsedFence.storytree as Record<string, unknown>
    : null
  const storyNodes = Array.isArray(storytree?.nodes) ? storytree.nodes : []
  const candidateRuns = Array.isArray(storytree?.candidateRuns) ? storytree.candidateRuns : []
  assertCondition(storyNodes.length >= 6, `expected runnable Strytree story branches, got ${storyNodes.length}`)
  assertCondition(candidateRuns.length >= 1, 'expected ForkCompare candidate run in validation input')
  const firstRun = candidateRuns.find(run => run && typeof run === 'object' && !Array.isArray(run)) as Record<string, unknown> | undefined
  const candidates = Array.isArray(firstRun?.candidates) ? firstRun.candidates : []
  assertCondition(candidates.length > 0 && candidates.length <= 3, `expected bounded candidate fan-out of 1..3, got ${candidates.length}`)
  for (const candidate of candidates) {
    assertCondition(candidate && typeof candidate === 'object' && !Array.isArray(candidate), 'expected candidate scorecard object')
    const rec = candidate as Record<string, unknown>
    for (const field of ['provider', 'creditCost', 'elapsedMs', 'fallbackStatus', 'moderationStatus', 'inheritedAssetCount', 'continuityScore', 'publishEligible']) {
      assertCondition(rec[field] !== undefined && rec[field] !== null, `expected candidate scorecard field ${field}`)
    }
  }

  const parsed = await loadGraphDataFromTextViaParser(path.basename(inputPath), inputText, { applyToStore: false })
  assertCondition(parsed?.parserId === 'strybldr-storyboard', `expected strybldr parser, got ${parsed?.parserId}`)
  const graph = parsed.graphData
  assertCondition(graph, 'expected parsed graph data')
  const graphNodes = Array.isArray(graph.nodes) ? graph.nodes : []
  const graphEdges = Array.isArray(graph.edges) ? graph.edges : []
  const candidateNodes = graphNodes.filter(node => String(node.type || '') === 'StorytreeCandidate')
  assertCondition(candidateNodes.length === candidates.length, `expected candidate graph cards, got ${candidateNodes.length}`)
  assertCondition(graphEdges.filter(edge => edge.label === 'candidateOption').length === candidates.length, 'expected visible candidate option edges')
  assertCondition(candidateNodes.every(node => node.properties?.privateCandidate === true), 'expected candidates to stay private until published')

  const board = buildStoryboardBoardModel({ graphData: graph, graphRevision: 1 })
  const forkCompareLane = board.lanes.find(lane => lane.id === 'ForkCompare')
  assertCondition(forkCompareLane && forkCompareLane.cards.length >= candidates.length, 'expected ForkCompare lane cards on the Strybldr canvas')
  const handoff = buildStrybldrVideoHandoffFromGraphData(graph)
  assertCondition(handoff.cards.some(card => card.lane === 'ForkCompare'), 'expected Run all handoff to include ForkCompare cards')
}

export function testStrytreeForkCompareCloudflareNativeStackGuard() {
  const self = fileURLToPath(import.meta.url)
  const repoRoot = path.resolve(path.dirname(self), '../../..')
  const forbiddenDependencyMatches = readDirectPackageDependencyNames(repoRoot)
    .filter(name => STACK_DRIFT_FORBIDDEN_TERMS.some(term => name.toLowerCase().includes(term.toLowerCase())))
  assertCondition(
    forbiddenDependencyMatches.length === 0,
    `Strytree ForkCompare stack guard found forbidden direct dependency names: ${forbiddenDependencyMatches.join(', ')}`,
  )

  const runtimeMatches: string[] = []
  const terms = STACK_DRIFT_FORBIDDEN_TERMS.map(term => ({ term, re: new RegExp(escapeRegex(term), 'i') }))
  for (const file of listStrytreeRuntimeFiles(repoRoot)) {
    let text = ''
    try {
      const stat = fs.statSync(file)
      if (stat.size > 2_000_000) continue
      text = fs.readFileSync(file, 'utf8')
    } catch {
      continue
    }
    const match = terms.find(term => term.re.test(text))
    if (match) runtimeMatches.push(`${path.relative(repoRoot, file)} -> ${match.term}`)
    if (runtimeMatches.length >= 20) break
  }
  assertCondition(
    runtimeMatches.length === 0,
    `Strytree ForkCompare stack guard found forbidden runtime/docs references: ${runtimeMatches.join(', ')}`,
  )
}

export async function testForbidVdeoxplnDemoCopyHardcodes() {
  const inputPath = readVdeoxplnDemoInputPath()
  if (!inputPath) return
  const inputText = fs.readFileSync(inputPath, 'utf8')
  ensureInputAvoidsReferenceMentions(inputText, 'Vdeoxpln demo validation input')
  assertNoRepoCopyHardcodes({ inputPath, inputText, label: 'vdeoxpln demo' })
}

export async function testVdeoxplnDemoInputRendersInteractiveVisualExplanation() {
  const inputPath = readVdeoxplnDemoInputPath()
  if (!inputPath) return
  const inputText = fs.readFileSync(inputPath, 'utf8')
  ensureInputAvoidsReferenceMentions(inputText, 'Vdeoxpln demo validation input')
  assertCondition(/\bkgStrybldrStoryboard:\s*true\b/.test(inputText), 'expected vdeoxpln demo to opt into the Strybldr storyboard renderer')
  assertCondition(/\bkgCanvasSurfaceMode:\s*"xr"/.test(inputText), 'expected vdeoxpln demo to request XR surface mode')
  assertCondition(/\bkgCanvasRenderMode:\s*"3d"/.test(inputText), 'expected vdeoxpln demo to request 3D render mode')
  assertCondition(/\bkgCanvas3dMode:\s*"xr"/.test(inputText), 'expected vdeoxpln demo to request XR canvas mode')
  const parsedFence = extractJsonFence(inputText)
  assertCondition(parsedFence, 'expected vdeoxpln demo to include a parseable strybldr-storyboard JSON fence')

  const sources = Array.isArray(parsedFence.sources) ? parsedFence.sources : []
  const elements = Array.isArray(parsedFence.elements) ? parsedFence.elements : []
  const explainerVideo = parsedFence.explainerVideo && typeof parsedFence.explainerVideo === 'object' && !Array.isArray(parsedFence.explainerVideo)
    ? parsedFence.explainerVideo as Record<string, unknown>
    : null
  const explainerPanels = Array.isArray(explainerVideo?.panels) ? explainerVideo.panels : []
  const explainerTabs = new Set(explainerPanels
    .filter(panel => panel && typeof panel === 'object' && !Array.isArray(panel))
    .map(panel => String((panel as Record<string, unknown>).activeTab || '')))
  const storytree = parsedFence.storytree && typeof parsedFence.storytree === 'object' && !Array.isArray(parsedFence.storytree)
    ? parsedFence.storytree as Record<string, unknown>
    : null
  const storyNodes = Array.isArray(storytree?.nodes) ? storytree.nodes : []
  assertCondition(sources.length >= 3, `expected source-backed owner cards, got ${sources.length}`)
  assertCondition(elements.length >= 5, `expected visual explanation elements, got ${elements.length}`)
  assertCondition(explainerVideo, 'expected text-artifact-to-explainer-video payload')
  assertCondition(String(explainerVideo.mode || '') === 'xr', `expected explainer video XR mode, got ${String(explainerVideo.mode || '')}`)
  for (const requiredTab of ['text', 'image', 'video']) {
    assertCondition(explainerTabs.has(requiredTab), `expected explainer video to include a ${requiredTab} Rich Media Panel`)
  }
  assertCondition(storyNodes.length >= 8, `expected an interactive tree with multiple branches, got ${storyNodes.length}`)
  assertCondition(storyNodes.some(node => node && typeof node === 'object' && (node as Record<string, unknown>).status === 'dropped'), 'expected an audit-only declined branch')
  assertCondition(storyNodes.some(node => node && typeof node === 'object' && (node as Record<string, unknown>).status === 'draft'), 'expected a gated draft branch')
  assertCondition(storyNodes.some(node => node && typeof node === 'object' && (node as Record<string, unknown>).isProtected === true), 'expected protected branch state for credit-aware inspection')

  const parsed = await loadGraphDataFromTextViaParser(path.basename(inputPath), inputText, { applyToStore: false })
  assertCondition(parsed?.parserId === 'strybldr-storyboard', `expected strybldr parser, got ${parsed?.parserId}`)
  const graph = parsed.graphData
  assertCondition(graph, 'expected parsed graph data')
  const graphMetadata = (graph.metadata as Record<string, unknown>) || {}
  assertCondition(String(graphMetadata.kgCanvasSurfaceMode || '') === 'xr', `expected XR surface metadata, got ${String(graphMetadata.kgCanvasSurfaceMode || '')}`)
  assertCondition(String(graphMetadata.kgCanvasRenderMode || '') === '3d', `expected 3D render metadata, got ${String(graphMetadata.kgCanvasRenderMode || '')}`)
  assertCondition(String(graphMetadata.kgCanvas3dMode || '') === 'xr', `expected XR canvas metadata, got ${String(graphMetadata.kgCanvas3dMode || '')}`)
  assertCondition(graphMetadata.textArtifactToExplainerVideo === true, 'expected graph metadata to mark text-artifact-to-explainer-video support')
  assertCondition(Number(graphMetadata.explainerVideoPanelsCount || 0) >= 3, 'expected parsed explainer-video panel count metadata')
  assertCondition(String((graph.metadata as Record<string, unknown>)?.graphSemanticKey || '').length > 0, 'expected shared graph semantic key metadata')

  const graphNodes = Array.isArray(graph.nodes) ? graph.nodes : []
  const graphEdges = Array.isArray(graph.edges) ? graph.edges : []
  const storytreeGraphNodes = graphNodes.filter(node => String(node.type || '') === 'StorytreeNode')
  const richMediaPanelNodes = graphNodes.filter(node => String(node.type || '') === 'RichMediaPanel')
  const richMediaPanelTabs = new Set(richMediaPanelNodes.map(node => String(node.properties?.richMediaActiveTab || '')))
  assertCondition(graphNodes.some(node => String(node.type || '') === 'ExplainerVideoSnapshot'), 'expected explainer-video overview node')
  assertCondition(richMediaPanelNodes.length >= 3, `expected Rich Media Panel nodes for text, image, and video, got ${richMediaPanelNodes.length}`)
  for (const requiredTab of ['text', 'image', 'video']) {
    assertCondition(richMediaPanelTabs.has(requiredTab), `expected graph Rich Media Panel tab ${requiredTab}`)
  }
  for (const node of richMediaPanelNodes) {
    const tab = String(node.properties?.richMediaActiveTab || '')
    const panel = buildRichMediaPanelOverlayState({ node })
    const preview = buildRichMediaPanelPreviewSpec({ node, panel })
    const mediaSpec = getNodeMediaSpec(node)
    assertCondition(panel, `expected Rich Media Panel overlay state for ${tab}`)
    assertCondition(preview, `expected Rich Media Panel preview spec for ${tab}`)
    assertCondition(mediaSpec, `expected Rich Media Panel media spec for ${tab}`)
    if (tab === 'text') {
      assertCondition(panel.hasText, 'expected text Rich Media Panel to expose text content')
      assertCondition(preview.kind === 'iframe' && String(preview.srcDoc || '').length > 0, 'expected text Rich Media Panel to render inspectable iframe srcDoc')
      assertCondition(mediaSpec.kind === 'iframe' && String(mediaSpec.srcDoc || '').length > 0, 'expected text media spec to use iframe srcDoc')
    } else if (tab === 'image') {
      assertCondition(panel.hasImage, 'expected image Rich Media Panel to expose image content')
      assertCondition(preview.kind === 'image' && String(preview.url || '').length > 0, 'expected image Rich Media Panel preview URL')
      assertCondition(mediaSpec.kind === 'image' && String(mediaSpec.url || '').length > 0, 'expected image media spec URL')
    } else if (tab === 'video') {
      assertCondition(panel.hasVideo, 'expected video Rich Media Panel to expose video content')
      assertCondition(preview.kind === 'video' && String(preview.url || '').length > 0, 'expected video Rich Media Panel preview URL')
      assertCondition(mediaSpec.kind === 'video' && String(mediaSpec.url || '').length > 0, 'expected video media spec URL')
    }
  }
  assertCondition(graphNodes.some(node => String(node.type || '') === 'StorytreeSnapshot'), 'expected storytree overview node')
  assertCondition(storytreeGraphNodes.length >= storyNodes.length, 'expected each input branch to become an inspectable graph node')
  assertCondition(graphEdges.filter(edge => edge.label === 'parent_node_id').length >= storyNodes.length - 2, 'expected parent-derived tree edges')
  assertCondition(storytreeGraphNodes.some(node => String(node.properties?.accessState || '').includes('unlock')), 'expected protected branches to expose access state')
  assertCondition(storytreeGraphNodes.some(node => Array.isArray(node.properties?.inheritedAssetIds) && node.properties.inheritedAssetIds.length > 0), 'expected branch nodes to inherit parent assets')

  const board = buildStoryboardBoardModel({ graphData: graph, graphRevision: 1 })
  const laneIds = new Set(board.lanes.map(lane => lane.id))
  for (const requiredLane of ['Source', 'Storyboard', 'Elements', 'Storytree', 'Explainer Video']) {
    assertCondition(laneIds.has(requiredLane), `expected Strybldr board to expose ${requiredLane} lane`)
  }
  assertCondition(board.totalCards >= sources.length + elements.length + storyNodes.length + explainerPanels.length, `expected visual cards for sources, elements, tree branches, and explainer panels, got ${board.totalCards}`)

  const handoff = buildStrybldrVideoHandoffFromGraphData(graph)
  assertCondition(handoff.cards.some(card => card.lane === 'Storytree'), 'expected Run all handoff to include storytree cards')
  assertCondition(handoff.cards.filter(card => card.lane === 'Explainer Video').length >= explainerPanels.length, 'expected Run all handoff to include explainer-video Rich Media Panel cards')
  assertCondition(String(handoff.renderVideoUrl || '').length > 0, 'expected Run all handoff to expose the explainer video URL for review')
  assertCondition(handoff.prompt.includes('approved Strybldr storyboard cards'), 'expected handoff to reuse the shared Strybldr prompt contract')

  const routePlan = buildAgenticGraphVdeoxplnRoutingPlan({
    intentText: 'Create an inspectable dynamic scene explainer from source evidence with exact layers, storyboard output, and reviewable visual artifacts.',
    contentTypes: ['workspace document markdown', 'source evidence'],
    requestedOutputs: ['storyboard', 'renderer-neutral scene plan', 'validated AGENTIC_OS Markdown'],
    stateSignals: ['Source Files', 'Storyboard', 'FloatingPanel Chat', 'Canvas apply'],
    sourceFileCount: sources.length,
    hasGraphData: true,
    hasWorkspaceDocument: true,
  })
  assertCondition(
    routePlan.status === 'selected' && routePlan.selectedVdeoxplnId === AGENTIC_OS_VDEOXPLN_IDS.researchVisual,
    `expected neutral visual-explainer routing to select ${AGENTIC_OS_VDEOXPLN_IDS.researchVisual}, got ${routePlan.selectedVdeoxplnId || routePlan.status}`,
  )
}
