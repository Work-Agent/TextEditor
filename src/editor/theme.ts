import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { EditorView } from '@codemirror/view';

export function editorTheme(dark: boolean) {
  return EditorView.theme(
    {
      '&': {
        height: '100%',
        color: 'var(--te-fg)',
        backgroundColor: 'var(--te-bg)',
      },
      '.cm-scroller': {
        fontFamily: 'var(--te-font)',
        fontSize: 'var(--te-font-size)',
        lineHeight: '1.65',
        overflow: 'auto',
      },
      '.cm-content': {
        padding: '16px 0 160px',
        caretColor: 'var(--te-accent)',
      },
      '.cm-line': {
        padding: '0 14px',
      },
      '.cm-cursor, .cm-dropCursor': {
        borderLeftColor: 'var(--te-accent)',
      },
      '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
        backgroundColor: 'var(--te-selection)',
      },
      '.cm-activeLine': {
        backgroundColor: 'var(--te-active-line)',
      },
      '.cm-gutters': {
        backgroundColor: 'var(--te-bg)',
        color: 'var(--te-muted)',
        border: 'none',
        paddingRight: '6px',
      },
      '.cm-activeLineGutter': {
        backgroundColor: 'var(--te-active-line)',
        color: 'var(--te-fg)',
      },
      '.cm-foldGutter .cm-gutterElement': {
        color: 'var(--te-muted)',
        padding: '0 2px',
      },
      '.cm-panels': {
        backgroundColor: 'var(--te-panel)',
        color: 'var(--te-fg)',
        borderColor: 'var(--te-border)',
      },
      '.cm-panels.cm-panels-top': {
        borderBottom: '1px solid var(--te-border)',
      },
      '.cm-searchMatch': {
        backgroundColor: 'var(--te-search-match)',
        outline: '1px solid var(--te-accent)',
      },
      '.cm-searchMatch.cm-searchMatch-selected': {
        backgroundColor: 'var(--te-search-selected)',
      },
      '.cm-tooltip': {
        backgroundColor: 'var(--te-panel)',
        color: 'var(--te-fg)',
        border: '1px solid var(--te-border)',
        borderRadius: '8px',
        boxShadow: '0 8px 30px rgba(0,0,0,.18)',
      },
      '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
        backgroundColor: 'var(--te-accent-soft)',
        color: 'var(--te-fg)',
      },
      '.cm-placeholder': {
        color: 'var(--te-muted)',
        fontStyle: 'normal',
      },
      '.cm-specialChar': {
        color: 'var(--te-danger)',
      },
      '.cm-highlightSpace': {
        backgroundImage:
          'radial-gradient(circle at 50% 55%, var(--te-whitespace) 0, var(--te-whitespace) 1px, transparent 1.2px)',
        backgroundSize: '5px 5px',
      },
      '.cm-highlightTab': {
        backgroundImage:
          'linear-gradient(to right, var(--te-whitespace) 0, var(--te-whitespace) 1px, transparent 1px)',
        backgroundSize: '4px 100%',
      },
    },
    { dark },
  );
}

export const textHighlightStyle = HighlightStyle.define([
  { tag: tags.comment, color: 'var(--te-code-comment)', fontStyle: 'italic' },
  { tag: tags.keyword, color: 'var(--te-code-keyword)' },
  { tag: tags.atom, color: 'var(--te-code-atom)' },
  { tag: tags.bool, color: 'var(--te-code-atom)' },
  { tag: tags.number, color: 'var(--te-code-number)' },
  { tag: tags.string, color: 'var(--te-code-string)' },
  { tag: tags.special(tags.string), color: 'var(--te-code-string)' },
  { tag: tags.propertyName, color: 'var(--te-code-property)' },
  { tag: tags.variableName, color: 'var(--te-fg)' },
  { tag: tags.typeName, color: 'var(--te-code-type)' },
  { tag: tags.heading, color: 'var(--te-code-property)', fontWeight: '600' },
  { tag: tags.meta, color: 'var(--te-code-meta)' },
  { tag: tags.url, color: 'var(--te-link)' },
  { tag: tags.link, color: 'var(--te-link)' },
  { tag: tags.operator, color: 'var(--te-code-keyword)' },
  { tag: tags.punctuation, color: 'var(--te-muted)' },
  { tag: tags.bracket, color: 'var(--te-muted)' },
  { tag: tags.invalid, color: 'var(--te-danger)' },
]);

export const highlightTheme = syntaxHighlighting(textHighlightStyle);
