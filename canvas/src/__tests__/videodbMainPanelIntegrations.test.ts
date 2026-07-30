import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  VIDEODB_API_DOC_AREA,
  VIDEODB_API_DOC_ENTRIES,
  VIDEODB_BASE_URL,
  VIDEODB_DOC_ROWS,
  getVideodbApiRowAnchorId,
} from '@/features/integrations/videodbSsot'
import { isIntegrationsOwnedSetting } from '@/features/panels/views/useSettingsView.helpers'

const repoRoot = resolve(process.cwd(), '..')
const apiReferencePath = resolve(repoRoot, 'docs/documents/knowgrph-api-reference/knowgrph-videodb-api-reference.md')
const demoPath = resolve(repoRoot, '../huijoohwee/docs/knowgrph-strybldr-demo.md')

const requiredKeys = [
  'api_key',
  'base_url',
  'docs_url',
  'ai.generate_video',
  'async_response.get',
  'index.spoken_word',
  'video.character_clips',
  'video.character_clips.schema',
  'video.search',
  'video.stream',
] as const

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message)
}

if (VIDEODB_BASE_URL !== 'https://api.videodb.io') {
  throw new Error(`unexpected VideoDB base URL: ${VIDEODB_BASE_URL}`)
}
assert(VIDEODB_DOC_ROWS.length >= 45, `expected at least 45 VideoDB rows, got ${VIDEODB_DOC_ROWS.length}`)
assert(
  VIDEODB_API_DOC_ENTRIES.length === VIDEODB_DOC_ROWS.length,
  'expected VideoDB settings entries to match SSOT row count',
)
for (const key of requiredKeys) {
  assert(VIDEODB_DOC_ROWS.some(row => row.key === key), `missing VideoDB SSOT row: ${key}`)
  assert(
    VIDEODB_API_DOC_ENTRIES.some(entry => entry.meta.key === `videodb.${key}`),
    `missing VideoDB settings entry: videodb.${key}`,
  )
}
const apiKeyEntry = VIDEODB_API_DOC_ENTRIES.find(entry => entry.meta.key === 'videodb.api_key')
assert(apiKeyEntry?.value === 'VIDEODB_API_KEY', 'VideoDB API key entry must expose the server-managed env var name')
assert(
  String(apiKeyEntry?.details.notes || '').includes('Server Managed Key'),
  'VideoDB API key entry must label the server-managed key mode',
)
assert(
  String(apiKeyEntry?.details.notes || '').includes('Never hardcode'),
  'VideoDB API key entry must forbid hardcoded credential literals',
)

assert(isIntegrationsOwnedSetting('videodb.api_key', VIDEODB_API_DOC_AREA), 'VideoDB API key must be owned by MainPanel Integrations')
assert(isIntegrationsOwnedSetting('videodb.video.character_clips', VIDEODB_API_DOC_AREA), 'VideoDB character clips must be owned by MainPanel Integrations')
assert(isIntegrationsOwnedSetting('videodb.video.stream', VIDEODB_API_DOC_AREA), 'VideoDB stream must be owned by MainPanel Integrations')
assert(
  getVideodbApiRowAnchorId('videodb.video.stream') === 'videodb-api-row-videodb-video-stream',
  'VideoDB stream anchor changed unexpectedly',
)

const apiReferenceText = readFileSync(apiReferencePath, 'utf8')
assert(
  apiReferenceText.includes('local_rung: "undocumented"'),
  'API reference must remain undocumented until it has evidence-bound VCCs',
)
assert(
  apiReferenceText.includes('delivered_rung: "undocumented"'),
  'API reference must not promote source presence into a delivery claim',
)
assert(
  apiReferenceText.includes('App SSOT entrypoint: `canvas/src/features/integrations/videodbSsot.ts`'),
  'API reference must name the app SSOT entrypoint',
)
assert(
  apiReferenceText.includes('| Runtime SSOT entrypoint | `canvas/src/features/integrations/videodbSsot.ts` |'),
  'API reference must include the runtime SSOT overlay row',
)
assert(apiReferenceText.includes('videodb.video.character_clips'), 'API reference must include the VideoDB character clips SDK row')
assert(apiReferenceText.includes('video.generate_stream(timeline=subject_timeline_ranges)'), 'API reference must include the VideoDB timeline generate_stream primitive')

if (existsSync(demoPath)) {
  const demoText = readFileSync(demoPath, 'utf8')
  for (const requiredText of [
    'deployed_api_claim: false',
    "generation_job_id: ''",
    "video_id: ''",
    "index_job_id: ''",
    "stream_url: ''",
    "download_url: ''",
    "publish_packet_path: ''",
    '2D Renderer: Storyboard',
    '2D Renderer: Storyboard',
    '2D Renderer: Storyboard',
    'strybldr_storyboard:',
    'POST /video/{id}/generate/video',
    'POST /video/{id}/index/',
    'POST /video/{id}/search/',
    'POST /video/{id}/stream/',
    'videodb_character_clips_contract',
    'video.generate_stream(timeline=subject_timeline_ranges)',
    "clip: ''",
  ]) {
    assert(demoText.includes(requiredText), `demo missing required text: ${requiredText}`)
  }
  assert(
    !/job-upload-|job-index-|job-generation-|stream\.videodb\.io|deployed_api_claim:\s*true|\bzapier\b|\bnotion\b/i.test(demoText),
    'demo must not contain fabricated runtime VideoDB values or copied external-workflow terms',
  )
}
