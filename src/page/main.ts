import '@work-studio/sdk/global';
import './mock';
import './style.css';

import { redo, undo } from '@codemirror/commands';
import { openSearchPanel } from '@codemirror/search';
import type { EditorView } from '@codemirror/view';
import {
  createTextEditor,
  type TextEditorHandle,
  type ThemeMode,
} from '../editor';
import { languageForRef, type LanguageInfo } from '../editor/language';
import {
  DEFAULT_SETTINGS,
  normalizeSettings,
  type EditorSettings,
} from '../shared/settings';
import {
  EOL_LABELS,
  type TextMeta,
  type TextSnapshot,
} from '../shared/text-meta';
import { summarizeEols } from '../text/eol';

const bridge = window.workStudio;
const params = new URLSearchParams(location.search);
const ref = params.get('ref') ?? 'file:///demo.yaml';
const isMock = Boolean(
  (window as unknown as { __workstudioMock?: boolean }).__workstudioMock,
);
const PLUGIN_ID = isMock ? 'text-editor' : location.hostname || 'text-editor';
const language = languageForRef(ref);

const DEFAULT_META: TextMeta = {
  encoding: 'utf-8',
  encodingLabel: 'UTF-8',
  encodingConfidence: 'high',
  bom: null,
  eol: 'none',
  defaultEol: '\n',
  finalNewline: false,
  lineCount: 1,
  size: 0,
  digest: '',
  binary: false,
  readOnly: false,
  warnings: [],
};

function el<T extends HTMLElement>(selector: string): T {
  const node = document.querySelector<T>(selector);
  if (!node) throw new Error(`缺少页面元素：${selector}`);
  return node;
}

const editorHost = el<HTMLDivElement>('#editor');
const titleEl = el<HTMLDivElement>('#title');
const dirtyEl = el<HTMLSpanElement>('#dirty');
const languageEl = el<HTMLSpanElement>('#language');
const encodingEl = el<HTMLSpanElement>('#encoding');
const eolEl = el<HTMLSpanElement>('#eol');
const sizeEl = el<HTMLSpanElement>('#size');
const toolbarHost = el<HTMLDivElement>('#toolbar');
const saveButton = el<HTMLButtonElement>('#save');
const statusEl = el<HTMLSpanElement>('#status');
const positionEl = el<HTMLSpanElement>('#position');
const countEl = el<HTMLSpanElement>('#count');
const warningEl = el<HTMLDivElement>('#warning');
const readonlyBadge = el<HTMLSpanElement>('#readonly');
const warningText = el<HTMLSpanElement>('#warning-text');
const conflictEl = el<HTMLDivElement>('#conflict');
const conflictReload = el<HTMLButtonElement>('#conflict-reload');
const conflictKeep = el<HTMLButtonElement>('#conflict-keep');

interface SaveResult {
  saved: boolean;
  ref: string;
  exact: boolean;
  wrote: boolean;
  meta?: TextMeta;
}

interface TextEditorToolbar {
  update(settings: EditorSettings): void;
}

