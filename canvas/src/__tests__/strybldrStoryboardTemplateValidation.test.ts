import { deepStrictEqual } from 'node:assert/strict'
import { resolveSiblingFixturePath } from '@/tests/lib/repoTestData'
import fs from 'node:fs'
import path from 'node:path'
import { parse as parseYaml } from 'yaml'

import { buildStoryboardBoardModel } from '@/components/StoryboardCanvas/storyboardModel'
import { loadGraphDataFromTextViaParser } from '@/features/parsers/loader'
import { parseStrybldrStoryboardMarkdown } from '@/features/strybldr/strybldrStoryboard'
import { extractYamlFrontmatterHeaderBlock, parseCanvasWorkspaceFrontmatterPresetBlock, readCanvasWorkspaceFrontmatterPresetFromMeta, readYamlFrontmatterValue } from '@/lib/markdown/frontmatter'

const STORYBOARD_2D_RENDERER_TEMPLATE_NAME = 'agentic-graph-2d-renderer-storyboard-template.md'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

const readTypedValue = (value: unknown): unknown => {
  if (!value || typeof value !== 'object' || !('value' in value)) return value
  return (value as Record<string, unknown>).value
}

const readTemplateText = (): string => {
  const externalValidationInput = String(process.env.AG_TEST_VALIDATION_FORBID_HARDCODE_IN_REPO || '').trim()
  const templatePath = externalValidationInput && path.basename(externalValidationInput) === STORYBOARD_2D_RENDERER_TEMPLATE_NAME
    ? externalValidationInput
    : resolveSiblingFixturePath('huijoohwee.github.io', `template/${STORYBOARD_2D_RENDERER_TEMPLATE_NAME}`)
  return fs.readFileSync(templatePath, 'utf8')
}

const parseFrontmatterPayload = (rawBlock: string): Record<string, unknown> => {
  const parsed = parseYaml(rawBlock.replace(/^---\n?/, '').replace(/\n---\s*$/, ''))
  return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {}
}

