import type { FloatingPanelChatSubmitArgs } from './floatingPanelChatSubmitTypes'
import {
  isGeoInvocationCandidate,
  runGeoInvocation,
  type GeoInvocationRuntimeDependencies,
} from '@/features/geospatial/geoInvocationRuntime'

const toActionableMessage = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error || 'Geospatial command failed.')
  return (message.trim() || 'Geospatial command failed.').slice(0, 140)
}

export async function tryActivateGeospatialInvocation(
  args: {
    input: string
    submitArgs: FloatingPanelChatSubmitArgs
  },
  dependencies: GeoInvocationRuntimeDependencies = {},
): Promise<boolean> {
  if (!isGeoInvocationCandidate(args.input, args.submitArgs.graphData)) return false
  try {
    const activation = await runGeoInvocation({
      raw: args.input,
      graphData: args.submitArgs.graphData,
      dependencies,
    })
    if (!activation.handled) return false
    if (activation.result.ok === false) {
      args.submitArgs.setErrorText(activation.result.rejection.message)
      args.submitArgs.pushUiLog?.({
        kind: 'error',
        message: activation.result.rejection.message,
        source: 'chat:geospatial',
      })
      return true
    }
    args.submitArgs.setErrorText(null)
    args.submitArgs.setInput('')
    args.submitArgs.pushUiLog?.({
      kind: 'success',
      message: 'Geospatial command applied.',
      source: 'chat:geospatial',
    })
    return true
  } catch (error) {
    const message = toActionableMessage(error)
    args.submitArgs.setErrorText(message)
    args.submitArgs.pushUiLog?.({ kind: 'error', message, source: 'chat:geospatial' })
    return true
  }
}
