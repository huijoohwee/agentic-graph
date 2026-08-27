import type { GraphNode } from '@/lib/graph/types'
import type { FlowConnectedValuesBySchemaPath } from '@/lib/storyboardWidget/flowDataflow'
import { unwrapGraphCellValue } from '@/lib/graph/nodeProperties'
import {
  readImageDerivedInlineInvocationTokens,
  resolveImageToThreeJsSourceKind,
  resolveImageToThreeJsSourceUrl,
  type ImageToThreeJsSourceKind,
} from '@/features/image-to-threejs/imageToThreeJsContract'
import { hashStringToHex } from '@/lib/hash/stringHash'

export const IMAGE_TO_GLB_SCHEMA = 'agenticgraph-image-to-glb/v1' as const
export const IMAGE_TO_GLB_COMMAND_TOKEN = '/image.to-glb' as const
export const IMAGE_TO_GLB_BINDING_TOKEN = '@image-to-glb' as const
export const IMAGE_TO_GLB_SEMANTIC_TOKEN = '#image-to-glb' as const
export const IMAGE_TO_GLB_OUTPUT_PANEL_PROPERTY = 'imageGlbOutputPanel' as const
export const IMAGE_TO_GLB_OUTPUT_PANEL_ANCHOR_ID_PROPERTY = 'imageGlbOutputAnchorNodeId' as const
export const IMAGE_TO_GLB_OUTPUT_PANEL_LABEL = 'GLB Rich Media Panel' as const

export type ImageToGlbRunInvocation = 'inline-command'
export type ImageToGlbRunInput = {
  invocation: ImageToGlbRunInvocation
  invocationTokens: readonly string[]
  sourceUrl: string
}

export type ImageToGlbProceduralLanguage = 'javascript' | 'typescript'
export type ImageToGlbVisionReviewStage = 'reference-analysis' | 'procedural-geometry' | 'scene-edit' | 'artifact-review'
export type ImageToGlbVisionReviewVerdict = 'revise' | 'validated' | 'approved' | 'rejected'
export type ImageToGlbVisionReviewerKind = 'native-deterministic' | 'independent-provider'

export type ImageToGlbProceduralProgram = {
  language: ImageToGlbProceduralLanguage
  entrypoint: string
  source: string
}

export type ImageToGlbVisionReviewPass = {
  iteration: number
  stage: ImageToGlbVisionReviewStage
  verdict: ImageToGlbVisionReviewVerdict
  reviewer: {
    evidenceDigest: string
    kind: ImageToGlbVisionReviewerKind
  }
  observations: readonly string[]
  evidence: {
    expectedParts: readonly string[]
    foundParts: readonly string[]
    programDigest: string
    projectionDigest: string
    referenceDigest: string
    reviewedViews: readonly string[]
    silhouetteScore: number
    unresolvedIssues: readonly string[]
  }
}

export type ImageToGlbPartManifestEntry = {
  name: string
  primitive: string
  role: string
}

export type ImageToGlbProceduralJob = {
  schema: typeof IMAGE_TO_GLB_SCHEMA
  source: {
    url: string
    kind: ImageToThreeJsSourceKind
  }
  partManifest: readonly ImageToGlbPartManifestEntry[]
  program: ImageToGlbProceduralProgram
  programDigest: string
  referenceDigest: string
  visionReviewPasses: readonly ImageToGlbVisionReviewPass[]
}

export type ImageToGlbContractViolationCode =
  | 'invalid-schema'
  | 'missing-source'
  | 'unsupported-source'
  | 'source-kind-mismatch'
  | 'missing-program'
  | 'invalid-program-language'
  | 'invalid-entrypoint'
  | 'missing-procedural-construction'
  | 'missing-procedural-mesh'
  | 'serialized-or-baked-geometry'
  | 'external-runtime-dependency'
  | 'missing-vision-review'
  | 'invalid-vision-review-order'
  | 'invalid-vision-review-evidence'
  | 'unapproved-vision-review'
  | 'missing-part-manifest'
  | 'program-digest-mismatch'

export type ImageToGlbContractViolation = {
  code: ImageToGlbContractViolationCode
  message: string
}

export type ImageToGlbProceduralValidation = {
  valid: boolean
  violations: readonly ImageToGlbContractViolation[]
}

