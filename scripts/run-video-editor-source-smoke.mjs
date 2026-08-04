#!/usr/bin/env node

import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  VideoEditorSourceContractError,
  verifyVideoEditorIndependenceSourceContract,
} from './video-editor/clean-room-source-contract.mjs'

const scriptPath = fileURLToPath(import.meta.url)
const defaultRepositoryRoot = resolve(dirname(scriptPath), '..')

export async function runVideoEditorSourceSmoke({ repositoryRoot = defaultRepositoryRoot } = {}) {
  const contract = await verifyVideoEditorIndependenceSourceContract(repositoryRoot)
  return Object.freeze({
    schema: 'knowgrph-video-editor-source-smoke/v1',
    status: 'pass',
    checks: Object.freeze([contract]),
  })
}

function parseCliArguments(argv) {
  const options = { json: false, repositoryRoot: defaultRepositoryRoot }
  for (const argument of argv) {
    if (argument === '--json') options.json = true
    else if (argument.startsWith('--repository-root=')) {
      options.repositoryRoot = resolve(argument.slice('--repository-root='.length))
    } else throw new Error(`unknown argument: ${argument}`)
  }
  return options
}

if (resolve(process.argv[1] || '') === scriptPath) {
  try {
    const options = parseCliArguments(process.argv.slice(2))
    const report = await runVideoEditorSourceSmoke(options)
    console.log(options.json ? JSON.stringify(report) : 'Video editor clean-room source smoke passed.')
  } catch (error) {
    const report = error instanceof VideoEditorSourceContractError
      ? error.report
      : Object.freeze({
          schema: 'knowgrph-video-editor-source-smoke/v1',
          status: 'fail',
          error: error instanceof Error ? error.message : String(error),
        })
    console.error(JSON.stringify(report))
    process.exitCode = 1
  }
}
