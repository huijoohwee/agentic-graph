import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { JSDOM } from 'jsdom'
import catalog from 'agentic-gateway/connectors/moomoo-catalog.json' with { type: 'json' }
import { publicRoutes, namingDictionaries } from 'agentic-gateway/connectors/moomoo-coverage'
import { coverageSummary, providerCoverage } from 'agentic-trading-platform/src/provider-coverage.mjs'
import TradingProviderCoverage from '../features/panels/views/TradingProviderCoverage'

test('Integrations renders the pinned Gateway directory and Trading mapping evidence', () => {
  const doc: Document = new JSDOM(renderToStaticMarkup(React.createElement(TradingProviderCoverage))).window.document
  const panel = doc.querySelector('[aria-label="Moomoo OpenAPI coverage"]')!
  const summary = coverageSummary()
  assert.ok(panel.textContent?.includes(summary.mapped_operations.length + ' mapped read operations'))
  assert.equal(panel.querySelectorAll('section[data-status]').length, providerCoverage.length)
  for (const entry of providerCoverage) {
    const family = Array.from(panel.querySelectorAll('section')).find(item => item.getAttribute('aria-label') === entry.label)!
    assert.equal(family.getAttribute('data-status'), entry.status)
    for (const source of entry.sources) assert.ok(Array.from(family.querySelectorAll('a')).some(a => a.href === source.url))
  }
  const routes = publicRoutes(catalog)
  for (const transport of ['REST', 'MCP', 'Push']) assert.ok(panel.textContent?.includes(routes.filter(r => r.transport === transport).length + ' ' + transport))
  const quote = routes.find(r => r.label === 'quote_stock_quote' && r.transport === 'MCP')
  assert.ok(panel.textContent?.includes(quote.label + ' · ' + quote.sources[0].http))
  assert.deepEqual(Array.from(panel.querySelectorAll('nav a'), a => a.getAttribute('href')), namingDictionaries(catalog).map(d => d.url))
})
