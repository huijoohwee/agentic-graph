#!/usr/bin/env node
import { prepareDevLatest } from './dev-latest-preflight.mjs'

try {
  const result = await prepareDevLatest()
  process.stdout.write(`[dev:latest] ${result.message}\n`)
} catch (error) {
  process.stderr.write(`[dev:latest] ${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
}
