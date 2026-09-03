import path from 'node:path'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { initWindowHarness } from '@/tests/lib/windowHarness'
import { MemoryStorage } from '@/tests/lib/memoryStorage'
import { getWorkspaceFs, resetWorkspaceFsForTests } from '@/features/workspace-fs/workspaceFs'
import { useGraphStore } from '@/hooks/useGraphStore'
import {
  buildStreamArtifactQueryRelevance,
  ensureChatStreamArtifactBundleInitialized,
  persistChatStreamArtifacts,
  resetChatStreamArtifactBundleForTests,
  renderChatStreamArtifacts,
  resolveChatStreamArtifactBundle,
} from '@/features/chat/chatStreamArtifacts'

const normalizeFsPath = (value: string): string => String(value || '').replace(/\\/g, '/')
const AG_GITHUB_ROOT = normalizeFsPath(path.resolve(process.cwd(), '..', '..'))
const AG_HUIJOOHWEE_DOCS_ROOT = `${AG_GITHUB_ROOT}/huijoohwee/docs`
const AG_HUIJOOHWEE_CHAT_LOG_ROOT = `${AG_GITHUB_ROOT}/huijoohwee/chat-log`
const MIROMIND_SHARE_URL = ['https://', 'dr.miromind.ai', '/share/', 'c753877f-7480-4e76-bf75-89fe18358943'].join('')
const MIROMIND_REPORT_SHARE_URL = ['https://', 'dr.miromind.ai', '/report/share/', 'aNHNpO7MwdMtsxKg'].join('')

export function testChatStreamArtifactBundleReusesAgenticOsTimestampSessionFolder() {
  const bundle = resolveChatStreamArtifactBundle({
    workspacePath: '/chat-log/20260523T174000Z/agenticOs_20260523T174000Z.md',
    timestampMs: Date.UTC(2026, 4, 23, 18, 0, 0),
    defaultLocalRootPath: '/chat-log',
  })
  if (bundle.sessionId !== '20260523T174000Z') {
    throw new Error(`expected session folder timestamp derived from AGENTIC_OS path, got ${bundle.sessionId}`)
  }
  if (bundle.folderPath !== '/chat-log/20260523T174000Z') {
    throw new Error(`expected timestamped session folder path, got ${bundle.folderPath}`)
  }
  if (bundle.streamLogPath !== '/chat-log/20260523T174000Z/agentic-os-trace_20260523T174000Z.md') {
    throw new Error(`unexpected stream log path ${bundle.streamLogPath}`)
  }
  if (bundle.streamReportPath !== '/chat-log/20260523T174000Z/chat-stream-report_20260523T174000Z.md') {
    throw new Error(`unexpected stream report path ${bundle.streamReportPath}`)
  }
}

export async function testChatStreamArtifactBundleInitializationDefersMarkdownSidecars() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { restore: restoreDom } = initJsdomHarness()
  try {
    resetWorkspaceFsForTests()
    resetChatStreamArtifactBundleForTests()
    useGraphStore.getState().clearSourceFiles()
    const bundle = await ensureChatStreamArtifactBundleInitialized({
      workspacePath: '/chat-log/20260605T005045Z/agenticOs_20260605T005045Z.md',
      timestampMs: Date.UTC(2026, 5, 5, 0, 50, 45),
      defaultLocalRootPath: '/chat-log',
    })
    const fs = await getWorkspaceFs()
    const entries = await fs.listEntries()
    const paths = new Set(entries.map(entry => String(entry.path || '')))
    if (!paths.has('/chat-log/20260605T005045Z')) {
      throw new Error(`expected chat stream initialization to create only the session folder, got ${JSON.stringify([...paths])}`)
    }
    if (await fs.readFileText(bundle.streamLogPath) !== null || await fs.readFileText(bundle.streamReportPath) !== null) {
      throw new Error('expected chat stream initialization to defer log/report markdown until query-responsive stream content exists')
    }
    const deferredSourcePaths = new Set([
      `workspace:${bundle.streamLogPath}`,
      `workspace:${bundle.streamReportPath}`,
    ])
    if (useGraphStore.getState().sourceFiles.some(file => deferredSourcePaths.has(String(file?.source?.path || '')))) {
      throw new Error('expected deferred chat stream initialization to avoid Source Files placeholder sidecars')
    }
  } finally {
    resetWorkspaceFsForTests()
    useGraphStore.getState().clearSourceFiles()
    restoreDom()
    restoreWindow()
  }
}

