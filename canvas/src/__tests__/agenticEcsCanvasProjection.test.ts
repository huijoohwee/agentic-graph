import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { projectAgenticEcsWorldToCanvas } from '@/features/agentic-ecs/agenticEcsCanvasProjection'
import { useGraphStore } from '@/hooks/useGraphStore'
import { allocateEntity, createWorld, registerComponent } from '../../../ecs/world.js'

export async function testAgenticEcsCanvasProjectionUsesDocumentTextApplySeam() {
  const world = createWorld()
  registerComponent(world, 'Position', { x: 'f32', y: 'f32' })
  allocateEntity(world, {
    entityRef: 'npc.guide',
    components: { Position: { x: 3, y: 7 } },
  })

  const originalApply = useGraphStore.getState().setActiveMarkdownDocument
  const appliedDocuments: Array<Record<string, unknown>> = []
  useGraphStore.setState({
    setActiveMarkdownDocument: async payload => {
      appliedDocuments.push(payload as unknown as Record<string, unknown>)
      return true
    },
  })

  try {
    const result = await projectAgenticEcsWorldToCanvas(world, { name: 'Session Projection.md' })
    if (!result.ok || result.entityCount !== 1) {
      throw new Error(`expected one projected ECS entity, got ${JSON.stringify(result)}`)
    }
    if (appliedDocuments.length !== 1) {
      throw new Error(`expected exactly one existing Canvas document apply, got ${appliedDocuments.length}`)
    }
    const [applied] = appliedDocuments
    if (applied.name !== 'Session Projection.md' || applied.applyToGraph !== true || applied.forceApplyToGraph !== true) {
      throw new Error(`expected canonical text apply options, got ${JSON.stringify(applied)}`)
    }
    if (typeof applied.text !== 'string' || !applied.text.includes('type: "EcsEntityProjection"') || !applied.text.includes('npc.guide')) {
      throw new Error('expected the Rendering_Layer Markdown to reach the existing Canvas text seam')
    }

    const adapterText = readFileSync(
      resolve(process.cwd(), 'src', 'features', 'agentic-ecs', 'agenticEcsCanvasProjection.ts'),
      'utf8',
    )
    if (!adapterText.includes('projectWorldToCanvas') || !adapterText.includes('applyChatAgenticOsDocumentTextToCanvas')) {
      throw new Error('expected the browser adapter to delegate to Rendering_Layer and the extracted text apply seam')
    }
    if (/workspaceFs|writeFile|temp(?:File|Dir)|renderer/i.test(adapterText)) {
      throw new Error('expected the ECS browser adapter to avoid filesystem materialization and renderer ownership')
    }
  } finally {
    useGraphStore.setState({ setActiveMarkdownDocument: originalApply })
  }
}
