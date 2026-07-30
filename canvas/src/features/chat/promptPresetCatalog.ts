import { load as parseYaml } from 'js-yaml'
import { readWorkspaceInitializationDocsMirrorEntries } from '@/features/workspace-fs/workspaceSeedProvider'
import { getWorkspaceFs } from '@/features/workspace-fs/workspaceFs'
import type { WorkspaceFs } from '@/features/workspace-fs/types'
import { parseChatSkillSlashInvocation } from './chatSkillRegistry'
import { parseGenerationInvocation } from './generationInvocation'
import {
  IMAGE_TO_THREEJS_PROMPT_PRESET_ID,
  isImageToThreeJsPromptPreset,
} from '@/features/image-to-threejs/imageToThreeJsPromptPreset'
import {
  IMAGE_TO_GLB_PROMPT_PRESET_ID,
  isImageToGlbPromptPreset,
} from '@/features/image-to-glb/imageToGlbPromptPreset'
import { parseNativeCrawlerInvocation } from './nativeCrawlerInvocation'
import {
  isKnowgrphProbeTreePromptPreset,
  KNOWGRPH_PROBE_TREE_DOC_INVOCATION,
  KNOWGRPH_PROBE_TREE_PROMPT_PRESET_ID,
} from '@/features/agentic-os/probeTreePromptPreset'
import { AGENTIC_CANVAS_OS_DOCS_MCP_TOOL_NAME } from '../../../../mcp/agentic-canvas-os-docs-contract.mjs'

type PlainRecord = Record<string, unknown>

export const PROMPT_PRESET_CATALOG_WORKSPACE_PATH = '/agentic-canvas-os/docs/PROMPT-PRESETS.md' as const
export const PROMPT_PRESET_CATALOG_SCHEMA = 'agentic-os-prompt-preset-catalog/v1' as const

export type PromptPresetActivation = 'source-backed-canvas' | 'chat-agent' | 'card-inline'
export type PromptPresetResponseMode = 'llm-chat-response' | 'native-chat-response'
export type PromptPresetInvocationMode = PromptPresetResponseMode | 'mcp-invocation'

export const PROMPT_PRESET_ACTIVE_LLM_CHAT_ROUTE = 'active Chat provider, endpoint, and model' as const
export const PROMPT_PRESET_ACTIVE_NATIVE_CHAT_ROUTE = 'active native shared runtime' as const
export const PROMPT_PRESET_REQUIRED_IDS = [
  'video-agent',
  IMAGE_TO_THREEJS_PROMPT_PRESET_ID,
  IMAGE_TO_GLB_PROMPT_PRESET_ID,
  KNOWGRPH_PROBE_TREE_PROMPT_PRESET_ID,
  'sme-care-agent',
  'investment-research-agent',
  'crawler-agent',
  'sme-risk-assessment',
  'sme-protection-comparison',
  'investment-options-comparison',
  'investment-plan-assessment',
] as const

export type PromptPreset = {
  id: string
  label: string
  slashCommand: `/${string}`
  runtimeCommand: `/${string}`
  description: string
  activation: PromptPresetActivation
  invocationModes: readonly [PromptPresetResponseMode, 'mcp-invocation']
  chatRoute: typeof PROMPT_PRESET_ACTIVE_LLM_CHAT_ROUTE | typeof PROMPT_PRESET_ACTIVE_NATIVE_CHAT_ROUTE
  mcpTool: typeof AGENTIC_CANVAS_OS_DOCS_MCP_TOOL_NAME
  mcpToken: `/${string}`
  prompt: string
}

export type PromptPresetCatalogResult =
  | { ok: true; presets: PromptPreset[]; sourcePath: typeof PROMPT_PRESET_CATALOG_WORKSPACE_PATH }
  | { ok: false; error: string }

export type PromptPresetResult =
  | { ok: true; preset: PromptPreset; sourcePath: typeof PROMPT_PRESET_CATALOG_WORKSPACE_PATH }
  | { ok: false; error: string }

export const isPromptPresetCatalogError = (
  result: PromptPresetCatalogResult | PromptPresetResult,
): result is Extract<typeof result, { ok: false }> => !result.ok

const isRecord = (value: unknown): value is PlainRecord => (
  value != null && typeof value === 'object' && !Array.isArray(value)
)

