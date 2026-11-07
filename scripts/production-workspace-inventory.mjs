export const readVisibleWorkspaceSeedInventory = async contents => {
  const names = []
  // Only direct, visible file rows belong to this folder's inventory. Keep
  // duplicates so the caller's exact comparison rejects duplicated entries.
  const rows = contents.locator(':scope > ul > li > section[aria-label^="File "]')
  for (const row of await rows.all()) {
    if (await row.isVisible()) names.push((await row.getAttribute('aria-label')).slice('File '.length))
  }
  return names.sort()
}

export const openWorkspaceFolder = async (parent, name, timeout = 45_000) => {
  const folderLabel = `Folder ${name}`
  const folder = parent.locator(`section[aria-label="${folderLabel}"]`)
  await folder.waitFor({ state: 'visible', timeout })
  // Selection and disclosure have separate owners. Never select a folder as
  // a substitute for expanding it, and leave an already expanded row alone.
  if (await folder.locator('button[aria-expanded]').getAttribute('aria-expanded') === 'false') {
    await folder.getByRole('button', { name: `Expand folder ${name}`, exact: true }).click({ timeout })
  }
  await folder.getByRole('button', { name: `Collapse folder ${name}`, exact: true }).waitFor({ state: 'visible', timeout })
  const contents = folder.locator('..').locator(`:scope > section[aria-label=${JSON.stringify(`Contents of folder ${name}`)}]`)
  await contents.waitFor({ state: 'visible', timeout })
  return contents
}
