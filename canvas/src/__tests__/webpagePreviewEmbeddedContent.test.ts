import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { buildWebpageHtmlSrcdoc, buildWebpageSandboxHtmlAsync } from '@/lib/websites/webpageSandboxDoc'

const capture = `<h1>Saved document</h1>
<iframe title="First" src="https://embed.example.invalid/one?autoplay=1"></iframe>
<iframe title="Second" src="https://embed.example.invalid/two"></iframe>
<object data="https://embed.example.invalid/report"></object>
<embed src="https://embed.example.invalid/diagram">
<video autoplay="autoplay" preload="auto" src="https://media.example.invalid/movie"></video>
<audio autoplay preload=metadata src="https://media.example.invalid/audio"></audio>`
const args = { html: capture, baseHref: 'https://source.example.invalid/document' }
const tick = () => new Promise(resolve => setTimeout(resolve, 20))

test('both saved-preview builders leave embedded contexts inert and media paused', async () => {
  for (const html of [buildWebpageHtmlSrcdoc(args), (await buildWebpageSandboxHtmlAsync(args)).html]) {
    const dom = new JSDOM(html)
    try {
      const doc = dom.window.document
      assert.equal(doc.querySelectorAll('iframe,object,embed').length, 0)
      assert.equal(doc.querySelectorAll('details[data-kg-preview-embed] template').length, 4)
      assert.equal(doc.querySelector('h1')?.textContent, 'Saved document')
      for (const media of doc.querySelectorAll('video,audio')) {
        assert.equal(media.hasAttribute('autoplay'), false)
        assert.equal(media.getAttribute('preload'), 'none')
        assert.ok(media.hasAttribute('controls'))
      }
    } finally { dom.window.close() }
  }
})

test('opening an embed activates it; replacing or closing it releases the previous context', async () => {
  const dom = new JSDOM(buildWebpageHtmlSrcdoc(args), { runScripts: 'dangerously' })
  try {
    const doc = dom.window.document
    const panels = doc.querySelectorAll<HTMLDetailsElement>('details[data-kg-preview-embed]')
    assert.equal(doc.querySelectorAll('iframe').length, 0)
    panels[0].open = true
    await tick()
    assert.equal(doc.querySelectorAll('iframe').length, 1)
    assert.equal(doc.querySelector('iframe')?.title, 'First')
    panels[1].open = true
    await tick()
    assert.equal(panels[0].open, false)
    assert.equal(doc.querySelectorAll('iframe').length, 1)
    assert.equal(doc.querySelector('iframe')?.title, 'Second')
    panels[1].open = false
    await tick()
    assert.equal(doc.querySelectorAll('iframe').length, 0)
  } finally { dom.window.close() }
})

test('explicit script-enabled pages retain their authored embeds', async () => {
  for (const html of [buildWebpageHtmlSrcdoc({ ...args, scriptPolicy: 'allow' }), (await buildWebpageSandboxHtmlAsync({ ...args, scriptPolicy: 'allow' })).html]) {
    const dom = new JSDOM(html)
    try {
      assert.equal(dom.window.document.querySelectorAll('iframe').length, 2)
      assert.equal(dom.window.document.querySelectorAll('[data-kg-preview-embed]').length, 0)
    } finally { dom.window.close() }
  }
})
