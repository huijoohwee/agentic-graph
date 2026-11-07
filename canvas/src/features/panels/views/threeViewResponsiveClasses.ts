import React from 'react'
import { KeyTypeValueSectionStack } from 'grph-shared/react/keyTypeValueLayout'
import { uiToolbarSettingsPanelBodyClassName } from '@/features/toolbar/ui/toolbarStyles'

// Compose existing owners: the body owns insets; the inner stack owns row rhythm.
export function ThreeViewFieldSection({ children }: { children: React.ReactNode }) {
  return React.createElement('section', { className: uiToolbarSettingsPanelBodyClassName },
    React.createElement(KeyTypeValueSectionStack, null, children))
}
