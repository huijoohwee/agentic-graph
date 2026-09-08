import fs from 'node:fs'
import path from 'node:path'

const readUtf8 = (absPath: string): string => fs.readFileSync(absPath, { encoding: 'utf8' })

export const testD3SceneUsesBudgetedLabelRelaxAndEdgePlacement = () => {
  const sceneHandlersPath = path.resolve(process.cwd(), 'src', 'components', 'GraphCanvas', 'sceneHandlers.ts')
  const boundary = readUtf8(sceneHandlersPath)
  if (!boundary.includes("export { renderLabels2d } from '@/components/GraphCanvas/sceneHandlers.simulationTick2d.labels'")) throw new Error('expected scene boundary to reuse the label owner')
  const text = readUtf8(path.resolve(process.cwd(), 'src/components/GraphCanvas/sceneHandlers.simulationTick2d.labels.ts'))
  if (!text.includes("from '@/lib/graph/collision/relaxRunner'")) {
    throw new Error('Expected sceneHandlers to use relaxRunner SSOT for budgeted label relax')
  }
  if (!text.includes('runRelaxSteps')) {
    throw new Error('Expected sceneHandlers to run budgeted relax steps for labels')
  }
  if (!text.includes('pickEdgeLabelPlacement')) {
    throw new Error('Expected sceneHandlers to use pickEdgeLabelPlacement for strict edge label collision avoidance')
  }
  if (!text.includes('data-kg-group-label')) {
    throw new Error('Expected label relax to account for group labels as collision blockers')
  }
}

export const testFlowAndDesignUseBudgetedCollisionRelax = () => {
  const flowRelaxPath = path.resolve(process.cwd(), 'src', 'components', 'FlowCanvas', 'relaxPositions.ts')
  const flowRelaxText = readUtf8(flowRelaxPath)
  if (!flowRelaxText.includes('runRelaxSteps')) throw new Error('Expected FlowCanvas relax to use runRelaxSteps')
  if (!flowRelaxText.includes('maxOps')) throw new Error('Expected FlowCanvas relax to pass maxOps budget')

  const designPath = path.resolve(process.cwd(), 'src', 'components', 'DesignCanvas.tsx')
  const designText = readUtf8(designPath)
  const dragText = readUtf8(path.resolve(process.cwd(), 'src/components/DesignCanvas/useFrameDragController.ts'))
  if (!designText.includes('useFrameDragController({') || !dragText.includes('relaxNodesWithCollision({')) {
    throw new Error('Expected DesignCanvas to use relaxNodesWithCollision for overlap resolution')
  }
}

export const testStoryboardWidgetOverlayUsesBudgetedPanelRelax = () => {
  const relaxPath = path.resolve(process.cwd(), 'src', 'lib', 'ui', 'relaxOverlayPanelsWithCollision.ts')
  const relaxText = readUtf8(relaxPath)
  if (!relaxText.includes('runRelaxSteps')) throw new Error('Expected overlay panel relax to use runRelaxSteps')
  if (!relaxText.includes('maxOps')) throw new Error('Expected overlay panel relax to pass maxOps budget')
}

export const testD3SimulationUsesAxisEpsilonsForStrictBboxCollision = () => {
  const simPath = path.resolve(process.cwd(), 'src', 'components', 'GraphCanvas', 'simulation.ts')
  const text = readUtf8(simPath)
  if (!text.includes('touchEpsilonXPx') || !text.includes('touchEpsilonYPx')) {
    throw new Error('Expected D3 simulation bbox collision to pass axis-specific touch epsilons')
  }
  if (!text.includes('nestedTouchEpsilonXPx') || !text.includes('nestedTouchEpsilonYPx')) {
    throw new Error('Expected D3 group collision to pass nested axis-specific touch epsilons')
  }
}
