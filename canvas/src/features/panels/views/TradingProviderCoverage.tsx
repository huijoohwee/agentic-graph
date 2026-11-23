import React from 'react'
import { TRADING_PROVIDER_COVERAGE, COVERAGE_INDEX, coverageSummary } from './tradingCoverageInventory'

export default function TradingProviderCoverage() {
  const summary = coverageSummary()
  return (
    <section aria-label="Moomoo OpenAPI coverage" className="min-w-0 space-y-2 border-b p-2 text-sm">
      <h3 className="font-semibold">Moomoo OpenAPI coverage · evidence-led feature families</h3>
      <p className="text-xs">
        {summary.families} families · {summary.mappedOperations.length} mapped read operations · connected runtime UNQUALIFIED.
        Inventory of {COVERAGE_INDEX.known_sources} known sources ({COVERAGE_INDEX.imported_sources} imported, {COVERAGE_INDEX.incomplete_sources} incomplete).
        Statuses describe mapping readiness, not connected readiness; live order dispatch is excluded from the read-only $0 scope.
      </p>
      <p className="text-xs">{Object.entries(summary.byStatus).map(([key, value]) => `${key}: ${value}`).join(' · ')}</p>
      <div className="min-w-0 space-y-2">
        {TRADING_PROVIDER_COVERAGE.map(entry => (
          <section key={entry.id} aria-label={entry.label} className="min-w-0 space-y-1 rounded border p-2" data-status={entry.status}>
            <h4 className="text-xs font-semibold">{entry.label} · {entry.status} · {entry.transport}</h4>
            <p className="text-xs">{entry.note}</p>
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 text-xs">
              <dt>Semantic reads</dt><dd className="break-words">{entry.operations.length ? entry.operations.join(', ') : 'none (excluded)'}</dd>
              <dt>Verified MCP tools</dt><dd className="break-words">{entry.mcp.length ? entry.mcp.join(', ') : 'none observed'}</dd>
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