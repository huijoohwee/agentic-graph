import { buildStrybldrVideoHandoffFromGraphData } from '@/features/strybldr/strybldrStoryboard'
import { importStrybldrRunAllSource, STRYBLDR_RUN_ALL_SOURCE_IMPORT_OPTS } from '@/features/strybldr/strybldrRunAllSourceImport'
import { createStrybldrLocalVideoArtifactFromGraphData } from '@/features/strybldr/strybldrVideoHandoffArtifact'
import { readFileSync } from 'node:fs'
import { getWorkspaceFs, resetWorkspaceFsForTests } from '@/features/workspace-fs/workspaceFs'
import {
  parseWorkspaceFrontmatterFlowGraphDataCached,
  parseWorkspaceStrybldrStoryboardGraphDataCached,
} from '@/hooks/active-graph-data/workspaceStructuredGraph'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

export function testStrybldrWorkspaceParserSkipsEmptyMarkerOnlyFrontmatterFlow() {
  const text = [
    '---',
    'kgCanvasRenderMode: "2d"',
    'kgCanvas2dRenderer: "storyboard"',
    'kgStrybldrStoryboard: true',
    'flow:',
    '  nodes:',
    '    - id: "operator"',
    '      type: "StoryboardFrame"',
    '      label: "Operator"',
    '      lane: "Trigger"',
    '      summary: "Starts a local validation run."',
    '      action: "Run the local self-check."',
    '      prompt: "Summarize the operator intent."',
    '      strybldrSourceUnitId: "marker-only-source"',
    '    - id: "review_packet"',
    '      type: "StoryboardFrame"',
    '      label: "Review Packet"',
    '      lane: "Review"',
    '      summary: "Keeps generated fields blank until runtime returns them."',
    '      action: "Prepare a local review packet."',
    '      prompt: "Generate a local review packet from approved demo cards."',
    '      strybldrSourceUnitId: "marker-only-source"',
    '  edges:',
    '    - source: "operator"',
    '      target: "review_packet"',
    '      label: "review"',
    '---',
    '',
    '# Marker-only frontmatter flow',
  ].join('\n')
  const strybldrGraph = parseWorkspaceStrybldrStoryboardGraphDataCached({
    markdownName: 'marker-only-frontmatter-flow.md',
    markdownText: text,
  })
  assert(strybldrGraph === null, 'expected marker-only Strybldr parse to fall through instead of shadowing frontmatter-flow')
  const frontmatterGraph = parseWorkspaceFrontmatterFlowGraphDataCached({
    markdownName: 'marker-only-frontmatter-flow.md',
    markdownText: text,
  })
  assert(frontmatterGraph, 'expected frontmatter-flow parser to own marker-only flow cards')
  const handoff = buildStrybldrVideoHandoffFromGraphData(frontmatterGraph)
  assert(handoff.cards.length === 2, `expected frontmatter-flow StoryboardFrame cards to feed Run All, got ${handoff.cards.length}`)
}

export async function testStrybldrRunAllVideoSourceWritesVideoAgentAnalysisPacket() {
  try {
    resetWorkspaceFsForTests()
    const videoId = ['Run', 'All', 'Video', 'Agent'].join('')
    const sourceUrl = `https://www.youtube.com/watch?v=${videoId}`
    const graphData = {
      type: 'Graph',
      context: 'frontmatter-flow',
      nodes: [
        {
          id: 'source_video',
          type: 'StoryboardFrame',
          label: 'Source Video',
          properties: {
            lane: 'Source',
            summary: 'Operator supplied source video.',
            action: 'Analyze this source before provider work.',
            prompt: 'Prepare a source-backed video-agent packet.',
            sourceUrl,
            mediaUrl: sourceUrl,
            mediaKind: 'video',
            references: [sourceUrl],
          },
        },
        {
          id: 'analysis_packet',
          type: 'StoryboardFrame',
          label: 'Analysis Packet',
          properties: {
            lane: 'Analysis',
            summary: 'Review deterministic video-agent evidence.',
            action: 'Save the source-backed analysis packet.',
            prompt: 'Keep live provider outputs blank until approved runtime returns them.',
          },
        },
      ],
      edges: [{ id: 'source_video->analysis_packet', source: 'source_video', target: 'analysis_packet', label: 'analyze', properties: {} }],
    }
    const result = await createStrybldrLocalVideoArtifactFromGraphData(graphData)
    assert(result.ok === true, `expected video handoff artifact to be written, got ${JSON.stringify(result)}`)
    assert(result.videoAgentAnalysis === true, 'expected source-video Run All to include a video-agent analysis packet')
    const fsRuntime = await getWorkspaceFs()
    const artifactText = await fsRuntime.readFileText(result.path)
    assert(artifactText.includes('## Video-Agent Analysis Packet'), 'expected generated artifact to include video-agent packet section')
    assert(artifactText.includes('"schemaVersion": "agentic-graph-video-agent/v1"'), 'expected generated artifact to reuse video-agent pipeline schema')
    assert(artifactText.includes('"frameBoundingBoxes"'), 'expected generated artifact to include frame-level analysis evidence')
    assert(artifactText.includes('"zoneCounting"'), 'expected generated artifact to include zone-counting analysis evidence')
    assert(artifactText.includes('"transcriptText": null'), 'expected generated artifact to keep transcript text blank until live runtime returns it')
    assert(artifactText.includes(sourceUrl), 'expected generated artifact to preserve the operator-supplied source URL')
  } finally {
    resetWorkspaceFsForTests()
  }
}

