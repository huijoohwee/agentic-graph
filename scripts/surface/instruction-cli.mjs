#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { stableJson } from './constants.mjs'
import { appendFixtureInstruction } from './ledger.mjs'

export async function runInstructionCli(args = process.argv.slice(2)) {
  const requestPath = args.find(argument => !argument.startsWith('--'))
  if (!requestPath) throw new Error('instruct-fixture requires one request JSON path')
  const request = JSON.parse(await readFile(path.resolve(requestPath), 'utf8'))
  const result = await appendFixtureInstruction(request)
  process.stdout.write(stableJson(result))
  return result.written ? 0 : 1
}

const direct = process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url

if (direct) {
  try {
    process.exitCode = await runInstructionCli()
  } catch (error) {
    process.stderr.write(stableJson({
      written: false,
      code: 'FIXTURE_INSTRUCTION_FAILED',
      error: error instanceof Error ? error.message : String(error),
    }))
    process.exitCode = 1
  }
}
