import assert from 'node:assert/strict'

const quoted = value => `"${String(value).replace(/[\\"\n\r\f]/g, char => `\\${char.codePointAt(0).toString(16)} `)}"`

/** Exercise the visible shared menu using the same pointer path as a user. */
export async function selectMenuOption(locator, choice) {
  const trigger = locator.and(locator.page().locator('button[data-kg-select]'))
  assert.equal(await trigger.getAttribute('aria-haspopup'), 'menu')
  await trigger.click()
  const menuId = await trigger.getAttribute('aria-controls')
  assert.ok(menuId, 'an opened field must identify its visible menu')
  const menu = trigger.page().locator(`menu[id=${quoted(menuId)}]`)
  const item = typeof choice === 'object'
    ? menu.getByRole('menuitemradio', { name: choice.label, exact: true })
    : menu.locator(`button[role="menuitemradio"][value=${quoted(choice)}]`)
  await item.click()
  await menu.waitFor({ state: 'detached' })
}
