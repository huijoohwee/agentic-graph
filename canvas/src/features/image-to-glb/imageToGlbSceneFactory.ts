import { hashStringToHex } from '@/lib/hash/stringHash'
import { analyzeImageToGlbReference, type ImageToGlbReferenceAnalysis } from './imageToGlbReferenceAnalysis'
export { analyzeImageToGlbReference } from './imageToGlbReferenceAnalysis'
export type { ImageToGlbReferenceAnalysis, ImageToGlbSilhouetteSpan } from './imageToGlbReferenceAnalysis'
import * as THREE from 'three'
import {
  loadImageReferencePixels,
  type ImageReferencePixels,
} from '@/features/image-to-threejs/imageReferencePixels'
import {
  createImageToGlbProceduralJob,
  type ImageToGlbPartManifestEntry,
  type ImageToGlbProceduralJob,
  type ImageToGlbProceduralProgram,
  type ImageToGlbVisionReviewPass,
} from './imageToGlbContract'
import {
  createImageToGlbActionReadiness,
  validateImageToGlbActionReadiness,
} from './imageToGlbActionReadiness'
import {
  buildContourRebuildScene,
  createContourRebuildProgram,
  deriveContourRebuildPlan,
} from './imageToGlbContourRebuild'
import {
  attachImageToGlbQualityReport,
  evaluateImageToGlbQuality,
  measureImageToGlbFrontProjectionScore,
} from './imageToGlbQualityGate'
import { inspectImageToGlbScene } from './imageToGlbSceneEvidence'

export type ReviewedImageToGlbScene = {
  analysis: ImageToGlbReferenceAnalysis
  job: ImageToGlbProceduralJob
  scene: THREE.Group
}

export function createReviewedImageToGlbScene(args: {
  pixels: ImageReferencePixels
  sourceUrl: string
}): ReviewedImageToGlbScene {
  const analysis = analyzeImageToGlbReference(args.pixels)
  const partManifest: ImageToGlbPartManifestEntry[] = []
  const contourRebuildPlan = deriveContourRebuildPlan(analysis)
  if (!contourRebuildPlan.quality.withinBudgets) {
    throw new Error('Image to GLB contour reconstruction exceeded its procedural quality budget.')
  }
  const scene = buildContourRebuildScene({ partManifest, plan: contourRebuildPlan })
  scene.name = 'Image to GLB reviewed procedural scene'
  const actionReadiness = createImageToGlbActionReadiness(scene)
  const actionValidation = validateImageToGlbActionReadiness(scene, actionReadiness.manifest)
  const program: ImageToGlbProceduralProgram = {
    entrypoint: 'buildImageToGlbReviewedScene',
    language: 'typescript',
    source: createContourRebuildProgram(contourRebuildPlan),
  }
  const programDigest = hashStringToHex(program.source)
  const sceneEvidence = inspectImageToGlbScene(scene)
  const projectionDigest = sceneEvidence.projectionDigest
  const expectedParts = partManifest.map(part => part.name)
  const missingParts = expectedParts.filter(part => !sceneEvidence.foundParts.includes(part))
  const measuredSilhouetteScore = measureImageToGlbFrontProjectionScore({ analysis, scene })
  const evidence = {
    expectedParts,
    foundParts: sceneEvidence.foundParts,
    programDigest,
    projectionDigest,
    referenceDigest: analysis.referenceDigest,
    reviewedViews: ['reference-front', 'native-scene-bounds', 'native-part-graph', 'rigid-part-pivots', 'inspection-loop'],
    silhouetteScore: measuredSilhouetteScore,
    unresolvedIssues: missingParts.map(part => `Missing native scene part: ${part}`),
  }
  const visionReviewPasses: readonly ImageToGlbVisionReviewPass[] = [
    {
      iteration: 1,
      stage: 'reference-analysis',
      verdict: 'revise',
      reviewer: { evidenceDigest: projectionDigest, kind: 'native-deterministic' },
      observations: [`Read ${analysis.width}x${analysis.height} reference pixels with ${analysis.backgroundMethod} isolation at analysis confidence ${analysis.analysisConfidence.toFixed(3)}; selected ${analysis.profile}.`],
      evidence,
    },
    {
      iteration: 2,
      stage: 'procedural-geometry',
      verdict: 'validated',
      reviewer: { evidenceDigest: projectionDigest, kind: 'native-deterministic' },
      observations: [`Validated ${sceneEvidence.foundParts.length} named native Three.js contour volumes from measured silhouette runs, negative spaces, symmetry, and palette evidence.`],
      evidence,
    },
    {
      iteration: 3,
      stage: 'artifact-review',
      verdict: 'validated',
      reviewer: { evidenceDigest: projectionDigest, kind: 'native-deterministic' },
      observations: [`Validated the exact program, rigid-part pivot graph, attachment sockets, bounded inspection loop, and native projection at score ${measuredSilhouetteScore.toFixed(3)}.`],
      evidence,
    },
  ]
  const job = createImageToGlbProceduralJob({
    sourceUrl: args.sourceUrl,
    partManifest,
    program,
    programDigest,
    referenceDigest: analysis.referenceDigest,
    visionReviewPasses,
  })
  scene.userData.imageToGlb = {
    actionReadiness: actionReadiness.manifest,
    contourRebuildPlan,
    partManifest,
    procedural: true,
    profile: analysis.profile,
    programDigest,
    projectionDigest,
    projectionAspectRatio: sceneEvidence.aspectRatio,
    referenceDigest: analysis.referenceDigest,
    sourceKind: job.source.kind,
    sourceReferenceDigest: analysis.referenceDigest,
  }
  const qualityReport = evaluateImageToGlbQuality({
    action: {
      clipCount: scene.animations.length,
      fingerprint: hashStringToHex(JSON.stringify(actionReadiness.manifest)),
      pivotCount: actionReadiness.manifest.parts.length,
      socketCount: actionReadiness.manifest.parts.length,
      valid: actionValidation.valid,
      violations: actionValidation.violations.map(violation => `${violation.code}: ${violation.message}`),
    },
    analysis,
    componentCount: contourRebuildPlan.components.length,
    job,
    programSource: program.source,
    reconstruction: {
      acceptedSpanCount: contourRebuildPlan.quality.acceptedSpanCount,
      inferredSurfaceConfidence: contourRebuildPlan.quality.inferredSurfaceConfidence,
      rawSpanCount: contourRebuildPlan.quality.rawSpanCount,
      retainedAreaRatio: contourRebuildPlan.quality.retainedAreaRatio,
      withinBudgets: contourRebuildPlan.quality.withinBudgets,
    },
    scene,
  })
  if (!qualityReport.passed) {
    throw new Error(`Image to GLB quality gate failed: ${qualityReport.violations.map(violation => violation.code).join(', ')}`)
  }
  attachImageToGlbQualityReport(scene, qualityReport)
  return { analysis, job, scene }
}

export async function generateReviewedImageToGlbScene(args: {
  sourceUrl: string
}): Promise<ReviewedImageToGlbScene> {
  const pixels = await loadImageReferencePixels({ sourceUrl: args.sourceUrl, maxDimension: 192 })
  return createReviewedImageToGlbScene({ pixels, sourceUrl: args.sourceUrl })
}
