import React from 'react'
import { CheckboxOption as BaseCheckboxOption, type CheckboxOptionProps } from '@agentic-base/views-react/controls'
import { PanelCheckbox } from '@/lib/ui/panelFormControls'

export { CheckboxGroup } from '@agentic-base/views-react/controls'

export function CheckboxOption(props: Omit<CheckboxOptionProps, 'inputComponent'>) {
  return <BaseCheckboxOption {...props} inputComponent={PanelCheckbox} />
}
