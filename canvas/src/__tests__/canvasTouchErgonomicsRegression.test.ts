import { createToolbarFixture, path, readUtf8 } from './canvasTouchErgonomicsRegression/sourceFixture'
import { assertPhase1 } from './canvasTouchErgonomicsRegression/assertions1'
import { assertPhase2 } from './canvasTouchErgonomicsRegression/assertions2'
import { assertPhase3 } from './canvasTouchErgonomicsRegression/assertions3'
import { assertPhase4 } from './canvasTouchErgonomicsRegression/assertions4'
import { assertPhase5 } from './canvasTouchErgonomicsRegression/assertions5'
import { assertPhase6 } from './canvasTouchErgonomicsRegression/assertions6'

// Preserve the registry's stable entry point and run every assertion phase exactly once.
export function testToolbarTouchErgonomicsStaySourceDriven() {
  const fixture = createToolbarFixture()
  assertPhase1(fixture)
  assertPhase2(fixture)
  assertPhase3(fixture)
  assertPhase4(fixture)
  assertPhase5(fixture)
  assertPhase6(fixture)
}

export function testCanvasTouchTargetsStayLargeAndViewportSuppressesBrowserGestures() {
  const root = process.cwd()
  const dropdownText = readUtf8(path.resolve(root, 'src/components/toolbar/ToolbarDropdownSelect.tsx'))
  const viewportText = readUtf8(path.resolve(root, 'src/components/CanvasViewport.tsx'))

  if (
    !dropdownText.includes('dropdownMenuOptionClassName') || !readUtf8(path.resolve(root, 'src/lib/ui/dropdownMenu.tsx')).includes('UI_RESPONSIVE_TOUCH_MENU_OPTION_ROW_CLASSNAME') ||
    !dropdownText.includes('UI_RESPONSIVE_COMPACT_GLYPH_CLASSNAME') ||
    !dropdownText.includes('toolbarDropdownChevronClassName')
  ) {
    throw new Error('expected toolbar dropdown option rows and nested chevrons to keep shared touch-sized hit targets')
  }
  if (dropdownText.includes('gap-2 rounded px-2 py-1 text-sm') || dropdownText.includes('px-2 py-0.5 text-[10px]') || dropdownText.includes('h-3 w-3') || dropdownText.includes('w-3 h-3')) {
    throw new Error('expected toolbar dropdown row, hint, and chevron sizing to stay in shared responsive owners')
  }
  if (!dropdownText.includes('kg-toolbar-dropdown-children') || !dropdownText.includes('aria-expanded')) {
    throw new Error('expected toolbar dropdown child groups to use shared click-expand-down rows')
  }
  if (dropdownText.includes('kg-toolbar-dropdown-submenu') || dropdownText.includes('left-full')) {
    throw new Error('expected toolbar dropdown groups to avoid stale side-flyout submenu placement')
  }
  if (!viewportText.includes("touchAction: 'manipulation'")) {
    throw new Error('expected canvas viewport shell to disable double-tap browser zoom delays')
  }
  if (!viewportText.includes("overscrollBehavior: 'none'")) {
    throw new Error('expected canvas viewport shell to contain browser overscroll gestures')
  }
}