export async function testRenderChatStreamArtifactsBuildsGenericQueryRelevantMetadata() {
  const workspaceAssistantText = [
    '---',
    'title: "Geospatial MCP Assistant Plan"',
    '---',
    '# Geospatial MCP Assistant Plan',
    '',
    '### User Flow',
    'Operators create, review, and share map-backed assistant flows.',
    '',
    '### Data Flow',
    'RxDB sync keeps local-first state aligned with MapLibre-driven workspace views.',
    '',
    '### Integration Boundaries',
    'MapLibre provides spatial rendering while MCP integrations broker external tool calls.',
    '',
    '## Computing Flow Definition  ← MANDATORY first body section; target of links.yaml_anchor',
    '',
    'Execute User Flow logic using bounded graph context.',
    '',
    'execution: computing-flow',
    'output: "Computed analysis"',
  ].join('\n')
  const rendered = await renderChatStreamArtifacts({
    workspacePath: '/chat-log/20260527T131514Z/agenticOs_20260527T131514Z.md',
    timestampMs: Date.UTC(2026, 4, 27, 13, 15, 14),
    defaultLocalRootPath: '/chat-log',
    traceId: 'trace-query-shape',
    providerSummary: 'Agnes AI API · Global',
    modelId: 'agnes-2.0-flash',
    requestText: 'Design a geospatial MCP assistant plan with User Flow, Data Flow, integrations, MapLibre, RxDB sync, and pricing options.',
    rawAssistantText: 'Outline integration boundaries, storage sync, and pricing considerations for a geospatial MCP assistant.',
    workspaceAssistantText,
    usageSummary: 'Usage: prompt 100 · completion 50 · total 150',
    finishReason: 'stop',
    reasoningSteps: [],
    rawSseEvents: [
      JSON.stringify({
        choices: [
          {
            delta: {
              reasoning_steps: [
                {
                  type: 'web_search',
                  web_search: {
                    search_keywords: ['geospatial MCP assistant MapLibre RxDB pricing'],
                  },
                },
              ],
            },
          },
        ],
      }),
      JSON.stringify({
        choices: [
          {
            delta: {
              content: [
                '### Data Flow',
                'RxDB sync streams map edits into the local-first workspace before MCP tools enrich the result.',
                `Source: ${MIROMIND_SHARE_URL}`,
              ].join('\n'),
            },
          },
        ],
      }),
      JSON.stringify({
        choices: [
          {
            delta: {
              reasoning_steps: [
                {
                  type: 'fetch_url_content',
                  fetch_url_content: {
                    title: 'Geospatial assistant source',
                    url: MIROMIND_SHARE_URL,
                  },
                },
              ],
            },
          },
        ],
      }),
    ],
    status: 'ok',
  })

  const requestText = 'Design a geospatial MCP assistant plan with User Flow, Data Flow, integrations, MapLibre, RxDB sync, and pricing options.'
  const relevance = buildStreamArtifactQueryRelevance(requestText)
  if (relevance.intent !== requestText) {
    throw new Error(`expected generic request intent to stay aligned with the query, got ${JSON.stringify(relevance.intent)}`)
  }
  for (const expectedSection of ['User Flow', 'Data Flow', 'Monetization', 'Integration']) {
    if (!relevance.requestedSections.includes(expectedSection)) {
      throw new Error(`expected requested sections to include ${expectedSection}, got ${JSON.stringify(relevance.requestedSections)}`)
    }
  }
  if (!rendered.logText.includes(`- Intent: ${requestText}`)) {
    throw new Error('expected rendered stream log to persist the original request-shaped intent summary')
  }
  if (!rendered.logText.includes('Requested Sections: User Flow, Data Flow, Monetization, Integration')) {
    throw new Error('expected rendered stream log to include generic requested-section relevance metadata')
  }
  if (!rendered.logText.includes('## Editor Workspace Output') || !rendered.logText.includes('Heading Snapshot: Geospatial MCP Assistant Plan | User Flow | Data Flow | Integration Boundaries')) {
    throw new Error('expected rendered stream log to summarize the canonical workspace output instead of only raw stream text')
  }
  if (!rendered.logText.includes('## Response Snapshot')) {
    throw new Error('expected rendered stream log to include the concise response snapshot section')
  }
  if (rendered.logText.includes('This document is the pipeline.') || rendered.logText.includes('machine-readable source of truth')) {
    throw new Error('expected rendered stream log response snapshot to suppress generic pipeline boilerplate')
  }
  for (const forbidden of ['Computing Flow Definition', 'bounded graph context', 'execution: computing-flow', 'Computed analysis']) {
    if (rendered.logText.includes(forbidden)) {
      throw new Error(`expected rendered stream log response snapshot to suppress generic computing-flow boilerplate, saw ${forbidden}`)
    }
  }
  if (!rendered.logText.includes('## Stream Signals') || !rendered.logText.includes('Selected Signals:')) {
    throw new Error('expected rendered stream log to summarize stream signals instead of dumping every raw chunk')
  }
  if (!rendered.logText.includes('## SSE Markdown Projection') || !rendered.logText.includes('### Content Chunks')) {
    throw new Error('expected rendered stream log to project streamed JSON chunks into markdown sections')
  }
  if (!rendered.logText.includes('RxDB sync streams map edits into the local-first workspace before MCP tools enrich the result.')) {
    throw new Error('expected markdown projection to preserve query-relevant streamed content chunks')
  }
  if (!rendered.logText.includes('web_search: geospatial MCP assistant MapLibre RxDB pricing') || !rendered.logText.includes('fetch_url: Geospatial assistant source')) {
    throw new Error('expected markdown projection to summarize streamed reasoning/search/fetch JSON chunks')
  }
  if (!rendered.logText.includes('### Source Links') || !rendered.logText.includes(MIROMIND_SHARE_URL)) {
    throw new Error('expected markdown projection to preserve source URLs extracted from JSON chunks')
  }
  if (rendered.logText.includes('## Final Assistant Text') || rendered.logText.includes('## SSE JSON Chunks')) {
    throw new Error('expected rendered stream log to avoid the old raw-dump sections')
  }
  for (const expectedTerm of ['MapLibre', 'RxDB']) {
    if (!rendered.logText.includes(expectedTerm)) {
      throw new Error(`expected rendered stream log to preserve named query term ${expectedTerm}`)
    }
  }
  if (rendered.logText.includes('Artifact: report') || rendered.logText.includes('Artifact: Chat Response')) {
    throw new Error('expected rendered stream log to avoid generic artifact filler in query relevance metadata')
  }
  if (rendered.reportDocuments.length !== 0) {
    throw new Error(`expected ordinary stream rendering to avoid duplicate report markdown docs, got ${rendered.reportDocuments.length}`)
  }
}

