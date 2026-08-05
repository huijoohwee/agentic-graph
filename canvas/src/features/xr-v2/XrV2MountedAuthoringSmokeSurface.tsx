import React from 'react'
import { Canvas } from '@react-three/fiber'

import {
  readXrMotionReferenceRuntime,
  setXrMotionReferencePlayhead,
} from '@/features/three/xrMotionReferenceRuntime'
import { useGraphStore } from '@/hooks/useGraphStore'
import type { GraphData } from '@/lib/graph/types'

import { MATERIAL_GRAPH_SCHEMA } from './materialGraph'
import {
  readMountedAuthoringEvidence,
  subscribeMountedAuthoringEvidence,
} from './mountedAuthoringEvidence'
import { XR_V2_TIMELINE_SEQUENCE_SCHEMA } from './timelineSequencer'
import { XrV2MountedAuthoringScene } from './XrV2MountedAuthoringScene'

const DOCUMENT_NAME = 'xr-v2-mounted-authoring-smoke.md'
const DOCUMENT_SOURCE_URL = 'browser://xr-v2-mounted-authoring-smoke'

function schemaNode(name: string, fields: Record<string, string>) {
  return {
    id: `schema:${name}`,
    label: name,
    type: 'EcsComponentSchema',
    properties: { ecsComponent: { name, fields } },
  }
}

/** Bounded committed-data fixture for the browser-only mounted observation. */
function createXrV2MountedAuthoringGraphFixture(): GraphData {
  return {
    type: 'application/json',
    nodes: [
      schemaNode('XrTransform', {
        px: 'f32', py: 'f32', pz: 'f32', qx: 'f32', qy: 'f32', qz: 'f32', qw: 'f32',
        sx: 'f32', sy: 'f32', sz: 'f32',
      }),
      schemaNode('XrRenderable', { geometryKind: 'u8', visible: 'u8' }),
      schemaNode('XrParticleEmitter', {
        rate: 'f32', lifetime: 'f32', ceiling: 'u16', size: 'f32', color: 'u32',
      }),
      schemaNode('XrRig', { enabled: 'u8' }),
      {
        id: 'entity:scene.hero', label: 'Hero', type: 'EcsEntity',
        properties: { ecsEntity: {
          entityRef: 'scene.hero',
          components: {
            XrTransform: { px: 0, py: 0, pz: 0, qx: 0, qy: 0, qz: 0, qw: 1, sx: 1, sy: 1, sz: 1 },
            XrRenderable: { geometryKind: 0, visible: 1 },
            XrParticleEmitter: { rate: 12, lifetime: 0.75, ceiling: 64, size: 0.06, color: 0x66ccff },
            XrRig: { enabled: 1 },
          },
        } },
      },
      {
        id: 'entity:scene.marker', label: 'Marker', type: 'EcsEntity',
        properties: { ecsEntity: {
          entityRef: 'scene.marker',
          components: {
            XrTransform: { px: -1.5, py: -0.5, pz: 0, qx: 0, qy: 0, qz: 0, qw: 1, sx: 1, sy: 1, sz: 1 },
          },
        } },
      },
      {
        id: 'material:hero', label: 'Hero checker material', type: 'XrMaterialGraph',
        properties: { xrMaterialGraph: {
          schema: MATERIAL_GRAPH_SCHEMA,
          nodes: [
            { id: 'albedo', type: 'color', value: '#336699' },
            { id: 'surface', type: 'texture-2d', assetId: 'builtin:checker-v1' },
            { id: 'roughness', type: 'number', value: 0.35 },
            { id: 'output', type: 'mesh-standard-output', bindings: {
              color: 'albedo', map: 'surface', roughness: 'roughness',
            } },
          ],
        } },
      },
      {
        id: 'behavior:hero:select', label: 'Select hero', type: 'XrBehaviorTrigger',
        properties: { xrBehaviorTrigger: {
          behaviorId: 'hero-select', trigger: 'select', sourceEntityRef: 'scene.hero',
        } },
      },
      {
        id: 'action:hero:burst', label: 'Burst particles', type: 'XrBehaviorAction',
        properties: { xrBehaviorAction: {
          actionId: 'hero-burst', kind: 'emit-particle-burst', targetEntityRef: 'scene.hero',
          parameters: { count: 8 },
        } },
      },
      {
        id: 'timeline:hero', label: 'Hero arm animation', type: 'XrTimelineSequence',
        properties: { xrTimelineSequence: {
          schema: XR_V2_TIMELINE_SEQUENCE_SCHEMA,
          durationSeconds: 2,
          loop: false,
          tracks: [{
            id: 'arm-pose', kind: 'bone-pose', targetName: 'Arm',
            keyframes: [
              { timeSeconds: 0, value: {
                translation: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1],
              } },
              { timeSeconds: 2, value: {
                translation: [0, 1, 0], rotation: [0, 1, 0, 0], scale: [1, 1, 1],
              } },
            ],
          }],
        } },
      },
    ],
    edges: [
      {
        id: 'edge:material', source: 'material:hero', target: 'entity:scene.hero',
        label: 'xr-material-target', type: 'xr-material-target', properties: {},
      },
      {
        id: 'edge:behavior', source: 'behavior:hero:select', target: 'action:hero:burst',
        label: 'xr-behavior-wire', type: 'xr-behavior-wire', properties: {},
      },
      {
        id: 'edge:timeline', source: 'timeline:hero', target: 'entity:scene.hero',
        label: 'xr-timeline-target', type: 'xr-timeline-target', properties: {},
      },
    ],
  } as GraphData
}