const PROCEDURAL_GEOMETRY_PATTERNS = [
  /\bnew\s+(?:THREE\.)?(?:BoxGeometry|CapsuleGeometry|CircleGeometry|ConeGeometry|CylinderGeometry|DodecahedronGeometry|ExtrudeGeometry|IcosahedronGeometry|LatheGeometry|PlaneGeometry|RingGeometry|ShapeGeometry|SphereGeometry|TorusGeometry|TubeGeometry)\s*\(/,
  /\bnew\s+(?:THREE\.)?BufferGeometry\s*\(\s*\)[\s\S]{0,800}?\.\s*(?:setFromPoints|setAttribute|setIndex)\s*\(/,
  /\bnew\s+(?:THREE\.)?ParametricGeometry\s*\(/,
  /\b(?:csg|CSG)[\w.]*\.\s*(?:union|subtract|intersect)\s*\(/,
] as const

const BAKED_GEOMETRY_PATTERNS = [
  /\b(?:JSON\.parse|\.fromJSON|ObjectLoader|BufferGeometryLoader|GLTFLoader|GLTFExporter|parseGeometry|toJSON)\b/,
  /\b(?:asset|accessors|bufferViews|buffers|meshes|nodes|scenes)\s*:/,
  /\bnew\s+(?:Uint8|Uint16|Uint32|Int8|Int16|Int32|Float32|Float64)Array\s*\(\s*\[/,
  /\b(?:ArrayBuffer|DataView)\s*\(/,
  /\b(?:atob|btoa)\s*\(|\bbase64\b|data:/i,
] as const

const EXTERNAL_RUNTIME_PATTERNS = [
  /\b(?:fetch|XMLHttpRequest|WebSocket|eval|require)\s*\(/,
  /\bnew\s+Function\s*\(/,
  /\bimport\s*\(/,
] as const

const IMAGE_TO_GLB_INVOCATION_TOKEN_SET = new Set<string>([
  IMAGE_TO_GLB_COMMAND_TOKEN,
  IMAGE_TO_GLB_BINDING_TOKEN,
  IMAGE_TO_GLB_SEMANTIC_TOKEN,
])

function cleanString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function readOutputPanelBoolean(value: unknown): boolean {
  const scalar = unwrapGraphCellValue(value)
  return scalar === true || cleanString(scalar).toLowerCase() === 'true'
}

export function isImageToGlbOutputPanel(properties: unknown): boolean {
  if (!properties || typeof properties !== 'object' || Array.isArray(properties)) return false
  const record = properties as Record<string, unknown>
  const nested = record.properties
  return readOutputPanelBoolean(record[IMAGE_TO_GLB_OUTPUT_PANEL_PROPERTY])
    || (nested != null && typeof nested === 'object' && !Array.isArray(nested)
      && readOutputPanelBoolean((nested as Record<string, unknown>)[IMAGE_TO_GLB_OUTPUT_PANEL_PROPERTY]))
}

/**
 * `/`, `@`, and `#` all identify this shared preset. The canonical editor
 * inserts the full triad, but an individual token remains executable so cards
 * and widgets do not silently lose a user-authored invocation.
 */
export function resolveImageToGlbRunInput(args: {
  node: Pick<GraphNode, 'properties'>
  connectedValuesBySchemaPath?: FlowConnectedValuesBySchemaPath
}): ImageToGlbRunInput | null {
  const invocationTokens = readImageDerivedInlineInvocationTokens(args.node.properties)
    .filter(token => IMAGE_TO_GLB_INVOCATION_TOKEN_SET.has(token))
  if (invocationTokens.length === 0) return null
  return {
    invocation: 'inline-command',
    invocationTokens,
    sourceUrl: resolveImageToThreeJsSourceUrl(args),
  }
}

function stripCommentsAndStrings(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n\r]*/g, ' ')
    .replace(/(['"`])(?:\\[\s\S]|(?!\1)[^\\])*\1/g, ' ')
}

function readStaticModuleSpecifiers(source: string): string[] {
  const modules: string[] = []
  const expression = /\bimport\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g
  for (const match of source.matchAll(expression)) {
    const specifier = cleanString(match[1])
    if (specifier) modules.push(specifier)
  }
  return modules
}

function hasProceduralGeometryConstruction(source: string): boolean {
  return PROCEDURAL_GEOMETRY_PATTERNS.some(pattern => pattern.test(source))
}

function hasProceduralMeshConstruction(source: string): boolean {
  return /\bnew\s+(?:THREE\.)?Mesh\s*\(/.test(source)
}

function sourceUsesForbiddenBakedGeometry(source: string): boolean {
  const executableSource = stripCommentsAndStrings(source)
  return BAKED_GEOMETRY_PATTERNS.some(pattern => pattern.test(executableSource))
    || /\bbase64\b|data:/i.test(source)
}

function sourceUsesExternalRuntimeDependency(source: string): boolean {
  const executableSource = stripCommentsAndStrings(source)
  if (EXTERNAL_RUNTIME_PATTERNS.some(pattern => pattern.test(executableSource))) return true
  return readStaticModuleSpecifiers(source).some(specifier => (
    specifier !== 'three' && !specifier.startsWith('three/examples/jsm/')
  ))
}

function validEntrypoint(value: string): boolean {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(value)
}

function validReviewStage(value: unknown): value is ImageToGlbVisionReviewStage {
  return value === 'reference-analysis'
    || value === 'procedural-geometry'
    || value === 'scene-edit'
    || value === 'artifact-review'
}

function validReviewVerdict(value: unknown): value is ImageToGlbVisionReviewVerdict {
  return value === 'revise' || value === 'validated' || value === 'approved' || value === 'rejected'
}

function validReviewerKind(value: unknown): value is ImageToGlbVisionReviewerKind {
  return value === 'native-deterministic' || value === 'independent-provider'
}

/**
 * The program is a reviewable artifact, never a payload that this module runs.
 * The renderer receives a native Three.js Object3D constructed by trusted code.
 */
export function validateImageToGlbProceduralProgram(program: ImageToGlbProceduralProgram | null | undefined): ImageToGlbProceduralValidation {
  const violations: ImageToGlbContractViolation[] = []
  const source = cleanString(program?.source)
  const entrypoint = cleanString(program?.entrypoint)
  if (!source) {
    violations.push({ code: 'missing-program', message: 'Image to GLB requires reviewable procedural JavaScript or TypeScript source.' })
    return { valid: false, violations }
  }
  if (program?.language !== 'javascript' && program?.language !== 'typescript') {
    violations.push({ code: 'invalid-program-language', message: 'Procedural source must be JavaScript or TypeScript.' })
  }
  if (!validEntrypoint(entrypoint)) {
    violations.push({ code: 'invalid-entrypoint', message: 'The procedural program needs a JavaScript identifier entrypoint.' })
  }
  if (/^\s*[\[{]/.test(source) || sourceUsesForbiddenBakedGeometry(source)) {
    violations.push({
      code: 'serialized-or-baked-geometry',
      message: 'Serialized glTF/JSON, embedded binary payloads, and baked typed-array literals are not accepted.',
    })
  }
  if (sourceUsesExternalRuntimeDependency(source)) {
    violations.push({
      code: 'external-runtime-dependency',
      message: 'Procedural source may use only the in-repo Three.js runtime; providers, network calls, and extra modules are forbidden.',
    })
  }
  const executableSource = stripCommentsAndStrings(source)
  if (!hasProceduralGeometryConstruction(executableSource)) {
    violations.push({
      code: 'missing-procedural-construction',
      message: 'Procedural source must construct geometry with approved Three.js constructors, BufferGeometry points/attributes, CSG, or a parametric surface.',
    })
  }
  if (!hasProceduralMeshConstruction(executableSource)) {
    violations.push({
      code: 'missing-procedural-mesh',
      message: 'Procedural source must attach its constructed geometry to a Three.js Mesh.',
    })
  }
  return { valid: violations.length === 0, violations }
}

export function validateImageToGlbVisionReviewPasses(passes: readonly ImageToGlbVisionReviewPass[] | null | undefined): ImageToGlbProceduralValidation {
  const violations: ImageToGlbContractViolation[] = []
  if (!Array.isArray(passes) || passes.length === 0) {
    return {
      valid: false,
      violations: [{ code: 'missing-vision-review', message: 'Image to GLB requires at least one structured vision-review pass.' }],
    }
  }
  let expectedIteration = 1
  for (const pass of passes) {
    if (
      !pass
      || pass.iteration !== expectedIteration
      || !validReviewStage(pass.stage)
      || !validReviewVerdict(pass.verdict)
      || !validReviewerKind(pass.reviewer?.kind)
      || !cleanString(pass.reviewer?.evidenceDigest)
      || !Array.isArray(pass.observations)
      || pass.observations.every(observation => !cleanString(observation))
    ) {
      violations.push({
        code: 'invalid-vision-review-order',
        message: 'Vision-review passes must be sequential and contain a stage, verdict, and observation.',
      })
      break
    }
    const evidence = pass.evidence
    if (
      !evidence
      || !cleanString(evidence.referenceDigest)
      || !cleanString(evidence.programDigest)
      || !cleanString(evidence.projectionDigest)
      || !Array.isArray(evidence.reviewedViews)
      || evidence.reviewedViews.length === 0
      || !Array.isArray(evidence.expectedParts)
      || evidence.expectedParts.length === 0
      || !Array.isArray(evidence.foundParts)
      || evidence.foundParts.length === 0
      || !Number.isFinite(evidence.silhouetteScore)
      || evidence.silhouetteScore < 0
      || evidence.silhouetteScore > 1
      || !Array.isArray(evidence.unresolvedIssues)
    ) {
      violations.push({
        code: 'invalid-vision-review-evidence',
        message: 'Each vision-review pass must cite the exact reference, program, projection, reviewed views, parts, and silhouette score.',
      })
      break
    }
    if (
      (pass.verdict === 'validated' && pass.reviewer.kind !== 'native-deterministic')
      || (pass.verdict === 'approved' && pass.reviewer.kind !== 'independent-provider')
      || (pass.reviewer.kind === 'native-deterministic' && pass.reviewer.evidenceDigest !== evidence.projectionDigest)
    ) {
      violations.push({
        code: 'invalid-vision-review-evidence',
        message: 'Validated passes require projection-bound native evidence; approved passes require a distinct independent-provider receipt.',
      })
      break
    }
    expectedIteration += 1
  }
  const finalPass = passes[passes.length - 1]
  if (!finalPass || (finalPass.verdict !== 'validated' && finalPass.verdict !== 'approved')) {
    violations.push({
      code: 'unapproved-vision-review',
      message: 'The final review pass must deterministically validate or independently approve the procedural scene before export.',
    })
  } else if (
    finalPass.evidence.silhouetteScore < 0.55
    || finalPass.evidence.unresolvedIssues.length > 0
    || finalPass.evidence.expectedParts.some(part => !finalPass.evidence.foundParts.includes(part))
  ) {
    violations.push({
      code: 'invalid-vision-review-evidence',
      message: 'Final approval requires adequate silhouette fidelity, complete named-part coverage, and no unresolved issues.',
    })
  }
  return { valid: violations.length === 0, violations }
}

export function validateImageToGlbProceduralJob(job: ImageToGlbProceduralJob | null | undefined): ImageToGlbProceduralValidation {
  const violations: ImageToGlbContractViolation[] = []
  if (job?.schema !== IMAGE_TO_GLB_SCHEMA) {
    violations.push({ code: 'invalid-schema', message: 'Image to GLB jobs must use the native procedural v1 schema.' })
  }
  const sourceUrl = cleanString(job?.source?.url)
  const resolvedKind = resolveImageToThreeJsSourceKind(sourceUrl)
  if (!sourceUrl) {
    violations.push({ code: 'missing-source', message: 'Image to GLB requires a PNG, JPG, or SVG reference image.' })
  } else if (!resolvedKind) {
    violations.push({ code: 'unsupported-source', message: 'Image to GLB supports only PNG, JPG, JPEG, and SVG reference images.' })
  } else if (job?.source?.kind !== resolvedKind) {
    violations.push({ code: 'source-kind-mismatch', message: 'The procedural job source kind must match the shared image-to-threejs resolver.' })
  }
  const program = validateImageToGlbProceduralProgram(job?.program)
  const review = validateImageToGlbVisionReviewPasses(job?.visionReviewPasses)
  violations.push(...program.violations, ...review.violations)
  const expectedProgramDigest = job?.program?.source ? hashStringToHex(job.program.source) : ''
  if (!cleanString(job?.programDigest) || job?.programDigest !== expectedProgramDigest) {
    violations.push({ code: 'program-digest-mismatch', message: 'The job program digest must identify the exact reviewable procedural source.' })
  }
  if (!Array.isArray(job?.partManifest) || job.partManifest.length < 1) {
    violations.push({ code: 'missing-part-manifest', message: 'A reviewed procedural job requires at least one named scene part.' })
  }
  if (
    cleanString(job?.referenceDigest)
    && Array.isArray(job?.visionReviewPasses)
    && job.visionReviewPasses.some(pass => (
      pass.evidence?.referenceDigest !== job.referenceDigest
      || pass.evidence?.programDigest !== job.programDigest
    ))
  ) {
    violations.push({ code: 'invalid-vision-review-evidence', message: 'Review evidence must identify the exact reference and procedural program exported by the job.' })
  }
  return { valid: violations.length === 0, violations }
}

export function createImageToGlbProceduralJob(args: {
  sourceUrl: string
  partManifest: readonly ImageToGlbPartManifestEntry[]
  program: ImageToGlbProceduralProgram
  programDigest: string
  referenceDigest: string
  visionReviewPasses: readonly ImageToGlbVisionReviewPass[]
}): ImageToGlbProceduralJob {
  const sourceUrl = cleanString(args.sourceUrl)
  const sourceKind = resolveImageToThreeJsSourceKind(sourceUrl)
  if (!sourceKind) throw new Error('Image to GLB requires a PNG, JPG, JPEG, or SVG source URL.')
  return {
    schema: IMAGE_TO_GLB_SCHEMA,
    source: { url: sourceUrl, kind: sourceKind },
    partManifest: args.partManifest,
    program: args.program,
    programDigest: cleanString(args.programDigest),
    referenceDigest: cleanString(args.referenceDigest),
    visionReviewPasses: args.visionReviewPasses,
  }
}
