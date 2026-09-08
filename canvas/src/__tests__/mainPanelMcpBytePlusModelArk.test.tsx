import React from 'react'
import { createRoot } from 'react-dom/client'
import IntegrationsHubView from '@/features/panels/views/IntegrationsHubView'
import McpHubView from '@/features/panels/views/McpHubView'
import {
  BYTEPLUS_MODELARK_MCP_AUTH_ENV,
  BYTEPLUS_MODELARK_MCP_BASE_URL,
  BYTEPLUS_MODELARK_MCP_BETA_HEADER,
  BYTEPLUS_MODELARK_MCP_BETA_HEADER_VALUE,
  BYTEPLUS_MODELARK_MCP_CODEX_SERVER_KEY,
  BYTEPLUS_MODELARK_MCP_DEFAULT_MODEL,
  BYTEPLUS_MODELARK_MCP_DEFAULT_IMAGE_MODEL,
  BYTEPLUS_MODELARK_MCP_DOC_ENTRIES,
  BYTEPLUS_MODELARK_MCP_DOCS_URL,
  BYTEPLUS_MODELARK_MCP_DOC_LAST_UPDATED,
  BYTEPLUS_MODELARK_MCP_IMAGE_GENERATION_DOCS_URL,
  BYTEPLUS_MODELARK_MCP_MODEL_LIST_URL,
  BYTEPLUS_MODELARK_MCP_RESPONSES_DOCS_URL,
  BYTEPLUS_MODELARK_MCP_SERVER_LABEL_PLACEHOLDER,
  BYTEPLUS_MODELARK_MCP_SERVER_URL_PLACEHOLDER,
  BYTEPLUS_MODELARK_MCP_SEEDANCE_TUTORIAL_DOCS_URL,
  BYTEPLUS_MODELARK_MCP_VIDEO_GENERATION_DOCS_URL,
  BYTEPLUS_MODELARK_MCP_VIDEO_MODEL_FAMILY,
  buildBytePlusModelArkMcpCodexAddCommand,
  buildBytePlusModelArkMcpMediaProfileJson,
  buildBytePlusModelArkMcpReadinessManifestJson,
  buildBytePlusModelArkMcpResponsesToolConfigJson,
  getBytePlusModelArkMcpApiRowAnchorId,
} from '@/features/panels/views/byteplusModelArkMcpApiDocs'
import { isIntegrationsOwnedSetting, isMcpOwnedSetting } from '@/features/panels/views/useSettingsView.helpers'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { initWindowHarness } from '@/tests/lib/windowHarness'
import { MemoryStorage } from '@/tests/lib/memoryStorage'
import { installDeterministicRaf, mountReactRoot, unmountReactRoot } from '@/tests/lib/reactRootHarness'
import { useGraphStore } from '@/hooks/useGraphStore'

const LEGACY_MODELARK_AUTH_ENV = ['MODEL', 'ARK_API_KEY'].join('')

const withRenderedHub = async (
  hub: 'integrations' | 'mcp',
  assertions: (container: Element) => void,
): Promise<void> => {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { dom, restore: restoreDom } = initJsdomHarness()
  let root: ReturnType<typeof createRoot> | null = null

  try {
    const anyWindow = dom.window as unknown as { requestAnimationFrame?: (cb: (ts: number) => void) => number }
    anyWindow.requestAnimationFrame = installDeterministicRaf(dom.window)

    useGraphStore.getState().resetAll()

    const doc = dom.window.document
    const container = doc.createElement('section')
    doc.body.appendChild(container)
    root = createRoot(container as unknown as HTMLElement)
    const Component = hub === 'integrations' ? IntegrationsHubView : McpHubView
    await mountReactRoot(root, React.createElement(Component), { window: dom.window, frames: 4 })

    assertions(container)
  } finally {
    try {
      if (root) await unmountReactRoot(root, { window: dom.window })
    } catch {
      void 0
    }
    restoreDom()
    restoreWindow()
  }
}

