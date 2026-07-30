import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { CitySimMediaFigure } from '@/features/game-city-sim/CitySimMediaFigure'

function renderCityMediaFigure(citySimActive: boolean): string {
  return renderToStaticMarkup(
    <CitySimMediaFigure citySimActive={citySimActive}>
      <section data-maplibre-owner="1" />
    </CitySimMediaFigure>,
  )
}

export function testCitySimMediaFigureIsSemanticAndConditionallySelectable() {
  const activeMarkup = renderCityMediaFigure(true)
  assert.match(activeMarkup, /^<figure\b/)
  assert.match(activeMarkup, /aria-label="Interactive City simulation media stage"/)
  assert.match(activeMarkup, /data-kg-city-sim-semantic-media="active"/)
  assert.match(activeMarkup, /data-kg-rich-media-selectable-surface="1"/)
  assert.match(
    activeMarkup,
    /<figcaption class="sr-only">Interactive City simulation media stage<\/figcaption>/,
  )
  assert.equal(
    activeMarkup.includes(['<', 'div'].join('')),
    false,
    'the semantic wrapper must not add a generic div',
  )
  assert.doesNotMatch(activeMarkup, /aria-hidden/)

  const inactiveMarkup = renderCityMediaFigure(false)
  assert.doesNotMatch(
    inactiveMarkup,
    /aria-label|figcaption|data-kg-city-sim-semantic-media|data-kg-rich-media-selectable-surface/,
  )
  assert.match(inactiveMarkup, /^<figure class="absolute inset-0 m-0" role="presentation">/)
}
