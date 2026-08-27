import { readFileSync } from 'node:fs'

export function testMobileKeyboardBrowserSmokeContract() {
  const appSource = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8')
  const smokePageSource = readFileSync(new URL('../features/testing/MobileKeyboardBrowserSmokePage.tsx', import.meta.url), 'utf8')
  const packageJson = readFileSync(new URL('../../package.json', import.meta.url), 'utf8')
  const runnerSource = readFileSync(new URL('../../scripts/run_mobile_keyboard_browser_smoke.mjs', import.meta.url), 'utf8')
  const verifierSource = readFileSync(new URL('../../scripts/verify_mobile_keyboard_browser_smoke.py', import.meta.url), 'utf8')

  for (const snippet of [
    "pathname === '/__smoke__/mobile-keyboard'",
    "kgPath === '/__smoke__/mobile-keyboard'",
    'MobileKeyboardBrowserSmokePageLazy',
  ]) {
    if (!appSource.includes(snippet)) {
      throw new Error(`expected App smoke route wiring for mobile keyboard browser smoke: ${snippet}`)
    }
  }

  for (const snippet of [
    'data-kg-mobile-keyboard-smoke-page="1"',
    'data-kg-mobile-chat-stream-button="true"',
    'FloatingPanelChatComposer',
    'MarkdownBlockContainer',
    'MarkdownEditorPane',
    'data-kg-mobile-keyboard-shell="chat"',
    'data-kg-mobile-chat-proof-status="true"',
    'data-kg-mobile-chat-recovery-button="true"',
    'data-kg-mobile-chat-submit-button="true"',
    'data-kg-mobile-keyboard-shell="workspace"',
    'data-kg-mobile-keyboard-shell="runtime"',
    'data-kg-mobile-workspace-inline-host="true"',
    'data-kg-mobile-workspace-editor-host="true"',
    'data-kg-mobile-workspace-editor-preview="true"',
    'data-kg-mobile-workspace-json-editor-host="true"',
    'data-kg-mobile-workspace-json-editor-preview="true"',
    'CanvasViewport',
    'MermaidVisibilityGate',
    'data-kg-mobile-runtime-3d-host="true"',
    'data-kg-mobile-runtime-geo-host="true"',
    'data-kg-mobile-mermaid-gate-host="true"',
    'data-kg-mobile-mermaid-runtime="true"',
    'SerializationSection',
    'data-kg-mobile-schema-serialization-host="true"',
    'data-kg-mobile-schema-serialization-preview="true"',
    'defaultCollapsed={false}',
    'ariaLabel="Workspace Markdown Editor Text"',
    'ariaLabel="Workspace JSON Editor Text"',
  ]) {
    if (!smokePageSource.includes(snippet)) {
      throw new Error(`expected mobile keyboard smoke page to mount shared chat/workspace owners: ${snippet}`)
    }
  }

  if (!packageJson.includes('"test:smoke:mobile-keyboard:browser": "node ./scripts/run_mobile_keyboard_browser_smoke.mjs"')) {
    throw new Error('expected package.json to expose mobile keyboard browser smoke command')
  }

  for (const snippet of [
    "import { runLocalViteBrowserSmoke } from './lib/run-local-vite-browser-smoke.mjs'",
    "logLabel: 'mobile-keyboard-browser-smoke'",
    "devServerPath: '/__smoke__/mobile-keyboard'",
    "verifierArgs: ['scripts/verify_mobile_keyboard_browser_smoke.py']",
    "prepareBeforeStart: true",
    "devServerStartMode: 'vite-runner'",
    'AG_MOBILE_KEYBOARD_SMOKE_BASE_URL',
  ]) {
    if (!runnerSource.includes(snippet)) {
      throw new Error(`expected mobile keyboard smoke runner to target the mobile keyboard route and verifier: ${snippet}`)
    }
  }

  for (const snippet of [
    'TARGET_URL = f"{BASE_URL}/__smoke__/mobile-keyboard"',
    'MOBILE_VIEWPORT = {"width": 390, "height": 844}',
    'KEYBOARD_VIEWPORT = {"width": 390, "height": 520}',
    "page.set_viewport_size(KEYBOARD_VIEWPORT)",
    "'[data-kg-chat-grammar-quick-bar=\"true\"]'",
    "'[data-kg-mobile-chat-recovery-button=\"true\"]'",
    "'[data-kg-mobile-chat-submit-button=\"true\"]'",
    "'[data-kg-mobile-chat-proof-status=\"true\"]'",
    "'[data-kg-markdown-mobile-grammar-quick-bar=\"true\"]'",
    "'[data-kg-markdown-editor-grammar-quick-bar=\"true\"]'",
    "'[data-kg-mobile-workspace-editor-preview=\"true\"]'",
    "'[data-kg-mobile-workspace-json-editor-host=\"true\"]'",
    "'[data-kg-mobile-workspace-json-editor-preview=\"true\"]'",
    "'[data-kg-monaco-runtime-mode=\"deferred-touch\"]'",
    "'[data-kg-monaco-touch-intent=\"true\"]'",
    "'[data-kg-monaco-touch-intent-activate=\"true\"]'",
    "'[data-kg-mobile-runtime-3d-host=\"true\"]'",
    "'[data-kg-mobile-runtime-geo-host=\"true\"]'",
    "'[data-kg-canvas-heavy-runtime-intent=\"3d\"]'",
    "'[data-kg-canvas-heavy-runtime-intent=\"geo\"]'",
    "'[data-kg-mobile-mermaid-gate-host=\"true\"]'",
    "'[data-kg-mermaid-touch-placeholder=\"true\"]'",
    "'[data-kg-mobile-mermaid-runtime=\"true\"]'",
    "'[data-kg-mobile-schema-serialization-host=\"true\"]'",
    "'.kg-schema-editor-serialization-editor--compact'",
    "'section[aria-label=\"Chat slash commands\"]'",
    "expect(chat_status).to_contain_text(\"submitted:/\")",
    "expect(chat_status).to_contain_text(\"recovered:\")",
    "'section[aria-label=\"Semantic commands\"]'",
    "'section[aria-label=\"Variable toolbar\"]'",
    "'[data-kg-mobile-workspace-editor-host=\"true\"]'",
  ]) {
    if (!verifierSource.includes(snippet)) {
      throw new Error(`expected mobile keyboard browser verifier to assert viewport shrink and quick-bar reachability: ${snippet}`)
    }
  }
}
