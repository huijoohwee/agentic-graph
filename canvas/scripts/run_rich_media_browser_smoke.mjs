import { runLocalViteBrowserSmoke } from './lib/run-local-vite-browser-smoke.mjs'

async function run() {
  await runLocalViteBrowserSmoke({
    logLabel: 'rich-media-browser-smoke',
    devServerPort: String(process.env.AG_RICH_MEDIA_SMOKE_PORT || '4175'),
    devServerPath: '/__smoke__/rich-media',
    baseUrlEnvName: 'AG_RICH_MEDIA_SMOKE_BASE_URL',
    verifierCommand: 'python3',
    verifierArgs: ['scripts/verify_rich_media_browser_smoke.py'],
    prepareBeforeStart: true,
    devServerStartMode: 'vite-runner',
  })
}

run().catch(error => {
  console.error(error)
  process.exit(1)
})
