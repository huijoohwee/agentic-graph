import React from 'react'
import type { EvidenceSourceCapture } from './evidenceSource'
import { clearSourceGeospatial, loadSourceGeospatial, useSourceGeospatialState } from './geospatialSource'

const button = 'App-toolbar__btn min-h-[44px]'
export function SourceGeospatialControls({ capture }: { capture: EvidenceSourceCapture | null }) {
  const state = useSourceGeospatialState()
  if (!state.sourceKey && !state.error && !state.loading) return null
  const current = capture?.sourceKey === state.sourceKey
  const features = current ? state.snapshot?.collection.features || [] : []
  const positions = features.filter(feature => feature.properties.role === 'point' && feature.properties.status !== 'gap')
  const surfaces = features.filter(feature => ['surface', 'volume'].includes(feature.properties.role))
  const gaps = features.filter(feature => feature.properties.status === 'gap')
  return <section aria-label="Source map context" className="grid min-w-0 gap-2 rounded border p-2" data-kg-source-context="1">
    <h4 className="font-semibold">{state.title || 'Source map context'}</h4>
    <p>{state.description}</p>
    <p role="status">{current ? state.error || state.status : 'Source changed. The previous map context is no longer displayed.'}</p>
    <p>{state.airspaceQualification}</p>
    <div className="flex flex-wrap gap-2">
      <button type="button" className={button} disabled={!capture || state.loading} onClick={() => capture && void loadSourceGeospatial(capture)}>Reload map context</button>
      <button type="button" className={button} disabled={!state.snapshot && !state.loading} onClick={clearSourceGeospatial}>Remove map context</button>
    </div>
    {current && state.snapshot && <>
      <p>{surfaces.length} source surfaces · {positions.length} observed positions · {state.missingPositions.length} unknown positions · {gaps.length} marked gaps</p>
      <p>Observation UTC · {state.atUtc}</p>
      <ul aria-label="Map observation legend" className="grid list-none gap-2 p-0">{positions.map(feature => <li key={feature.id} className="border-l-4 pl-2" style={{ borderColor: feature.properties.color }}>
        <p>{feature.properties.label}</p><p>{feature.properties.observedAtUtc}</p><p>{feature.properties.altitudeLabel}</p>
        <details><summary className="min-h-[44px] cursor-pointer">Observation source</summary><p className="break-all">{feature.properties.sourceId} · SHA-256 {feature.properties.sourceHash}</p><p className="break-all">{feature.properties.sourcePointer}</p></details>
      </li>)}</ul>
      {state.missingPositions.length > 0 && <ul aria-label="Unknown map positions">{state.missingPositions.map(item => <li key={`${item.entityId}:${item.sourceId}`}>{item.label} · position unknown at {item.observedAtUtc}: {item.reason}</li>)}</ul>}
      <details><summary className="min-h-[44px] cursor-pointer">Surface provenance and qualifications</summary>
        <ul>{surfaces.map(feature => <li key={feature.id}>{feature.properties.label} · {feature.properties.status}</li>)}</ul>
        <ul>{state.references.map(reference => <li key={reference.sha256} className="break-words">{reference.upstreamUrl ? <a href={reference.upstreamUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-[44px] items-center underline">{reference.label}</a> : reference.label} · {reference.license}<p className="break-all">SHA-256 {reference.sha256}</p></li>)}</ul>
      </details>
    </>}
  </section>
}