export async function testPersistChatStreamArtifactsWritesStoryboardMarkdownDocs() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { restore: restoreDom } = initJsdomHarness()
  const previousAbsRoot = process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
  const previousChatLogAbsRoot = process.env.VITE_WORKSPACE_INITIALIZATION_CHAT_LOG_ABS_ROOT
  const previousFetch = globalThis.fetch
  const mirrorCalls: Array<{ url: string; body: string }> = []
  try {
    resetWorkspaceFsForTests()
    delete process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
    process.env.VITE_WORKSPACE_INITIALIZATION_CHAT_LOG_ABS_ROOT = AG_HUIJOOHWEE_CHAT_LOG_ROOT
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      mirrorCalls.push({
        url: String(typeof input === 'string' ? input : input.toString()),
        body: String(init?.body || ''),
      })
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }) as typeof fetch
    await persistChatStreamArtifacts({
      workspacePath: '/chat-log/20260523T174000Z/agenticOs_20260523T174000Z.md',
      timestampMs: Date.UTC(2026, 4, 23, 17, 40, 0),
      defaultLocalRootPath: '/chat-log',
      traceId: 'trace-stream-1',
      providerSummary: 'MiroMind · Global',
      modelId: 'mirothinker-1-7-deepresearch',
      requestText: 'Summarize the MCP payment stream, preserve report URLs, and keep Stripe checkout plus MapLibre integration details query-relevant.',
      rawAssistantText: [
        '# Stream report',
        '',
        `- Log share: ${MIROMIND_SHARE_URL}`,
        `- Report share: ${MIROMIND_REPORT_SHARE_URL}`,
      ].join('\n'),
      workspaceAssistantText: [
        '---',
        'title: "MCP Payment Stream Plan"',
        '---',
        '# MCP Payment Stream Plan',
        '',
        '### Monetization Surface',
        'Stripe checkout covers payment trigger, confirmation, and entitlement handoff.',
        '',
        '### Integration Boundaries',
        'MapLibre remains a spatial surface while MCP tools and report artifacts stay linked as external references.',
      ].join('\n'),
      usageSummary: 'Usage: total 42 · reasoning 12 · searches 2',
      finishReason: 'stop',
      reasoningSteps: ['web_search: graph observability', 'fetch_url: report artifact'],
      rawSseEvents: [
        JSON.stringify({
          choices: [
            {
              delta: {
                reasoning_steps: [
                  {
                    type: 'web_search',
                    web_search: {
                      search_keywords: ['MCP payment stream Stripe checkout MapLibre observability'],
                    },
                  },
                ],
              },
            },
          ],
        }),
        JSON.stringify({
          choices: [
            {
              delta: {
                content: [
                  '### Monetization Surface',
                  'Stripe checkout is the query-relevant payment handoff for the MCP stream.',
                  `Report source: ${MIROMIND_REPORT_SHARE_URL}`,
                ].join('\n'),
              },
            },
          ],
        }),
      ],
      status: 'ok',
      fetchUrlContent: async url => ({
        normalizedUrl: url,
        name: url.includes('/report/share/') ? 'report-derived.md' : 'share-derived.md',
        text: [
          '---',
          'kgCanvasSurfaceMode: "2d"',
          'kgCanvasRenderMode: "2d"',
          'kgCanvas2dRenderer: "storyboard"',
          'kgDocumentSemanticMode: "document"',
          'kgFrontmatterModeEnabled: true',
          'kgMultiDimTableModeEnabled: false',
          'kgDocumentStructureBaselineLock: false',
          `kgWebpageUrl: "${url}"`,
          'kgWebpageView: "markdown"',
          '---',
          '',
          `# Imported ${url.includes('/report/share/') ? 'Report' : 'Share'}`,
          '',
        ].join('\n'),
      }),
    })

    const fs = await getWorkspaceFs()
    const entries = await fs.listEntries()
    const entryPaths = new Set(entries.map(entry => String(entry.path || '')))
    const expectedFolder = '/chat-log/20260523T174000Z'
    const expectedLog = `${expectedFolder}/agentic-os-trace_20260523T174000Z.md`
    const expectedReport = `${expectedFolder}/chat-stream-report_20260523T174000Z.md`
    const expectedDereferencedShare = `${expectedFolder}/share-01-share-derived.md`
    const expectedDereferencedReport = `${expectedFolder}/report-share-02-report-derived.md`
    const expectedShareExportFolder = '/chat-log/c753877f-7480-4e76-bf75-89fe18358943'
    const expectedShareExportMarkdown = `${expectedShareExportFolder}/c753877f-7480-4e76-bf75-89fe18358943.md`
    const expectedShareThinking = `${expectedShareExportFolder}/c753877f-7480-4e76-bf75-89fe18358943-thinking.md`
    for (const path of [
      expectedFolder,
      expectedLog,
      expectedReport,
      expectedDereferencedShare,
      expectedDereferencedReport,
      expectedShareExportFolder,
      expectedShareExportMarkdown,
      expectedShareThinking,
    ]) {
      if (!entryPaths.has(path)) {
        throw new Error(`expected workspace stream artifact path ${path}, got ${JSON.stringify([...entryPaths])}`)
      }
    }
    if (entryPaths.has(`${expectedFolder}/chat-02-stream-report_20260523T174000Z.md`)) {
      throw new Error('expected generic /share/ URLs to stop generating extra stream report documents')
    }

    const logText = await fs.readFileText(expectedLog)
    const reportText = await fs.readFileText(expectedReport)
    const dereferencedShareText = await fs.readFileText(expectedDereferencedShare)
    const shareExportText = await fs.readFileText(expectedShareExportMarkdown)
    const shareThinkingText = await fs.readFileText(expectedShareThinking)
    if (!logText || !logText.includes('kgCanvas2dRenderer: "storyboard"') || !logText.includes('edges:')) {
      throw new Error('expected stream log markdown artifact to keep storyboard frontmatter nodes and edges')
    }
    if (!logText.includes('## Query Relevance') || !logText.includes('user-action monetization') || !logText.includes('local-first spatial workflows')) {
      throw new Error('expected stream log to include neutral request-derived query relevance details')
    }
    if (!logText.includes('## Editor Workspace Output') || !logText.includes('Requested Sections Present: Monetization, Integration')) {
      throw new Error('expected stream log to summarize request-aligned editor workspace output')
    }
    if (!logText.includes('## Response Snapshot') || !logText.includes('Stripe checkout covers payment trigger, confirmation, and entitlement handoff.')) {
      throw new Error('expected stream log to foreground a concise request-shaped response snapshot')
    }
    if (!logText.includes('## Stream Signals') || !logText.includes('Selected Signals:')) {
      throw new Error('expected stream log to summarize selected stream signals rather than every raw SSE chunk')
    }
    if (!logText.includes('## SSE Markdown Projection') || !logText.includes('Stripe checkout is the query-relevant payment handoff for the MCP stream.')) {
      throw new Error('expected stream log to render query-relevant SSE JSON content as markdown')
    }
    if (!logText.includes('web_search: MCP payment stream Stripe checkout MapLibre observability') || !logText.includes(MIROMIND_REPORT_SHARE_URL)) {
      throw new Error('expected stream log markdown projection to summarize streamed reasoning and source links')
    }
    if (logText.includes('## Final Assistant Text') || logText.includes('## SSE JSON Chunks')) {
      throw new Error('expected stream log to stop rendering the old raw assistant text and full chunk dump sections')
    }
    if (!logText.includes(MIROMIND_SHARE_URL)) {
      throw new Error('expected stream log to preserve observed share URL from stream content')
    }
    if (!logText.includes(expectedDereferencedReport) || !reportText?.includes(expectedDereferencedShare)) {
      throw new Error('expected stream log/report docs to reference dereferenced workspace markdown artifacts')
    }
    if (!reportText || !reportText.includes('# Chat Stream Report')) {
      throw new Error('expected primary stream report markdown doc')
    }
    if (!reportText.includes('## Query Relevance') || !reportText.includes('user-action monetization') || !reportText.includes('local-first spatial workflows')) {
      throw new Error('expected stream report to include request-derived query relevance focus')
    }
    if (!reportText.includes('## Stream-Aligned Workspace Output') || !reportText.includes('### Monetization Surface') || !reportText.includes('### Integration Boundaries')) {
      throw new Error('expected stream report to foreground the canonical workspace output with request-shaped sections')
    }
    if (!reportText.includes('## Raw Stream Output') || !reportText.includes('# Stream report')) {
      throw new Error('expected stream report to retain the raw stream output separately for observability')
    }
    if (!reportText.includes(MIROMIND_REPORT_SHARE_URL) || reportText.includes(`- ${MIROMIND_SHARE_URL}`)) {
      throw new Error('expected only /report/share/ URLs to be promoted into stream report share metadata')
    }
    if (!dereferencedShareText || !dereferencedShareText.includes(`kgWebpageUrl: "${MIROMIND_SHARE_URL}"`)) {
      throw new Error('expected dereferenced share markdown artifact to reuse shared imported workspace content')
    }
    if (!shareExportText || !shareExportText.includes(`kgWebpageUrl: "${MIROMIND_SHARE_URL}"`)) {
      throw new Error('expected share export markdown alias to reuse shared imported workspace content')
    }
    if (!shareThinkingText || !shareThinkingText.includes('# c753877f-7480-4e76-bf75-89fe18358943 Thinking Trace')) {
      throw new Error('expected per-share thinking trace markdown artifact')
    }
    if (
      !shareThinkingText.includes('## Thinking Trajectory')
      || !shareThinkingText.includes('## Thinking Process')
      || !shareThinkingText.includes('## Searching For')
      || !shareThinkingText.includes('## Run Code')
      || !shareThinkingText.includes('## Finalization')
    ) {
      throw new Error('expected per-share thinking trace to preserve high-fidelity trajectory and execution trace sections')
    }
    if (!shareThinkingText.includes(expectedShareExportMarkdown) || !shareThinkingText.includes(MIROMIND_SHARE_URL)) {
      throw new Error('expected per-share thinking trace to link canonical share markdown and source URL')
    }
    if (!shareThinkingText.includes('web_search: MCP payment stream Stripe checkout MapLibre observability')) {
      throw new Error('expected per-share thinking trace to preserve explicit search trajectory lines')
    }
    if (!shareThinkingText.includes('No run-code, execute-command, execute-python, or tool-call execution signals were captured.')) {
      throw new Error('expected per-share thinking trace to preserve an explicit run-code section even when no execution signal exists')
    }
    if (!shareThinkingText.includes('Now I can write the final answer.')) {
      throw new Error('expected per-share thinking trace to preserve the finalization marker')
    }
    const mirroredLogWrite = mirrorCalls.find(call => call.body.includes(`${AG_HUIJOOHWEE_CHAT_LOG_ROOT}/20260523T174000Z/agentic-os-trace_20260523T174000Z.md`))
    if (!mirroredLogWrite) {
      throw new Error('expected stream log writes to mirror into the sibling host chat-log root')
    }
    const mirroredReportWrite = mirrorCalls.find(call => call.body.includes(`${AG_HUIJOOHWEE_CHAT_LOG_ROOT}/20260523T174000Z/chat-stream-report_20260523T174000Z.md`))
    if (!mirroredReportWrite) {
      throw new Error('expected stream report writes to mirror into the sibling host chat-log root')
    }
    const mirroredDereferenceWrite = mirrorCalls.find(call => call.body.includes(`${AG_HUIJOOHWEE_CHAT_LOG_ROOT}/20260523T174000Z/report-share-02-report-derived.md`))
    if (!mirroredDereferenceWrite) {
      throw new Error('expected dereferenced share/report markdown artifacts to mirror into the sibling host chat-log root')
    }
    const mirroredShareExportWrite = mirrorCalls.find(call => call.body.includes(`${AG_HUIJOOHWEE_CHAT_LOG_ROOT}/c753877f-7480-4e76-bf75-89fe18358943/c753877f-7480-4e76-bf75-89fe18358943.md`))
    if (!mirroredShareExportWrite) {
      throw new Error('expected canonical share export markdown to mirror into the sibling host chat-log root')
    }
    const mirroredShareThinkingWrite = mirrorCalls.find(call => call.body.includes(`${AG_HUIJOOHWEE_CHAT_LOG_ROOT}/c753877f-7480-4e76-bf75-89fe18358943/c753877f-7480-4e76-bf75-89fe18358943-thinking.md`))
    if (!mirroredShareThinkingWrite) {
      throw new Error('expected per-share thinking trace markdown to mirror into the sibling host chat-log root')
    }
    const sourceFiles = useGraphStore.getState().sourceFiles
    const visibleLog = sourceFiles.find(file => String(file?.source?.path || '') === 'workspace:/chat-log/20260523T174000Z/agentic-os-trace_20260523T174000Z.md')
    const visibleReport = sourceFiles.find(file => String(file?.source?.path || '') === 'workspace:/chat-log/20260523T174000Z/chat-stream-report_20260523T174000Z.md')
    if (!visibleLog || !visibleReport) {
      throw new Error('expected persisted chat-log stream artifacts to become visible in Source Files')
    }
    if (visibleLog.enabled !== false || visibleReport.enabled !== false) {
      throw new Error('expected mirrored chat stream sidecar files to remain disabled by default after Source Files materialization')
    }
  } finally {
    resetWorkspaceFsForTests()
    if (typeof previousAbsRoot === 'string') process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = previousAbsRoot
    else delete process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
    if (typeof previousChatLogAbsRoot === 'string') process.env.VITE_WORKSPACE_INITIALIZATION_CHAT_LOG_ABS_ROOT = previousChatLogAbsRoot
    else delete process.env.VITE_WORKSPACE_INITIALIZATION_CHAT_LOG_ABS_ROOT
    if (previousFetch) globalThis.fetch = previousFetch
    else delete (globalThis as unknown as { fetch?: typeof fetch }).fetch
    restoreDom()
    restoreWindow()
  }
}

