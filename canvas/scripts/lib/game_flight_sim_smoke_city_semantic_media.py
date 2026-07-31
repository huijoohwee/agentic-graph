from __future__ import annotations

from typing import Any

from playwright.sync_api import Page


def read_city_semantic_media_contract(page: Page) -> dict[str, Any]:
    return page.evaluate(
        """
        () => {
          const surface = document.querySelector(
            '[data-kg-city-sim-semantic-media="active"]',
          )
          const isVisible = element => {
            const rect = element?.getBoundingClientRect()
            const style = element ? getComputedStyle(element) : null
            return Boolean(rect?.width > 0 && rect?.height > 0)
              && style?.display !== 'none'
              && style?.visibility !== 'hidden'
              && Number(style?.opacity || '1') > 0
          }
          const visibleMapCanvases = surface
            ? Array.from(
                surface.querySelectorAll('canvas.maplibregl-canvas'),
              ).filter(isVisible)
            : []
          const mapCanvas = visibleMapCanvases[0] || null
          const mapInteractiveRoot = mapCanvas?.closest(
            '.maplibregl-interactive',
          ) || null
          const rect = surface?.getBoundingClientRect()
          const centerHit = rect?.width > 0 && rect?.height > 0
            ? document.elementFromPoint(
                rect.left + rect.width / 2,
                rect.top + rect.height / 2,
              )
            : null
          return {
            citySemanticSurfaceAccessibleName:
              surface?.getAttribute('aria-label') || '',
            citySemanticSurfaceAriaHidden:
              surface?.hasAttribute('aria-hidden') === true,
            citySemanticSurfaceCenterMapLibreOwned: Boolean(
              centerHit
              && surface?.contains(centerHit)
              && (
                centerHit === mapCanvas
                || mapInteractiveRoot?.contains(centerHit)
              )
            ),
            citySemanticSurfaceNodeName: surface?.tagName || '',
            citySemanticSurfaceSelectableMarker:
              surface?.getAttribute(
                'data-kg-rich-media-selectable-surface',
              ) || '',
            citySemanticSurfaceVisibleMapLibreCanvasCount:
              visibleMapCanvases.length,
          }
        }
        """
    )
