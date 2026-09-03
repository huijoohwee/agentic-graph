import fs from 'node:fs'
import path from 'node:path'

import { load as parseYaml } from 'js-yaml'
import { tryParseMarkdownFrontmatterFlowGraph } from '@/features/parsers/markdownFrontmatterFlowGraph'
import { parseGenerationInvocation } from '@/features/chat/generationInvocation'
import { parseChatSkillSlashInvocation } from '@/features/chat/chatSkillRegistry'
import { parseNativeCrawlerInvocation } from '@/features/chat/nativeCrawlerInvocation'
import { isVideoAgentDemoPresetInvocation } from '@/features/chat/floatingPanelChat/videoAgentDemoPresetSubmit'
import { isImageToThreeJsPromptPreset } from '@/features/image-to-threejs/imageToThreeJsPromptPreset'
import { isImageToGlbPromptPreset } from '@/features/image-to-glb/imageToGlbPromptPreset'
import { isAgenticGraphProbeTreePromptPreset } from '@/features/agentic-os/probeTreePromptPreset'
import { buildLiveCanvasHeroModel } from '@/features/agentic-os/liveCanvasHeroModel'
import { getCachedStoryboardWidgetWorkflowRunPlan } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetRenderGraph'
import {
  PROMPT_PRESET_ACTIVE_LLM_CHAT_ROUTE,
  PROMPT_PRESET_ACTIVE_NATIVE_CHAT_ROUTE,
  PROMPT_PRESET_REQUIRED_IDS,
} from '@/features/chat/promptPresetCatalog'
import { AGENTIC_CANVAS_OS_DOCS_MCP_TOOL_NAME } from '../../../mcp/agentic-canvas-os-docs-contract.mjs'

type PlainRecord = Record<string, unknown>

const GITHUB_ROOT = path.resolve(process.cwd(), '..', '..')
const DOC_PATH = path.join(GITHUB_ROOT, 'huijoohwee', 'docs', 'agentic-graph-agentic-video-canvas-demo.md')
const SCRIPT_PATH = path.join(GITHUB_ROOT, 'huijoohwee', 'docs', 'AI视频-港岛实景写实风-异城算计与女主绝境求生-终极统一执行总表.md')
const PROMPT_CATALOG_PATH = path.join(GITHUB_ROOT, 'agentic-canvas-os', 'docs', 'PROMPT-PRESETS.md')
const TEXT_PACKAGE_SHEETS = ['Character sheet', 'Scene sheet', 'Dialogue sheet', 'Visual asset sheet', 'Audio sheet', 'Timing sheet', 'Metadata sheet', 'Prompt sheet'] as const

const isRecord = (value: unknown): value is PlainRecord => (
  value != null && typeof value === 'object' && !Array.isArray(value)
)

const unwrap = (value: unknown): unknown => (
  isRecord(value) && Object.prototype.hasOwnProperty.call(value, 'value') ? value.value : value
)

const readFrontmatter = (markdownText: string): PlainRecord => {
  if (!markdownText.startsWith('---\n')) throw new Error('expected byte-zero YAML frontmatter')
  const end = markdownText.indexOf('\n---\n', 4)
  if (end < 0) throw new Error('expected a closing YAML frontmatter fence')
  const parsed = parseYaml(markdownText.slice(4, end))
  if (!isRecord(parsed)) throw new Error('expected frontmatter object')
  return parsed
}

const readFlowNodes = (meta: PlainRecord): PlainRecord[] => {
  const flow = meta.flow
  if (!isRecord(flow) || !Array.isArray(flow.nodes)) throw new Error('expected flow.nodes')
  return flow.nodes.filter(isRecord)
}

const nodeById = (nodes: PlainRecord[], id: string): PlainRecord => {
  const node = nodes.find(candidate => unwrap(candidate.id) === id)
  if (!node) throw new Error(`missing flow node ${id}`)
  return node
}

