import React from 'react'
import catalog from 'agentic-gateway/connectors/moomoo-catalog.json' with { type: 'json' }
import { namingDictionaries, publicRoutes } from 'agentic-gateway/connectors/moomoo-coverage'
import { coverageSummary, providerCoverage } from 'agentic-trading-platform/src/provider-coverage.mjs'

const routes = publicRoutes(catalog)
const byTransport = new Map<string, number>()
const bindings = new Map<string, string>()
for (const route of routes) {
  byTransport.set(route.transport, (byTransport.get(route.transport) ?? 0) + 1)
  if (route.transport === 'MCP') bindings.set(route.label, route.sources[0].http)
}
const dictionaries = namingDictionaries(catalog)

export default function TradingProviderCoverage() {
  const summary = coverageSummary()
  return (
    <section aria-label="Moomoo OpenAPI coverage" className="min-w-0 space-y-2 border-b p-2 text-sm">
      <h3 className="font-semibold">Moomoo OpenAPI coverage · evidence-led feature families</h3>
      <p className="text-xs">
        {summary.families} Trading feature families · {summary.mapped_operations.length} mapped read operations.
        Connected qualification applies to the named host and read.
      </p>
      <p className="text-xs">{Array.from(byTransport, ([transport, count]) => count + ' ' + transport).join(' · ')} · {catalog.sources.length} documentation sources</p>
      <nav aria-label="Moomoo naming dictionaries" className="flex flex-wrap gap-x-3 text-xs">
        {dictionaries.map(item => <a key={item.area} href={item.url} className="underline" target="_blank" rel="noopener noreferrer">
          {item.area.replace(/_/g, ' ')} naming dictionary
        </a>)}
      </nav>
      <p className="text-xs">{Object.entries(summary.by_status).map(([key, value]) => `${key}: ${value}`).join(' · ')}</p>
      <div className="min-w-0 space-y-2">
        {providerCoverage.map(entry => (
          <section key={entry.id} aria-label={entry.label} className="min-w-0 space-y-1 rounded border p-2" data-status={entry.status}>
            <h4 className="text-xs font-semibold">{entry.label} · {entry.status} · {entry.transport}</h4>
            <p className="text-xs">{entry.note}</p>
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 text-xs">
              <dt>Semantic reads</dt><dd className="break-words">{entry.operations.length ? entry.operations.join(', ') : 'None'}</dd>
              <dt>Listed MCP tools</dt><dd className="break-words">{entry.mcp.length ? <ul>{entry.mcp.map(name => <li key={name}>
                <code>{name}</code>{bindings.has(name) && <> · <code>{bindings.get(name)}</code></>}
              </li>)}</ul> : 'See individual routes'}</dd>
            </dl>
            {entry.sources.length > 0 && <ul className="space-y-0.5 text-xs">
              {entry.sources.map(item => (
                <li key={item.path} className="break-all">
                  <a href={item.url} target="_blank" rel="noopener noreferrer" className="underline">{item.path}</a>
                  <code> SHA-256 {item.sha256.slice(0, 16)}…</code>
                </li>
              ))}
            </ul>}
          </section>
        ))}
      </div>
    </section>
  )
}