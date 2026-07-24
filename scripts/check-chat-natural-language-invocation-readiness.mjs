import { execFileSync } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'

const runStep = ({ name, args }) => {
  process.stdout.write(`\n[chat-natural-language-invocation-readiness] ${name}\n`)
  process.stdout.write(`$ ${npmCommand} ${args.join(' ')}\n`)
  execFileSync(npmCommand, args, {
    cwd: repositoryRoot,
    env: process.env,
    stdio: 'inherit',
  })
}

const focusedTestFilters = [
  'chat.responseContract.widgetPalette',
  'chat.responseContract.prompt',
  'ui.floatingPanelChat.noSlash',
  'ui.floatingPanelChat.prdTadSlash',
  'chat.responseContract.storage.prdTadSlashTraceResponseOnlyNoBackfill',
  'markdownWorkspace.viewer.inlineEdit.slashMenu.commandTokenOnly',
  'chat.responseContract.structuredContent',
  'canvas.probeTree.llmResponseContract',
  'canvas.probeTree.mcpResponseAdapter',
  'canvas.probeTree.literalMcpResult.appliesVisibleWidgetCardPanelTree',
  'floatingPropsPanel.widgetPalette',
  'ui.mainPanel.propsPanel.widgetPalette.rendersPaletteOnlySurface',
]

for (const filter of focusedTestFilters) {
  runStep({
    name: `registered source tests: ${filter}`,
    args: ['--prefix', 'canvas', 'run', 'test:ci:unit', '--', filter],
  })
}

runStep({
  name: 'Canvas TypeScript check',
  args: ['--prefix', 'canvas', 'run', 'check'],
})

runStep({
  name: 'normal-route deterministic browser proof',
  args: ['--prefix', 'canvas', 'run', 'test:smoke:chat-natural-language-invocation:browser'],
})

process.stdout.write('\n[chat-natural-language-invocation-readiness] ok\n')
