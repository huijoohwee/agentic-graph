import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { UI_ICON_APPEARANCE } from '@/lib/ui/theme-tokens'
import { renderSettingInput } from '@/features/settings/ui'

export function testSettingsPreviewRowsUseSharedResponsiveOwner() {
  for (const [key, value] of Object.entries(UI_ICON_APPEARANCE)) {
    for (const writable of [false, true]) {
      const html = renderToStaticMarkup(renderSettingInput(key, typeof value, writable,
        { ...UI_ICON_APPEARANCE, [key]: 'p-20' }, () => {}, { current: new Set() }))
      assert.match(html, /<output[^>]*data-shared-icon-role=/)
      assert.match(html, /<svg[^>]*role="img"[^>]*aria-label="Shared design role"/)
      assert.ok(html.includes(String(value)), `${key} shows its central role`)
      assert.doesNotMatch(html, /<input|<button|<select|aria-hidden|p-20/)
    }
  }
}
