---
title: Markdown Slide Styling Guidelines
graphId: md:markdown-slide-styling-guidelines
theme: academic
background: https://placehold.co/1920x1080?text=Cover+Image
class: text-center
transition: slide-left
layout: cover
aspectRatio: 16/9
lang: en-US
authors:
  - AgenticGraph Team
meeting: "Documentation"
date: "2026-01-12"
venue: "GitHub"
institution: "Huijoohwee"
url: "https://huijoohwee.github.io"
mermaid: |
  graph TB
    A[Start] --> B[Left Path]
    A --> C[Right Path]
    B --> D[End]
    C --> D
---

# Markdown Slide Styling Guidelines

Universal syntax guide for presentation frameworks

> Canonical index document. Keep this file sub-600; continue advanced syntax and export guidance in `agenticgraph-markdown-slide-styling-guidelines-advanced-and-export.md`.

> Status: This document distinguishes between **fully supported semantics** in the AgenticGraph canvas markdown viewer and **structurally accepted only** features that are rendered as plain content without special behavior.

---

## Frontmatter Configuration (fully supported in AgenticGraph viewer)

```yaml
---
theme: default
background: /cover.jpg
class: text-center
transition: slide-left
layout: cover
aspectRatio: '16/9'
lang: en-US
mermaid: |
  graph TB
    A[Start] --> B[Left Path]
    A --> C[Right Path]
    B --> D[End]
    C --> D
---
```

**Purpose**: Configures presentation-wide settings via YAML metadata block

**Common keys**: `theme`, `background`, `class`, `transition`, `layout`, `aspectRatio`, `lang`

**Academic / Metadata keys (fully supported):**
- `authors`: List of authors (string or array)
- `meeting`: Conference or meeting name
- `date`: Presentation date
- `venue`: Presentation venue
- `institution`: Institution or organization name (displays in footer)
- `url`: Link to paper or project
- `theme`: Theme style (e.g., `default`, `academic`; legacy alias: `neversink` → `academic`)
- `mermaid`: Global mermaid diagram definition (string)

**Effect**: When these keys are present, a persistent footer is rendered on slides (except `cover` and `intro` layouts).
- **Default Theme**: Meeting/Venue/Institution/Date (Left), Authors/URL (Right), Page Numbers (Right).
- **Academic Theme** (`theme: academic`): Meeting + Authors (Left), Institution/Venue + Page X / Y (Right).

---

## Text Styling (fully supported)

**Bold:** `**text**` → **text**  
**Italic:** `*text*` → *text*  
**Bold+Italic:** `***text***` → ***text***  
**Underline:** `<u>text</u>` → <u>text</u>  
**Highlight:** `==text==` or `<mark>text</mark>` → <mark>text</mark>  
**Strikethrough:** `~~text~~` → ~~text~~  
**Subscript:** `~text~` → <sub>text</sub>  
**Superscript:** `^text^` → <sup>text</sup>  
**Code:** `` `text` `` → `text`

**Custom span:**
```html
<span class="custom-class">styled text</span>
```

---

## Lists (fully supported)

**Unordered:**
```markdown
- Item one
- Item two
  - Nested item
```

**Ordered:**
```markdown
1. Step one
2. Step two
```

**Task:**
```markdown
- [x] Completed
- [ ] Pending
```

---

## Footnotes (fully supported)

```markdown
Here is a footnote reference[^1].

[^1]: This is the footnote content.
```

**Purpose**: Add citations or additional context at the bottom of the slide/document.

---

## Headings and IDs (fully supported)

```markdown
# Heading Level 1 {#custom-id}
## Heading Level 2
```

**Auto-generated IDs**: Headings automatically get IDs derived from their text (kebab-case).
**Custom IDs**: You can specify a custom ID using the `{#id}` syntax.
**Linking**: Link to headings using `[Link Text](#custom-id)`.

---

## Tables (fully supported)

```markdown
| Column A | Column B | Column C |
|----------|----------|----------|
| Data 1   | Data 2   | Data 3   |
| Data 4   | Data 5   | Data 6   |
```

**Alignment:** `:---` (left), `:---:` (center), `---:` (right)

**Example:**
```markdown
| Metric | Before | After |
|:-------|-------:|:-----:|
| Speed  | 3.2s   | 0.8s  |
```

---

## Blockquotes (fully supported)

```markdown
> Single-line quote

> **Multi-line quote:**
>
> - Point one
> - Point two
> - Point three
```

