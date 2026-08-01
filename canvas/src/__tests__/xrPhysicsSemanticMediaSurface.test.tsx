import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { JSDOM } from 'jsdom'
import {
  XR_PHYSICS_MEDIA_STAGE_DATA_ATTRIBUTES,
  XR_PHYSICS_MEDIA_STAGE_LABEL,
} from '@/features/three/xrPhysicsMediaSurface'
import { SemanticMediaFigure } from '@/lib/cards/SemanticMediaFigure'
import {
  MEDIA_PREVIEW_SELECTABLE_SURFACE_ATTR,
  MEDIA_PREVIEW_SELECTABLE_SURFACE_VALUE,
} from '@/lib/cards/mediaPreviewSurfaceSelection'
import { bindThreeCanvasSemanticOwner } from '@/lib/three/threeCanvasSemanticOwner'

function renderPhysicsMediaFigure(active: boolean): string {
  return renderToStaticMarkup(
    <SemanticMediaFigure
      active={active}
      activeDataAttributes={XR_PHYSICS_MEDIA_STAGE_DATA_ATTRIBUTES}
      label={XR_PHYSICS_MEDIA_STAGE_LABEL}
      selectionTarget="descendant"
    >
      {captionId => (
        <canvas data-caption-id={captionId} data-kg-three-canvas="1" />
      )}
    </SemanticMediaFigure>,
  )
}

export function testXrPhysicsSemanticMediaSurfaceOwnsTheDirectThreeCanvas() {
  const markup = renderPhysicsMediaFigure(true)
  assert.match(markup, /^<figure\b/)
  assert.doesNotMatch(markup, /<(?:div)\b|aria-hidden/)

  const dom = new JSDOM(markup)
  const document = dom.window.document
  const figure = document.querySelector(
    '[data-kg-xr-physics-semantic-media="active"]',
  )
  const caption = figure?.querySelector('figcaption')
  const canvas = figure?.querySelector('canvas')
  assert.equal(figure?.tagName, 'FIGURE')
  assert.equal(caption?.tagName, 'FIGCAPTION')
  assert.equal(canvas?.tagName, 'CANVAS')
  assert.ok(caption)
  assert.ok(canvas)

  const release = bindThreeCanvasSemanticOwner(canvas, {
    captionId: caption.id,
    label: XR_PHYSICS_MEDIA_STAGE_LABEL,
  })
  assert.equal(canvas.getAttribute('aria-label'), XR_PHYSICS_MEDIA_STAGE_LABEL)
  assert.equal(canvas.getAttribute('aria-labelledby'), caption.id)
  assert.equal(canvas.getAttribute('role'), 'region')
  assert.equal(
    canvas.getAttribute(MEDIA_PREVIEW_SELECTABLE_SURFACE_ATTR),
    MEDIA_PREVIEW_SELECTABLE_SURFACE_VALUE,
  )
  assert.equal(
    canvas.closest(`[${MEDIA_PREVIEW_SELECTABLE_SURFACE_ATTR}="1"]`),
    canvas,
  )
  assert.equal(canvas.hasAttribute('aria-hidden'), false)
  assert.equal(document.getElementById(caption.id)?.textContent, XR_PHYSICS_MEDIA_STAGE_LABEL)

  release?.()
  assert.equal(canvas.hasAttribute('aria-label'), false)
  assert.equal(canvas.hasAttribute('aria-labelledby'), false)
  assert.equal(canvas.hasAttribute('role'), false)
  assert.equal(canvas.hasAttribute(MEDIA_PREVIEW_SELECTABLE_SURFACE_ATTR), false)

  const inactiveMarkup = renderPhysicsMediaFigure(false)
  assert.doesNotMatch(
    inactiveMarkup,
    /aria-label|figcaption|data-kg-xr-physics-semantic-media|data-kg-rich-media-selectable-surface/,
  )
}

export function testXrPhysicsSemanticOwnerIsBoundAfterThreeCreatesItsCanvas() {
  const semanticSurface = readFileSync(
    resolve(
      process.cwd(),
      'src/features/three/XrPhysicsSemanticMediaSurface.tsx',
    ),
    'utf8',
  )
  const threeGraph = readFileSync(
    resolve(process.cwd(), 'src/lib/three/ThreeGraph.impl.tsx'),
    'utf8',
  )
  assert.match(
    semanticSurface,
    /semanticMediaOwner=\{semanticActive \? \{/,
  )
  assert.match(
    semanticSurface,
    /active && !geospatialComposite \? 'auto' : 'none'/,
  )
  assert.match(threeGraph, /useThreeCanvasSemanticOwner\(semanticMediaOwner\)/)
  assert.match(threeGraph, /applySemanticCanvasOwner\(glCanvasRef\.current\)/)
  assert.doesNotMatch(
    threeGraph.match(/<Canvas[\s\S]*?>/)?.[0] || '',
    /data-kg-rich-media-selectable-surface|aria-labelledby|aria-label=/,
    'selection and accessible ownership must bind to gl.domElement, not the generic R3F wrapper',
  )
}
