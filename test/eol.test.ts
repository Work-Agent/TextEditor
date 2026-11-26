import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import {
  eolField,
  eolStateFromText,
  remapEols,
  textFromState,
} from '../src/editor/eol-field';
import { splitLinesWithEols, summarizeEols } from '../src/text/eol';

describe('summarizeEols', () => {
  it('reports the dominant and mixed line endings', () => {
    const mixed = summarizeEols('a\r\nb\nc\r');
    expect(mixed.eol).toBe('mixed');
    expect(mixed.defaultEol).toBe('\r\n');
    expect(mixed.finalNewline).toBe(true);
    expect(mixed.lineCount).toBe(4);

    const none = summarizeEols('one line');
    expect(none.eol).toBe('none');
    expect(none.finalNewline).toBe(false);
    expect(none.lineCount).toBe(1);
  });

  it('splits lines without losing the original terminators', () => {
    expect(splitLinesWithEols('a\r\nb\nc\r')).toEqual({
      lines: ['a', 'b', 'c', ''],
      eols: ['\r\n', '\n', '\r', ''],
    });
  });
});

describe('eolField', () => {
  const mixed = 'a\r\nb\nc';

  function stateOf(text: string) {
    return EditorState.create({
      doc: text.replace(/\r\n?/g, '\n'),
      extensions: [eolField.init(() => eolStateFromText(text))],
    });
  }

  it('reconstructs the original text from the editor state', () => {
    const state = stateOf(mixed);
    expect(textFromState(state)).toBe(mixed);
  });

  it('keeps each line ending when text is inserted', () => {
    const state = stateOf(mixed).update({
      changes: { from: 0, insert: 'X' },
    }).state;
    expect(textFromState(state)).toBe('Xa\r\nb\nc');
  });

  it('gives inserted line breaks the dominant ending', () => {
    const state = stateOf(mixed).update({
      changes: { from: 1, insert: '\n' },
    }).state;
    expect(textFromState(state)).toBe('a\r\n\r\nb\nc');
  });

  it('drops the ending when its line break is deleted', () => {
    const state = stateOf(mixed).update({
      changes: { from: 1, to: 2 },
    }).state;
    expect(textFromState(state)).toBe('ab\nc');
  });

  it('drops the final newline when it is deleted', () => {
    const state = stateOf('a\r\n').update({
      changes: { from: 1, to: 2 },
    }).state;
    expect(textFromState(state)).toBe('a');
  });

  it('remaps directly through ChangeSet', () => {
    const old = EditorState.create({
      doc: 'a\nb\nc',
      extensions: [eolField.init(() => eolStateFromText('a\r\nb\nc'))],
    });
    const update = old.update({ changes: { from: 1, to: 2 } });
    const remapped = remapEols(
      eolStateFromText('a\r\nb\nc'),
      update.startState.doc,
      update.state.doc,
      update.changes,
    );
    expect(remapped.eols).toEqual(['\n', '']);
  });
});

describe('eolField collision handling', () => {
  it('does not inherit a deleted line ending onto the surviving break', () => {
    const text = 'a\r\n\nb';
    const initial = EditorState.create({
      doc: 'a\n\nb',
      extensions: [eolField.init(() => eolStateFromText(text))],
    });
    const next = initial.update({ changes: { from: 1, to: 2 } }).state;
    expect(textFromState(next)).toBe('a\nb');
  });
});