function fileName(value: string): string {
  const tail = value.split(/[/?#]/).filter(Boolean).pop() ?? '文本';
  try {
    return decodeURIComponent(tail);
  } catch {
    return tail;
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function setStatus(text: string, error = false): void {
  statusEl.textContent = text;
  statusEl.classList.toggle('is-error', error);
}

function fallbackMeta(text: string): TextMeta {
  const summary = summarizeEols(text);
  return {
    ...DEFAULT_META,
    eol: summary.eol,
    defaultEol: summary.defaultEol,
    finalNewline: summary.finalNewline,
    lineCount: summary.lineCount,
    size: new TextEncoder().encode(text).byteLength,
  };
}

function metaFromSnapshot(snapshot: TextSnapshot): TextMeta {
  const fallback = fallbackMeta(snapshot.text);
  return {
    encoding:
      typeof snapshot.encoding === 'string'
        ? snapshot.encoding
        : fallback.encoding,
    encodingLabel:
      typeof snapshot.encodingLabel === 'string'
        ? snapshot.encodingLabel
        : fallback.encodingLabel,
    encodingConfidence:
      snapshot.encodingConfidence === 'low' ? 'low' : 'high',
    bom:
      snapshot.bom === 'utf-8' ||
      snapshot.bom === 'utf-16le' ||
      snapshot.bom === 'utf-16be' ||
      snapshot.bom === 'utf-32le' ||
      snapshot.bom === 'utf-32be'
        ? snapshot.bom
        : null,
    eol:
      snapshot.eol === 'lf' ||
      snapshot.eol === 'crlf' ||
      snapshot.eol === 'cr' ||
      snapshot.eol === 'mixed' ||
      snapshot.eol === 'none'
        ? snapshot.eol
        : fallback.eol,
    defaultEol:
      snapshot.defaultEol === '\r\n' ||
      snapshot.defaultEol === '\r' ||
      snapshot.defaultEol === '\n'
        ? snapshot.defaultEol
        : fallback.defaultEol,
    finalNewline:
      typeof snapshot.finalNewline === 'boolean'
        ? snapshot.finalNewline
        : fallback.finalNewline,
    lineCount:
      typeof snapshot.lineCount === 'number'
        ? snapshot.lineCount
        : fallback.lineCount,
    size:
      typeof snapshot.size === 'number' ? snapshot.size : fallback.size,
    digest: typeof snapshot.digest === 'string' ? snapshot.digest : '',
    binary: snapshot.binary === true,
    readOnly: snapshot.readOnly === true || snapshot.binary === true,
    warnings: Array.isArray(snapshot.warnings)
      ? snapshot.warnings.filter(
          (item): item is string => typeof item === 'string',
        )
      : [],
  };
}

function extractSnapshot(value: unknown): TextSnapshot | null {
  const item = Array.isArray(value)
    ? value.find(
        (entry) =>
          typeof entry === 'object' &&
          entry !== null &&
          typeof (entry as { text?: unknown }).text === 'string',
      )
    : value;
  if (
    typeof item !== 'object' ||
    item === null ||
    typeof (item as { text?: unknown }).text !== 'string'
  ) {
    return null;
  }
  return item as TextSnapshot;
}

let editor: TextEditorHandle | undefined;
let toolbar: TextEditorToolbar | null = null;
let settings: EditorSettings = { ...DEFAULT_SETTINGS };
let meta: TextMeta = { ...DEFAULT_META };
let expectedDigest = '';
let dirty = false;
let saving = false;
let readOnly = false;
let conflict: TextSnapshot | null = null;
let forceNextSave = false;

function updateDirty(): void {
  dirtyEl.textContent = dirty ? '● 未保存' : '';
  saveButton.classList.toggle('is-primary', dirty && !readOnly);
  saveButton.disabled = saving || readOnly || !dirty;
  saveButton.title = readOnly
    ? '只读文件'
    : dirty
      ? '保存（Cmd/Ctrl+S）'
      : '没有未保存修改';
  document.title = `${dirty ? '● ' : ''}${fileName(ref)}`;
}

function updateChips(): void {
  languageEl.textContent = language.label;
  encodingEl.textContent = `${meta.encodingLabel}${meta.bom ? ' BOM' : ''}`;
  encodingEl.title =
    meta.encodingConfidence === 'low' ? '编码为自动猜测，未能完全确认' : '文件编码';
  eolEl.textContent = EOL_LABELS[meta.eol];
  eolEl.title = '原文件换行风格';
  sizeEl.textContent = formatSize(meta.size);
  sizeEl.title = `${meta.size} 字节`;
}

function updateWarning(): void {
  const messages = [...meta.warnings];
  if (readOnly && messages.length === 0) {
    messages.push('该文件以只读方式打开，保存已禁用。');
  }
  warningEl.hidden = messages.length === 0;
  readonlyBadge.hidden = !readOnly;
  warningText.textContent = messages.join(' ');
}

function applyMeta(next: TextMeta): void {
  meta = next;
  expectedDigest = next.digest;
  readOnly = next.readOnly;
  editor?.setReadOnly(readOnly);
  document.body.dataset['readonly'] = readOnly ? 'true' : 'false';
  updateChips();
  updateWarning();
  updateDirty();
}

function showConflict(): void {
  conflictEl.hidden = conflict === null;
}

function applySnapshot(
  snapshot: TextSnapshot,
  options: { force?: boolean } = {},
): void {
  if (!editor) return;
  if (options.force || (!dirty && !saving)) {
    editor.setText(snapshot.text, { addToHistory: false });
    applyMeta(metaFromSnapshot(snapshot));
    dirty = false;
    conflict = null;
    forceNextSave = false;
    showConflict();
    updateDirty();
    setStatus('已加载');
    return;
  }
  if (editor.getText() === snapshot.text) {
    applyMeta(metaFromSnapshot(snapshot));
    dirty = false;
    conflict = null;
    forceNextSave = false;
    showConflict();
    updateDirty();
    setStatus('已保存');
    return;
  }
  conflict = snapshot;
  showConflict();
  setStatus('文件已在外部更新', true);
}

async function save(): Promise<void> {
  if (!editor || !dirty || saving || readOnly) return;
  saving = true;
  updateDirty();
  setStatus('保存中…');
  try {
    const result = await bridge.command<SaveResult>(
      PLUGIN_ID,
      PLUGIN_ID,
      'save',
      {
        ref,
        content: editor.getText(),
        ...(forceNextSave ? { force: true } : { expectedDigest }),
      },
    );
    if (!result.ok) throw new Error(result.error.message);
    if (result.data.meta) applyMeta(result.data.meta);
    dirty = false;
    conflict = null;
    forceNextSave = false;
    showConflict();
    setStatus(
      result.data.exact ? '没有文本变化，文件保持原字节' : '已按原编码保存',
    );
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), true);
  } finally {
    saving = false;
    updateDirty();
  }
}

function updateFooter(view: EditorView): void {
  const head = view.state.selection.main.head;
  const line = view.state.doc.lineAt(head);
  const selected = view.state.selection.ranges.reduce(
    (sum, range) => sum + (range.to - range.from),
    0,
  );
  positionEl.textContent = `Ln ${line.number}, Col ${head - line.from + 1}${
    selected > 0 ? ` · ${selected} 选中` : ''
  }`;
  countEl.textContent = `${view.state.doc.lines} 行 · ${view.state.doc.length} 字符`;
}

function createToolbar(
  host: HTMLElement,
  actions: {
    undo(): void;
    redo(): void;
    find(): void;
    wrap(): void;
    lines(): void;
    whitespace(): void;
  },
): TextEditorToolbar {
  host.innerHTML = `
    <button type="button" data-action="undo" title="撤销（Cmd/Ctrl+Z）">↶</button>
    <button type="button" data-action="redo" title="重做（Cmd/Ctrl+Shift+Z）">↷</button>
    <button type="button" data-action="find" title="查找 / 替换（Cmd/Ctrl+F）">⌕</button>
    <span class="te-separator"></span>
    <button type="button" class="wide" data-action="wrap" title="自动换行">换行</button>
    <button type="button" class="wide" data-action="lines" title="显示行号">行号</button>
    <button type="button" class="wide" data-action="whitespace" title="显示空白字符">空白</button>
  `;
  for (const button of host.querySelectorAll<HTMLButtonElement>(
    'button[data-action]',
  )) {
    button.addEventListener('click', () => {
      switch (button.dataset['action']) {
        case 'undo':
          actions.undo();
          break;
        case 'redo':
          actions.redo();
          break;
        case 'find':
          actions.find();
          break;
        case 'wrap':
          actions.wrap();
          break;
        case 'lines':
          actions.lines();
          break;
        case 'whitespace':
          actions.whitespace();
          break;
        default:
          break;
      }
    });
  }
  const setActive = (action: string, active: boolean): void => {
    host
      .querySelector<HTMLElement>(`[data-action="${action}"]`)
      ?.classList.toggle('is-active', active);
  };
  return {
    update(next) {
      setActive('wrap', next.lineWrap);
      setActive('lines', next.lineNumbers);
      setActive('whitespace', next.highlightWhitespace);
    },
  };
}

function applySettings(next: unknown): void {
  settings = normalizeSettings(next);
  editor?.setSettings(settings);
  toolbar?.update(settings);
}

async function patchSettings(patch: Partial<EditorSettings>): Promise<void> {
  settings = { ...settings, ...patch };
  editor?.setSettings(settings);
  toolbar?.update(settings);
  try {
    const result = await bridge.command(PLUGIN_ID, 'settings', 'set', patch);
    if (!result.ok) throw new Error(result.error.message);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), true);
  }
}

