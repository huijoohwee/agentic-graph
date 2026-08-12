import React from 'react'
import { createRoot } from 'react-dom/client'
import IntegrationsHubView from '@/features/panels/views/IntegrationsHubView'
import { ExaSearchSkillsCommandsProjection } from '@/features/integrations/ExaSearchSkillsCommandsProjection'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { initWindowHarness } from '@/tests/lib/windowHarness'
import { MemoryStorage } from '@/tests/lib/memoryStorage'
import { installDeterministicRaf, mountReactRoot, unmountReactRoot } from '@/tests/lib/reactRootHarness'
import { useGraphStore } from '@/hooks/useGraphStore'
import {
  EXA_SEARCH_API_CODING_AGENT_REQUEST_JSON,
  EXA_SEARCH_API_DEPRECATED_FIELDS,
  EXA_SEARCH_API_DOC_AREA,
  EXA_SEARCH_API_DOCS_URL,
  EXA_SEARCH_API_ENDPOINT,
  EXA_SEARCH_API_INVOCATION_TEXT,
  buildExaCodingAgentSearchRequest,
} from 'grph-shared/search/exaSearchApiSsot'

async function withRendered(element: React.ReactElement, assertions: (container: Element) => void): Promise<void> {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { dom, restore: restoreDom } = initJsdomHarness()
  let root: ReturnType<typeof createRoot> | null = null
  try {
    const anyWindow = dom.window as unknown as { requestAnimationFrame?: (callback: (time: number) => void) => number }
    anyWindow.requestAnimationFrame = installDeterministicRaf(dom.window)
    useGraphStore.getState().resetAll()
    const container = dom.window.document.createElement('section')
    dom.window.document.body.appendChild(container)
    root = createRoot(container as unknown as HTMLElement)
    await mountReactRoot(root, element, { window: dom.window, frames: 4 })
    assertions(container)
  } finally {
    if (root) await unmountReactRoot(root, { window: dom.window })
    restoreDom()
    restoreWindow()
  }
}

const renderedValues = (container: Element): string => Array.from(
  container.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input, textarea, select'),
  element => element.value,
).join('\n')

export async function testIntegrationsHubSurfacesExaCodingAgentSearchContract() {
  await withRendered(React.createElement(IntegrationsHubView), container => {
    const searchableText = `${container.textContent || ''}\n${renderedValues(container)}`
    ;[
      EXA_SEARCH_API_DOC_AREA,
      'exaSearchApi.endpoint',
      'exaSearchApi.request.query',
      'exaSearchApi.request.type',
      'exaSearchApi.request.numResults',
      'exaSearchApi.request.contents.highlights',
      'exaSearchApi.request.structured_output',
      'exaSearchApi.response.contract',
      'exaSearchApi.errors.statuses',
      'exaSearchApi.deprecated.fields',
      'exaSearchApi.invocation',
      EXA_SEARCH_API_ENDPOINT,
      EXA_SEARCH_API_CODING_AGENT_REQUEST_JSON,
      EXA_SEARCH_API_INVOCATION_TEXT,
      EXA_SEARCH_API_DOCS_URL,
      'Open Exa Search API Coding-Agent Guide',
      'Open FloatingPanel Skills & Commands',
    ].forEach(token => {
      if (!searchableText.includes(token)) {
        throw new Error(`expected MainPanel Integrations to include Exa coding-agent token ${JSON.stringify(token)}`)
      }
    })
    if (!container.querySelector('[data-kg-anchor^="integrations-row-exa-search-"]')) {
      throw new Error('expected Exa Search API integration rows to use stable Exa anchors')
    }
    ;['YOUR_EXA_API_KEY', 'your_api_key', 'exaApiKey=', 'sk_test_', 'sk_live_'].forEach(secret => {
      if (searchableText.includes(secret)) throw new Error(`expected Exa integration to omit secret material ${secret}`)
    })
  })
}

export function testExaCodingAgentSearchRequestUsesCurrentBoundedContract() {
  const request = buildExaCodingAgentSearchRequest({
    query: '  inspect current repository issue  ',
    type: 'unsupported',
    numResults: 999,
  })
  if (
    request.query !== 'inspect current repository issue'
    || request.type !== 'auto'
    || request.numResults !== 100
    || request.contents.highlights !== true
  ) {
    throw new Error(`expected sanitized Exa coding-agent request, got ${JSON.stringify(request)}`)
  }
  ;['useAutoprompt', 'numSentences', 'tokensNum', 'livecrawl (string)'].forEach(field => {
    if (!EXA_SEARCH_API_DEPRECATED_FIELDS.some(candidate => candidate === field)) {
      throw new Error(`expected shared Exa contract to reject deprecated field ${field}`)
    }
  })
}

export async function testFloatingSkillsCommandsSurfacesCanonicalExaInvocation() {
  await withRendered(React.createElement(ExaSearchSkillsCommandsProjection), container => {
    const projection = container.querySelector('[data-kg-exa-search-skills-projection="configuration-only"]')
    const invocation = projection?.querySelector('[data-kg-exa-search-invocation="canonical"]')
    const text = projection?.textContent || ''
    if (
      !projection
      || invocation?.getAttribute('data-kg-exa-search-invocation-chip-renderer') !== 'shared-markdown-sigil'
      || !text.includes('/tool.catalog')
      || !text.includes('#tool-routing')
      || !text.includes('@tool-provider')
      || !text.includes('no browser-side API key or direct search call')
      || projection.querySelector(`a[href="${EXA_SEARCH_API_DOCS_URL}"]`) === null
    ) {
      throw new Error(`expected FloatingPanel Skills & Commands Exa canonical projection, got ${JSON.stringify(text)}`)
    }
    if (text.includes('/exa') || text.includes('#exa') || text.includes('@exa')) {
      throw new Error(`expected Exa projection to avoid provider-specific invocation aliases, got ${JSON.stringify(text)}`)
    }
  })
}