const property = (node: PlainRecord, key: string): unknown => unwrap(node[key])

export function testAgenticPromptPresetCatalogOwnsChatAndMcpRuntimeRoutes() {
  const catalogText = fs.readFileSync(PROMPT_CATALOG_PATH, 'utf8')
  const catalog = readFrontmatter(catalogText)
  const presets = Array.isArray(catalog.prompt_presets) ? catalog.prompt_presets.filter(isRecord) : []
  if (catalog.schema !== 'agentic-os-prompt-preset-catalog/v1') {
    throw new Error('expected the centralized prompt preset catalog')
  }
  const presetIds = new Set(presets.map(preset => String(preset.id || '')))
  for (const id of PROMPT_PRESET_REQUIRED_IDS) {
    if (!presetIds.has(id)) throw new Error(`centralized prompt preset catalog missing ${id}`)
  }
  const slashRoutes = presets.map(preset => String(preset.slash_command || ''))
  if (new Set(slashRoutes).size !== slashRoutes.length) {
    throw new Error(`centralized prompt preset routes must be unique: ${slashRoutes.join(',')}`)
  }
  for (const preset of presets) {
    const prompt = String(preset.prompt || '')
    const runtimeCommand = String(preset.runtime_command || '')
    const slashCommand = String(preset.slash_command || '')
    const invocationModes = Array.isArray(preset.invocation_modes) ? preset.invocation_modes.map(String) : []
    const responseMode = invocationModes[0]
    const chatRoute = String(preset.chat_route || '')
    const mcpTool = String(preset.mcp_tool || '')
    const mcpToken = String(preset.mcp_token || '')
    const isCardInline = slashCommand === '/image.to-threejs' || slashCommand === '/image.to-glb' || runtimeCommand === '/agentic-graph.probe-tree'
    let valid = false
    if (slashCommand === '/image.to-threejs') valid = isImageToThreeJsPromptPreset(prompt)
    else if (slashCommand === '/image.to-glb') valid = isImageToGlbPromptPreset(prompt)
    else if (runtimeCommand === '/agentic-graph.probe-tree') valid = isAgenticGraphProbeTreePromptPreset(prompt)
    else if (runtimeCommand === '/video-agent') valid = Boolean(parseGenerationInvocation(prompt))
    else if (runtimeCommand === '/crawler-agent') valid = parseNativeCrawlerInvocation(prompt)?.command === '/crawler-agent'
    else valid = parseChatSkillSlashInvocation(prompt)?.skill.slashCommand === runtimeCommand
    if (
      (!isCardInline && !slashCommand.endsWith('-prompt-preset'))
      || !valid
      || !prompt.startsWith(runtimeCommand)
      || invocationModes.length !== 2
      || (responseMode !== 'llm-chat-response' && responseMode !== 'native-chat-response')
      || invocationModes[1] !== 'mcp-invocation'
      || (responseMode === 'llm-chat-response' && chatRoute !== PROMPT_PRESET_ACTIVE_LLM_CHAT_ROUTE)
      || (responseMode === 'native-chat-response' && chatRoute !== PROMPT_PRESET_ACTIVE_NATIVE_CHAT_ROUTE)
      || mcpTool !== AGENTIC_CANVAS_OS_DOCS_MCP_TOOL_NAME
      || mcpToken !== runtimeCommand
    ) {
      throw new Error(`invalid centralized prompt preset ${String(preset.id || '')}`)
    }
  }
}