const parseFrontmatter = (markdownText: string): PlainRecord | null => {
  if (!markdownText.startsWith('---\n')) return null
  const endIndex = markdownText.indexOf('\n---\n', 4)
  if (endIndex < 0) return null
  const parsed = parseYaml(markdownText.slice(4, endIndex))
  return isRecord(parsed) ? parsed : null
}

const normalizeSlashCommand = (value: unknown): `/${string}` | '' => {
  const command = String(value || '').trim()
  return command.startsWith('/') ? command as `/${string}` : ''
}

const parsePreset = (value: unknown): PromptPreset | null => {
  if (!isRecord(value)) return null
  const id = String(value.id || '').trim()
  const label = String(value.label || '').trim()
  const slashCommand = normalizeSlashCommand(value.slash_command)
  const explicitRuntimeCommand = normalizeSlashCommand(value.runtime_command)
  const runtimeCommand = explicitRuntimeCommand || (
    id === IMAGE_TO_THREEJS_PROMPT_PRESET_ID || id === IMAGE_TO_GLB_PROMPT_PRESET_ID ? slashCommand : ''
  )
  const description = String(value.description || '').trim()
  const activation = String(value.activation || '').trim()
  const invocationModes = Array.isArray(value.invocation_modes)
    ? value.invocation_modes.map(mode => String(mode || '').trim())
    : []
  const responseMode = invocationModes[0]
  const chatRoute = String(value.chat_route || '').trim()
  const mcpTool = String(value.mcp_tool || '').trim()
  const mcpToken = normalizeSlashCommand(value.mcp_token)
  const prompt = String(value.prompt || '').trim()
  if (
    !id
    || !label
    || !slashCommand
    || !runtimeCommand
    || (!slashCommand.endsWith('-prompt-preset') && id !== IMAGE_TO_THREEJS_PROMPT_PRESET_ID && id !== IMAGE_TO_GLB_PROMPT_PRESET_ID)
    || !description
    || !prompt
    || (activation !== 'source-backed-canvas' && activation !== 'chat-agent' && activation !== 'card-inline')
    || invocationModes.length !== 2
    || (responseMode !== 'llm-chat-response' && responseMode !== 'native-chat-response')
    || invocationModes[1] !== 'mcp-invocation'
    || (responseMode === 'llm-chat-response' && chatRoute !== PROMPT_PRESET_ACTIVE_LLM_CHAT_ROUTE)
    || (responseMode === 'native-chat-response' && chatRoute !== PROMPT_PRESET_ACTIVE_NATIVE_CHAT_ROUTE)
    || mcpTool !== AGENTIC_CANVAS_OS_DOCS_MCP_TOOL_NAME
    || mcpToken !== runtimeCommand
  ) return null
  if (id === IMAGE_TO_THREEJS_PROMPT_PRESET_ID) {
    if (
      slashCommand !== '/image.to-threejs'
      || activation !== 'card-inline'
      || !isImageToThreeJsPromptPreset(prompt)
    ) return null
  } else if (id === IMAGE_TO_GLB_PROMPT_PRESET_ID) {
    if (
      slashCommand !== '/image.to-glb'
      || activation !== 'card-inline'
      || !isImageToGlbPromptPreset(prompt)
    ) return null
  } else if (id === KNOWGRPH_PROBE_TREE_PROMPT_PRESET_ID) {
    if (
      runtimeCommand !== KNOWGRPH_PROBE_TREE_DOC_INVOCATION.slashCommand
      || activation !== 'card-inline'
      || !isKnowgrphProbeTreePromptPreset(prompt)
    ) return null
  } else if (runtimeCommand === '/video-agent') {
    const invocation = parseGenerationInvocation(prompt)
    if (!invocation || !prompt.includes('@video-generation-demo-script') || activation !== 'source-backed-canvas') return null
  } else if (runtimeCommand === '/crawler-agent') {
    const invocation = parseNativeCrawlerInvocation(prompt)
    if (!invocation || invocation.command !== runtimeCommand || activation !== 'chat-agent') return null
  } else {
    const invocation = parseChatSkillSlashInvocation(prompt)
    if (!invocation || invocation.skill.slashCommand !== runtimeCommand || activation !== 'chat-agent') return null
  }
  const typedChatRoute = responseMode === 'llm-chat-response'
    ? PROMPT_PRESET_ACTIVE_LLM_CHAT_ROUTE
    : PROMPT_PRESET_ACTIVE_NATIVE_CHAT_ROUTE
  return {
    id,
    label,
    slashCommand,
    runtimeCommand,
    description,
    activation,
    invocationModes: [responseMode, 'mcp-invocation'],
    chatRoute: typedChatRoute,
    mcpTool: AGENTIC_CANVAS_OS_DOCS_MCP_TOOL_NAME,
    mcpToken,
    prompt,
  }
}

