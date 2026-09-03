import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  SENSENOVA_API_KEY_ENV,
  SENSENOVA_API_DOC_AREA,
  SENSENOVA_API_DOC_ENTRIES,
  SENSENOVA_BASE_URL,
  SENSENOVA_DOC_ROWS,
  SENSENOVA_IMAGE_GENERATION_PATH,
  SENSENOVA_PLATFORM_URL,
  SENSENOVA_PROVIDER_ID,
  SENSENOVA_VIDEO_GENERATION_PATH,
  SENSENOVA_CHAT_COMPLETIONS_PATH,
  getSensenovaApiRowAnchorId,
} from '@/features/integrations/sensenovaSsot'
import { isIntegrationsOwnedSetting } from '@/features/panels/views/useSettingsView.helpers'
import { extractYamlFrontmatterHeaderBlock, readYamlFrontmatterValue } from '@/lib/markdown/frontmatter'

const repoRoot = resolve(process.cwd(), '..')
const prdTadPath = resolve(repoRoot, 'docs/documents/agentic-graph-mcp/agentic-graph-sensenova-api-prd-tad.md')
const demoPath = resolve(repoRoot, '../huijoohwee/docs/agentic-graph-strybldr-demo.md')

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message)
}

if (SENSENOVA_PROVIDER_ID !== 'sensenova') throw new Error(`unexpected SenseNova provider id: ${SENSENOVA_PROVIDER_ID}`)
if (SENSENOVA_BASE_URL !== 'https://api.sensenova.cn') throw new Error(`unexpected SenseNova base URL: ${SENSENOVA_BASE_URL}`)
if (SENSENOVA_PLATFORM_URL !== 'https://platform.sensenova.cn') throw new Error(`unexpected SenseNova platform URL: ${SENSENOVA_PLATFORM_URL}`)
if (SENSENOVA_CHAT_COMPLETIONS_PATH !== '/v1/llm/chat-completions') throw new Error(`unexpected SenseNova chat path: ${SENSENOVA_CHAT_COMPLETIONS_PATH}`)
if (SENSENOVA_IMAGE_GENERATION_PATH !== '/v1/images/generations') throw new Error(`unexpected SenseNova image path: ${SENSENOVA_IMAGE_GENERATION_PATH}`)
if (SENSENOVA_VIDEO_GENERATION_PATH !== '/v1/video/generations') throw new Error(`unexpected SenseNova video path: ${SENSENOVA_VIDEO_GENERATION_PATH}`)

const requiredKeys = [
  'provider_id',
  'base_url',
  'platform_url',
  'credential.api_key_env',
  'auth.method',
  'text.chat_completions',
  'text.default_model',
  'text.stream_supported',
  'image.generations',
  'image.default_model',
  'video.generations',
  'video.default_model',
  'video.async.circuit_breaker',
  'pipeline.publish_packet_schema',
  'pipeline.video_to_videodb',
] as const

assert(SENSENOVA_DOC_ROWS.length >= requiredKeys.length, `expected SenseNova SSOT rows, got ${SENSENOVA_DOC_ROWS.length}`)
assert(SENSENOVA_API_DOC_ENTRIES.length === SENSENOVA_DOC_ROWS.length, 'expected SenseNova settings entries to match SSOT row count')
for (const key of requiredKeys) {
  assert(SENSENOVA_DOC_ROWS.some(row => row.key === key), `missing SenseNova SSOT row: ${key}`)
  assert(
    SENSENOVA_API_DOC_ENTRIES.some(entry => entry.meta.key === `sensenova.${key}`),
    `missing SenseNova settings entry: sensenova.${key}`,
  )
}

