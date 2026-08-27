import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

export function testRichMediaBrowserSmokeContract() {
  const appSource = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8')
  const smokePageSource = readFileSync(new URL('../features/testing/RichMediaBrowserSmokePage.tsx', import.meta.url), 'utf8')
  const previewDeckSource = readFileSync(new URL('../features/command-menu/MediaCatalogPreviewDeck.tsx', import.meta.url), 'utf8')
  const packageJson = readFileSync(new URL('../../package.json', import.meta.url), 'utf8')
  const runnerSource = readFileSync(new URL('../../scripts/run_rich_media_browser_smoke.mjs', import.meta.url), 'utf8')
  const verifierSource = readFileSync(new URL('../../scripts/verify_rich_media_browser_smoke.py', import.meta.url), 'utf8')
  const timingSchemaSource = readFileSync(new URL('../../schemas/rich-media-catalog-preview-timing.v1.schema.json', import.meta.url), 'utf8')
  const timingValidatorSource = readFileSync(new URL('../../scripts/lib/rich-media-catalog-preview-timing-schema.mjs', import.meta.url), 'utf8')
  const fixtureManifestSource = readFileSync(new URL('../features/testing/richMediaBrowserSmokeFixtures.json', import.meta.url), 'utf8')
  const fixtureManifest = JSON.parse(fixtureManifestSource) as {
    catalogVideo: { durationSeconds: number; height: number; path: string; sha256: string; sizeBytes: number; width: number }
  }
  const catalogVideoFixture = fixtureManifest.catalogVideo
  const videoFixture = readFileSync(new URL(`../../public${catalogVideoFixture.path}`, import.meta.url))

  for (const snippet of [
    "pathname === '/__smoke__/rich-media'",
    "kgPath === '/__smoke__/rich-media'",
    'RichMediaBrowserSmokePageLazy',
  ]) {
    if (!appSource.includes(snippet)) {
      throw new Error(`expected App smoke route wiring for rich media browser smoke: ${snippet}`)
    }
  }

  for (const snippet of [
    'data-kg-rich-media-smoke-page="1"',
    'data-kg-smoke-panel="text-preview"',
    'data-kg-smoke-panel="text-edit"',
    'data-kg-smoke-panel="iframe-srcdoc"',
    'data-kg-smoke-panel="iframe-snapshot"',
    'data-kg-smoke-panel="iframe-open-overlay"',
    'data-kg-smoke-panel="image-zoom"',
    'data-kg-smoke-panel="image-threejs-raster"',
    'data-kg-smoke-panel="image-threejs-card-jpg"',
    'data-kg-smoke-panel="image-threejs-svg"',
    'data-kg-smoke-panel="image-threejs-fallback"',
    'data-kg-smoke-panel="video-inline"',
    'data-kg-smoke-panel="audio"',
    'data-kg-smoke-panel="storyboard-widget"',
    'richMediaBrowserSmokeFixtures.catalogVideo.path',
    'richMediaBrowserSmokeFixtures.catalogVideo.contentType',
    'richMediaBrowserSmokeFixtures.catalogVideo.sizeBytes',
    'setEditableText(next.text)',
    'buildImageToThreeJsConversion(sourceUrl)',
    "canvas.toDataURL('image/jpeg', 0.9)",
    '<CardMediaPreview',
    'data-kg-image-threejs-smoke-format="png"',
    'data-kg-image-threejs-smoke-format="jpg"',
    'data-kg-image-threejs-smoke-format="svg"',
    "buildImageThreeJsSmokeProjection('/demo/image-to-threejs-fallback.svg')",
  ]) {
    if (!smokePageSource.includes(snippet)) {
      throw new Error(`expected rich media smoke page to mount shared media surfaces: ${snippet}`)
    }
  }

  if (smokePageSource.includes('data:video/mp4;base64,AAAA')) {
    throw new Error('expected the browser smoke to use the valid local video fixture')
  }
  const fixtureSha256 = createHash('sha256').update(videoFixture).digest('hex')
  if (
    videoFixture.length !== catalogVideoFixture.sizeBytes
    || videoFixture.subarray(4, 8).toString('ascii') !== 'ftyp'
    || fixtureSha256 !== catalogVideoFixture.sha256
    || catalogVideoFixture.width !== 160
    || catalogVideoFixture.height !== 90
    || !Number.isFinite(catalogVideoFixture.durationSeconds)
    || catalogVideoFixture.durationSeconds <= 0
  ) {
    throw new Error('expected the video fixture binary to match its source-owned metadata identity')
  }

  for (const snippet of [
    'data-kg-media-catalog-preview-preloads="1"',
    'key={item.id}',
    'data-kg-media-catalog-preview-item-active',
    "active ? 'visible z-10 pointer-events-auto' : 'invisible z-0 pointer-events-none'",
  ]) {
    if (!previewDeckSource.includes(snippet)) {
      throw new Error(`expected the media preview deck to preserve keyed adjacent resources across navigation: ${snippet}`)
    }
  }

  if (!packageJson.includes('"test:smoke:rich-media:browser": "node ./scripts/run_rich_media_browser_smoke.mjs"')) {
    throw new Error('expected package.json to expose rich media browser smoke command')
  }
  if (!packageJson.includes('"validate:rich-media-catalog-preview-timing": "node ./scripts/validate_rich_media_catalog_preview_timing.mjs"')) {
    throw new Error('expected package.json to expose timing artifact schema validation')
  }

  for (const snippet of [
    'https://json-schema.org/draft/2020-12/schema',
    'https://agenticgraph.dev/schemas/rich-media-catalog-preview-timing/v1',
    '"additionalProperties": false',
    '"const": "rich-media-catalog-preview-timing/v1"',
    '"required": ["expected", "preloaded", "visible"]',
  ]) {
    if (!timingSchemaSource.includes(snippet)) {
      throw new Error(`expected versioned Rich Media timing schema contract: ${snippet}`)
    }
  }

  for (const snippet of [
    "import Ajv2020 from 'ajv/dist/2020.js'",
    'new Ajv2020({ allErrors: true, strict: true })',
    'validateRichMediaCatalogPreviewTimingArtifact',
    'invalid ${RICH_MEDIA_CATALOG_PREVIEW_TIMING_SCHEMA} artifact',
  ]) {
    if (!timingValidatorSource.includes(snippet)) {
      throw new Error(`expected strict Rich Media timing validator contract: ${snippet}`)
    }
  }

  for (const snippet of [
    "import { runLocalViteBrowserSmoke } from './lib/run-local-vite-browser-smoke.mjs'",
    "logLabel: 'rich-media-browser-smoke'",
    "devServerPath: '/__smoke__/rich-media'",
    "verifierArgs: ['scripts/verify_rich_media_browser_smoke.py']",
    "prepareBeforeStart: true",
    "devServerStartMode: 'vite-runner'",
    'AG_RICH_MEDIA_SMOKE_BASE_URL',
  ]) {
    if (!runnerSource.includes(snippet)) {
      throw new Error(`expected rich media smoke runner to target the rich media route and verifier: ${snippet}`)
    }
  }

  for (const snippet of [
    'TARGET_URL = f"{BASE_URL}/__smoke__/rich-media"',
    'window.__kgRichMediaSmokeOpened = []',
    'def open_text_edit_input(page):',
    'display = page.locator(f\'{panel_selector} [data-kg-card-inline-edit="1"]\').first',
    'input_locator = page.locator(f\'{panel_selector} [data-kg-card-inline-edit-input="1"]\').first',
    'input_locator.wait_for(state="visible", timeout=5000)',
    'expected rich media text edit panel to reveal the inline editor surface',
    'AG_RICH_MEDIA_SMOKE_BASE_URL',
    'ASYNC_SURFACE_READY_TIMEOUT_MS = 15_000',
    'data-kg-smoke-panel="storyboard-widget"',
    'image_threejs_surfaces = (',
    '("image-threejs-card-jpg", "raster", "jpg")',
    '("storyboard-widget", "svg", "svg")',
    'data-kg-image-threejs-card-surface="1"',
    'data-kg-image-threejs-fallback="1"',
    'expected original SVG image fallback to load after Three.js geometry rejection',
    'data-kg-smoke-flow-size="1"',
    'CATALOG_PREVIEW_READY_BUDGET_MS',
    'AG_MEDIA_PREVIEW_READY_BUDGET_MS',
    'CATALOG_PREVIEW_TIMING_PATH',
    'CATALOG_PREVIEW_TIMING_SCHEMA = "rich-media-catalog-preview-timing/v1"',
    'CATALOG_PREVIEW_TIMING_VALIDATOR_PATH',
    'FIXTURE_MANIFEST_PATH',
    'richMediaBrowserSmokeFixtures.json',
    'def wait_for_image_ready(page, image, timeout_ms: int) -> None:',
    'def wait_for_video_metadata(page, video, timeout_ms: int) -> None:',
    'def assert_video_metadata_identity(video, label: str) -> dict[str, float]:',
    'element.readyState >= element.HAVE_METADATA',
    'math.isfinite(duration_seconds)',
    '"preloaded": preloaded_video_metadata',
    '"visible": visible_video_metadata',
    'subprocess.run(',
    'def arm_catalog_preview_promotion_timing(',
    'def read_catalog_preview_promotion_timing(',
    'window.__kgMediaPromotion',
    'expected adjacent video to remain metadata-only',
    'expected {kind} promotion to preserve the preloaded DOM node',
    '"criterion": "readyState >= HAVE_METADATA"',
    'preloadedTransitionReadyMs',
    'OK rich-media-browser-smoke',
  ]) {
    if (!verifierSource.includes(snippet)) {
      throw new Error(`expected rich media browser verifier to assert the real panel surface contract: ${snippet}`)
    }
  }
}
