import { useGraphStore } from '@/hooks/useGraphStore'
import { parseMarkdownFrontmatter, splitMarkdownLines } from '@/lib/markdown'
import { hashText } from '@/features/parsers/hash'
import { findComposedSourceFileByPath } from '@/features/source-files/composedSourceSelection'
import { diagnoseWorkspaceRunReadyDemoActivation } from '@/features/workspace-fs/workspaceRunReadyDemos'
import { admitFlightSimTrainingProfile, readFlightSimTrainingScenario } from './flightSimTrainingScenario'
import { validateFlightSimTrainingProfile, type FlightSimTrainingProfile } from './flightSimTrainingProfile'
import type { FlightSimPhase } from './flightSimModel'
import { validateFlightSimGeographicReference, type FlightSimGeographicReference } from './flightSimGeospatialCoordinates'

export type FlightSimTrainingSourceCapture = Readonly<{
  documentName: string
  documentText: string
  sourceId: string
  sourceText: string
  sourceRevision: number | undefined
  sourceKey: string
  profile: FlightSimTrainingProfile | null
  geographicReference: FlightSimGeographicReference | null
}>

/** Resolve the exact active source through the native source selector and YAML owner. */
export function captureFlightSimTrainingSource(): FlightSimTrainingSourceCapture {
  const state = useGraphStore.getState()
  const documentName = state.markdownDocumentName
  const documentText = state.markdownDocumentText
  const source = findComposedSourceFileByPath({ sourceFiles: state.sourceFiles, targetPath: documentName })
  if (source && source.text !== documentText) throw new Error('Flight training profile requires the exact enabled, parsed active SourceFile text.')
  const parsed = parseMarkdownFrontmatter(splitMarkdownLines(source?.text ?? documentText))
  if (parsed.warnings.length) throw new Error(`Flight training source YAML is invalid: ${parsed.warnings.join(' ')}`)
  const declaration = parsed.meta.flight_training_profile
  const geo = parsed.meta.geo_flight_overlay
  if (geo !== undefined && (!geo || typeof geo !== 'object' || Array.isArray(geo))) throw new TypeError('Flight geography declaration must be an authored object.')
  const geographicReference = validateFlightSimGeographicReference((geo as Record<string, unknown> | undefined)?.geographic_reference)
  if (declaration !== undefined || geographicReference) {
    if (!source || !source.enabled || source.text !== documentText || source.status !== 'parsed') {
      throw new Error('Flight training profile requires the exact enabled, parsed active SourceFile text.')
    }
    if (parsed.meta.run_ready_demo !== undefined) {
      const admission = diagnoseWorkspaceRunReadyDemoActivation(documentName, source.text)
      if (admission.ok === false) throw new Error(admission.message)
    }
  }
  const profile = declaration === undefined ? null : validateFlightSimTrainingProfile(declaration)
  return Object.freeze({
    documentName, documentText,
    sourceId: source?.id || '', sourceText: source?.text || '', sourceRevision: source?.parsedGraphRevision,
    sourceKey: profile || geographicReference ? `${source!.id}:${source!.parsedGraphRevision ?? ''}:${hashText(source!.text)}` : '',
    profile, geographicReference,
  })
}

export function isFlightSimTrainingSourceCurrent(capture: FlightSimTrainingSourceCapture): boolean {
  const state = useGraphStore.getState()
  const source = findComposedSourceFileByPath({ sourceFiles: state.sourceFiles, targetPath: state.markdownDocumentName })
  return state.markdownDocumentName === capture.documentName
    && state.markdownDocumentText === capture.documentText
    && (source?.id || '') === capture.sourceId
    && (source?.text || '') === capture.sourceText
    && source?.parsedGraphRevision === capture.sourceRevision
    && (!(capture.profile || capture.geographicReference) || Boolean(source?.enabled && source.status === 'parsed'))
}

export function assertCapturedFlightSimTrainingSource(capture: FlightSimTrainingSourceCapture, phase: FlightSimPhase): void {
  if (!isFlightSimTrainingSourceCurrent(capture)) throw new Error('Flight training source changed before admission; retry with the current SourceFile.')
  const current = readFlightSimTrainingScenario()
  if (phase !== 'stopped' && (current.sourceKey !== capture.sourceKey
    || JSON.stringify(current.profile) !== JSON.stringify(capture.profile)
    || JSON.stringify(current.geographicReference) !== JSON.stringify(capture.geographicReference))) {
    throw new Error('Flight training source changed during an active run; stop before admitting another profile.')
  }
}
/** No cache/store here: configuration publishes atomically in the existing scenario owner. */
export function admitCapturedFlightSimTrainingSource(capture: FlightSimTrainingSourceCapture, phase: FlightSimPhase, isCurrent?: () => boolean): void {
  assertCapturedFlightSimTrainingSource(capture, phase)
  admitFlightSimTrainingProfile(capture.profile, capture.sourceKey, phase, () => isFlightSimTrainingSourceCurrent(capture) && (!isCurrent || isCurrent()), capture.geographicReference)
  if (!isFlightSimTrainingSourceCurrent(capture)) throw new Error('Flight training source changed during admission; no World may enter from that capture.')
}

export function resolveAuthoredFlightSimTrainingSelection(operation: string) {
  const capture = captureFlightSimTrainingSource()
  return capture.profile?.controlAliases[operation] || null
}
