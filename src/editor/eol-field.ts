/**
 * CodeMirror 的“每行原始行尾”状态。
 *
 * 文档内部统一是 \n；这个 StateField 按行保存原始行尾，事务发生时把旧行尾
 * 映射到新文档的行边界上。保存时用 textFromState 拼回 CRLF / CR / LF。
 */

import {
  StateEffect,
  StateField,
  type ChangeDesc,
  type EditorState,
  type Text,
} from '@codemirror/state';
import type { Eol } from '../shared/text-meta';
import {
  splitLinesWithEols,
  summarizeEols,
  textFromLines,
} from '../text/eol';

export interface EolState {
  /** 与文档行等长；最后一项恒为 ''。 */
  eols: string[];
  defaultEol: Eol;
}

export const setEolState = StateEffect.define<EolState>();

export function eolStateFromText(text: string, fallback: Eol = '\n'): EolState {
  const summary = summarizeEols(text);
  const { eols } = splitLinesWithEols(text);
  return {
    eols,
    defaultEol: summary.eol === 'none' ? fallback : summary.defaultEol,
  };
}

export function remapEols(
  value: EolState,
  oldDoc: Text,
  newDoc: Text,
  changes: ChangeDesc,
): EolState {
  const eols: string[] = new Array<string>(newDoc.lines).fill(value.defaultEol);
  eols[newDoc.lines - 1] = '';

  // 被删除的换行不应把行尾“继承”给相邻的幸存换行。
  const deleted: Array<[number, number]> = [];
  changes.iterChangedRanges((fromA, toA) => {
    if (toA > fromA) deleted.push([fromA, toA]);
  });
  let deletedIndex = 0;

  for (let index = 0; index < oldDoc.lines - 1; index += 1) {
    // 旧文档第 index 行的换行符在扁平字符串中的位置。
    const breakPos = oldDoc.line(index + 1).to;
    while (
      deletedIndex < deleted.length &&
      deleted[deletedIndex]![1] <= breakPos
    ) {
      deletedIndex += 1;
    }
    const range = deleted[deletedIndex];
    if (range && breakPos >= range[0] && breakPos < range[1]) continue;

    const mapped = changes.mapPos(breakPos, 1);
    if (mapped < 0 || mapped >= newDoc.length) continue;
    const line = newDoc.lineAt(mapped);
    if (line.number >= newDoc.lines || line.to !== mapped) continue;
    eols[line.number - 1] = value.eols[index] ?? value.defaultEol;
  }

  return { eols, defaultEol: value.defaultEol };
}

export const eolField = StateField.define<EolState>({
  create(state) {
    return eolStateFromText(state.doc.toString());
  },
  update(value, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setEolState)) return effect.value;
    }
    if (!transaction.docChanged) return value;
    return remapEols(
      value,
      transaction.startState.doc,
      transaction.newDoc,
      transaction.changes,
    );
  },
});

export function eolState(state: EditorState): EolState {
  return state.field(eolField);
}

/** 把编辑器文档按原始行尾拼回字符串。 */
export function textFromState(state: EditorState): string {
  const doc = state.doc;
  const { eols } = state.field(eolField);
  const lines: string[] = [];
  for (let number = 1; number <= doc.lines; number += 1) {
    lines.push(doc.line(number).text);
  }
  return textFromLines(lines, eols);
}
