/**
 * 换行符扫描与重建。
 *
 * CodeMirror 内部文档统一使用 \n；页面维护一条“每行原始行尾”的并行数组，
 * 保存时再拼回去。这样 CRLF / CR / LF 混用的文件也不会被静默规范化。
 */

import type { Eol, EolStyle } from '../shared/text-meta';
import { eolStyleOf } from '../shared/text-meta';

export function normalizeEol(text: string): string {
  return text.replace(/\r\n?/g, '\n');
}

export interface SplitText {
  /** 不含行尾的文本行。 */
  lines: string[];
  /** 与 lines 等长；最后一项恒为 ''，其余项是行尾。 */
  eols: string[];
}

export function splitLinesWithEols(text: string): SplitText {
  const lines: string[] = [];
  const eols: string[] = [];
  let start = 0;
  for (const match of text.matchAll(/\r\n|\r|\n/g)) {
    const index = match.index ?? 0;
    lines.push(text.slice(start, index));
    eols.push(match[0]);
    start = index + match[0].length;
  }
  lines.push(text.slice(start));
  eols.push('');
  return { lines, eols };
}

export function textFromLines(lines: readonly string[], eols: readonly string[]): string {
  let out = '';
  for (let index = 0; index < lines.length; index += 1) {
    out += lines[index] ?? '';
    if (index < lines.length - 1) out += eols[index] ?? '\n';
  }
  return out;
}

export interface EolSummary {
  eol: EolStyle;
  defaultEol: Eol;
  finalNewline: boolean;
  lineCount: number;
}

export function summarizeEols(text: string): EolSummary {
  const { lines, eols } = splitLinesWithEols(text);
  const breaks = eols.slice(0, -1);
  const counts = new Map<Eol, number>();
  for (const value of breaks) {
    const eol = value as Eol;
    counts.set(eol, (counts.get(eol) ?? 0) + 1);
  }

  let defaultEol: Eol = '\n';
  let best = -1;
  for (const [eol, count] of counts) {
    if (count > best) {
      best = count;
      defaultEol = eol;
    }
  }

  let eol: EolStyle;
  if (breaks.length === 0) eol = 'none';
  else if (counts.size > 1) eol = 'mixed';
  else eol = eolStyleOf(breaks[0] as Eol);

  return {
    eol,
    defaultEol,
    finalNewline: breaks.length > 0 && /[\r\n]$/.test(text),
    lineCount: lines.length,
  };
}
