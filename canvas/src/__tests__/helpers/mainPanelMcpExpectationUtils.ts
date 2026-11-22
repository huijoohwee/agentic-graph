export const readRenderedFormValues = (container: Element): string => (
  Array.from(container.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLButtonElement>('input, textarea, button[data-kg-select]'))
    .map(el => el.value)
    .join('\n')
)

export const findKtvValueCell = (container: Element, key: string): HTMLElement => {
  const rows = Array.from(container.querySelectorAll('dl')) as HTMLElement[]
  const row = rows.find(item => item.children[0]?.textContent?.includes(key))
  if (!row) {
    throw new Error(`expected MCP hub to render KTV row ${JSON.stringify(key)}, got ${JSON.stringify(container.textContent || '')}`)
  }
  const valueCell = row.children[2] as HTMLElement | undefined
  if (!valueCell) {
    throw new Error(`expected MCP hub KTV row ${JSON.stringify(key)} to include a configurable Value cell`)
  }
  return valueCell
}

export const assertMcpValueCellControl = (container: Element, key: string, selector: string): void => {
  const valueCell = findKtvValueCell(container, key)
  if (!valueCell.querySelector(selector)) {
    throw new Error(`expected MCP hub KTV row ${JSON.stringify(key)} Value cell to render configurable control ${JSON.stringify(selector)}, got ${JSON.stringify(valueCell.textContent || '')}`)
  }
}
