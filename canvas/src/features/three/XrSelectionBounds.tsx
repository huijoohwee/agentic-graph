import React from 'react'
import { useFrame } from '@react-three/fiber'
import { Box3, Box3Helper, Matrix4, type Group } from 'three'
import { THREE_RENDER_ORDER } from './renderOrder'

/** World bounds follow the rendered geometry and compensate for any transformed parent. */
export function updateXrSelectionBounds(root: Group, helper: Box3Helper, inverse: Matrix4) {
  root.updateWorldMatrix(true, true)
  helper.box.setFromObject(root)
  helper.visible = !helper.box.isEmpty()
  helper.matrixAutoUpdate = true
  helper.updateMatrixWorld(true)
  if (root.parent) {
    inverse.copy(root.parent.matrixWorld).invert()
    helper.matrix.premultiply(inverse)
    helper.matrixAutoUpdate = false
    helper.matrixWorldNeedsUpdate = true
  }
}

export function XrSelectionBounds({ children, targetId, selected }: { children: React.ReactNode; targetId: string; selected: boolean }) {
  const root = React.useRef<Group>(null)
  const inverse = React.useMemo(() => new Matrix4(), [])
  const helper = React.useMemo(() => {
    const bounds = new Box3Helper(new Box3(), 0xfacc15)
    bounds.name = `agentic_os_xr_selection_bounds_${targetId}`
    bounds.renderOrder = THREE_RENDER_ORDER.overlays
    for (const material of Array.isArray(bounds.material) ? bounds.material : [bounds.material]) {
      material.depthTest = false
      material.depthWrite = false
      material.toneMapped = false
    }
    return bounds
  }, [targetId])
  React.useEffect(() => () => {
    helper.geometry.dispose()
    for (const material of Array.isArray(helper.material) ? helper.material : [helper.material]) material.dispose()
  }, [helper])
  useFrame(() => {
    if (selected && root.current) updateXrSelectionBounds(root.current, helper, inverse)
    else helper.visible = false
  })
  return <><group ref={root}>{children}</group><primitive object={helper} visible={selected} raycast={() => null} /></>
}

// Keep the model parent stable: reparenting a reused R3F primitive on selection destroys its root binding.
