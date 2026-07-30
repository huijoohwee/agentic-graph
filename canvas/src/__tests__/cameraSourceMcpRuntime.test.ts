import assert from 'node:assert/strict'
import test from 'node:test'
import { useGraphStore } from '@/hooks/useGraphStore'
import {
  controlLocalCamera,
  inspectLocalCamera,
} from '@/features/strybldr/cameraMcpRuntime'
import {
  CAMERA_SOURCE_SELECTION_DEADLINE_MS,
  controlLocalCameraSource,
} from '@/features/strybldr/cameraSourceMcpRuntime'
import {
  selectXrNativeControllerCameraMode,
} from '@/features/three/xrNativeControllerCameraRuntime'

test('Camera source selection is bounded and rejects invalid values without changing framing', () => {
  useGraphStore.getState().resetAll()
  useGraphStore.setState({
    canvasRenderMode: '3d',
    canvas3dMode: 'xr',
    floatingPanelOpen: false,
    floatingPanelView: 'motionControl',
    timelineTransportPlaying: false,
  } as never)
  selectXrNativeControllerCameraMode('fixed-follow')
  try {
    const selected = controlLocalCamera({
      invocation: '/camera.select @camera #camera camera=free-orbit',
    })
    assert.equal(selected.ok, true)
    assert.equal(selected.deadlineMs, CAMERA_SOURCE_SELECTION_DEADLINE_MS)
    assert.equal(typeof selected.elapsedMs, 'number')
    assert.ok((selected.elapsedMs || 0) <= CAMERA_SOURCE_SELECTION_DEADLINE_MS)
    assert.equal(inspectLocalCamera().source.selected, 'free-orbit')

    const rejected = controlLocalCamera({
      action: 'select',
      cameraId: 'authored-shot' as never,
    })
    assert.equal(rejected.ok, false)
    assert.equal(rejected.errorCode, 'CAMERA_SOURCE_INVALID_VALUE')
    assert.equal(rejected.invalidValue, 'authored-shot')
    assert.equal(inspectLocalCamera().source.selected, 'free-orbit')

    selectXrNativeControllerCameraMode('fixed-follow')
    let clockReads = 0
    const timedOut = controlLocalCameraSource({
      action: 'select',
      cameraId: 'free-orbit',
      targetId: 'camera',
      invocation: '',
    }, inspectLocalCamera, {
      now: () => clockReads++ === 0 ? 0 : CAMERA_SOURCE_SELECTION_DEADLINE_MS + 1,
    })
    assert.equal(timedOut.ok, false)
    assert.equal(timedOut.errorCode, 'CAMERA_SOURCE_SELECTION_TIMEOUT')
    assert.equal(timedOut.deadlineMs, CAMERA_SOURCE_SELECTION_DEADLINE_MS)
    assert.equal(timedOut.elapsedMs, CAMERA_SOURCE_SELECTION_DEADLINE_MS + 1)
    assert.equal(inspectLocalCamera().source.selected, 'fixed-follow')
  } finally {
    selectXrNativeControllerCameraMode('fixed-follow')
    useGraphStore.getState().resetAll()
  }
})