export async function testPersistChatStreamArtifactsDereferencesShareUrlFromRequestText() {
  const previousDocsAbsRoot = process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
  const previousChatLogAbsRoot = process.env.VITE_WORKSPACE_INITIALIZATION_CHAT_LOG_ABS_ROOT
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'chat-stream-request-share-'))
  try {
    process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = `${tempRoot}/docs`
    process.env.VITE_WORKSPACE_INITIALIZATION_CHAT_LOG_ABS_ROOT = `${tempRoot}/chat-log`
    resetWorkspaceFsForTests()
    resetChatStreamArtifactBundleForTests()

    await persistChatStreamArtifacts({
      workspacePath: '/chat-log/20260527T162848Z/agenticOs_20260527T162848Z.md',
      timestampMs: Date.UTC(2026, 4, 27, 16, 31, 59),
      defaultLocalRootPath: '/chat-log',
      traceId: 'trace-request-share',
      providerSummary: 'Agnes AI API · Global · agnes-2.0-flash',
      modelId: 'agnes-2.0-flash',
      requestText: `Analyze this share URL for fidelity export: ${MIROMIND_SHARE_URL}`,
      rawAssistantText: '# No explicit share url in assistant text',
      workspaceAssistantText: '# No explicit share url in workspace text',
      usageSummary: 'Usage: total 1',
      finishReason: 'stop',
      reasoningSteps: [],
      rawSseEvents: [],
      status: 'ok',
      fetchUrlContent: async url => ({
        normalizedUrl: url,
        name: 'share-derived.md',
        text: [
          '---',
          `kgWebpageUrl: "${url}"`,
          'kgWebpageView: "markdown"',
          '---',
          '',
          '# Imported Share',
          '',
        ].join('\n'),
      }),
    })

    const fs = await getWorkspaceFs()
    if (await fs.readFileText('/chat-log/20260527T162848Z/chat-stream-report_20260527T162848Z.md') !== null) {
      throw new Error('expected ordinary share-url streams to avoid duplicate stream report markdown')
    }
    const exported = await fs.readFileText('/chat-log/c753877f-7480-4e76-bf75-89fe18358943/c753877f-7480-4e76-bf75-89fe18358943.md')
    const thinking = await fs.readFileText('/chat-log/c753877f-7480-4e76-bf75-89fe18358943/c753877f-7480-4e76-bf75-89fe18358943-thinking.md')
    if (!exported?.includes(`kgWebpageUrl: "${MIROMIND_SHARE_URL}"`)) {
      throw new Error('expected share markdown export to be created from requestText-only observed URL')
    }
    if (!thinking?.includes(MIROMIND_SHARE_URL)) {
      throw new Error('expected share thinking export to be created from requestText-only observed URL')
    }
  } finally {
    resetWorkspaceFsForTests()
    resetChatStreamArtifactBundleForTests()
    if (typeof previousDocsAbsRoot === 'string') process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = previousDocsAbsRoot
    else delete process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
    if (typeof previousChatLogAbsRoot === 'string') process.env.VITE_WORKSPACE_INITIALIZATION_CHAT_LOG_ABS_ROOT = previousChatLogAbsRoot
    else delete process.env.VITE_WORKSPACE_INITIALIZATION_CHAT_LOG_ABS_ROOT
    await rm(tempRoot, { recursive: true, force: true })
  }
}