export async function testStrybldrRunAllVideoSourceUsesWorkspaceImportUrlBridge() {
  const videoId = ['Run', 'All', 'Import', 'Bridge'].join('')
  const sourceUrl = `https://www.youtube.com/watch?v=${videoId}`
  const graphData = {
    type: 'Graph',
    context: 'frontmatter-flow',
    nodes: [
      {
        id: 'source_video',
        type: 'StoryboardFrame',
        label: 'Source Video',
        properties: {
          lane: 'Source',
          summary: 'Operator supplied source video.',
          action: 'Analyze this source through the workspace import bridge.',
          prompt: 'Use the same source intake as Toolbar Launch Import URL.',
          sourceUrl,
          mediaUrl: sourceUrl,
          mediaKind: 'video',
        },
      },
      {
        id: 'analysis_packet',
        type: 'StoryboardFrame',
        label: 'Analysis Packet',
        properties: {
          lane: 'Analysis',
          summary: 'Review deterministic video-agent evidence.',
          action: 'Save the source-backed analysis packet.',
          prompt: 'Keep live provider outputs blank until approved runtime returns them.',
        },
      },
    ],
    edges: [{ id: 'source_video->analysis_packet', source: 'source_video', target: 'analysis_packet', label: 'analyze', properties: {} }],
  }
  const calls: Array<{ url: string; opts: unknown }> = []
  const result = await importStrybldrRunAllSource({
    graphData,
    importUrl: (url, opts) => {
      calls.push({ url, opts })
    },
  })
  assert(result.importStarted === true, 'expected Run All source intake to start workspace importUrl')
  assert(result.sourceUrl === sourceUrl, 'expected Run All source intake to preserve the operator-supplied source URL')
  assert(calls.length === 1, `expected one workspace importUrl call, got ${calls.length}`)
  assert(calls[0]?.url === sourceUrl, 'expected workspace importUrl to receive the source video URL')
  assert(calls[0]?.opts === STRYBLDR_RUN_ALL_SOURCE_IMPORT_OPTS, 'expected shared Run All import options object')
  assert(JSON.stringify(calls[0]?.opts) === JSON.stringify({
    canvas2dRenderer: 'storyboard',
    documentSemanticMode: 'document',
  }), 'expected Run All import options to match Toolbar Launch Import URL storyboard document intake')
}

export function testStrybldrRunAllVideoSourceFallsBackToLaunchImportUrl() {
  const toolbarText = readFileSync(new URL('../components/Toolbar.tsx', import.meta.url), 'utf8')
  assert(toolbarText.includes("import { importUrlFallback } from '@/features/toolbar/launchDropdownFallbacks'"), 'expected Toolbar Run All to reuse Launch Import URL fallback owner')
  assert(toolbarText.includes('workspaceBridge.importUrl ||'), 'expected Toolbar Run All to fall back when the workspace bridge importUrl is absent')
  assert(toolbarText.includes('urlRaw: url'), 'expected Toolbar Run All fallback to pass the source URL into Launch Import URL fallback')
  assert(toolbarText.includes("opts?.canvas2dRenderer === 'storyboard'"), 'expected Toolbar Run All fallback to preserve storyboard import renderer options')
  assert(toolbarText.includes('documentSemanticMode: opts?.documentSemanticMode ?? null'), 'expected Toolbar Run All fallback to preserve document semantic import options')
}
