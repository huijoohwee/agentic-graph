// A capture's byte budget does not bound the sites loaded by its child frames.
// Templates keep those browsing contexts inert until the reader opens one.
const EMBED_RUNTIME = `<script data-kg-preview-embeds>
document.addEventListener('toggle', function(event) {
  var panel = event.target;
  if (!(panel instanceof HTMLDetailsElement) || !panel.hasAttribute('data-kg-preview-embed')) return;
  var content = panel.querySelector('[data-kg-preview-active]');
  if (!panel.open) { if (content) content.remove(); return; }
  document.querySelectorAll('details[data-kg-preview-embed][open]').forEach(function(other) {
    if (other === panel) return;
    other.open = false;
    var previous = other.querySelector('[data-kg-preview-active]');
    if (previous) previous.remove();
  });
  if (content) return;
  var template = panel.querySelector('template');
  if (!template) return;
  content = document.createElement('div');
  content.setAttribute('data-kg-preview-active', '');
  content.appendChild(template.content.cloneNode(true));
  panel.appendChild(content);
}, true);
</script>`

export function deferWebpagePreviewEmbeddedContent(html: string): string {
  let hasEmbeds = false
  const deferred = html
    .replace(/<(iframe|object)\b(?:"[^"]*"|'[^']*'|[^'">])*?>[\s\S]*?<\/\1\s*>|<embed\b(?:"[^"]*"|'[^']*'|[^'">])*?\/?\s*>/gi, content => {
      hasEmbeds = true
      return `<details data-kg-preview-embed><summary>Load embedded content</summary><template>${content}</template></details>`
    })
    .replace(/<(video|audio)\b(?:"[^"]*"|'[^']*'|[^'">])*?>/gi, tag => tag
      .replace(/\s(?:autoplay|preload)\b(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?/gi, '')
      .replace(/\s*\/?>$/, ' preload="none" controls>'))
  return hasEmbeds ? `${deferred}\n${EMBED_RUNTIME}` : deferred
}
