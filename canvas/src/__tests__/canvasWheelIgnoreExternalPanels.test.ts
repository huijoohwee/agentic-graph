import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export function testCanvasWheelIgnoreIsAppliedToExternalPanels() {
  const root = process.cwd()
  const tablePath = resolve(root, 'src', 'lib', 'graph-data-table', 'ui', 'GraphDataTableTable.impl.tsx')
  const viewportPath = resolve(root, 'src', 'features', 'panels', 'views', 'preview-panel', 'ui', 'ZoomPanViewport.tsx')
  const table = readFileSync(tablePath, 'utf8')
  const viewport = readFileSync(viewportPath, 'utf8')

  if (!table.includes('data-kg-canvas-wheel-ignore="true"')) {
    throw new Error('expected GraphDataTableTable to opt-out of canvas wheel zoom via data-kg-canvas-wheel-ignore')
  }
  if (!viewport.includes('data-kg-canvas-wheel-ignore="true"')) {
    throw new Error('expected ZoomPanViewport to opt-out of canvas wheel zoom via data-kg-canvas-wheel-ignore')
  }
}
