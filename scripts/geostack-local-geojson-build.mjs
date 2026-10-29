#!/usr/bin/env node
import { mkdir, open, rmdir, unlink, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { LOCAL_POI_MAX_BYTES, validateLocalPoiGeoJson } from '../canvas/src/features/geospatial/localPoiDirectoryModel.ts'

const USAGE = `Usage:
  node --import tsx scripts/geostack-local-geojson-build.mjs \\
    --input=<file.geojson> --out=<new-directory> --source=<name> --license=<license> \\
    --attribution=<text> --attest-rights --attest-public-fields \\
    [--approve-region-polygons] [--approve-exact-points]

The command reads one local file, makes no network requests, and refuses to overwrite output.`

export function parseArguments(argv) {
  const values = new Map()
  const flags = new Set()
  for (const token of argv) {
    if (token === '--help' || token === '-h') return { help: true }
    if (!token.startsWith('--')) throw new Error(`Unexpected argument: ${token}`)
    const separator = token.indexOf('=')
    if (separator < 0) {
      const flag = token.slice(2)
      if (!['attest-rights', 'attest-public-fields', 'approve-exact-points', 'approve-region-polygons'].includes(flag)) {
        throw new Error(`Unknown flag: ${token}`)
      }
      if (flags.has(flag)) throw new Error(`Duplicate flag: ${token}`)
      flags.add(flag)
      continue
    }
    const key = token.slice(2, separator)
    const value = token.slice(separator + 1)
    if (!['input', 'out', 'source', 'license', 'attribution'].includes(key) || !value) {
      throw new Error(`Unknown or empty option: ${token}`)
    }
    if (values.has(key)) throw new Error(`Duplicate option: --${key}`)
    values.set(key, value)
  }
  const missing = ['input', 'out', 'source', 'license', 'attribution'].filter(key => !values.has(key))
  if (missing.length) throw new Error(`Missing required options: ${missing.join(', ')}`)
  return { values, flags, help: false }
}

async function readBoundedInput(path) {
  const handle = await open(path, 'r')
  try {
    const before = await handle.stat({ bigint: true })
    if (!before.isFile() || before.size <= 0n || before.size > BigInt(LOCAL_POI_MAX_BYTES)) {
      throw new Error('Choose a GeoJSON file of 500 kB or less.')
    }
    const buffer = Buffer.alloc(LOCAL_POI_MAX_BYTES + 1)
    let offset = 0
    while (offset <= LOCAL_POI_MAX_BYTES) {
      const { bytesRead } = await handle.read(buffer, offset, LOCAL_POI_MAX_BYTES + 1 - offset, offset)
      if (bytesRead === 0) break
      offset += bytesRead
    }
    const after = await handle.stat({ bigint: true })
    if (offset > LOCAL_POI_MAX_BYTES || offset !== Number(before.size) || after.size !== before.size
      || after.mtimeNs !== before.mtimeNs || after.ctimeNs !== before.ctimeNs
      || after.ino !== before.ino || after.dev !== before.dev) {
      throw new Error('The selected file changed during the bounded read; choose it again.')
    }
    return new Uint8Array(buffer.subarray(0, offset))
  } finally {
    await handle.close()
  }
}

export async function buildLocalPoiGeoJsonDirectory({ inputPath, outputPath, source, license, attribution,
  attestRights = false, attestPublicFields = false, approveExactPoints = false,
  approveRegionPolygons = false } = {}) {
  const input = resolve(String(inputPath || ''))
  const output = resolve(String(outputPath || ''))
  if (!inputPath || !outputPath || !source || !license || !attribution) {
    throw new Error('Input, output directory, source, license, and attribution are required.')
  }
  const sourceBytes = await readBoundedInput(input)
  const text = new TextDecoder('utf-8', { fatal: true }).decode(sourceBytes)
  const result = await validateLocalPoiGeoJson(text, sourceBytes, {
    source,
    license,
    attribution,
    rightsAttested: attestRights,
    publicFieldsReviewed: attestPublicFields,
    approvedExactPoints: approveExactPoints,
    approvedRegionPolygons: approveRegionPolygons,
  })
  if (!result.ok) throw new Error(result.error)

  const geoJsonText = JSON.stringify(result.featureCollection)
  const manifestText = `${JSON.stringify(result.manifest, null, 2)}\n`
  await mkdir(dirname(output), { recursive: true })
  await mkdir(output)
  const written = []
  try {
    const geoJsonPath = join(output, 'geostack-allowlisted.geojson')
    await writeFile(geoJsonPath, geoJsonText, { encoding: 'utf8', flag: 'wx' })
    written.push(geoJsonPath)
    const manifestPath = join(output, 'manifest.json')
    await writeFile(manifestPath, manifestText, { encoding: 'utf8', flag: 'wx' })
    written.push(manifestPath)
  } catch (error) {
    for (const filePath of written) {
      try { await unlink(filePath) } catch { /* Keep the directory if rollback cannot remove a partial file. */ }
    }
    try { await rmdir(output) } catch { /* Keep any unexpected bytes for inspection. */ }
    throw error
  }
  return { output, manifest: result.manifest }
}

async function run() {
  const args = parseArguments(process.argv.slice(2))
  if (args.help) {
    process.stdout.write(`${USAGE}\n`)
    return
  }
  const outcome = await buildLocalPoiGeoJsonDirectory({
    inputPath: args.values.get('input'),
    outputPath: args.values.get('out'),
    source: args.values.get('source'),
    license: args.values.get('license'),
    attribution: args.values.get('attribution'),
    attestRights: args.flags.has('attest-rights'),
    attestPublicFields: args.flags.has('attest-public-fields'),
    approveExactPoints: args.flags.has('approve-exact-points'),
    approveRegionPolygons: args.flags.has('approve-region-polygons'),
  })
  process.stdout.write(`${JSON.stringify(outcome)}\n`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run().catch(error => {
    const message = error instanceof Error ? error.message : String(error)
    process.stderr.write(`geostack-local-geojson-build: ${message}\n${USAGE}\n`)
    process.exitCode = 1
  })
}