const readRepoLocalCatalogText = async (
  fs: WorkspaceFs,
  preferAuthoritativeMirror: boolean,
): Promise<string> => {
  const relPath = PROMPT_PRESET_CATALOG_WORKSPACE_PATH.replace(/^\//, '')
  if (preferAuthoritativeMirror) {
    const entries = await readWorkspaceInitializationDocsMirrorEntries({ preferCompleteDataset: true })
    const authoritativeText = String(entries.find(entry => entry.relPath === relPath)?.text || '')
    if (authoritativeText) return authoritativeText
  }
  const workspaceText = await fs.readFileText(PROMPT_PRESET_CATALOG_WORKSPACE_PATH).catch(() => '')
  if (workspaceText) return workspaceText
  const entries = await readWorkspaceInitializationDocsMirrorEntries({ preferCompleteDataset: true })
  return String(entries.find(entry => entry.relPath === relPath)?.text || '')
}

export const loadPromptPresetCatalog = async (fsOverride?: WorkspaceFs): Promise<PromptPresetCatalogResult> => {
  const publishedSource = fsOverride
    ? { authority: 'repo-local' as const }
    : await import('@/features/workspace-fs/workspacePublishedAgenticDocsSource')
        .then(module => module.readPublishedAgenticDocSource(PROMPT_PRESET_CATALOG_WORKSPACE_PATH))
  const markdownText = publishedSource.authority === 'canonical-storage'
    ? publishedSource.text
    : await readRepoLocalCatalogText(fsOverride || await getWorkspaceFs(), !fsOverride)
  if (!markdownText) return { ok: false, error: `Prompt preset catalog unavailable: ${PROMPT_PRESET_CATALOG_WORKSPACE_PATH}` }
  const frontmatter = parseFrontmatter(markdownText)
  if (frontmatter?.schema !== PROMPT_PRESET_CATALOG_SCHEMA || !Array.isArray(frontmatter.prompt_presets)) {
    return { ok: false, error: 'Prompt preset catalog frontmatter is invalid.' }
  }
  const presets = frontmatter.prompt_presets.map(parsePreset)
  if (presets.some(preset => !preset)) return { ok: false, error: 'Prompt preset catalog contains an invalid preset.' }
  const typedPresets = presets.filter((preset): preset is PromptPreset => Boolean(preset))
  const ids = new Set(typedPresets.map(preset => preset.id))
  const slashCommands = new Set(typedPresets.map(preset => preset.slashCommand))
  if (ids.size !== typedPresets.length) {
    return { ok: false, error: 'Prompt preset catalog contains duplicate ids.' }
  }
  if (slashCommands.size !== typedPresets.length) {
    return { ok: false, error: 'Prompt preset catalog contains duplicate slash commands.' }
  }
  for (const id of PROMPT_PRESET_REQUIRED_IDS) {
    if (!ids.has(id)) return { ok: false, error: `Prompt preset catalog is missing ${id}.` }
  }
  return { ok: true, presets: typedPresets, sourcePath: PROMPT_PRESET_CATALOG_WORKSPACE_PATH }
}

export const loadPromptPreset = async (id: string, fsOverride?: WorkspaceFs): Promise<PromptPresetResult> => {
  const catalog = await loadPromptPresetCatalog(fsOverride)
  if (isPromptPresetCatalogError(catalog)) return catalog
  const preset = catalog.presets.find(candidate => candidate.id === String(id || '').trim())
  return preset
    ? { ok: true, preset, sourcePath: catalog.sourcePath }
    : { ok: false, error: `Unknown prompt preset: ${String(id || '').trim() || '(empty)'}` }
}
