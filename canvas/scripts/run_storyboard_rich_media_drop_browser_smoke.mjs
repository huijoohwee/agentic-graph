import { runLocalViteBrowserSmoke } from './lib/run-local-vite-browser-smoke.mjs'

async function run() {
  await runLocalViteBrowserSmoke({
    logLabel: 'storyboard-rich-media-drop-smoke',
    devServerPort: String(process.env.AG_STORYBOARD_DROP_SMOKE_PORT || '4176'),
    devServerPath: '/__smoke__/storyboard-rich-media-drop',
    baseUrlEnvName: 'AG_STORYBOARD_DROP_SMOKE_BASE_URL',
    verifierCommand: 'python3',
    verifierArgs: ['scripts/verify_storyboard_rich_media_drop_browser_smoke.py'],
    prepareBeforeStart: true,
    devServerStartMode: 'vite-runner',
  })
}

run().catch(error => {
  console.error(error)
  process.exit(1)
})
