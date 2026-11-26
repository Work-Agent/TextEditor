/**
 * 浏览器里直接打开页面时的最小 bridge。
 *
 * WorkStudio 内由 preload 注入真正的 window.workStudio；这里只在缺失时
 * 提供一份内存实现，方便 `vite` 预览与截图。
 */
import type { CallResult, WorkStudioBridge } from '@work-studio/sdk';
import type { TextMeta } from '../shared/text-meta';
import { summarizeEols } from '../text/eol';

const PLUGIN_ID = 'text-editor';

const SAMPLE = `# WorkStudio 纯文本编辑器
# 这个示例只在浏览器预览中生效；在 WorkStudio 中打开的是真实文件。

project:
  name: TextEditor
  byteFaithful: true
  encodings:
    - UTF-8
    - UTF-16 LE / BE
    - GB18030
  eol: [LF, CRLF, CR]
  logHighlight: true

formats:
  text: [.txt, .text, .log]
  config: [.ini, .cfg, .conf, .properties, .env]
  structured: [.yaml, .yml, .toml, .json]

# 保存时会保留原文件的编码、BOM 与每一行的换行符。
`;

const SETTINGS_KEY = 'workstudio.text-editor.mock.settings';
const CONTENT_KEY = 'workstudio.text-editor.mock.content';

function storedContent(): string {
  try {
    return localStorage.getItem(CONTENT_KEY) ?? SAMPLE;
  } catch {
    return SAMPLE;
  }
}

function storedSettings(): Record<string, unknown> {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') as Record<
      string,
      unknown
    >;
  } catch {
    return {};
  }
}

function metaOf(text: string): TextMeta {
  const summary = summarizeEols(text);
  return {
    encoding: 'utf-8',
    encodingLabel: 'UTF-8',
    encodingConfidence: 'high',
    bom: null,
    eol: summary.eol,
    defaultEol: summary.defaultEol,
    finalNewline: summary.finalNewline,
    lineCount: summary.lineCount,
    size: new TextEncoder().encode(text).byteLength,
    digest: `mock-${text.length}`,
    binary: false,
    readOnly: false,
    warnings: [],
  };
}

function snapshot() {
  const text = storedContent();
  return [
    {
      locator: 'file:///demo.yaml',
      title: 'demo.yaml',
      text,
      ...metaOf(text),
    },
  ];
}

const allowMock =
  location.protocol !== 'plugin:' && location.protocol !== 'work:';

if (!window.workStudio && allowMock) {
  const bridge = {
    workspaceId: 'mock',
    async fileToken() {
      return { token: 'mock', name: 'demo.yaml', size: 0 };
    },
    async subscribe(domain: string, resource: string) {
      if (domain === 'workspace' && resource === 'registry') {
        return { current: { id: 'mock', path: '/mock' } };
      }
      if (domain === 'workspace') return snapshot();
      if (domain === PLUGIN_ID && resource === 'settings') {
        return storedSettings();
      }
      return {};
    },
    unsubscribe() {
      // 内存桥没有订阅。
    },
    async command<T = unknown>(
      domain: string,
      _resource: string,
      action: string,
      input?: unknown,
    ): Promise<CallResult<T>> {
      const args = (input ?? {}) as Record<string, unknown>;
      if (domain === PLUGIN_ID && action === 'save') {
        const content = String(args['content'] ?? '');
        try {
          localStorage.setItem(CONTENT_KEY, content);
        } catch {
          // 忽略隐私模式。
        }
        return {
          ok: true,
          data: {
            saved: true,
            ref: String(args['ref'] ?? ''),
            exact: false,
            wrote: true,
            meta: metaOf(content),
          } as T,
        };
      }
      if (domain === PLUGIN_ID && action === 'set') {
        const next = { ...storedSettings(), ...args };
        try {
          localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
        } catch {
          // 忽略隐私模式。
        }
        return { ok: true, data: next as T };
      }
      return { ok: true, data: null as T };
    },
    notify() {
      // 忽略。
    },
    onUpdate() {
      return () => undefined;
    },
  } satisfies WorkStudioBridge;

  window.workStudio = bridge;
  (window as unknown as { __workstudioMock?: boolean }).__workstudioMock = true;
}
