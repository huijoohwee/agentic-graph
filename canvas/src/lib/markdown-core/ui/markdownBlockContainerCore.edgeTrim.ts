import React from 'react'

export const useMarkdownBlockContainerEdgeTrim = (args: {
  editorRef: React.RefObject<HTMLElement | null>
  editing: boolean
  editListMode?: 'ordered' | 'unordered'
  editTrimEmptyBlockEdges: boolean
  editEnforceSingleListRoot: boolean
}) => {
  const {
    editorRef,
    editing,
    editListMode,
    editTrimEmptyBlockEdges,
    editEnforceSingleListRoot,
  } = args

  const trimEmptyEditableEdges = React.useCallback((): boolean => {
    if (!editTrimEmptyBlockEdges) return false
    const root = editorRef.current
    if (!root) return false
    if (root.hasAttribute('data-agentic-viewer-surface') && !root.hasAttribute('data-agentic-viewer-dirty')) return false
    const isWhitespaceText = (n: Node | null): boolean => {
      if (!n || n.nodeType !== Node.TEXT_NODE) return false
      const v = String((n as Text).nodeValue || '')
      return v.replace(/[\u200B\u00A0\uFEFF]/g, '').trim().length === 0
    }
    const isBrElement = (n: Node | null): boolean => {
      if (!n || n.nodeType !== Node.ELEMENT_NODE) return false
      const tag = String((n as HTMLElement).tagName || '').toLowerCase()
      return tag === 'br'
    }
    const isEffectivelyEmptyBlockishElement = (el: Element, depth: number = 0): boolean => {
      if (depth > 5) return false
      const tag = String((el as HTMLElement).tagName || '').toLowerCase()
      const isAllowedEmptyWrapper = (
        tag === 'div'
        || tag === 'p'
        || tag === 'section'
        || tag === 'span'
        || tag === 'em'
        || tag === 'strong'
        || tag === 'b'
        || tag === 'i'
        || tag === 'u'
        || tag === 's'
        || tag === 'del'
        || tag === 'ins'
        || tag === 'mark'
        || tag === 'code'
        || tag === 'a'
        || tag === 'sub'
        || tag === 'sup'
      )
      if (!isAllowedEmptyWrapper) return false
      const text = String((el as HTMLElement).textContent || '').replace(/[\u200B\u00A0\uFEFF]/g, '').trim()
      if (text) return false
      const childEls = Array.from(el.children)
      if (childEls.length === 0) return true
      return childEls.every(c => {
        const childTag = String((c as HTMLElement).tagName || '').toLowerCase()
        if (childTag === 'br') return true
        return isEffectivelyEmptyBlockishElement(c, depth + 1)
      })
    }
    const isEmptyBlockElement = (el: Element): boolean => isEffectivelyEmptyBlockishElement(el, 0)

    let changed = false
    const pruneLeading = () => {
      while (isWhitespaceText(root.firstChild) || isBrElement(root.firstChild)) {
        root.firstChild?.remove()
        changed = true
      }
      while (root.firstElementChild && isEmptyBlockElement(root.firstElementChild)) {
        root.firstElementChild.remove()
        changed = true
      }
    }
    const pruneTrailing = () => {
      while (isWhitespaceText(root.lastChild) || isBrElement(root.lastChild)) {
        root.lastChild?.remove()
        changed = true
      }
      while (root.lastElementChild && isEmptyBlockElement(root.lastElementChild)) {
        root.lastElementChild.remove()
        changed = true
      }
    }

    pruneLeading()
    pruneTrailing()

    const rootTag = String((root as HTMLElement).tagName || '').toLowerCase()
    const rootIsList = rootTag === 'ul' || rootTag === 'ol'
    const hasAnyList = !rootIsList && Array.from(root.children).some(e => {
      const tag = String(e.tagName || '').toLowerCase()
      return tag === 'ul' || tag === 'ol'
    })
    const onlyList = (() => {
      const elems = Array.from(root.children)
      const meaningful = elems.filter(e => {
        const tag = String(e.tagName || '').toLowerCase()
        return tag !== 'br'
      })
      if (meaningful.length !== 1) return false
      const tag = String(meaningful[0]?.tagName || '').toLowerCase()
      return tag === 'ul' || tag === 'ol'
    })()
    if (onlyList || rootIsList || hasAnyList) {
      pruneLeading()
      pruneTrailing()

      let listEl = (
        rootIsList
          ? root
          : Array.from(root.children).find(e => {
              const tag = String(e.tagName || '').toLowerCase()
              return tag === 'ul' || tag === 'ol'
            })
      ) as HTMLElement | undefined
      const listNodes = rootIsList
        ? [root as HTMLElement]
        : (Array.from(root.querySelectorAll('ol, ul')) as HTMLElement[])
      for (const anyList of listNodes) {
        anyList.style.marginTop = '0px'
        anyList.style.marginBottom = '0px'
        anyList.style.paddingTop = '0px'
        anyList.style.paddingBottom = '0px'
        const prev = anyList.previousElementSibling as HTMLElement | null
        if (prev) {
          const prevTag = String(prev.tagName || '').toLowerCase()
          if (prevTag === 'ol' || prevTag === 'ul') anyList.style.marginTop = '0px'
        }
      }
      const unwrapSingleListWrappers = () => {
        let localChanged = false
        const children = Array.from(root.children) as HTMLElement[]
        for (const child of children) {
          const tag = String(child.tagName || '').toLowerCase()
          if (tag !== 'div' && tag !== 'p' && tag !== 'section' && tag !== 'span') continue
          const childNodes = Array.from(child.childNodes)
          const elementChildren = childNodes.filter(n => n.nodeType === Node.ELEMENT_NODE) as HTMLElement[]
          const listChildren = elementChildren.filter(el => {
            const t = String(el.tagName || '').toLowerCase()
            return t === 'ol' || t === 'ul'
          })
          if (listChildren.length !== 1) continue
          const hasMeaningfulNonList = childNodes.some(n => {
            if (n.nodeType === Node.TEXT_NODE) {
              const text = String((n as Text).nodeValue || '').replace(/[\u200B\u00A0\uFEFF]/g, '').trim()
              return text.length > 0
            }
            if (n.nodeType !== Node.ELEMENT_NODE) return false
            const t = String((n as HTMLElement).tagName || '').toLowerCase()
            if (t === 'ol' || t === 'ul' || t === 'br') return false
            return !isEmptyBlockElement(n as Element)
          })
          if (hasMeaningfulNonList) continue
          const listChild = listChildren[0]
          child.parentNode?.insertBefore(listChild, child)
          child.remove()
          localChanged = true
        }
        if (localChanged) changed = true
      }
      if (!rootIsList) unwrapSingleListWrappers()
      const normalizeListAncestorSpacing = () => {
        let localChanged = false
        const lists = Array.from(root.querySelectorAll('ol, ul')) as HTMLElement[]
        for (const listNode of lists) {
          let parent = listNode.parentElement
          while (parent && parent !== root) {
            const tag = String(parent.tagName || '').toLowerCase()
            if (tag === 'div' || tag === 'p' || tag === 'section' || tag === 'span') {
              if (parent.style.marginTop !== '0px') {
                parent.style.marginTop = '0px'
                localChanged = true
              }
              if (parent.style.marginBottom !== '0px') {
                parent.style.marginBottom = '0px'
                localChanged = true
              }
              if (parent.style.paddingTop !== '0px') {
                parent.style.paddingTop = '0px'
                localChanged = true
              }
              if (parent.style.paddingBottom !== '0px') {
                parent.style.paddingBottom = '0px'
                localChanged = true
              }
            }
            parent = parent.parentElement
          }
        }
        if (localChanged) changed = true
      }
      if (!rootIsList) normalizeListAncestorSpacing()

      const stripEmptyNodesBetweenSiblingLists = () => {
        const isListEl = (n: Node | null): n is HTMLElement => {
          if (!n || n.nodeType !== Node.ELEMENT_NODE) return false
          const tag = String((n as HTMLElement).tagName || '').toLowerCase()
          return tag === 'ol' || tag === 'ul'
        }
        const isEmptyBetween = (n: Node | null): boolean => {
          if (!n) return false
          if (n.nodeType === Node.COMMENT_NODE) return true
          if (isWhitespaceText(n)) return true
          if (isBrElement(n)) return true
          if (n.nodeType === Node.ELEMENT_NODE) return isEmptyBlockElement(n as Element)
          return false
        }

        let localChanged = false
        const lists = Array.from(root.querySelectorAll('ol, ul')) as HTMLElement[]
        for (const listEl of lists) {
          let node: Node | null = listEl.nextSibling
          const toRemove: Node[] = []
          while (node && isEmptyBetween(node)) {
            toRemove.push(node)
            node = node.nextSibling
          }
          if (!node) continue
          if (!isListEl(node)) continue
          if (node.parentNode !== listEl.parentNode) continue
          for (const n of toRemove) {
            if (n.parentNode) n.parentNode.removeChild(n)
            localChanged = true
          }
        }
        if (localChanged) changed = true
      }

      if (!rootIsList) {
        stripEmptyNodesBetweenSiblingLists()
      }
      if (editEnforceSingleListRoot && listEl) {
        if (rootIsList) {
          const childList = Array.from(root.children).find(e => {
            const tag = String(e.tagName || '').toLowerCase()
            return tag === 'ul' || tag === 'ol'
          }) as HTMLElement | undefined
          if (childList) {
            root.innerHTML = childList.innerHTML
            changed = true
            listEl = root
          }
        }
        const shouldRewriteRoot = (() => {
          if (rootIsList) return false
          const elems = Array.from(root.children)
          const listRootCount = elems.filter(e => {
            const tag = String((e as HTMLElement).tagName || '').toLowerCase()
            return tag === 'ul' || tag === 'ol'
          }).length
          if (listRootCount > 1) return false
          if (elems.length !== 1) return true
          if (elems[0] !== listEl) return true
          const leading = root.firstChild
          const trailing = root.lastChild
          const isWhitespaceNode = (n: Node | null) =>
            !!n && n.nodeType === Node.TEXT_NODE && String((n as Text).nodeValue || '').trim().length === 0
          if (leading && leading !== listEl && !isWhitespaceNode(leading)) return true
          if (trailing && trailing !== listEl && !isWhitespaceNode(trailing)) return true
          return false
        })()
        if (shouldRewriteRoot) {
          root.innerHTML = listEl.outerHTML
          changed = true
          listEl = root.firstElementChild as HTMLElement | undefined
        }
      }
      const isEmptyLi = (li: Element): boolean => {
        const tag = String((li as HTMLElement).tagName || '').toLowerCase()
        if (tag !== 'li') return false
        const text = String((li as HTMLElement).textContent || '').replace(/[\u200B\u00A0\uFEFF]/g, '').trim()
        if (text) return false
        const childEls = Array.from(li.children)
        if (childEls.length === 0) return true
        const okChild = (el: Element): boolean => {
          const t = String((el as HTMLElement).tagName || '').toLowerCase()
          if (t === 'br') return true
          if (t === 'p' || t === 'div') {
            const innerText = String((el as HTMLElement).textContent || '').replace(/[\u200B\u00A0\uFEFF]/g, '').trim()
            if (innerText) return false
            const innerChildren = Array.from(el.children)
            return innerChildren.length === 0 || innerChildren.every(c => String((c as HTMLElement).tagName || '').toLowerCase() === 'br')
          }
          return false
        }
        return childEls.every(okChild)
      }
      if (listEl) {
        listEl.style.marginTop = '0px'
        listEl.style.marginBottom = '0px'
        listEl.style.paddingTop = '0px'
        listEl.style.paddingBottom = '0px'
        for (const node of Array.from(listEl.childNodes)) {
          if (node.nodeType === Node.TEXT_NODE) {
            const v = String((node as Text).nodeValue || '').replace(/[\u200B\u00A0\uFEFF]/g, '').trim()
            if (!v) {
              node.remove()
              changed = true
            }
            continue
          }
          if (node.nodeType === Node.ELEMENT_NODE) {
            const tag = String((node as HTMLElement).tagName || '').toLowerCase()
            if (tag === 'br') {
              node.remove()
              changed = true
            }
          }
        }
        const isEmptyInlineContainer = (el: Element): boolean => {
          const t = String((el as HTMLElement).tagName || '').toLowerCase()
          if (t !== 'p' && t !== 'div') return false
          const text = String((el as HTMLElement).textContent || '').replace(/\u200B/g, '').trim()
          if (text) return false
          const children = Array.from(el.children)
          return children.length === 0 || children.every(c => String((c as HTMLElement).tagName || '').toLowerCase() === 'br')
        }
        const trimLiEdgeBlocks = (li: Element) => {
          while (li.firstChild && isWhitespaceText(li.firstChild)) {
            li.firstChild.remove()
            changed = true
          }
          while (li.lastChild && isWhitespaceText(li.lastChild)) {
            li.lastChild.remove()
            changed = true
          }
          while (li.firstChild && isBrElement(li.firstChild)) {
            li.firstChild.remove()
            changed = true
          }
          while (li.lastChild && isBrElement(li.lastChild)) {
            li.lastChild.remove()
            changed = true
          }
          while (li.firstElementChild && isEmptyInlineContainer(li.firstElementChild)) {
            li.firstElementChild.remove()
            changed = true
          }
          while (li.lastElementChild && isEmptyInlineContainer(li.lastElementChild)) {
            li.lastElementChild.remove()
            changed = true
          }
        }
        for (const li of Array.from(listEl.children)) {
          trimLiEdgeBlocks(li)
        }
        while (listEl.firstElementChild && isEmptyLi(listEl.firstElementChild)) {
          listEl.firstElementChild.remove()
          changed = true
        }
        while (listEl.lastElementChild && isEmptyLi(listEl.lastElementChild)) {
          listEl.lastElementChild.remove()
          changed = true
        }
        if (changed && listEl.children.length === 0) {
          const li = document.createElement('li')
          li.appendChild(document.createElement('br'))
          listEl.appendChild(li)
        }
      }
    }

    if (changed && root.childNodes.length === 0) {
      root.appendChild(document.createElement('br'))
    }
    return changed
  }, [editEnforceSingleListRoot, editTrimEmptyBlockEdges, editorRef])

  const edgeTrimRafRef = React.useRef(0)
  const scheduleEdgeTrimBurst = React.useCallback(() => {
    if (!editTrimEmptyBlockEdges) return
    if (edgeTrimRafRef.current) return
    let framesLeft = editListMode ? 3 : 6
    let stableFrames = 0
    const tick = () => {
      edgeTrimRafRef.current = 0
      if (!editing) return
      const changed = trimEmptyEditableEdges()
      if (changed) stableFrames = 0
      else stableFrames += 1
      framesLeft -= 1
      if (framesLeft <= 0) return
      if (stableFrames >= (editListMode ? 1 : 2)) return
      edgeTrimRafRef.current = window.requestAnimationFrame(tick)
    }
    edgeTrimRafRef.current = window.requestAnimationFrame(tick)
  }, [editListMode, editTrimEmptyBlockEdges, editing, trimEmptyEditableEdges])

  return {
    edgeTrimRafRef,
    trimEmptyEditableEdges,
    scheduleEdgeTrimBurst,
  }
}
