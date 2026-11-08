export async function setButtonPressed(button, pressed, options) {
  const current = await button.getAttribute('aria-pressed', options)
  if (current !== 'true' && current !== 'false') throw new Error('Expected a toggle button with aria-pressed')
  if (current !== String(pressed)) await button.click(options)
}
