import { collectRepoLevelHardcodedMotionRecipeOffenders } from '@/__tests__/helpers/motionTokenAudit'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export function testMotionTokenSsoTAuditFindsNoOtherRepoLevelCssMotionRecipes() {
  const offenders = collectRepoLevelHardcodedMotionRecipeOffenders()
  if (offenders.length > 0) {
    throw new Error(`expected no other repo-level CSS surfaces to keep hardcoded 140ms ease motion recipes, found: ${offenders.join(', ')}`)
  }
}

export function testAgenticGraphMotionRuntimeUsesNativeWaapiWithoutMotionDependency() {
  const root = resolve(process.cwd(), '..')
  const canvasPackageText = readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')
  const rootPackageLockText = readFileSync(resolve(root, 'package-lock.json'), 'utf8')
  for (const forbidden of ['"@motionone/dom"', '"motion"', '"framer-motion"', 'motiondivision/motionone']) {
    if (canvasPackageText.includes(forbidden) || rootPackageLockText.includes(forbidden)) {
      throw new Error(`expected agentic-graph motion enhancement to avoid vendoring ${forbidden}`)
    }
  }

  const runtimeText = readFileSync(resolve(process.cwd(), 'src', 'lib', 'motion', 'agentic-graph-motion.ts'), 'utf8')
  for (const required of [
    'element.animate',
    'WeakMap<Element, Animation>',
    "window.matchMedia('(prefers-reduced-motion: reduce)')",
    'runAgenticGraphMotion',
    'flow-widget-enter',
    'overlay-toolbar-enter',
  ]) {
    if (!runtimeText.includes(required)) throw new Error(`expected native motion runtime to include ${required}`)
  }
}

export function testAgenticGraphMotionTokensAndStoryboardWidgetIntegration() {
  const indexCssText = readFileSync(resolve(process.cwd(), 'src', 'index.css'), 'utf8')
  for (const required of [
    '--kg-motion-duration-enter',
    '--kg-motion-duration-emphasis',
    '--kg-motion-stagger-step',
    '--kg-motion-ease-standard',
    '--kg-motion-ease-spring',
    '--kg-motion-distance-sm',
    '@media (prefers-reduced-motion: reduce)',
  ]) {
    if (!indexCssText.includes(required)) throw new Error(`expected motion tokens to include ${required}`)
  }

  const overlayInnerText = readFileSync(resolve(process.cwd(), 'src', 'components', 'StoryboardWidget', 'WidgetEditorInner.tsx'), 'utf8')
  for (const required of [
    "runAgenticGraphMotion(placement.asideRef.current, 'flow-widget-enter'",
    "runAgenticGraphMotion(placement.asideRef.current, 'flow-widget-emphasis'",
    'controller.abort()',
  ]) {
    if (!overlayInnerText.includes(required)) throw new Error(`expected Storyboard Widget motion integration to include ${required}`)
  }

  const overlayViewText = readFileSync(resolve(process.cwd(), 'src', 'components', 'StoryboardWidget', 'WidgetEditorView.tsx'), 'utf8')
  for (const required of [
    'toolbarMotionRef',
    "runAgenticGraphMotion(toolbarMotionRef.current, 'overlay-toolbar-enter'",
  ]) {
    if (!overlayViewText.includes(required)) throw new Error(`expected Storyboard Widget toolbar motion integration to include ${required}`)
  }
}