export async function testPersistChatStreamArtifactsWaitsForHostMirrorWrites() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { restore: restoreDom } = initJsdomHarness()
  const previousChatLogAbsRoot = process.env.VITE_WORKSPACE_INITIALIZATION_CHAT_LOG_ABS_ROOT
  const previousFetch = globalThis.fetch
  let pendingMirrorWrites = 0
  let resolvedMirrorWrites = 0
  try {
    resetWorkspaceFsForTests()
    process.env.VITE_WORKSPACE_INITIALIZATION_CHAT_LOG_ABS_ROOT = AG_HUIJOOHWEE_CHAT_LOG_ROOT
    globalThis.fetch = (async () => {
      pendingMirrorWrites += 1
      await new Promise(resolve => setTimeout(resolve, 20))
      resolvedMirrorWrites += 1
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }) as typeof fetch

    await persistChatStreamArtifacts({
      workspacePath: '/chat-log/20260523T174000Z/agenticOs_20260523T174000Z.md',
      timestampMs: Date.UTC(2026, 4, 23, 17, 40, 0),
      defaultLocalRootPath: '/chat-log',
      traceId: 'trace-await-mirror',
      providerSummary: 'MiroMind · Global',
      modelId: 'mirothinker-1-7-deepresearch',
      requestText: `Summarize ${MIROMIND_SHARE_URL} and preserve its exported artifacts.`,
      rawAssistantText: `- Share: ${MIROMIND_SHARE_URL}`,
      workspaceAssistantText: '# Visible share export',
      usageSummary: 'Usage: total 1',
      finishReason: 'stop',
      reasoningSteps: [],
      rawSseEvents: [],
      status: 'ok',
      fetchUrlContent: async url => ({
        normalizedUrl: url,
        name: 'share-derived.md',
        text: ['---', `kgWebpageUrl: "${url}"`, 'kgWebpageView: "markdown"', '---', '', '# Imported Share', ''].join('\n'),
      }),
    })

    if (pendingMirrorWrites === 0) {
      throw new Error('expected at least one host mirror write')
    }
    if (resolvedMirrorWrites !== pendingMirrorWrites) {
      throw new Error(`expected persistChatStreamArtifacts to await host mirror writes, got ${resolvedMirrorWrites}/${pendingMirrorWrites}`)
    }
  } finally {
    resetWorkspaceFsForTests()
    if (typeof previousChatLogAbsRoot === 'string') process.env.VITE_WORKSPACE_INITIALIZATION_CHAT_LOG_ABS_ROOT = previousChatLogAbsRoot
    else delete process.env.VITE_WORKSPACE_INITIALIZATION_CHAT_LOG_ABS_ROOT
    if (previousFetch) globalThis.fetch = previousFetch
    else delete (globalThis as unknown as { fetch?: typeof fetch }).fetch
    restoreDom()
    restoreWindow()
  }
}
