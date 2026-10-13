import { useEffect, useState } from 'react'

type Readiness = 'idle' | 'loading' | 'ready' | 'failed'

type Options = Readonly<{
  active: boolean
  mode: string
  documentLoaded: boolean
  geospatialComposite: boolean
}>

/** Load the active XR viewport's deferred modules before it advertises offline readiness. */
export function useThreeViewportRuntimeReadiness(options: Options): Readiness {
  const eligible = options.active && options.mode === 'xr' && options.documentLoaded && !options.geospatialComposite
  const key = [options.active, options.mode, options.documentLoaded, options.geospatialComposite].join(':')
  const [state, setState] = useState<{ key: string; readiness: Readiness }>({ key: '', readiness: 'idle' })

  useEffect(() => {
    if (!eligible) {
      setState({ key, readiness: 'idle' })
      return
    }
    let current = true
    setState({ key, readiness: 'loading' })
    void Promise.all([
      import('@/features/three/Controls'),
      import('@/lib/three/Scene.impl'),
      import('@/features/xr-v2/SemanticTwinStage'),
    ]).then(() => {
      if (current) setState({ key, readiness: 'ready' })
    }).catch(error => {
      console.error('[agentic-graph] XR viewport modules failed to load.', error)
      if (current) setState({ key, readiness: 'failed' })
    })
    return () => { current = false }
  }, [eligible, key])

  return state.key === key ? state.readiness : eligible ? 'loading' : 'idle'
}
