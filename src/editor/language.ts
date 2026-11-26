/**
 * 按扩展名选择语言。
 *
 * 纯文本插件不只服务 .txt：INI / cfg / conf / env / properties 是配置语法，
 * YAML / TOML / JSON 是结构化配置文本，日志用轻量的行首级别高亮。
 */

import { json } from '@codemirror/lang-json';
import { yaml } from '@codemirror/lang-yaml';
import { StreamLanguage, type StreamParser } from '@codemirror/language';
import { properties } from '@codemirror/legacy-modes/mode/properties';
import { toml } from '@codemirror/legacy-modes/mode/toml';
import type { Extension } from '@codemirror/state';

export type LanguageId =
  | 'text'
  | 'log'
  | 'properties'
  | 'yaml'
  | 'toml'
  | 'json';

export interface LanguageInfo {
  id: LanguageId;
  label: string;
  extension: string;
}

const LOG_LEVEL = /\b(?:ERROR|FATAL|SEVERE|CRITICAL|WARN(?:ING)?|INFO|NOTICE|DEBUG|TRACE|VERBOSE)\b/i;

const logParser: StreamParser<unknown> = {
  name: 'log',
  token(stream) {
    if (stream.sol()) {
      if (
        stream.match(
          /^\s*(?:\[[^\]]+\]\s*)?\d{4}-\d{2}-\d{2}[T ][0-9:.,+\-Z]+/,
        )
      ) {
        return 'meta';
      }
      if (
        stream.match(
          /^\s*(?:\[[^\]]+\]\s*)?(?:ERROR|FATAL|SEVERE|CRITICAL)\b/i,
        )
      ) {
        return 'invalid';
      }
      if (stream.match(/^\s*(?:\[[^\]]+\]\s*)?WARN(?:ING)?\b/i)) {
        return 'atom';
      }
      if (stream.match(/^\s*(?:\[[^\]]+\]\s*)?(?:INFO|NOTICE)\b/i)) {
        return 'keyword';
      }
      if (
        stream.match(/^\s*(?:\[[^\]]+\]\s*)?(?:DEBUG|TRACE|VERBOSE)\b/i)
      ) {
        return 'comment';
      }
    }

    if (stream.match(LOG_LEVEL)) {
      const value = stream.current().toUpperCase();
      if (/ERROR|FATAL|SEVERE|CRITICAL/.test(value)) return 'invalid';
      if (value.startsWith('WARN')) return 'atom';
      if (/INFO|NOTICE/.test(value)) return 'keyword';
      return 'comment';
    }
    if (stream.match(/https?:\/\/[^\s)\]}>"']+/)) return 'url';
    if (stream.match(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/)) return 'string';
    if (
      stream.match(
        /\b\d+(?:\.\d+)?(?:ms|us|µs|ns|s|m|h|B|KB|MB|GB|TB)?\b/,
      )
    ) {
      return 'number';
    }
    stream.next();
    return null;
  },
  languageData: {
    commentTokens: { line: '#' },
  },
};

const logLanguage = StreamLanguage.define(logParser);

function extensionOf(ref: string): string {
  let path = ref.split(/[?#]/, 1)[0] ?? ref;
  try {
    path = decodeURIComponent(new URL(path).pathname);
  } catch {
    // 保持原字符串。
  }
  const base = path.slice(path.lastIndexOf('/') + 1);
  const dot = base.lastIndexOf('.');
  return dot < 0 ? '' : base.slice(dot + 1).toLowerCase();
}

export function languageForRef(ref: string): LanguageInfo {
  const extension = extensionOf(ref);
  switch (extension) {
    case 'log':
      return { id: 'log', label: '日志', extension };
    case 'yaml':
    case 'yml':
      return { id: 'yaml', label: 'YAML', extension };
    case 'toml':
      return { id: 'toml', label: 'TOML', extension };
    case 'json':
      return { id: 'json', label: 'JSON', extension };
    case 'ini':
    case 'cfg':
    case 'conf':
    case 'properties':
    case 'env':
      return { id: 'properties', label: 'INI / 配置', extension };
    default:
      return { id: 'text', label: '纯文本', extension };
  }
}

export function languageExtension(id: LanguageId): Extension {
  switch (id) {
    case 'log':
      return logLanguage;
    case 'yaml':
      return yaml();
    case 'toml':
      return StreamLanguage.define(toml);
    case 'json':
      return json();
    case 'properties':
      return StreamLanguage.define(properties);
    default:
      return [];
  }
}