const assertNoRepoHardcodedRuntimeMedia = (text: string): void => {
  const forbiddenRuntimeMediaPatterns: Array<[RegExp, string]> = [
    [/\bagentic_os_media_token=/i, 'local media access tokens'],
    [/\blocalhost:\d+\/api\/storage\/media\//i, 'localhost storage media URLs'],
    [/\/api\/storage\/media\/[^ \n"'`]+\/runs\/upload-[^ \n"'`]+/i, 'persisted upload storage URLs'],
    [/\bupload-[a-z0-9]{8,}/i, 'source-specific upload ids'],
  ]
  for (const [pattern, label] of forbiddenRuntimeMediaPatterns) assert(!pattern.test(text), `expected Storyboard renderer template not to store ${label}`)
}

const assertNoStoredGeneratedOutputSrcDocPayload = (payload: unknown): void => {
  const offenders: string[] = []
  const visit = (value: unknown, valuePath: string): void => {
    if (!value || typeof value !== 'object') return
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i += 1) visit(value[i], `${valuePath}[${i}]`)
      return
    }
    const record = value as Record<string, unknown>
    const candidate = record.outputSrcDoc
    if (candidate && typeof candidate === 'object' && Object.prototype.hasOwnProperty.call(candidate as Record<string, unknown>, 'value')) {
      if (String(readTypedValue(candidate) || '').trim()) offenders.push(`${valuePath}.outputSrcDoc`)
    } else if (typeof candidate === 'string' && candidate.trim() && (valuePath.includes('.cards[') || /<!doctype|<html|srcdoc=/i.test(candidate))) {
      offenders.push(`${valuePath}.outputSrcDoc`)
    }
    for (const key of Object.keys(record)) visit(record[key], `${valuePath}.${key}`)
  }
  visit(payload, STORYBOARD_2D_RENDERER_TEMPLATE_NAME)
  assert(offenders.length === 0, `expected Storyboard renderer template not to store generated outputSrcDoc values: ${offenders.join(', ')}`)
}

function assertCanvasPresetNamespaceCompatibility() {
  const fields = { CanvasSurfaceMode: '2d', CanvasRenderMode: '2d', Canvas2dRenderer: 'design',
    DocumentSemanticMode: 'keyword', FrontmatterModeEnabled: false, MultiDimTableModeEnabled: true,
    DocumentStructureBaselineLock: false, BottomPanelOpen: false, BottomPanelTab: 'gantt',
    FloatingPanelOpen: true, FloatingPanelView: 'gantt' }
  const expected = readCanvasWorkspaceFrontmatterPresetFromMeta(Object.fromEntries(Object.entries(fields).map(([key, value]) => ['kg' + key, value])))
  assert(expected?.canvas2dRenderer === 'design' && expected.frontmatterModeEnabled === false, 'expected explicit renderer and false flags in the legacy preset')
  for (const prefix of ['kg', 'agenticOs']) {
    const meta = Object.fromEntries(Object.entries(fields).map(([key, value]) => [prefix + key, value]))
    const block = extractYamlFrontmatterHeaderBlock('---\n' + Object.entries(meta).map(([key, value]) => key + ': ' + JSON.stringify(value)).join('\n') + '\n---')!
    deepStrictEqual(readCanvasWorkspaceFrontmatterPresetFromMeta(meta), expected, prefix + ' metadata preset')
    deepStrictEqual(parseCanvasWorkspaceFrontmatterPresetBlock(block), expected, prefix + ' YAML preset')
    deepStrictEqual(parseCanvasWorkspaceFrontmatterPresetBlock(block), expected, prefix + ' cached YAML preset')
  }
  const conflicting = { kgCanvas2dRenderer: 'design', agenticOsCanvas2dRenderer: 'storyboard', kgFrontmatterModeEnabled: true, agenticOsFrontmatterModeEnabled: false }
  const resolved = readCanvasWorkspaceFrontmatterPresetFromMeta(conflicting)
  assert(resolved?.canvas2dRenderer === 'storyboard' && resolved.frontmatterModeEnabled === false, 'expected explicit Agentic OS fields to own conflicts, including false')
  assert(readCanvasWorkspaceFrontmatterPresetFromMeta({ kgCanvas2dRenderer: 'design', agenticOsCanvas2dRenderer: 'invalid-renderer' })?.canvas2dRenderer === undefined, 'expected an invalid explicit canonical renderer not to revive a conflicting legacy renderer')
}

export async function testStrybldr2dRendererStoryboardTemplateStaysRuntimeReadyAndNeutral() {
  assertCanvasPresetNamespaceCompatibility()
  const text = readTemplateText()
  const frontmatter = extractYamlFrontmatterHeaderBlock(text)
  assert(frontmatter, 'expected Storyboard renderer template to keep byte-zero YAML frontmatter')
  const frontmatterPayload = parseFrontmatterPayload(frontmatter.rawBlock)
  assert(parseCanvasWorkspaceFrontmatterPresetBlock(frontmatter)?.canvas2dRenderer === 'storyboard', 'expected Storyboard renderer template to route to the shared Storyboard renderer')
  assert(readYamlFrontmatterValue(frontmatter.rawBlock, 'validation_input_forbid_hardcode_in_repo').trim() === 'true', 'expected Storyboard renderer template to declare hardcode-free validation input mode')
  assertNoRepoHardcodedRuntimeMedia(text)
  assert(!text.includes('\n  cards:\n'), 'expected Storyboard renderer template not to store runtime card override payloads')
  assert(!text.includes('Generated Strybldr'), 'expected Storyboard renderer template not to store generated runtime handoff copy')
  assertNoStoredGeneratedOutputSrcDocPayload(frontmatterPayload)
  const readiness = frontmatterPayload.runtime_readiness as Record<string, unknown> | undefined
  assert(readiness?.status === 'template-ready', 'expected the seed to report template readiness without claiming executed runtime proof')
  assert(readiness?.default_runtime === 'local-dry-run-first', 'expected the seed to start with a local dry run')
  assert(readiness?.paid_call_count === 0, 'expected no paid calls in an unexecuted template')
  assert(readiness?.publish_scope === 'local-only', 'expected the seed to preserve local publication scope')
  for (const key of ['provider_job_id', 'stream_url', 'generated_asset_url', 'runtime_proof_path']) assert(readiness?.[key] === '', `expected ${key} to remain empty until execution supplies evidence`)
  for (const key of ['prod_mirror', 'cloudflare']) assert(readiness?.[key] === 'blocked until operator instruction', `expected ${key} to preserve explicit release authority`)
  const doc = parseStrybldrStoryboardMarkdown(text)
  assert(doc, 'expected Storyboard renderer template to expose a structured Strybldr storyboard payload')
  const parsed = await loadGraphDataFromTextViaParser(STORYBOARD_2D_RENDERER_TEMPLATE_NAME, text, {
    applyToStore: false,
    syncMarkdownDocument: false,
  })
  assert(parsed?.parserId === 'strybldr-storyboard', `expected Storyboard renderer template to use Strybldr parser, got ${parsed?.parserId}`)
  const graph = parsed.graphData
  assert(graph, 'expected parsed Storyboard renderer template graph')
  const board = buildStoryboardBoardModel({ graphData: graph, graphRevision: 1 })
  const laneIds = new Set(board.lanes.map(lane => lane.id))
  for (const laneId of ['Source', 'Storyboard', 'Elements', 'Runtime', 'Review', 'Publish']) assert(laneIds.has(laneId), `expected Storyboard renderer template board to expose ${laneId} lane`)
  assert(board.totalCards === doc.sources.length * 2 + doc.elements.length, `expected Storyboard renderer template to render source-owned cards, got ${board.totalCards}`)
  assert((graph.edges || []).length === doc.sources.length + doc.elements.length + doc.edges.length, `expected Storyboard renderer template to render source-owned edges, got ${(graph.edges || []).length}`)
}
