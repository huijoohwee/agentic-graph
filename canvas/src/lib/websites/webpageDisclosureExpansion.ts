export type WebpageDisclosureExpansionOptions = {
  maxControls?: number
  maxRounds?: number
  maxDurationMs?: number
}

export type WebpageDisclosureExpansionResult = {
  detailsOpened: number
  controlsActivated: number
  preservedPanels: number
  limited: boolean
}

/** Opens native and ARIA-disclosed content without relying on page-specific labels or classes. */
export async function expandWebpageDisclosures(
  options: WebpageDisclosureExpansionOptions = {},
): Promise<WebpageDisclosureExpansionResult> {
  // This function is serialized and executed in the captured page by Playwright.
  // Keep its runtime dependencies inside the function so it does not rely on
  // this module's scope after serialization.
  const maxPreservedDisclosureChars = 4_000_000
  const maxSingleDisclosureChars = 1_000_000
  const doc = typeof document === 'undefined' ? null : document
  if (!doc) return { detailsOpened: 0, controlsActivated: 0, preservedPanels: 0, limited: false }

  const maxControls = Number.isFinite(options.maxControls)
    ? Math.max(1, Math.min(240, Math.floor(Number(options.maxControls))))
    : 120
  const maxRounds = Number.isFinite(options.maxRounds)
    ? Math.max(1, Math.min(8, Math.floor(Number(options.maxRounds))))
    : 8
  const maxDurationMs = Number.isFinite(options.maxDurationMs)
    ? Math.max(100, Math.min(4000, Math.floor(Number(options.maxDurationMs))))
    : 1800
  const deadline = Date.now() + maxDurationMs
  let detailsOpened = 0
  let controlsActivated = 0
  let preservedPanels = 0
  let preservedHtmlChars = 0
  let scannedControls = 0
  let limited = false
  const controlAttempts = new WeakMap<Element, number>()
  const preservedTargets = new Map<string, { target: Element; clone: Element; control: Element }>()
  const preservedDetails = new Map<HTMLDetailsElement, HTMLDetailsElement>()

  const helpers = {
    visible(element: Element): boolean {
      try {
        const style = window.getComputedStyle(element)
        if (style.display === 'none' || style.visibility === 'hidden') return false
        if (Number.parseFloat(style.opacity || '1') <= 0.02) return false
        const rect = element.getBoundingClientRect()
        return rect.width > 1 && rect.height > 1
      } catch {
        return true
      }
    },

    controlledContentIsClosed(control: Element): boolean {
      const ids = String(control.getAttribute('aria-controls') || '').trim().split(/\s+/).filter(Boolean)
      for (const id of ids.slice(0, 8)) {
        const target = doc.getElementById(id)
        if (!target) continue
        if (target.hasAttribute('hidden') || target.getAttribute('aria-hidden') === 'true') return true
        if (target.getAttribute('data-state') === 'closed') return true
        try {
          const style = window.getComputedStyle(target)
          if (style.display === 'none' || style.visibility === 'hidden') return true
        } catch {
          // Attribute-based disclosure state remains available without computed styles.
        }
      }
      return false
    },

    isClosedDisclosure(control: Element): boolean {
      const expanded = String(control.getAttribute('aria-expanded') || '').toLowerCase()
      const state = String(control.getAttribute('data-state') || '').toLowerCase()
      if (expanded === 'true') return false
      if (expanded === 'false') return true
      return state === 'closed' || controlledContentIsClosed(control)
    },

    activate(control: Element): boolean {
      try {
        const tag = String(control.tagName || '').toLowerCase()
        const role = String(control.getAttribute('role') || '').toLowerCase()
        const popupType = String(control.getAttribute('aria-haspopup') || '').toLowerCase()
        if (['combobox', 'menuitem', 'option', 'tab'].includes(role)) return false
        if (tag === 'a' || (tag !== 'button' && role !== 'button')) return false
        if (popupType && popupType !== 'false') return false
        if (control.hasAttribute('disabled') || control.getAttribute('aria-disabled') === 'true') return false
        if (tag === 'button') {
          const type = String(control.getAttribute('type') || '').toLowerCase()
          if (type === 'submit' || type === 'reset') return false
          if (!type && control.closest('form')) return false
        }
        if (!visible(control)) return false
        const click = (control as HTMLElement).click
        if (typeof click !== 'function') return false
        click.call(control)
        return true
      } catch {
        return false
      }
    },

    sleep(ms: number): Promise<void> {
      return new Promise(resolve => setTimeout(resolve, ms))
    },

    controlledTargets(control: Element): Element[] {
      const ids = String(control.getAttribute('aria-controls') || '').trim().split(/\s+/).filter(Boolean)
      return ids.slice(0, 8).flatMap(id => {
        const target = doc.getElementById(id)
        return target ? [target] : []
      })
    },

    canCaptureControl(control: Element): boolean {
      const role = String(control.getAttribute('role') || '').toLowerCase()
      const popupType = String(control.getAttribute('aria-haspopup') || '').toLowerCase()
      return !['combobox', 'menuitem', 'option', 'tab'].includes(role)
        && (!popupType || popupType === 'false')
        && controlledTargets(control).length > 0
    },

    makeContentVisible(element: Element): void {
      try {
        element.removeAttribute('hidden')
        element.removeAttribute('inert')
        if (element.hasAttribute('aria-hidden')) element.setAttribute('aria-hidden', 'false')
        if (element.getAttribute('data-state') === 'closed') element.setAttribute('data-state', 'open')
        const style = (element as HTMLElement).style
        if (!style) return
        if (style.display === 'none') style.display = 'block'
        if (style.visibility === 'hidden') style.visibility = 'visible'
        if (style.opacity === '0') style.opacity = '1'
        if (style.maxHeight === '0px' || style.maxHeight === '0') style.maxHeight = 'none'
        if (style.height === '0px' || style.height === '0') style.height = 'auto'
        if (style.overflow === 'hidden') style.overflow = 'visible'
      } catch {
        // A partial clone is still preferable to losing the disclosed text entirely.
      }
    },

    preserveTarget(target: Element, control: Element): void {
      if (!target.id || preservedTargets.has(target.id)) return
      if (target.hasAttribute('hidden') || target.getAttribute('aria-hidden') === 'true' || target.getAttribute('data-state') === 'closed') return
      const html = String(target.outerHTML || '')
      if (!html || html.length > maxSingleDisclosureChars || preservedHtmlChars + html.length > maxPreservedDisclosureChars) {
        limited = true
        return
      }
      try {
        const clone = target.cloneNode(true) as Element
        makeContentVisible(clone)
        preservedTargets.set(target.id, { target, clone, control })
        preservedHtmlChars += html.length
        preservedPanels += 1
      } catch {
        // Continue opening other disclosures when a page node cannot be cloned.
      }
    },

    preserveDetails(details: HTMLDetailsElement): void {
      if (preservedDetails.has(details)) return
      const html = String(details.outerHTML || '')
      if (!html || html.length > maxSingleDisclosureChars || preservedHtmlChars + html.length > maxPreservedDisclosureChars) {
        limited = true
        return
      }
      try {
        const clone = details.cloneNode(true) as HTMLDetailsElement
        clone.open = true
        // Same-name disclosure groups are single-open in browsers; the captured
        // snapshot must retain every section independently of that interaction rule.
        clone.removeAttribute('name')
        preservedDetails.set(details, clone)
        preservedHtmlChars += html.length
        preservedPanels += 1
      } catch {
        // Continue with the remaining native disclosures.
      }
    },

    async waitForDisclosureOpen(control: Element): Promise<void> {
      const settleDeadline = Math.min(deadline, Date.now() + 280)
      while (Date.now() < settleDeadline) {
        const targetOpened = controlledTargets(control).some(target =>
          !target.hasAttribute('hidden')
          && target.getAttribute('aria-hidden') !== 'true'
          && target.getAttribute('data-state') !== 'closed',
        )
        if (!isClosedDisclosure(control) || targetOpened) {
          await sleep(Math.min(80, Math.max(0, settleDeadline - Date.now())))
          return
        }
        await sleep(Math.min(20, Math.max(0, settleDeadline - Date.now())))
      }
    },
  }
  const {
    visible,
    controlledContentIsClosed,
    isClosedDisclosure,
    activate,
    sleep,
    controlledTargets,
    canCaptureControl,
    makeContentVisible,
    preserveTarget,
    preserveDetails,
    waitForDisclosureOpen,
  } = helpers

  // Preserve initially open panels before visiting other controls. In a
  // single-open group, the first click can otherwise unmount the only copy.
  for (const details of Array.from(doc.querySelectorAll('details[open]')).slice(0, maxControls)) {
    preserveDetails(details as HTMLDetailsElement)
  }
  const openControls = doc.querySelectorAll(
    'button[aria-expanded="true"], [role="button"][aria-expanded="true"], '
    + 'button[data-state="open"], [role="button"][data-state="open"]',
  )
  for (const control of openControls) {
    if (!canCaptureControl(control)) continue
    for (const target of controlledTargets(control)) preserveTarget(target, control)
    controlAttempts.set(control, maxRounds)
  }

  for (let round = 0; round < maxRounds && Date.now() < deadline; round += 1) {
    let changed = false
    const details = doc.querySelectorAll('details:not([open])')
    for (const disclosure of Array.from(details).slice(0, maxControls)) {
      if (detailsOpened + controlsActivated >= maxControls || Date.now() >= deadline) {
        limited = true
        break
      }
      try {
        const detailsElement = disclosure as HTMLDetailsElement
        detailsElement.open = true
        detailsOpened += 1
        preserveDetails(detailsElement)
        changed = true
      } catch {
        // Continue with other native disclosures.
      }
    }
    if (details.length > maxControls) limited = true

    if (detailsOpened + controlsActivated < maxControls && Date.now() < deadline) {
      const controls = doc.querySelectorAll(
        'button[aria-expanded="false"], [role="button"][aria-expanded="false"], '
        + 'button[data-state="closed"], [role="button"][data-state="closed"], '
        + 'button[aria-controls], [role="button"][aria-controls]',
      )
      for (const control of controls) {
        const attempts = controlAttempts.get(control) || 0
        const state = String(control.getAttribute('data-state') || '').toLowerCase()
        const maxAttempts = control.hasAttribute('aria-controls') || state === 'closed' ? Math.min(2, maxRounds) : 1
        if (attempts >= maxAttempts) continue
        if (detailsOpened + controlsActivated >= maxControls || scannedControls >= maxControls || Date.now() >= deadline) {
          limited = true
          break
        }
        if (!attempts) scannedControls += 1
        if (!isClosedDisclosure(control) || !activate(control)) continue
        controlAttempts.set(control, attempts + 1)
        controlsActivated += 1
        if (control.hasAttribute('aria-controls')) await waitForDisclosureOpen(control)
        const targets = controlledTargets(control)
        for (const target of targets) preserveTarget(target, control)
        const targetOpened = targets.some(target =>
          !target.hasAttribute('hidden')
          && target.getAttribute('aria-hidden') !== 'true'
          && target.getAttribute('data-state') !== 'closed',
        )
        if (targets.length && (!isClosedDisclosure(control) || targetOpened)) controlAttempts.set(control, maxAttempts)
        changed = true
      }
      if (controls.length > scannedControls && scannedControls >= maxControls) limited = true
    }

    if (!changed) break
    if (round + 1 < maxRounds && Date.now() < deadline) await sleep(Math.min(100, deadline - Date.now()))
  }

  if (controlsActivated && Date.now() < deadline) {
    const MutationObserverCtor = doc.defaultView?.MutationObserver
    let lastMutationAt = Date.now()
    const observer = MutationObserverCtor ? new MutationObserverCtor(() => { lastMutationAt = Date.now() }) : null
    try { observer?.observe(doc.documentElement || doc.body, { subtree: true, childList: true, attributes: true, characterData: true }) } catch { void 0 }
    const settleDeadline = Math.min(deadline, Date.now() + 1200)
    const settleStartedAt = Date.now()
    while (Date.now() < settleDeadline) {
      const elapsed = Date.now() - settleStartedAt
      if (elapsed >= 450 && Date.now() - lastMutationAt >= 240) break
      await sleep(Math.min(60, settleDeadline - Date.now()))
    }
    observer?.disconnect()
  }

  // Single-open accordions close earlier panels as later triggers are activated.
  // Put captured copies back in their original positions before the caller
  // serializes the page, so downstream converters see every disclosed section.
  for (const [targetId, preserved] of preservedTargets) {
    const current = doc.getElementById(targetId)
    try {
      if (current) {
        current.replaceWith(preserved.clone)
      } else {
        const control = preserved.control.id ? doc.getElementById(preserved.control.id) : preserved.control
        const anchor = control?.parentElement || control
        if (anchor?.parentNode) anchor.parentNode.insertBefore(preserved.clone, anchor.nextSibling)
        else (doc.querySelector('main,[role="main"]') || doc.body || doc.documentElement)?.appendChild(preserved.clone)
      }
    } catch {
      limited = true
    }
  }
  for (const [original, clone] of preservedDetails) {
    try {
      if (original.isConnected) original.replaceWith(clone)
      else (doc.querySelector('main,[role="main"]') || doc.body || doc.documentElement)?.appendChild(clone)
    } catch {
      limited = true
    }
  }

  if (scannedControls > maxControls) limited = true
  return { detailsOpened, controlsActivated, preservedPanels, limited }
}

export function hasCollapsedWebpageDisclosures(html: string): boolean {
  const source = String(html || '')
  if (!source) return false
  if (/\baria-expanded\s*=\s*(["'])false\1/i.test(source)) return true
  if (/\bdata-state\s*=\s*(["'])closed\1/i.test(source)) return true
  const details = source.match(/<details\b[^>]*>/gi) || []
  return details.some(tag => !/\bopen(?:\s|=|\/|>)/i.test(tag))
}