**Purpose**: Highlights citations, callouts, or emphasized content blocks

### Callouts (subset)

Callouts are blockquotes whose first line includes `[!type]`:

```markdown
> [!info] Status
> This is an informational callout.
```

Foldable callouts add `+` (open) or `-` (collapsed) after the type:

```markdown
> [!note+] Open by default
> Details...

> [!warning-] Collapsed by default
> Details...
```

---

## Code Blocks (fully supported)

**Basic:**
````markdown
```javascript
function example() {
  return 42;
}
```
````

**With language hint:**
````markdown
```python
def calculate(x):
    return x * 2
```
````

**Supported languages:** `javascript`, `python`, `java`, `cpp`, `go`, `rust`, `sql`, `bash`, `css`, `html`, `json`, `yaml`, `markdown`

**Viewer controls (Canvas):** The Markdown Viewer header provides a single global **Beside / Inline / Render** mode that applies to all code blocks:
- **Beside / Inline** controls annotation layout (when annotations are detected).
- **Render** shows a fitted preview when supported (e.g. `mermaid` / `mmd` diagrams, GeoJSON rendered via MapLibre).

---

## Code: Line Highlighting (structural only today)

````markdown
```js {1,3-5}
const a = 1;     // Highlighted
const b = 2;
const c = 3;     // Highlighted
const d = 4;     // Highlighted
const e = 5;     // Highlighted
```
````

**Progressive steps:**
````markdown
```js {1|3-5|all}
// Step 1: line 1
// Step 2: lines 3-5
// Step 3: all lines
```
````

---

## Code: Advanced Features (structural only today)

**Line numbers:**
````markdown
```python {lines:true}
def example():
    pass
```
````

**Diff syntax:**
````markdown
```diff
- removed_line()
+ added_line()
  unchanged_line()
```
````

**Editable code:**
````markdown
```js {monaco}
const editable = true;
```
````

---

## Math: LaTeX (structural only today)

**Inline:** `$E = mc^2$` renders inline equation

**Block:**
```markdown
$$
\int_{-\infty}^{\infty} e^{-x^2} dx = \sqrt{\pi}
$$
```

**Matrix:**
```markdown
$$
\begin{bmatrix}
a & b \\
c & d
\end{bmatrix}
$$
```

---

## Images (fully supported)

**Basic:**
```markdown
![Alt text](path/to/image.jpg)
```

**With size attributes:**
```markdown
![width:200px](image.jpg)
![w:50%](image.jpg)
```

**Background image:**
```markdown
![bg](background.jpg)
![bg right](split.jpg)
![bg left:40%](split.jpg)
```

---

## Links (fully supported)

```markdown
[Link text](https://example.com)
[Link with title](https://example.com "Tooltip text")
```

**Auto-linking:**
```markdown
<https://example.com>
```

---

## Horizontal Rules (fully supported)

```markdown
---
```

**Purpose**: Separates slides or sections depending on framework configuration

**Alternative syntax:**
```markdown
***
___
```

---

## Empty Slide Handling (fully supported)

If a slide's content cannot be rendered from shared tokens due to misalignment or missing data, the presentation engine automatically falls back to on-the-fly lexing of the slide text. This ensures that content is always visible, even if line mapping is imperfect.

---

## Semantic HTML Structure (fully supported)

The presentation engine uses semantic HTML elements to improve accessibility and document structure:

- **`<article>`**: Wraps each individual slide.
- **`<section>`**: Used for slide content containers and layout divisions.
- **`<header>`**: Used for slide headers (titles, metadata).
- **`<footer>`**: Used for slide footers (page numbers, institution info).
- **`<aside>`**: Used for speaker notes and sidebars.
- **`<nav>`**: Used for navigation controls and slide galleries.

This semantic structure ensures better compatibility with screen readers and search engines compared to generic `div` wrappers.

---
- Top-of-document YAML frontmatter (`---` … `---` at the very start) is treated as metadata and does not create a slide break.
- `---` lines that appear outside YAML frontmatter and outside fenced code blocks are treated as slide separators by the AgenticGraph markdown viewer and Gallery renderer.
- `---` that appear inside fenced code blocks or inside YAML frontmatter are treated as literal content, not slide breaks.

