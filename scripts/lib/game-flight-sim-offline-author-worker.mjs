import dgram from 'node:dgram'
import http from 'node:http'
import https from 'node:https'
import { readFile } from 'node:fs/promises'
import { syncBuiltinESMExports } from 'node:module'
import net from 'node:net'
import tls from 'node:tls'
import { parentPort, workerData } from 'node:worker_threads'
import {
  assertFlightSimOfflineAuthorSource,
  FLIGHT_SIM_OPTIONAL_PROP_AUTHOR_EXPORT,
  FLIGHT_SIM_OPTIONAL_PROP_AUTHOR_URL,
} from './game-flight-sim-offline-author-contract.mjs'

function blockedError(operation) {
  const error = new Error(
    `Flight Sim offline authoring blocked disallowed operation before commit: ${operation}`,
  )
  error.name = 'FlightSimOfflineAuthoringBlockedError'
  error.code = 'FLIGHT_SIM_OFFLINE_AUTHORING_OPERATION_BLOCKED'
  error.operation = operation
  error.beforeCommit = true
  return error
}

function block(operation) {
  throw blockedError(operation)
}

function replaceMethods(target, names, operation) {
  for (const name of names) target[name] = () => block(operation)
}

function installNetworkFence() {
  globalThis.fetch = () => block('network-fetch')
  replaceMethods(http, ['get', 'request'], 'network-fetch')
  replaceMethods(https, ['get', 'request'], 'network-fetch')
  replaceMethods(net, ['connect', 'createConnection'], 'network-fetch')
  replaceMethods(tls, ['connect'], 'network-fetch')
  replaceMethods(dgram, ['createSocket'], 'network-fetch')
  syncBuiltinESMExports()
}

function installDeferredWorkFence() {
  const deferred = []
  let identifier = 0
  const enqueue = (callback, args) => {
    identifier += 1
    deferred.push(Promise.resolve().then(() => callback(...args)))
    return identifier
  }
  globalThis.setTimeout = (callback, _delay, ...args) => enqueue(callback, args)
  globalThis.setInterval = (callback, _delay, ...args) => enqueue(callback, args)
  globalThis.setImmediate = (callback, ...args) => enqueue(callback, args)
  globalThis.queueMicrotask = callback => {
    void enqueue(callback, [])
  }
  globalThis.clearTimeout = () => {}
  globalThis.clearInterval = () => {}
  globalThis.clearImmediate = () => {}
  return () => Promise.all(deferred)
}

function serializeError(error) {
  return {
    ok: false,
    error: {
      name: String(error?.name || 'Error'),
      message: String(error?.message || error || 'Offline authoring failed'),
      code: String(error?.code || ''),
      operation: String(error?.operation || ''),
      beforeCommit: error?.beforeCommit === true,
      stack: String(error?.stack || ''),
    },
  }
}

async function run() {
  installNetworkFence()
  const settleDeferredWork = installDeferredWorkFence()
  const moduleUrl = new URL(String(workerData.authorModuleUrl))
  const source = await readFile(moduleUrl, 'utf8')
  assertFlightSimOfflineAuthorSource({
    authorExport: String(workerData.authorExport),
    authorModuleUrl: moduleUrl,
    source,
  })
  const authorModule = await import(`${moduleUrl.href}?offline-author-worker=1`)
  const author = authorModule[FLIGHT_SIM_OPTIONAL_PROP_AUTHOR_EXPORT]
  if (typeof author !== 'function') {
    throw new Error('Flight Sim offline authoring export is unavailable')
  }
  const output = await author(Object.freeze({
    imageTo3dModelCall: () => block('image-to-3d-model-call'),
    cloudflareResourceRequest: () => block('cloudflare-resource-request'),
  }))
  await settleDeferredWork()
  return output
}

try {
  if (
    String(workerData.authorModuleUrl) !== FLIGHT_SIM_OPTIONAL_PROP_AUTHOR_URL.href
    || workerData.authorExport !== FLIGHT_SIM_OPTIONAL_PROP_AUTHOR_EXPORT
  ) {
    throw Object.assign(
      new Error('Flight Sim offline author worker rejected non-canonical authority'),
      {
        code: 'FLIGHT_SIM_OFFLINE_AUTHOR_AUTHORITY_VIOLATION',
        beforeCommit: true,
      },
    )
  }
  parentPort?.postMessage({ ok: true, output: await run() })
} catch (error) {
  parentPort?.postMessage(serializeError(error))
}
