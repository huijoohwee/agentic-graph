import React from 'react'
import { discoverProviderProfiles } from 'agentic-gateway/provider-profiles'
import { importHyperframesHtml } from 'agentic-gateway/connectors/hyperframes'
import { isHyperframesSource } from './htmlVideoFlowNode'

export default function HyperframesCompatibility({html, format}: {html: unknown, format: unknown}) {
  const profiles = React.useMemo(() => discoverProviderProfiles(
    typeof document === 'undefined' ? [] : ['browser-dom', 'hyperframes-importer'],
  ), [])
  const result = React.useMemo(() => {
    if (typeof html !== 'string' || !isHyperframesSource(html, format)) return null
    try {
      const scene = importHyperframesHtml(html, document)
      return { ok: true, message: `HyperFrames source supported · ${scene.width} × ${scene.height} · ${scene.clips.length} timed clips. Local fonts can change text placement.` }
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) }
    }
  }, [html, format])

  return (
    <section aria-label="Video source compatibility">
      {result && <p role={result.ok ? 'status' : 'alert'}>{result.message}</p>}
      <details>
        <summary>Connector profiles</summary>
        {profiles.map(({manifest, routes}) => (
          <div key={manifest.id}>
            <strong>{manifest.id}</strong>
            <p>{manifest.input} → {manifest.output}</p>
            {routes.map(({route, available, missing}) => <p key={route}>{route} · {available ? 'Available here' : 'Requires ' + missing.join(', ')}</p>)}
            <p>{manifest.losses.join('. ')}</p>
          </div>
        ))}
      </details>
    </section>
  )
}
