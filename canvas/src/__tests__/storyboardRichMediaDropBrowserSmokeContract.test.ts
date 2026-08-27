import { readFileSync } from 'node:fs'

export function testStoryboardRichMediaDropBrowserSmokeContract() {
  const appSource = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8')
  const smokePageSource = readFileSync(new URL('../features/testing/StoryboardRichMediaDropSmokePage.tsx', import.meta.url), 'utf8')
  const packageJson = readFileSync(new URL('../../package.json', import.meta.url), 'utf8')
  const runnerSource = readFileSync(new URL('../../scripts/run_storyboard_rich_media_drop_browser_smoke.mjs', import.meta.url), 'utf8')
  const verifierSource = readFileSync(new URL('../../scripts/verify_storyboard_rich_media_drop_browser_smoke.py', import.meta.url), 'utf8')
  const geometrySource = readFileSync(new URL('../../scripts/storyboard_edge_smoke_geometry.py', import.meta.url), 'utf8')
  const browserSmokeSource = `${verifierSource}\n${geometrySource}`

  for (const snippet of [
    "pathname === '/__smoke__/storyboard-rich-media-drop'",
    "kgPath === '/__smoke__/storyboard-rich-media-drop'",
    'StoryboardRichMediaDropSmokePageLazy',
  ]) {
    if (!appSource.includes(snippet)) {
      throw new Error(`expected App smoke route wiring for storyboard rich media drop browser smoke: ${snippet}`)
    }
  }

  for (const snippet of [
    'startMediaDrag(event, props.payload)',
    'startMediaPointerDrag(event, props.payload)',
    "setCanvas2dRenderer('storyboard')",
    "setFrontmatterModeEnabled(true)",
    "setViewPinned(false)",
    "setFitToScreenMode(false)",
    "setZoomToSelectionMode(false)",
    "clearZoomRequest()",
    "requestZoomTransform({ k: 1, x: rect.width / 2, y: rect.height / 2 })",
    'setGraphData(buildSmokeGraph())',
    "__kgStoryboardDropSmoke = smokeState",
    'data-kg-storyboard-drop-smoke-source={props.surface}',
    'data-kg-storyboard-drop-smoke-shifted="1"',
    '<CanvasPage bootstrapRuntimesEnabled={false} />',
  ]) {
    if (!smokePageSource.includes(snippet)) {
      throw new Error(`expected storyboard smoke page to reuse shared drag/runtime contracts: ${snippet}`)
    }
  }

  if (!packageJson.includes('"test:smoke:storyboard-rich-media-drop:browser": "node ./scripts/run_storyboard_rich_media_drop_browser_smoke.mjs"')) {
    throw new Error('expected package.json to expose storyboard rich media drop browser smoke command')
  }

  for (const snippet of [
    "import { runLocalViteBrowserSmoke } from './lib/run-local-vite-browser-smoke.mjs'",
    "logLabel: 'storyboard-rich-media-drop-smoke'",
    "devServerPath: '/__smoke__/storyboard-rich-media-drop'",
    "verifierArgs: ['scripts/verify_storyboard_rich_media_drop_browser_smoke.py']",
    "prepareBeforeStart: true",
    "devServerStartMode: 'vite-runner'",
    'AG_STORYBOARD_DROP_SMOKE_BASE_URL',
  ]) {
    if (!runnerSource.includes(snippet)) {
      throw new Error(`expected smoke runner to target the storyboard rich media drop route and verifier: ${snippet}`)
    }
  }

  for (const snippet of [
    'TARGET_URL = f"{BASE_URL}/?kgPath=%2F__smoke__%2Fstoryboard-rich-media-drop"',
    'assert_storyboard_edge_panel_open_retention(',
    '"storyboard-card-alpha"',
    '"storyboard-card-beta"',
    'expect_selected_rich_media_panel(page, node_id)',
    'expect_pending_storyboard_edge_visible(page)',
    'def read_visible_storyboard_card_box(page, node_id: str):',
    'target_card_box = read_visible_storyboard_card_box(page, target_node_id)',
    'data-kg-overlay-pending-edge="true"',
    'expected created Storyboard edge to remain visible after retention',
    'expected selected/open dropped panel to retain Storyboard edge visibility',
    'expect_rich_media_shell_box_stable(selected_box, reopened_box, "after select/open retention")',
    'def run_storyboard_case(',
    'page = run_single_drop(browser, source_kind, target_ratio_x, target_ratio_y)',
    'run_storyboard_case(',
    '"image",',
    '"video",',
    'expected at least one dropped {source_kind} node',
    'expected dropped {source_kind} kind only',
    'expected dropped {source_kind} node id to be retained',
    'expected {source_kind} drop to preserve existing authored nodes',
    "data-kg-storyboard-widget-surface-root=\"storyboard\"",
  ]) {
    if (!browserSmokeSource.includes(snippet)) {
      throw new Error(`expected storyboard browser verifier to assert the real drag surface contract: ${snippet}`)
    }
  }
}