const initialHostTheme = document.documentElement.dataset['theme'];
let hostTheme: ThemeMode | null =
  initialHostTheme === 'dark' || initialHostTheme === 'light'
    ? initialHostTheme
    : null;
let currentTheme: ThemeMode = 'light';

function preferredTheme(): ThemeMode {
  if (hostTheme) return hostTheme;
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

function applyTheme(): void {
  const theme = preferredTheme();
  currentTheme = theme;
  document.documentElement.dataset['theme'] = theme;
  editor?.setTheme(theme);
}

const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
mediaQuery.addEventListener('change', applyTheme);
const themeObserver = new MutationObserver(() => {
  const value = document.documentElement.dataset['theme'];
  if (value !== 'dark' && value !== 'light') return;
  if (value === currentTheme) return;
  hostTheme = value;
  currentTheme = value;
  editor?.setTheme(value);
});
themeObserver.observe(document.documentElement, {
  attributes: true,
  attributeFilter: ['data-theme'],
});

async function reloadSnapshot(): Promise<void> {
  try {
    const snapshot = extractSnapshot(await bridge.subscribe('workspace', ref));
    if (snapshot) applySnapshot(snapshot, { force: true });
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), true);
  }
}

async function boot(): Promise<void> {
  titleEl.textContent = fileName(ref);
  document.title = fileName(ref);
  applyTheme();

  let initial: unknown = null;
  try {
    initial = await bridge.subscribe('workspace', ref);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), true);
  }

  const snapshot = extractSnapshot(initial);
  const initialText = snapshot?.text ?? '';
  meta = snapshot ? metaFromSnapshot(snapshot) : fallbackMeta(initialText);
  readOnly = meta.readOnly;
  expectedDigest = meta.digest;

  editor = createTextEditor({
    parent: editorHost,
    value: initialText,
    defaultEol: meta.defaultEol,
    theme: preferredTheme(),
    settings,
    language,
    readOnly,
    onChange() {
      dirty = true;
      updateDirty();
      if (!isMock) setStatus('未保存');
    },
    onSave: () => {
      void save();
    },
    onUpdate(view) {
      updateFooter(view);
    },
  });

  toolbar = createToolbar(toolbarHost, {
    undo: () => {
      undo(editor!.view);
      editor!.focus();
    },
    redo: () => {
      redo(editor!.view);
      editor!.focus();
    },
    find: () => {
      openSearchPanel(editor!.view);
      editor!.focus();
    },
    wrap: () => {
      void patchSettings({ lineWrap: !settings.lineWrap });
    },
    lines: () => {
      void patchSettings({ lineNumbers: !settings.lineNumbers });
    },
    whitespace: () => {
      void patchSettings({
        highlightWhitespace: !settings.highlightWhitespace,
      });
    },
  });
  toolbar.update(settings);
  applyMeta(meta);
  dirty = false;
  updateDirty();
  updateFooter(editor.view);
  showConflict();

  saveButton.addEventListener('click', () => {
    void save();
  });

  conflictReload.addEventListener('click', () => {
    void reloadSnapshot();
  });

  conflictKeep.addEventListener('click', () => {
    conflict = null;
    forceNextSave = true;
    showConflict();
    setStatus('保留当前修改；下次保存会覆盖外部版本');
  });

  try {
    applySettings(await bridge.subscribe(PLUGIN_ID, 'settings'));
  } catch {
    applySettings(settings);
  }

  const offUpdate = bridge.onUpdate((update) => {
    if (update.domain === 'workspace' && update.resource === ref) {
      const next = extractSnapshot(update.data);
      if (next) applySnapshot(next);
      return;
    }
    if (update.domain === PLUGIN_ID && update.resource === 'settings') {
      applySettings(update.data);
    }
  });

  window.addEventListener('beforeunload', () => {
    offUpdate();
    themeObserver.disconnect();
    mediaQuery.removeEventListener('change', applyTheme);
    bridge.unsubscribe('workspace', ref);
    bridge.unsubscribe(PLUGIN_ID, 'settings');
    editor?.destroy();
  });

  if (isMock) {
    setStatus('浏览器预览模式：保存只写入 localStorage', false);
  } else {
    setStatus('就绪');
  }
}

void boot();