export function testAgenticVideoCanvasDemoIsExecutableAndReplayable() {
  const markdownText = fs.readFileSync(DOC_PATH, 'utf8')
  const meta = readFrontmatter(markdownText)
  if (!fs.existsSync(SCRIPT_PATH)) throw new Error('expected the bound video-generation demo script')
  if (meta.schema !== 'agentic-os-computing-flow/v1' || meta.demo_schema !== 'agentic-os-agentic-video-canvas/v1') {
    throw new Error(`unexpected schema identity ${JSON.stringify({ schema: meta.schema, demo_schema: meta.demo_schema })}`)
  }
  if (meta.runtime_status !== 'runtime-ready-in-dev' || meta.publish_scope !== 'local-only' || meta.live_provider_run_proven !== false) {
    throw new Error('expected honest Dev-only runtime state without a fabricated live provider proof')
  }

  const inputs = meta.inputs
  if (!isRecord(inputs)) throw new Error('expected inputs contract')
  if (inputs.video_generation_demo_script !== `workspace:/docs/${path.basename(SCRIPT_PATH)}`) {
    throw new Error('expected the authored source binding to preserve the canonical workspace docs path')
  }
  if (inputs.prompt_preset_id !== 'video-agent') throw new Error('expected the Video Canvas to bind the centralized video-agent prompt preset')
  const promptCatalog = readFrontmatter(fs.readFileSync(PROMPT_CATALOG_PATH, 'utf8'))
  const promptPresets = Array.isArray(promptCatalog.prompt_presets) ? promptCatalog.prompt_presets.filter(isRecord) : []
  const videoPromptPreset = promptPresets.find(preset => preset.id === 'video-agent')
  if (!videoPromptPreset || videoPromptPreset.slash_command !== '/video-prompt-preset' || videoPromptPreset.runtime_command !== '/video-agent') {
    throw new Error('expected centralized video prompt preset alias and runtime route')
  }
  const invocation = parseGenerationInvocation(videoPromptPreset.prompt)
  if (!invocation) throw new Error('expected default /video-agent invocation to resolve')
  if (!isVideoAgentDemoPresetInvocation(String(videoPromptPreset.prompt || ''))) throw new Error('expected the centralized video invocation to bypass generic provider chat')
  if (markdownText.includes('```text') || markdownText.includes('Build a 45-second, 16:9 Hong Kong live-action drama sequence')) {
    throw new Error('Video Canvas must not duplicate centralized prompt text')
  }
  const heroDefaultQuery = buildLiveCanvasHeroModel().defaultQuery
  if ((heroDefaultQuery.match(/@video-generation-demo-script/g) || []).length !== 1) {
    throw new Error('expected the Hero default query to preserve one canonical video-script binding token')
  }
  if (invocation.provider !== 'byteplus-modelark') throw new Error(`unexpected provider ${invocation.provider}`)
  if (invocation.specification !== 'low') throw new Error(`unexpected specification ${invocation.specification}`)
  if (invocation.thinkingType !== 'enabled') throw new Error(`unexpected thinking type ${invocation.thinkingType}`)
  if (invocation.tokenCap !== 'medium' || invocation.reasoningEffort !== 'medium' || invocation.maxCompletionTokens !== 16384) {
    throw new Error(`unexpected token-cap profile ${JSON.stringify(invocation)}`)
  }
  if (invocation.kinds.join(',') !== 'text,image,audio,video') throw new Error(`unexpected output kinds ${invocation.kinds.join(',')}`)
  if (!invocation.prompt.includes('@video-generation-demo-script')) throw new Error('expected source binding to remain in the executable prompt')
  const videoContract = meta.agentic_video_contract
  if (!isRecord(videoContract) || !Array.isArray(videoContract.text_package_sheets) || videoContract.text_package_sheets.join('|') !== TEXT_PACKAGE_SHEETS.join('|')) {
    throw new Error('expected the centralized eight-sheet text package contract')
  }

  const parsedGraph = tryParseMarkdownFrontmatterFlowGraph('agentic-graph-agentic-video-canvas-demo.md', markdownText)
  if (!parsedGraph) throw new Error('expected frontmatter flow graph parse result')
  const nodes = readFlowNodes(meta)
  const textNode = nodeById(nodes, 'video_text_generation')
  const imageNode = nodeById(nodes, 'video_image_generation')
  const videoNode = nodeById(nodes, 'video_clip_generation')
  const audioNode = nodeById(nodes, 'video_audio_generation')
  if (property(textNode, 'type') !== 'TextGeneration' || property(textNode, 'flow:widgetFormId') !== 'videoScript') {
    throw new Error('expected executable TextGeneration owner')
  }
  if (
    property(textNode, 'chatThinkingType') !== 'enabled'
    || property(textNode, 'chatReasoningEffort') !== 'medium'
    || property(textNode, 'chatMaxCompletionTokens') !== 16384
  ) {
    throw new Error('expected the preset text owner to persist enabled thinking and the default medium token cap')
  }
  const textPrompt = String(property(textNode, 'prompt') || '')
  for (const sheet of TEXT_PACKAGE_SHEETS) {
    if (!textPrompt.includes(sheet)) throw new Error(`text package prompt missing ${sheet}`)
  }
  if (property(imageNode, 'type') !== 'ImageGeneration' || property(imageNode, 'flow:widgetFormId') !== 'imageGeneration') {
    throw new Error('expected executable ImageGeneration owner')
  }
  if (property(videoNode, 'type') !== 'VideoGeneration' || property(videoNode, 'flow:widgetFormId') !== 'videoGeneration') {
    throw new Error('expected executable VideoGeneration owner')
  }
  if (property(videoNode, 'generate_audio') !== true) throw new Error('expected provider-generated master audio track')
  if (property(audioNode, 'type') !== 'RichMediaPanel') throw new Error('expected shared audio Rich Media projection')

  const parsedTypes = new Set(parsedGraph.graphData.nodes.map(node => String(node.type || '')))
  for (const requiredType of ['TextGeneration', 'ImageGeneration', 'VideoGeneration', 'RichMediaPanel']) {
    if (!parsedTypes.has(requiredType)) throw new Error(`parsed graph missing ${requiredType}`)
  }
  const runPlan = getCachedStoryboardWidgetWorkflowRunPlan({
    graphData: parsedGraph.graphData,
    graphRevision: 0,
    preferCurrentGraphDataRefs: true,
  })
  for (const requiredNodeId of ['video_text_generation', 'video_image_generation', 'video_clip_generation']) {
    if (!runPlan?.orderedNodeIds.includes(requiredNodeId)) {
      throw new Error(`Run all plan missing ${requiredNodeId}: ${runPlan?.orderedNodeIds.join(',') || '<empty>'}`)
    }
  }
  const artifactContract = meta.runtime_artifact_contract
  if (!isRecord(artifactContract)) throw new Error('expected runtime_artifact_contract')
  for (const kind of invocation.kinds) {
    const record = artifactContract[kind]
    if (!isRecord(record) || record.persisted_by !== 'existing Cloudflare artifact utilities') {
      throw new Error(`expected ${kind} Cloudflare persistence contract`)
    }
  }
}

export function testAgenticVideoCanvasDemoUsesSharedCloudflarePersistenceOwners() {
  const richMediaRunPath = path.join(process.cwd(), 'src', 'features', 'chat', 'richMediaRun.ts')
  const richMediaRunStoragePath = path.join(process.cwd(), 'src', 'features', 'chat', 'richMediaRunStorage.ts')
  const source = `${fs.readFileSync(richMediaRunPath, 'utf8')}\n${fs.readFileSync(richMediaRunStoragePath, 'utf8')}`
  for (const required of [
    'uploadMediaFileToAgenticGraphStorage',
    'registerUploadedMediaPanelStorage',
    'publishGeneratedWorkspaceEntriesToAgenticGraphStorage',
    'publishGeneratedTextToStorage({ outputPath',
    'outputStorageUrl: storage?.accessUrl || storage?.publicUrl',
  ]) {
    if (!source.includes(required)) throw new Error(`shared persistence owner missing ${required}`)
  }
}
