import { openPresetCatalog } from 'agentic-gateway/presets'
import index from 'agentic-gateway/catalog/index.json'
import pin from 'agentic-gateway/catalog/pin.json'

export type PresetSummary = {
  id: string
  label: string
  description: string
  activation: string
  slashCommand: string
  runtimeCommand: string
  invocationModes: readonly string[]
  chatRoute: string
  mcpTool: string
  mcpToken: string
  authoringStarter?: boolean
  executionSurface?: string
  bodyDigest?: string
}

export type PresetListResult =
  | { ok: true; presets: PresetSummary[]; sourcePath: string }
  | { ok: false; error: string }

let opened: ReturnType<typeof openPresetCatalog> | undefined

function catalog() {
  // The package lock pins both files. The gateway independently checks the index and selected body.
  return opened ??= openPresetCatalog(JSON.stringify(index) + '\n', pin)
}

type Entry = (typeof index.presets)[number]

export async function listGatewayPresets(): Promise<PresetListResult> {
  try {
    const verified = await catalog()
    const presets = verified.list().map((item: Entry) => ({
      id: item.id, label: item.label, description: item.description, activation: item.activation,
      slashCommand: item.slash_command, runtimeCommand: item.runtime_command,
      invocationModes: item.invocation_modes, chatRoute: item.chat_route,
      mcpTool: item.mcp_tool, mcpToken: item.mcp_token, bodyDigest: item.bodyDigest,
      authoringStarter: 'authoring_starter' in item && item.authoring_starter === true,
      ...('execution_surface' in item ? { executionSurface: item.execution_surface } : {}),
    }))
    return { ok: true, presets, sourcePath: index.source.path }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

function readSelectedBody(digest: string): Promise<string> {
  const bodies = import.meta.glob<string>([
    '../../../node_modules/agentic-gateway/catalog/bodies/*.txt',
    '../../../../node_modules/agentic-gateway/catalog/bodies/*.txt',
  ], { exhaustive: true, query: '?raw', import: 'default' })
  const body = '/node_modules/agentic-gateway/catalog/bodies/' + digest + '.txt'
  const load = bodies['../../..' + body] ?? bodies['../../../..' + body]
  if (!load) throw new Error('Missing pinned preset body: ' + digest)
  return load()
}

export async function selectGatewayPreset(key: string, readBody = readSelectedBody) {
  try {
    const verified = await catalog()
    const selected = await verified.select(key, readBody)
    return { ok: true as const, prompt: selected.prompt as string }
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : String(error) }
  }
}