const apiKeyEnvEntry = SENSENOVA_API_DOC_ENTRIES.find(entry => entry.meta.key === 'sensenova.credential.api_key_env')
assert(apiKeyEnvEntry?.value === SENSENOVA_API_KEY_ENV, 'SenseNova API key row must expose only the server-managed env var name')
assert(String(apiKeyEnvEntry?.details.notes || '').includes('Server Managed Key'), 'SenseNova API key row must label the server-managed key mode')
assert(String(apiKeyEnvEntry?.details.notes || '').includes('never be persisted'), 'SenseNova API key row must forbid persisted credentials')

assert(isIntegrationsOwnedSetting('sensenova.text.chat_completions', SENSENOVA_API_DOC_AREA), 'SenseNova text row must be owned by MainPanel Integrations')
assert(isIntegrationsOwnedSetting('sensenova.image.generations', SENSENOVA_API_DOC_AREA), 'SenseNova image row must be owned by MainPanel Integrations')
assert(isIntegrationsOwnedSetting('sensenova.video.generations', SENSENOVA_API_DOC_AREA), 'SenseNova video row must be owned by MainPanel Integrations')
assert(
  getSensenovaApiRowAnchorId('sensenova.video.generations') === 'sensenova-api-row-sensenova-video-generations',
  'SenseNova anchors must use the SenseNova API namespace',
)

const prdTadText = readFileSync(prdTadPath, 'utf8')
for (const requiredText of [
  'SenseNova AI API',
  SENSENOVA_BASE_URL,
  SENSENOVA_API_KEY_ENV,
  'Server Managed Key',
  'HMAC-SHA256 signed JWT',
  'POST /v1/llm/chat-completions',
  'POST /v1/images/generations',
  'POST /v1/video/generations',
  'Text → Image → Video → VideoDB stream → local publish packet',
]) {
  assert(prdTadText.includes(requiredText), `SenseNova PRD/TAD missing required text: ${requiredText}`)
}

if (existsSync(demoPath)) {
  const demoText = readFileSync(demoPath, 'utf8')
  const demoFrontmatterBlock = extractYamlFrontmatterHeaderBlock(demoText)
  const demoVideoId = demoFrontmatterBlock ? readYamlFrontmatterValue(demoFrontmatterBlock.rawBlock, 'kgYoutubeVideoId').trim() : ''
  assert(demoVideoId, 'Strybldr demo must declare kgYoutubeVideoId in validation input frontmatter')
  for (const requiredText of [
    'SenseNova API Lane (Text, Image, Video)',
    `VideoDB API + MCP Recreate ${demoVideoId} Lane`,
    'SenseNova API Text, Image, Video generation feeds VideoDB upload, index, search, stream, and local publish packet workflow',
    'local_animatic_status: "Toolbar Run all and Strybldr Generate Video create a generated, playable, zero-paid-call local animatic from approved cards when live credentials are unavailable"',
    'provider: "agentic-graph-local-animatic"',
    'model: "strybldr-local-animatic-v1"',
    'sensenova-api-readiness-card',
    'sensenova-api-contract',
    'SenseChat-5',
    'artist-xl',
    'SenseAnim',
    'videodb_stream_url',
  ]) {
    assert(demoText.includes(requiredText), `Strybldr demo missing SenseNova E2E text: ${requiredText}`)
  }
  assert(
    !/SENSENOVA_API_KEY\\s*[:=]\\s*["'][^$]|SENSENOVA_ACCESS_KEY_ID|SENSENOVA_SECRET_ACCESS_KEY|signed-jwt-|stream\\.videodb\\.io|job-upload-|job-index-|job-generation-|\\bzapier\\b|\\bnotion\\b|客家/i.test(demoText),
    'Strybldr demo must not contain raw SenseNova credentials, fabricated runtime values, copied external-workflow terms, or unrelated content',
  )
}

// The assertions above execute when this module is imported. Exporting a
// stable entrypoint lets the focused runExport harness prove that the module
// loaded and all assertions completed instead of treating a zero-test filter
// as success.
export function testSensenovaMainPanelIntegrationContractModuleLoads() {
  return
}
