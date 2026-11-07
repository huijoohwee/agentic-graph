import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { resolveXrDocumentStageAuthority } from '@/features/three/xrSceneDocumentReadiness'
import { hydrateCanonicalXrMotionReferenceRuntime } from '@/features/three/XrMotionReferenceRuntimeBridge'
import { readXrMotionReferenceRuntime, setXrMotionReferenceStage } from '@/features/three/xrMotionReferenceRuntime'
import { completeSourceFilesBootstrap } from '@/features/source-files/sourceFilesBootstrapReadiness'
import { useGraphStore } from '@/hooks/useGraphStore'
import type { GraphData } from '@/lib/graph/types'

const canvasRoot = path.basename(process.cwd()) === 'canvas'
  ? process.cwd()
  : path.resolve(process.cwd(), 'canvas')

function read(relativePath: string): string {
  return readFileSync(path.resolve(canvasRoot, relativePath), 'utf8')
}

test('mounted XR authoring reuses the canonical Three canvas and root ECS owner', () => {
  const mountedScene = read('src/features/xr-v2/XrV2MountedAuthoringScene.tsx')
  const canonicalStage = read('src/features/three/XrCanonicalPhysicsStage.tsx')
  const rootRuntime = read('src/features/agentic-ecs/xrAuthoringEcsRuntime.ts')
  const threeGraph = read('src/lib/three/ThreeGraph.impl.tsx')
  const sceneAdmission = read('src/features/three/xrSceneDocumentReadiness.ts')
  const smokePage = read('src/features/testing/XrV2RuntimeSmokePage.tsx')
  const smokeSurface = read('src/features/xr-v2/XrV2MountedAuthoringSmokeSurface.tsx')

  assert.doesNotMatch(mountedScene, /<Canvas(?:\s|>)/u)
  assert.doesNotMatch(mountedScene, /hydrateAgenticOsDocument/u)
  assert.match(rootRuntime, /hydrateAgenticOsDocument/u)
  assert.match(rootRuntime, /projectXrAuthoringRenderPlan/u)
  assert.match(canonicalStage, /<XrV2MountedAuthoringScene\s+paused=\{paused\}\s*\/>/u)
  assert.match(threeGraph, /resolveXrDocumentStageAuthority/u)
  assert.match(sceneAdmission, /graphHasXrAuthoringSource\(input\.graphData\)\) return 'native-controller'/u)
  assert.match(smokePage, /<XrV2MountedAuthoringSmokeSurface\s*\/>/u)
  assert.equal((smokeSurface.match(/<Canvas(?:\s|>)/gu) || []).length, 1)
})

test('mounted XR authoring surfaces actual renderer resources and canonical timeline state', () => {
  const mountedScene = read('src/features/xr-v2/XrV2MountedAuthoringScene.tsx')

  for (const contract of [
    'bindMaterialGraphToTargetMesh',
    'BufferGeometry',
    'BufferAttribute',
    'DynamicDrawUsage',
    'PointsMaterial',
    '<bone',
    'readXrMotionReferenceRuntime',
    'createExactOnceBehaviorDispatcher',
    'disposeResourceOnce',
    'shouldRunXrV2RendererCompile',
    'particleUserData',
  ]) {
    assert.ok(mountedScene.includes(contract), `missing mounted renderer contract: ${contract}`)
  }
  assert.match(
    mountedScene,
    /if \(shouldRunXrV2RendererCompile\(rendererRef\.current\)\)[\s\S]*gl\.compile\(scene, camera\)/u,
  )
  assert.match(mountedScene, /userData=\{particleUserData\}/u)
  assert.match(mountedScene, /Object\.assign\(pointsRef\.current\.userData, particleUserData\)/u)
  assert.doesNotMatch(mountedScene, /<points\b(?:(?!\/>)[\s\S])*userData=\{\{/u)
})

const graph: GraphData = { type: 'Graph', nodes: [{ id: 'paragraph', label: 'Paragraph 1', type: 'Paragraph', properties: {} }], edges: [] }
const source = { graphData: graph, markdownDocumentName: 'demo.md', markdownDocumentText: '# Ordinary Markdown' }
const motion = { schema: 'agentic-graph-xr-motion-reference/v1', stageId: 'street-grid', castSource: 'graph+subjects' }

test('XR stage admission requires authored source, independent of filename and selected mode', () => {
  assert.equal(resolveXrDocumentStageAuthority(source), undefined)
  assert.equal(resolveXrDocumentStageAuthority({ ...source, markdownDocumentText: '---\nkgCanvasSurfaceMode: xr\n---\n# Notes' }), undefined)
  assert.equal(resolveXrDocumentStageAuthority({ ...source, graphData: { ...graph, metadata: { kgXrMotionReference: motion } } }), 'motion-reference')
  assert.equal(resolveXrDocumentStageAuthority({ ...source, graphData: { ...graph, metadata: { frontmatterMeta: { kgXrMotionReference: motion } } } }), 'motion-reference')
  assert.equal(resolveXrDocumentStageAuthority({ ...source, markdownDocumentText: '', graphData: { ...graph, metadata: { kgXrMotionReference: motion } } }), undefined)
  assert.equal(resolveXrDocumentStageAuthority({ ...source, graphData: { ...graph, metadata: { kgXrMotionReference: 'invalid' } } }), undefined)
  assert.equal(resolveXrDocumentStageAuthority({ ...source, markdownDocumentText: '---\nrun_ready_demo:\n  id: xr-v2\n---\n# XR' }), 'native-controller')
})

test('switching from an authored scene to ordinary Markdown clears synthetic cast without writing the source', () => {
  const previous = useGraphStore.getState()
  completeSourceFilesBootstrap()
  try {
    useGraphStore.setState({ ...source, graphData: { ...graph, metadata: { kgXrMotionReference: motion } }, canvasRenderMode: '3d', canvas3dMode: 'xr' })
    assert.equal(hydrateCanonicalXrMotionReferenceRuntime(), true)
    assert.equal(readXrMotionReferenceRuntime().plan.cast[0]?.actorId, 'paragraph')
    setXrMotionReferenceStage('singapore')
    assert.equal(readXrMotionReferenceRuntime().dirty, true)
    useGraphStore.setState(source)
    assert.equal(hydrateCanonicalXrMotionReferenceRuntime(), true)
    assert.equal(readXrMotionReferenceRuntime().plan.cast.length, 0)
    assert.equal(readXrMotionReferenceRuntime().plan.subjects.length, 0)
    assert.equal(readXrMotionReferenceRuntime().plan.stageId, 'neutral-volume')
    assert.equal(useGraphStore.getState().graphData, graph)
    assert.equal(useGraphStore.getState().markdownDocumentText, source.markdownDocumentText)
    assert.equal(resolveXrDocumentStageAuthority(useGraphStore.getState()), undefined)
  } finally {
    useGraphStore.setState(previous)
    hydrateCanonicalXrMotionReferenceRuntime()
  }
})
