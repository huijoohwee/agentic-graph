import { useGraphStore } from '@/hooks/useGraphStore'
import { CLICK_URL, PUBLIC_FALLBACK_JSON } from '@/lib/config'
import type { SettingMeta } from './types'

const s = () => useGraphStore.getState()

export const presetAndEnvSettingsRegistry: SettingMeta[] = [
  {
    key: 'three.preset.presentation3d',
    type: 'boolean',
    source: 'store',
    read: () => false,
    write: (v) => {
      if (!v) return
      const st = s()
      st.setCanvasRenderMode('3d')
      st.setThreeConfig({
        linkOpacity: 0.45,
        linkDirectionalArrowLength: 7,
        linkCurvature: 0.16,
        linkCurveRotation: 0,
        linkDirectionalArrowRelPos: 0.85,
        linkDirectionalParticles: 0,
        linkDirectionalParticleSpeed: 0.4,
        nodeMotionIntensity: 0.15,
        fogColor: '',
        fogNear: 130,
        fogFar: 310,
        cameraDampingFactor: 0.18,
        cameraRotateSpeed: 0.38,
        cameraZoomSpeed: 0.65,
        cameraPanSpeed: 0.45,
        selection: {
          selectedNodeGlowIntensity: 1.15,
          dimmedNodeOpacity: 0.32,
          dimmedEdgeOpacity: 0.32,
          selectedEdgeWidth: 2.8,
        },
      })
    },
    docKey: 'three.preset.presentation3d',
    default: () => false,
  },
  {
    key: 'CLICK_URL',
    type: 'string',
    source: 'env',
    read: () => CLICK_URL,
    docKey: 'CLICK_URL',
  },
  {
    key: 'PUBLIC_FALLBACK_JSON',
    type: 'string',
    source: 'env',
    read: () => PUBLIC_FALLBACK_JSON,
    docKey: 'PUBLIC_FALLBACK_JSON',
  },
  {
    key: 'AG_INPUT_PATH',
    type: 'string',
    source: 'backendEnv',
    read: () => null,
    docKey: 'AG_INPUT_PATH',
  },
  {
    key: 'AG_OUTPUT_DIR',
    type: 'string',
    source: 'backendEnv',
    read: () => null,
    docKey: 'AG_OUTPUT_DIR',
  },
  {
    key: 'max-lines',
    type: 'number',
    source: 'eslint',
    read: () => 600,
    docKey: 'max-lines',
  },
]