export function XrV2MountedAuthoringSmokeSurface() {
  const [sceneMounted, setSceneMounted] = React.useState(true)
  const evidence = React.useSyncExternalStore(
    subscribeMountedAuthoringEvidence,
    readMountedAuthoringEvidence,
    readMountedAuthoringEvidence,
  )
  React.useLayoutEffect(() => {
    const previous = useGraphStore.getState()
    const fixture = createXrV2MountedAuthoringGraphFixture()
    const previousPlayhead = readXrMotionReferenceRuntime().playheadSeconds
    const previousProjection = {
      graphData: previous.graphData,
      graphDataRevision: previous.graphDataRevision,
      markdownDocumentName: previous.markdownDocumentName,
      markdownDocumentSourceUrl: previous.markdownDocumentSourceUrl,
    }
    useGraphStore.setState({
      graphData: fixture,
      graphDataRevision: previous.graphDataRevision + 1,
      markdownDocumentName: DOCUMENT_NAME,
      markdownDocumentSourceUrl: DOCUMENT_SOURCE_URL,
    })
    setXrMotionReferencePlayhead(0.5)
    return () => {
      const current = useGraphStore.getState()
      if (current.graphData === fixture
        && current.markdownDocumentName === DOCUMENT_NAME
        && current.markdownDocumentSourceUrl === DOCUMENT_SOURCE_URL) {
        useGraphStore.setState(previousProjection)
        setXrMotionReferencePlayhead(previousPlayhead)
      }
    }
  }, [])

  const observation = evidence.observation
  const mesh = observation?.meshes[0]
  const particle = observation?.particles[0]
  const bone = observation?.bones[0]

  return (
    <section
      className="relative mt-5 h-72 overflow-hidden rounded-xl border border-slate-700 bg-slate-950"
      aria-label="XR v2 mounted authoring renderer proof"
      data-kg-xr-v2-mounted-authoring-surface="1"
      data-kg-xr-v2-mounted-evidence-schema={evidence.schema}
      data-kg-xr-v2-mounted-evidence-status={evidence.status}
      data-kg-xr-v2-mounted-evidence-reason={evidence.reason ?? ''}
      data-kg-xr-v2-mounted-source-digest={evidence.source?.sourceDigest ?? ''}
      data-kg-xr-v2-mounted-entity-ids={observation?.entityIds.join(',') ?? ''}
      data-kg-xr-v2-mounted-render-query={evidence.source?.componentQueries.renderable.join(',') ?? ''}
      data-kg-xr-v2-mounted-canvas-identity={observation?.canvas.identity ?? ''}
      data-kg-xr-v2-mounted-canvas-connected={String(observation?.canvas.connected ?? false)}
      data-kg-xr-v2-mounted-map-uuid={mesh?.mapUuid ?? ''}
      data-kg-xr-v2-mounted-material-status={mesh?.bindingStatus ?? ''}
      data-kg-xr-v2-mounted-particle-capacity={String(particle?.capacity ?? 0)}
      data-kg-xr-v2-mounted-particle-live={String(particle?.liveCount ?? 0)}
      data-kg-xr-v2-mounted-particle-high-water={String(particle?.highWaterCount ?? 0)}
      data-kg-xr-v2-mounted-particle-position-version={String(particle?.positionAttributeVersion ?? 0)}
      data-kg-xr-v2-mounted-bone-name={bone?.name ?? ''}
      data-kg-xr-v2-mounted-bone-y={String(bone?.position[1] ?? -1)}
      data-kg-xr-v2-mounted-bone-playhead={String(bone?.appliedPlayheadSeconds ?? -1)}
      data-kg-xr-v2-mounted-behavior-revision={String(observation?.behavior.revision ?? 0)}
      data-kg-xr-v2-mounted-behavior-effects={String(observation?.behavior.effectCount ?? 0)}
      data-kg-xr-v2-mounted-behavior-trigger={observation?.behavior.lastTrigger ?? ''}
      data-kg-xr-v2-mounted-behavior-actions={observation?.behavior.lastInvokedActionIds.join(',') ?? ''}
      data-kg-xr-v2-mounted-compile-method={observation?.renderer.compileMethod ?? ''}
      data-kg-xr-v2-mounted-compile-status={observation?.renderer.compileStatus ?? ''}
      data-kg-xr-v2-mounted-render-calls={String(observation?.renderer.renderCallCount ?? 0)}
      data-kg-xr-v2-mounted-observed-frames={String(observation?.renderer.observedFrameCount ?? 0)}
      data-kg-xr-v2-mounted-resource-count={String(evidence.resources.observedCount)}
      data-kg-xr-v2-mounted-dispose-count={String(evidence.resources.disposeEventCount)}
    >
      <div className="absolute right-2 top-2 z-10 flex gap-2">
        <button
          type="button"
          className="rounded bg-sky-700 px-2 py-1 text-xs"
          data-kg-xr-v2-mounted-scrub="1"
          onClick={() => setXrMotionReferencePlayhead(1)}
        >Scrub to 1s</button>
        <button
          type="button"
          className="rounded bg-rose-800 px-2 py-1 text-xs"
          data-kg-xr-v2-mounted-unmount="1"
          onClick={() => setSceneMounted(false)}
        >Unmount proof</button>
      </div>
      {sceneMounted ? <Canvas
        camera={{ position: [0, 0, 5], fov: 45, near: 0.1, far: 100 }}
        dpr={1}
        gl={{ antialias: false, powerPreference: 'high-performance' }}
        onCreated={({ gl }) => {
          gl.domElement.dataset.kgXrV2CanvasId = 'xr-v2-mounted-authoring-canvas'
          gl.domElement.dataset.kgXrV2CanvasOwner = 'react-three-fiber'
        }}
      >
        <color attach="background" args={['#020617']} />
        <ambientLight intensity={1.2} />
        <directionalLight position={[3, 4, 5]} intensity={2} />
        <XrV2MountedAuthoringScene />
      </Canvas> : null}
    </section>
  )
}
