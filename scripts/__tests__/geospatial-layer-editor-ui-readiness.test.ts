import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { EnhancedLayerCatalogView } from '../../canvas/src/features/geospatial/EnhancedLayerCatalogPanel.tsx'
import { EnhancedLayerEditorForm } from '../../canvas/src/features/geospatial/EnhancedLayerEditorForm.tsx'
import {
  createEnhancedLayerDraft,
  draftToEditorLayer,
  editorLayerToDraft,
  normalizedConfigToEditorLayers,
  removeEditorLayer,
  serializeEditorLayers,
  upsertEditorLayer,
  validateEnhancedLayerDraft,
  type EnhancedLayerEditorLayer,
} from '../../canvas/src/features/geospatial/enhancedLayerEditorModel.ts'
import type { EnhancedLayerCatalogController } from '../../canvas/src/features/geospatial/useEnhancedLayerCatalog.ts'

const building: EnhancedLayerEditorLayer = {
  id: 'buildings',
  kind: 'building',
  url: '/fixtures/buildings.geojson',
  visible: true,
  tags: ['#city'],
  timeoutMs: 10_000,
  maxBytes: 1_048_576,
  heightProperty: 'height_m',
  defaultHeightMeters: 8,
  baseHeightMeters: 0,
  fillColor: '#9aa5b1',
  fillOpacity: 0.85,
  lat: 0,
  lng: 0,
  altitudeMeters: 0,
  scale: 1,
  rotationDegrees: 0,
}

const createController = (
  layers: readonly EnhancedLayerEditorLayer[] = [building],
): EnhancedLayerCatalogController => ({
  status: 'ready',
  source: 'environment',
  layers,
  message: null,
  busyAction: null,
  refresh: async () => undefined,
  saveDraft: async () => ({ ok: true }),
  removeLayer: async () => ({ ok: true }),
  toggleLayer: async () => ({ ok: true }),
  resetToEnvironment: async () => ({ ok: true }),
})

test('structured editor validates duplicate ids, URLs, fetch bounds, paint, and coordinates without mutation', () => {
  const invalid = {
    ...createEnhancedLayerDraft('asset3d'),
    id: building.id,
    url: 'relative.geojson',
    timeoutMs: '0',
    maxBytes: '0',
    lat: '91',
    lng: '-181',
    scale: '0',
  }
  const before = [building]
  const errors = validateEnhancedLayerDraft(invalid, before)
  assert.deepEqual(before, [building])
  assert.equal(errors.id, 'Layer ID must be unique.')
  assert.match(String(errors.url), /absolute same-origin/)
  assert.match(String(errors.timeoutMs), /between/)
  assert.match(String(errors.maxBytes), /between/)
  assert.match(String(errors.lat), /between/)
  assert.match(String(errors.lng), /between/)
  assert.match(String(errors.scale), /greater than zero/)

  const invalidPaint = {
    ...editorLayerToDraft(building),
    fillColor: 'blue',
    fillOpacity: '2',
  }
  const paintErrors = validateEnhancedLayerDraft(invalidPaint, before, building.id)
  assert.match(String(paintErrors.fillColor), /six-digit hex/)
  assert.match(String(paintErrors.fillOpacity), /between/)
})

test('editor add, edit, remove, and serialization preserve siblings and mandatory fetch bounds', () => {
  const assetDraft = {
    ...createEnhancedLayerDraft('asset3d'),
    id: 'landmark',
    url: '/fixtures/landmark.mesh.json',
    lat: '1.29',
    lng: '103.85',
    tags: 'city, #landmark',
  }
  assert.deepEqual(validateEnhancedLayerDraft(assetDraft, [building]), {})
  const withAsset = upsertEditorLayer([building], draftToEditorLayer(assetDraft))
  assert.deepEqual(withAsset.map(layer => layer.id), ['buildings', 'landmark'])

  const editedBuilding = { ...building, fillColor: '#112233', visible: false }
  const edited = upsertEditorLayer(withAsset, editedBuilding, building.id)
  assert.equal(edited[0].fillColor, '#112233')
  assert.equal(edited[1].id, 'landmark')

  const removed = removeEditorLayer(edited, 'buildings')
  assert.deepEqual(removed.map(layer => layer.id), ['landmark'])
  const raw = serializeEditorLayers(removed) as Array<Record<string, unknown>>
  assert.equal(raw.length, 1)
  assert.deepEqual(raw[0].fetchBounds, { timeoutMs: 10_000, maxBytes: 25 * 1024 * 1024 })
  assert.deepEqual((raw[0].render as { tags: string[] }).tags, ['#city', '#landmark'])
})

test('normalized environment configuration becomes editable without losing effective values', () => {
  const layers = normalizedConfigToEditorLayers({
    extrusions: [{
      id: building.id,
      datasetId: building.id,
      url: building.url,
      kind: 'building',
      heightProperty: building.heightProperty,
      defaultHeightMeters: building.defaultHeightMeters,
      baseHeightMeters: building.baseHeightMeters,
      fillColor: building.fillColor,
      fillOpacity: building.fillOpacity,
      tags: building.tags,
      visible: building.visible,
      fetchBound: {
        timeoutMs: building.timeoutMs,
        maxBytes: building.maxBytes,
      },
    }],
    assets: [],
    diagnostics: [],
  })
  assert.equal(layers.length, 1)
  assert.deepEqual(editorLayerToDraft(layers[0]), {
    id: 'buildings',
    kind: 'building',
    url: '/fixtures/buildings.geojson',
    visible: true,
    tags: '#city',
    timeoutMs: '10000',
    maxBytes: '1048576',
    heightProperty: 'height_m',
    defaultHeightMeters: '8',
    baseHeightMeters: '0',
    fillColor: '#9aa5b1',
    fillOpacity: '0.85',
    lat: '0',
    lng: '0',
    altitudeMeters: '0',
    scale: '1',
    rotationDegrees: '0',
  })
})

test('catalog renders source, accessible live toggle, edit, remove, add, and reset controls', () => {
  const html = renderToStaticMarkup(React.createElement(EnhancedLayerCatalogView, {
    controller: createController(),
  }))
  assert.match(html, /aria-label="Enhanced layer catalog"/)
  assert.match(html, /data-kg-geo-enhanced-config-source="environment"/)
  assert.match(html, /aria-label="Add enhanced layer"/)
  assert.match(html, /aria-label="Toggle enhanced layer buildings"/)
  assert.match(html, /aria-label="Edit enhanced layer buildings"/)
  assert.match(html, /aria-label="Remove enhanced layer buildings"/)
  assert.match(html, /Reset to environment defaults/)
})

test('editor form exposes labelled common, extrusion, and bounded retrieval controls', () => {
  const html = renderToStaticMarkup(React.createElement(EnhancedLayerEditorForm, {
    draft: editorLayerToDraft(building),
    editingId: building.id,
    existingLayers: [building],
    busy: false,
    onCancel: () => undefined,
    onSave: async () => ({ ok: true }),
  }))
  for (const label of [
    'Enhanced layer editor',
    'Enhanced layer ID',
    'Enhanced layer kind',
    'Enhanced layer URL',
    'Enhanced layer timeout',
    'Enhanced layer maximum bytes',
    'Enhanced layer height property',
    'Enhanced layer fill color',
    'Enhanced layer fill opacity',
    'Save layer',
  ]) {
    assert.match(html, new RegExp(label))
  }
})
