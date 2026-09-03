import { runLocalViteBrowserSmoke } from './lib/run-local-vite-browser-smoke.mjs'

process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT ||= `${process.cwd()}/../docs`
process.env.VITE_AGENTIC_OS_RUN_READY_REPO_LOCAL ||= '1'
process.env.VITE_AGENTIC_OS_RUN_READY_DEMO ||= 'xr-physics'

async function run() {
  await runLocalViteBrowserSmoke({
    logLabel: 'game-fps-browser-smoke',
    devServerPort: String(process.env.AG_GAME_FPS_SMOKE_PORT || '4185'),
    devServerPath: '/',
    baseUrlEnvName: 'AG_GAME_FPS_SMOKE_BASE_URL',
    verifierCommand: 'python3',
    verifierArgs: ['scripts/verify_game_fps_browser_smoke.py'],
    verifierFailureLabel: 'Game FPS browser smoke',
    prepareBeforeStart: false,
    devServerStartMode: 'vite-runner',
  })
}

run().catch(error => {
  console.error(error)
  process.exit(1)
})
