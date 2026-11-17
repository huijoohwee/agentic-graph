/** Stable Graph contracts; the reusable caret and selection owner is Design System. */
export { readViewerCaretRange as readMarkdownContentEditableCaretRangeFromPoint, applyViewerSelection as applyMarkdownContentEditableSelection } from 'agentic-design-system/viewer'
export const MARKDOWN_EDIT_SURFACE_INTERACTION_PARITY_CLASS = '[caret-color:inherit] focus:outline-none focus-visible:outline-none'
export const MARKDOWN_CONTENT_EDITABLE_PLACEHOLDER_CLASS = 'before:pointer-events-none before:italic before:text-[color:var(--kg-text-tertiary)] before:content-[attr(aria-placeholder)]'
export type MarkdownContentEditablePoint = { x:number;y:number }
export type MarkdownContentEditableCaretRange = { range:Range|null;supported:boolean }