const assertNoSecretOrProviderEndpointMaterial = (text: string): void => {
  ;[
    '<ARK_API_KEY>',
    LEGACY_MODELARK_AUTH_ENV,
    'Authorization: Bearer',
    'sk-',
    'YOUR_BYTEPLUS_API_KEY',
    'YOUR_ARK_API_KEY',
    'https://mcp.deepwiki.com/mcp',
    'https://mcp.example.com/mcp',
  ].forEach(token => {
    if (text.includes(token)) {
      throw new Error(`expected BytePlus ModelArk MCP config to omit secret or provider endpoint token ${JSON.stringify(token)}, got ${JSON.stringify(text)}`)
    }
  })
}

const readRenderedFormValues = (container: Element): string => (
  Array.from(container.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input, textarea, select'))
    .map(el => el.value)
    .join('\n')
)

const assertHubSurfacesBytePlusModelArkMcpConfig = (container: Element): void => {
  const text = container.textContent || ''
  const searchableText = `${text}\n${readRenderedFormValues(container)}`
  ;[
    'BytePlus ModelArk Remote MCP',
    'byteplusModelArkMcp.docs.url',
    'byteplusModelArkMcp.docs.last_updated',
    'byteplusModelArkMcp.api.scope',
    'byteplusModelArkMcp.base_url',
    'byteplusModelArkMcp.auth.env',
    'byteplusModelArkMcp.beta.header',
    'byteplusModelArkMcp.model.default',
    'byteplusModelArkMcp.tool.type',
    'byteplusModelArkMcp.tool.server_label',
    'byteplusModelArkMcp.tool.server_url',
    'byteplusModelArkMcp.codex.server_key',
    'byteplusModelArkMcp.remote_config.codex',
    'byteplusModelArkMcp.tool.require_approval',
    'byteplusModelArkMcp.transport.required',
    'byteplusModelArkMcp.media.profile',
    'byteplusModelArkMcp.media.image_generation',
    'byteplusModelArkMcp.media.audio_generation',
    'byteplusModelArkMcp.media.video_generation',
    'byteplusModelArkMcp.media.generate_audio',
    'byteplusModelArkMcp.capability.ecosystem',
    'byteplusModelArkMcp.capability.multi_turn',
    'byteplusModelArkMcp.capability.mixed_tools',
    'byteplusModelArkMcp.limit.default_rpm',
    'byteplusModelArkMcp.billing.tool_calls',
    'byteplusModelArkMcp.responses_tool_config',
    'byteplusModelArkMcp.readiness_manifest',
    'byteplusModelArkMcp.docs.responses_request',
    'byteplusModelArkMcp.docs.model_list',
    'byteplusModelArkMcp.docs.image_generation',
    'byteplusModelArkMcp.docs.video_generation',
    'byteplusModelArkMcp.docs.seedance_tutorial',
    BYTEPLUS_MODELARK_MCP_DOCS_URL,
    BYTEPLUS_MODELARK_MCP_DOC_LAST_UPDATED,
    BYTEPLUS_MODELARK_MCP_RESPONSES_DOCS_URL,
    BYTEPLUS_MODELARK_MCP_MODEL_LIST_URL,
    BYTEPLUS_MODELARK_MCP_IMAGE_GENERATION_DOCS_URL,
    BYTEPLUS_MODELARK_MCP_VIDEO_GENERATION_DOCS_URL,
    BYTEPLUS_MODELARK_MCP_SEEDANCE_TUTORIAL_DOCS_URL,
    BYTEPLUS_MODELARK_MCP_BASE_URL,
    BYTEPLUS_MODELARK_MCP_AUTH_ENV,
    `${BYTEPLUS_MODELARK_MCP_BETA_HEADER}: ${BYTEPLUS_MODELARK_MCP_BETA_HEADER_VALUE}`,
    BYTEPLUS_MODELARK_MCP_DEFAULT_MODEL,
    BYTEPLUS_MODELARK_MCP_DEFAULT_IMAGE_MODEL,
    BYTEPLUS_MODELARK_MCP_VIDEO_MODEL_FAMILY,
    BYTEPLUS_MODELARK_MCP_CODEX_SERVER_KEY,
    BYTEPLUS_MODELARK_MCP_SERVER_LABEL_PLACEHOLDER,
    BYTEPLUS_MODELARK_MCP_SERVER_URL_PLACEHOLDER,
    buildBytePlusModelArkMcpCodexAddCommand(),
    'Responses API only',
    'streamable-http',
    'image_generation via ModelArk image generation docs',
    'audio_for_video_generation via ModelArk video generation docs',
    'video_generation via Seedance / Dreamina Seedance models',
    'generate_audio',
    'broad MCP ecosystem compatibility',
    'multi-turn MCP tool calls',
    'MCP tools plus user-defined functions',
    '1000 RPM',
    'base model token consumption only',
    'Open FloatingPanel Chat UI',
  ].forEach(token => {
    if (!searchableText.includes(token)) {
      throw new Error(`expected hub to include BytePlus ModelArk MCP config token ${JSON.stringify(token)}, got ${JSON.stringify(searchableText)}`)
    }
  })
  const providerRows = Array.from(container.querySelectorAll<HTMLElement>('[data-kg-anchor^="mcp-row-byteplus-modelark-"]'))
  if (!providerRows.length) throw new Error('expected source-owned BytePlus MCP rows before checking their material')
  assertNoSecretOrProviderEndpointMaterial(providerRows.map(row => `${row.textContent || ''}\n${readRenderedFormValues(row)}`).join('\n'))
  const mcpAnchors = Array.from(container.querySelectorAll<HTMLElement>('[data-kg-anchor]'))
    .map(el => String(el.dataset.kgAnchor || ''))
    .filter(Boolean)
  if (!mcpAnchors.some(anchor => anchor.startsWith('mcp-row-byteplus-modelark-'))) {
    throw new Error(`expected BytePlus ModelArk MCP rows to use BytePlus ModelArk MCP anchors, got ${JSON.stringify(mcpAnchors)}`)
  }
}

export async function testMcpHubSurfacesBytePlusModelArkMcpConfig() {
  await withRenderedHub('mcp', assertHubSurfacesBytePlusModelArkMcpConfig)
}

export async function testIntegrationsHubSurfacesBytePlusModelArkMcpConfig() {
  await withRenderedHub('integrations', assertHubSurfacesBytePlusModelArkMcpConfig)
}

export function testBytePlusModelArkMcpGeneratedToolConfigUsesOnlyOperatorPlaceholders() {
  const configText = buildBytePlusModelArkMcpResponsesToolConfigJson()
  const parsed = JSON.parse(configText) as {
    tools?: Array<{
      type?: string
      server_label?: string
      server_url?: string
      require_approval?: string
    }>
  }
  const tool = parsed.tools?.[0]

  if (tool?.type !== 'mcp') {
    throw new Error(`expected Responses API MCP tool type, got ${JSON.stringify(tool)}`)
  }
  if (
    tool.server_label !== BYTEPLUS_MODELARK_MCP_SERVER_LABEL_PLACEHOLDER
    || tool.server_url !== BYTEPLUS_MODELARK_MCP_SERVER_URL_PLACEHOLDER
    || tool.require_approval !== 'operator-configured'
  ) {
    throw new Error(`expected operator-owned placeholders in tool config, got ${JSON.stringify(tool)}`)
  }
  assertNoSecretOrProviderEndpointMaterial(configText)
}

export function testBytePlusModelArkMcpCodexConfigTargetsOperatorRemoteMediaServer() {
  const command = buildBytePlusModelArkMcpCodexAddCommand()
  if (command !== `codex mcp add ${BYTEPLUS_MODELARK_MCP_CODEX_SERVER_KEY} --url '${BYTEPLUS_MODELARK_MCP_SERVER_URL_PLACEHOLDER}'`) {
    throw new Error(`expected Codex MCP add command to use server key and Streamable HTTP placeholder, got ${JSON.stringify(command)}`)
  }
  assertNoSecretOrProviderEndpointMaterial(command)
}

export function testBytePlusModelArkMcpMediaProfileCoversImageAudioAndVideoWithoutApiClaims() {
  const profileText = buildBytePlusModelArkMcpMediaProfileJson()
  const parsed = JSON.parse(profileText) as {
    codexMcpServer?: string
    authEnv?: string
    mediaGeneration?: {
      image?: { intent?: string; docsUrl?: string; defaultModel?: string }
      audio?: { intent?: string; docsUrl?: string; boundary?: string }
      video?: { intent?: string; docsUrl?: string; modelFamily?: string; generateAudioDefault?: boolean }
    }
    boundaries?: {
      browserStoresArkApiKey?: boolean
      codexConfigUsesOperatorUrlPlaceholder?: boolean
      runtimeReadyAfterOperatorAddsRemoteMcp?: boolean
    }
  }
  if (
    parsed.codexMcpServer !== BYTEPLUS_MODELARK_MCP_CODEX_SERVER_KEY
    || parsed.authEnv !== BYTEPLUS_MODELARK_MCP_AUTH_ENV
    || parsed.mediaGeneration?.image?.intent !== 'image_generation'
    || parsed.mediaGeneration.image.docsUrl !== BYTEPLUS_MODELARK_MCP_IMAGE_GENERATION_DOCS_URL
    || parsed.mediaGeneration.image.defaultModel !== BYTEPLUS_MODELARK_MCP_DEFAULT_IMAGE_MODEL
    || parsed.mediaGeneration.audio?.intent !== 'audio_for_video_generation'
    || parsed.mediaGeneration.audio.docsUrl !== BYTEPLUS_MODELARK_MCP_VIDEO_GENERATION_DOCS_URL
    || !String(parsed.mediaGeneration.audio.boundary || '').includes('does not claim a standalone audio-only output API')
    || parsed.mediaGeneration.video?.intent !== 'video_generation'
    || parsed.mediaGeneration.video.docsUrl !== BYTEPLUS_MODELARK_MCP_VIDEO_GENERATION_DOCS_URL
    || parsed.mediaGeneration.video.modelFamily !== BYTEPLUS_MODELARK_MCP_VIDEO_MODEL_FAMILY
    || parsed.mediaGeneration.video.generateAudioDefault !== true
  ) {
    throw new Error(`expected image/audio/video media profile, got ${JSON.stringify(parsed.mediaGeneration)}`)
  }
  if (
    parsed.boundaries?.browserStoresArkApiKey !== false
    || parsed.boundaries.codexConfigUsesOperatorUrlPlaceholder !== true
    || parsed.boundaries.runtimeReadyAfterOperatorAddsRemoteMcp !== true
  ) {
    throw new Error(`expected Codex remote-MCP boundary flags, got ${JSON.stringify(parsed.boundaries)}`)
  }
  assertNoSecretOrProviderEndpointMaterial(profileText)
}

export function testBytePlusModelArkMcpReadinessManifestKeepsServerManagedBoundaries() {
  const manifestText = buildBytePlusModelArkMcpReadinessManifestJson()
  const parsed = JSON.parse(manifestText) as {
    byteplusModelArkRemoteMcp?: {
      docsLastUpdated?: string
      invocation?: {
        api?: string
        baseUrl?: string
        model?: string
        authEnv?: string
        betaHeader?: { name?: string; value?: string }
      }
      remoteMcp?: {
        transport?: string
        serverUrlPlaceholder?: string
        serverLabelPlaceholder?: string
      }
      codex?: {
        serverKey?: string
        addCommand?: string
        mediaProfile?: {
          mediaGeneration?: {
            image?: { intent?: string }
            audio?: { intent?: string }
            video?: { intent?: string; generateAudioDefault?: boolean }
          }
        }
      }
      boundaries?: {
        browserStoresArkApiKey?: boolean
        browserStoresRemoteMcpSecrets?: boolean
        remoteMcpUrlIsOperatorOwned?: boolean
        approvalPolicyIsOperatorOwned?: boolean
        deployedUntilOperatorDeploys?: boolean
      }
    }
  }
  const manifest = parsed.byteplusModelArkRemoteMcp
  const invocation = manifest?.invocation
  const remoteMcp = manifest?.remoteMcp
  const codex = manifest?.codex
  const boundaries = manifest?.boundaries

  if (
    manifest?.docsLastUpdated !== BYTEPLUS_MODELARK_MCP_DOC_LAST_UPDATED
    || invocation?.api !== 'Responses API'
    || invocation.baseUrl !== BYTEPLUS_MODELARK_MCP_BASE_URL
    || invocation.model !== BYTEPLUS_MODELARK_MCP_DEFAULT_MODEL
    || invocation.authEnv !== BYTEPLUS_MODELARK_MCP_AUTH_ENV
    || invocation.betaHeader?.name !== BYTEPLUS_MODELARK_MCP_BETA_HEADER
    || invocation.betaHeader.value !== BYTEPLUS_MODELARK_MCP_BETA_HEADER_VALUE
  ) {
    throw new Error(`expected ModelArk invocation metadata, got ${JSON.stringify(invocation)}`)
  }
  if (
    remoteMcp?.transport !== 'streamable-http'
    || remoteMcp.serverUrlPlaceholder !== BYTEPLUS_MODELARK_MCP_SERVER_URL_PLACEHOLDER
    || remoteMcp.serverLabelPlaceholder !== BYTEPLUS_MODELARK_MCP_SERVER_LABEL_PLACEHOLDER
  ) {
    throw new Error(`expected remote MCP transport and placeholders, got ${JSON.stringify(remoteMcp)}`)
  }
  if (
    codex?.serverKey !== BYTEPLUS_MODELARK_MCP_CODEX_SERVER_KEY
    || codex.addCommand !== buildBytePlusModelArkMcpCodexAddCommand()
    || codex.mediaProfile?.mediaGeneration?.image?.intent !== 'image_generation'
    || codex.mediaProfile.mediaGeneration.audio?.intent !== 'audio_for_video_generation'
    || codex.mediaProfile.mediaGeneration.video?.intent !== 'video_generation'
    || codex.mediaProfile.mediaGeneration.video.generateAudioDefault !== true
  ) {
    throw new Error(`expected Codex image/audio/video media readiness, got ${JSON.stringify(codex)}`)
  }
  if (
    boundaries?.browserStoresArkApiKey !== false
    || boundaries.browserStoresRemoteMcpSecrets !== false
    || boundaries.remoteMcpUrlIsOperatorOwned !== true
    || boundaries.approvalPolicyIsOperatorOwned !== true
    || boundaries.deployedUntilOperatorDeploys !== false
  ) {
    throw new Error(`expected server-managed and dev-only boundary flags, got ${JSON.stringify(boundaries)}`)
  }
  assertNoSecretOrProviderEndpointMaterial(manifestText)
}

export function testBytePlusModelArkMcpSsotRowsAreOwnedByIntegrationsAndMcp() {
  const keys = new Set(BYTEPLUS_MODELARK_MCP_DOC_ENTRIES.map(entry => entry.meta.key))
  for (const key of [
    'byteplusModelArkMcp.docs.url',
    'byteplusModelArkMcp.api.scope',
    'byteplusModelArkMcp.auth.env',
    'byteplusModelArkMcp.beta.header',
    'byteplusModelArkMcp.tool.server_url',
    'byteplusModelArkMcp.codex.server_key',
    'byteplusModelArkMcp.remote_config.codex',
    'byteplusModelArkMcp.transport.required',
    'byteplusModelArkMcp.media.profile',
    'byteplusModelArkMcp.media.image_generation',
    'byteplusModelArkMcp.media.audio_generation',
    'byteplusModelArkMcp.media.video_generation',
    'byteplusModelArkMcp.media.generate_audio',
    'byteplusModelArkMcp.limit.default_rpm',
    'byteplusModelArkMcp.billing.tool_calls',
    'byteplusModelArkMcp.responses_tool_config',
    'byteplusModelArkMcp.readiness_manifest',
    'byteplusModelArkMcp.docs.image_generation',
    'byteplusModelArkMcp.docs.video_generation',
    'byteplusModelArkMcp.docs.seedance_tutorial',
  ]) {
    if (!keys.has(key)) throw new Error(`missing BytePlus ModelArk MCP SSOT row ${key}`)
  }

  const firstEntry = BYTEPLUS_MODELARK_MCP_DOC_ENTRIES[0]
  if (!firstEntry) throw new Error('expected BytePlus ModelArk MCP SSOT rows')
  if (!isMcpOwnedSetting(firstEntry.meta.key, firstEntry.details.area)) {
    throw new Error('BytePlus ModelArk MCP rows must be MainPanel MCP-owned')
  }
  if (!isIntegrationsOwnedSetting(firstEntry.meta.key, firstEntry.details.area)) {
    throw new Error('BytePlus ModelArk MCP rows must also surface in MainPanel Integrations')
  }
  if (!getBytePlusModelArkMcpApiRowAnchorId('byteplusModelArkMcp.responses_tool_config').startsWith('mcp-row-byteplus-modelark-')) {
    throw new Error('BytePlus ModelArk MCP anchors must use the MCP BytePlus ModelArk namespace')
  }
}
