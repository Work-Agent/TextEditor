export interface EditorSettings {
  /** 自动换行。 */
  lineWrap: boolean;
  /** 正文字号 px。 */
  fontSize: number;
  /** Tab 宽度。 */
  tabSize: number;
  /** 浏览器 / 系统拼写检查。 */
  spellcheck: boolean;
  /** 左侧行号。 */
  lineNumbers: boolean;
  /** 高亮当前行。 */
  highlightActiveLine: boolean;
  /** 显示不可见字符（空格 / Tab / 换行）。 */
  highlightWhitespace: boolean;
}

export const DEFAULT_SETTINGS: EditorSettings = {
  lineWrap: true,
  fontSize: 14,
  tabSize: 2,
  spellcheck: false,
  lineNumbers: true,
  highlightActiveLine: true,
  highlightWhitespace: false,
};

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.round(value)));
}

export function normalizeSettings(value: unknown): EditorSettings {
  const source =
    typeof value === 'object' && value !== null
      ? (value as Record<string, unknown>)
      : {};
  return {
    lineWrap: bool(source['lineWrap'], DEFAULT_SETTINGS.lineWrap),
    fontSize: clampNumber(
      source['fontSize'],
      11,
      24,
      DEFAULT_SETTINGS.fontSize,
    ),
    tabSize: clampNumber(source['tabSize'], 1, 8, DEFAULT_SETTINGS.tabSize),
    spellcheck: bool(source['spellcheck'], DEFAULT_SETTINGS.spellcheck),
    lineNumbers: bool(source['lineNumbers'], DEFAULT_SETTINGS.lineNumbers),
    highlightActiveLine: bool(
      source['highlightActiveLine'],
      DEFAULT_SETTINGS.highlightActiveLine,
    ),
    highlightWhitespace: bool(
      source['highlightWhitespace'],
      DEFAULT_SETTINGS.highlightWhitespace,
    ),
  };
}
