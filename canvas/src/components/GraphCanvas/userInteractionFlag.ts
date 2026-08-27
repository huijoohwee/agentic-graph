export const AG_ATTR_USER_INTERACTED = 'data-kg-user-interacted'

export const markGraphCanvasUserInteracted = (svgEl?: SVGSVGElement | null) => {
  try {
    svgEl?.setAttribute(AG_ATTR_USER_INTERACTED, '1')
  } catch {
    void 0
  }
}

export const resetGraphCanvasUserInteracted = (svgEl?: SVGSVGElement | null) => {
  try {
    svgEl?.setAttribute(AG_ATTR_USER_INTERACTED, '0')
  } catch {
    void 0
  }
}

export const clearGraphCanvasUserInteracted = (svgEl?: SVGSVGElement | null) => {
  try {
    svgEl?.removeAttribute(AG_ATTR_USER_INTERACTED)
  } catch {
    void 0
  }
}

export const hasGraphCanvasUserInteracted = (svgEl?: SVGSVGElement | null): boolean => {
  try {
    return svgEl?.getAttribute(AG_ATTR_USER_INTERACTED) === '1'
  } catch {
    return false
  }
}
