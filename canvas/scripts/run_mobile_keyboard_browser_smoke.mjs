import { runLocalViteBrowserSmoke } from './lib/run-local-vite-browser-smoke.mjs'

async function run() {
  await runLocalViteBrowserSmoke({
    logLabel: 'mobile-keyboard-browser-smoke',
    devServerPort: String(process.env.AG_MOBILE_KEYBOARD_SMOKE_PORT || '4177'),
    devServerPath: '/__smoke__/mobile-keyboard',
    baseUrlEnvName: 'AG_MOBILE_KEYBOARD_SMOKE_BASE_URL',
    verifierCommand: 'python3',
    verifierArgs: ['scripts/verify_mobile_keyboard_browser_smoke.py'],
    prepareBeforeStart: true,
    devServerStartMode: 'vite-runner',
  })
}

run().catch(error => {
  console.error(error)
  process.exit(1)
})