**Reordering behavior:**
- The Gallery renderer sidebar lets you drag thumbnails to change slide order; AgenticGraph rewrites the underlying markdown to match that order so the editor, viewer, and on-disk file stay aligned.
- Reordering operates on slide-sized chunks, preserving per-slide YAML blocks, notes, and fenced code blocks (including those that contain `---`) as intact units.
- When AgenticGraph rewrites a deck after reordering, it normalizes slide separators to the form:

  ```markdown
  <last non-empty line of previous slide>
  
  ---
  
  <first non-empty line of next slide>
  ```

  enforcing a single blank line before and after each `---` separator.

**Fullscreen frame, zoom, and scroll semantics in AgenticGraph:**
- The Gallery renderer renders each slide inside a static frame; the frame border, corner radius, and drop shadow do not zoom.
- The slide content inside the frame can be zoomed and panned for detail inspection, while the frame stays fixed.
- Mouse wheel or trackpad scroll **inside the frame** scrolls the slide content; it does not trigger zoom.
- Zoom gestures are modifier-based: holding `Ctrl` (or `Cmd` on macOS) while scrolling zooms; plain scroll without modifiers only scrolls.

---

## Two-Column Layout: HTML (structural only)

```html
<section class="two-column">
<section>

**Left column:**
- Content A
- Content B

</section>
<section>

**Right column:**
- Content C
- Content D

</section>
</section>
```

**Requires CSS:** `.two-column { display: grid; grid-template-columns: 1fr 1fr; }`

---

## Two-Column Layout: Native (fully supported)

```markdown
---
layout: two-cols
---

Left column content

::right::

Right column content
```

**Purpose**: Framework-specific delimiter for column splitting

---

## Click-Based Progressive Disclosure (fully supported in AgenticGraph viewer)

**Group animation:**
```html
<v-clicks>

- Appears on click 1
- Appears on click 2
- Appears on click 3

</v-clicks>
```

**Individual control (step-based reveal):**
```html
<v-click>Block appears on click</v-click>

<v-click at="2">Appears at step 2</v-click>
```

**AgenticGraph semantics:**
- `<v-click>` blocks are treated as slide fragments.
- `at="N"` sets the explicit fragment index for ordering.
- When presentation mode is enabled and fragments are configured, fragments appear as the presenter advances steps.

---

## Inline Text Markers (partially supported in AgenticGraph viewer)

```html
<v-mark color="red">red highlight</v-mark>
<v-mark color="yellow">yellow highlight</v-mark>
<v-mark type="circle">circled</v-mark>
<v-mark type="underline">underlined</v-mark>
<v-mark type="strike-through">strikethrough</v-mark>
```

**Colors:** `red`, `orange`, `yellow`, `green`, `blue`, `purple`, `gray`

**Types:** `highlight`, `circle`, `underline`, `strike-through`

**AgenticGraph semantics:**
- `<v-mark>` blocks participate in fragment stepping like `<v-click>`.
- Color and type attributes are treated as plain content (no special styling today).

---

## Slide-Specific Directives (partially supported)

**Per-slide YAML:**
```markdown
---
layout: center
class: text-center
background: #1a1a2e
transition: fade
fragments:
  enabled: true
  steps: 3
---

Slide content

Additional fragment configuration keys understood by the AgenticGraph viewer:
- `fragmentTags`: overrides the default fragment tag list (`['v-click', 'v-mark']`).
- `fragmentClassNames`: overrides the default fragment class list (`['fragment']`).
- `fragmentSteps` / `fragmentStepCount`: alternative way to specify total steps.
```

**HTML comments:**
```markdown
<!-- _class: lead -->
<!-- _backgroundColor: #ffffff -->
<!-- _color: #333333 -->

Slide content
```

---

## Layout Types (partially supported)

**Common layouts:**
- `default` - Standard content
- `cover` - Title slide
- `intro` - Introduction
- `center` - Centered content
- `two-cols` - Two columns
- `image-right` - Image on right
- `image-left` - Image on left
- `quote` - Large quote
- `fact` - Large number/fact
- `section` - Section divider

---

## Background Control (fully supported)

**Image:**
```yaml
---
background: /path/to/image.jpg
backgroundSize: cover
backgroundPosition: center
---
```

**Gradient:**
```yaml
---
background: linear-gradient(135deg, #667eea, #764ba2)
---
```

**Color:**
```yaml
---
background: '#1a1a2e'
---
```

---


## Continued In Companion Documents
- agenticgraph-markdown-slide-styling-guidelines-advanced-and-export.md
