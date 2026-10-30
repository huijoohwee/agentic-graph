#!/usr/bin/env node
import { mkdir, readFile, rmdir, stat, unlink, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { LOCAL_POI_MAX_BYTES, validateLocalPoiGeoJson } from '../canvas/src/features/geospatial/localPoiDirectoryModel.ts'

const USAGE = `Usage:
  node --import tsx scripts/geostack-local-geojson-build.mjs \\
    --input=<file.geojson> --out=<new-directory> --source=<name> --license=<license> \\
    --attribution=<text> --attest-rights --attest-public-fields \\
    [--approve-region-polygons] [--approve-exact-points]

The command reads one local file, makes no network requests, and refuses to overwrite output.`

function parseArguments(argv) {
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

async function run() {
  const args = parseArguments(process.argv.slice(2))
  if (args.help) {
    process.stdout.write(`${USAGE}\n`)
    return
  }
  const inputPath = resolve(args.values.get('input'))
  const outputPath = resolve(args.values.get('out'))
  const inputInfo = await stat(inputPath)
  if (!inputInfo.isFile() || inputInfo.size <= 0 || inputInfo.size > LOCAL_POI_MAX_BYTES) {
    throw new Error('Choose a GeoJSON file of 500 kB or less.')
  }
  const bytes = await readFile(inputPath)
  const sourceBytes = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const text = new TextDecoder('utf-8', { fatal: true }).decode(sourceBytes)
  const result = await validateLocalPoiGeoJson(text, sourceBytes, {
    source: args.values.get('source'),
    license: args.values.get('license'),
    attribution: args.values.get('attribution'),
    rightsAttested: args.flags.has('attest-rights'),
    publicFieldsReviewed: args.flags.has('attest-public-fields'),
    approvedExactPoints: args.flags.has('approve-exact-points'),
    approvedRegionPolygons: args.flags.has('approve-region-polygons'),
  })
  if (!result.ok) throw new Error(result.error)

  const geoJsonText = JSON.stringify(result.featureCollection)
  const manifestText = `${JSON.stringify(result.manifest, null, 2)}\n`
  await mkdir(dirname(outputPath), { recursive: true })
  await mkdir(outputPath)
  const written = []
  try {
    const geoJsonPath = join(outputPath, 'geostack-allowlisted.geojson')
    await writeFile(geoJsonPath, geoJsonText, { encoding: 'utf8', flag: 'wx' })
    written.push(geoJsonPath)
    const manifestPath = join(outputPath, 'manifest.json')
    await writeFile(manifestPath, manifestText, { encoding: 'utf8', flag: 'wx' })
    written.push(manifestPath)
  } catch (error) {
    for (const filePath of written) {
      try { await unlink(filePath) } catch { /* Preserve cleanup failure in the final directory error. */ }
    }
    try { await rmdir(outputPath) } catch { /* Keep a non-empty directory for recovery. */ }
    throw error
  }
  process.stdout.write(`${JSON.stringify({ output: outputPath, manifest: result.manifest })}\n`)
}

run().catch(error => {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`geostack-local-geojson-build: ${message}\n${USAGE}\n`)
  process.exitCode = 1
})
