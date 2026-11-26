/**
 * 文本插件与资源快照共享的元数据。
 *
 * 页面只依赖这些纯数据字段；编码检测与字节还原留在引擎侧。
 */

export type Eol = '\n' | '\r\n' | '\r';

export type EolStyle = 'lf' | 'crlf' | 'cr' | 'mixed' | 'none';

export type BomKind =
  | 'utf-8'
  | 'utf-16le'
  | 'utf-16be'
  | 'utf-32le'
  | 'utf-32be';

export type EncodingConfidence = 'high' | 'low';

export interface TextMeta {
  /** iconv-lite 规范编码名，例如 utf-8 / gb18030 / windows-1252。 */
  encoding: string;
  /** 展示名，例如 UTF-8 / GB18030 / Shift_JIS。 */
  encodingLabel: string;
  encodingConfidence: EncodingConfidence;
  /** 文件开头的 BOM；没有时为 null。 */
  bom: BomKind | null;
  /** 主换行风格；混用时为 mixed。 */
  eol: EolStyle;
  /** 新增行使用的换行符。 */
  defaultEol: Eol;
  /** 原文件是否以换行符结尾。 */
  finalNewline: boolean;
  lineCount: number;
  size: number;
  /** 原始字节的 sha256，用于保存前的冲突检测。 */
  digest: string;
  /** 检测到二进制内容：只读，避免按文本写回损坏文件。 */
  binary: boolean;
  readOnly: boolean;
  warnings: string[];
}

export interface TextSnapshot extends TextMeta {
  locator: string;
  title?: string;
  text: string;
  truncated?: boolean;
  totalLines?: number;
}

export const EOL_LABELS: Record<EolStyle, string> = {
  lf: 'LF',
  crlf: 'CRLF',
  cr: 'CR',
  mixed: '混合换行',
  none: '无换行',
};

export function eolStyleOf(eol: Eol): Exclude<EolStyle, 'mixed' | 'none'> {
  return eol === '\r\n' ? 'crlf' : eol === '\r' ? 'cr' : 'lf';
}
