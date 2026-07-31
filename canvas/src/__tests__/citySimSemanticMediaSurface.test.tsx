import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { JSDOM } from 'jsdom'
import { bindMapLibreCanvasSemanticOwner } from 'gympgrph'
import {
  CITY_SIM_MEDIA_STAGE_DATA_ATTRIBUTES,
  CITY_SIM_MEDIA_STAGE_LABEL,
} from '@/features/game-city-sim/citySimMediaSurface'
import { SemanticMediaFigure } from '@/lib/cards/SemanticMediaFigure'

function renderCityMediaFigure(citySimActive: boolean): string {
  return renderToStaticMarkup(
    <SemanticMediaFigure
      active={citySimActive}
      activeDataAttributes={CITY_SIM_MEDIA_STAGE_DATA_ATTRIBUTES}
      label={CITY_SIM_MEDIA_STAGE_LABEL}
    >
      {captionId => (
        <section
          data-maplibre-owner="1"
          data-semantic-media-caption-id={captionId}
        />
      )}
    </SemanticMediaFigure>,
  )
}

export function testCitySimSemanticMediaSurfaceResolvesMapLibreHitTarget() {
  const activeMarkup = renderCityMediaFigure(true)
  assert.match(activeMarkup, /^<figure\b/)
  assert.match(activeMarkup, new RegExp(`aria-label="${CITY_SIM_MEDIA_STAGE_LABEL}"`))
  assert.match(activeMarkup, /class="pointer-events-auto absolute inset-0 m-0"/)
  assert.match(activeMarkup, /data-kg-city-sim-semantic-media="active"/)
  assert.match(activeMarkup, /data-kg-rich-media-selectable-surface="1"/)
  assert.match(
    activeMarkup,
    new RegExp(
      `<figcaption class="sr-only" id="([^"]+)">${CITY_SIM_MEDIA_STAGE_LABEL}</figcaption>`,
    ),
  )
  assert.equal(
    activeMarkup.includes(['<', 'div'].join('')),
    false,
    'the semantic wrapper must not add a generic div',
  )
  assert.doesNotMatch(activeMarkup, /aria-hidden/)

  const dom = new JSDOM(activeMarkup)
  const document = dom.window.document
  const surface = document.querySelector(
    '[data-kg-city-sim-semantic-media="active"]',
  )
  const caption = surface?.querySelector('figcaption')
  const mapHost = surface?.querySelector('[data-maplibre-owner="1"]')
  assert.equal(surface?.tagName, 'FIGURE')
  assert.equal(caption?.tagName, 'FIGCAPTION')
  assert.equal(mapHost?.tagName, 'SECTION')
  assert.ok(caption)
  assert.ok(mapHost)
  const captionId = caption.getAttribute('id') || ''
  assert.ok(captionId)
  assert.equal(
    mapHost.getAttribute('data-semantic-media-caption-id'),
    captionId,
  )

  const mapContainer = document.createElement('div')
  mapContainer.className = 'maplibregl-canvas-container maplibregl-interactive'
  const mapCanvas = document.createElement('canvas')
  mapCanvas.className = 'maplibregl-canvas'
  mapCanvas.setAttribute('aria-label', 'Map')
  mapCanvas.setAttribute('role', 'region')
  mapContainer.appendChild(mapCanvas)
  mapHost.appendChild(mapContainer)

  const releaseSemanticOwner = bindMapLibreCanvasSemanticOwner(
    { getCanvas: () => mapCanvas },
    captionId,
  )
  assert.equal(mapCanvas.getAttribute('aria-labelledby'), captionId)
  assert.equal(mapCanvas.getAttribute('aria-label'), 'Map')
  assert.equal(mapCanvas.getAttribute('role'), 'region')
  assert.equal(mapCanvas.hasAttribute('aria-hidden'), false)
  assert.equal(
    mapCanvas.hasAttribute('data-kg-rich-media-selectable-surface'),
    false,
  )
  assert.equal(
    mapCanvas.closest('[data-kg-rich-media-selectable-surface="1"]'),
    surface,
  )
  assert.equal(
    document.getElementById(
      mapCanvas.getAttribute('aria-labelledby') || '',
    )?.textContent,
    CITY_SIM_MEDIA_STAGE_LABEL,
  )
  releaseSemanticOwner?.()
  assert.equal(mapCanvas.hasAttribute('aria-labelledby'), false)

  const inactiveMarkup = renderCityMediaFigure(false)
  assert.doesNotMatch(
    inactiveMarkup,
    /aria-label|figcaption|data-kg-city-sim-semantic-media|data-kg-rich-media-selectable-surface/,
  )
  assert.match(
    inactiveMarkup,
    /^<figure class="pointer-events-auto absolute inset-0 m-0" role="presentation">/,
  )
}
