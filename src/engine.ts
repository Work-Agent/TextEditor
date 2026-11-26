/**
 * 纯文本插件引擎：资源读取 + 字节保真保存。
 *
 * 页面通过 workspace 快照拿到“文本 + 编码/BOM/换行元数据”，保存时只回传
 * 文本内容与期望的 sha256；引擎重新读取原文件、按原编码写回，未修改的
 * 文件直接复用原始字节。
 */

import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { definePlugin } from '@work-studio/sdk';
import type { TextMeta } from './shared/text-meta';
import {
  decodeSource,
  digestOfBytes,
  encodeSource,
  sameBytes,
  type DecodedSource,
} from './text/encoding';
import { normalizeEol } from './text/eol';

const MAX_GREP_ITEMS = 100;
const MAX_READ_LINES = 2000;

function pathOf(ref: string): string {
  try {
    return fileURLToPath(ref);
  } catch {
    throw new Error(`不是 file:// 地址：${ref}`);
  }
}

function titleOf(ref: string): string {
  try {
    return decodeURIComponent(basename(pathOf(ref)));
  } catch {
    return ref;
  }
}

function metaOf(source: DecodedSource): TextMeta {
  return {
    encoding: source.encoding,
    encodingLabel: source.encodingLabel,
    encodingConfidence: source.encodingConfidence,
    bom: source.bom,
    eol: source.eol,
    defaultEol: source.defaultEol,
    finalNewline: source.finalNewline,
    lineCount: source.lineCount,
    size: source.size,
    digest: source.digest,
    binary: source.binary,
    readOnly: source.readOnly,
    warnings: source.warnings,
  };
}

async function readSource(ref: string): Promise<DecodedSource> {
  return decodeSource(await readFile(pathOf(ref)));
}

export const workstudio = definePlugin({
  resources: {
    text: {
      async read(ref, options) {
        const source = await readSource(ref);
        const meta = metaOf(source);
        const title = titleOf(ref);

        if (!options?.offset && !options?.limit) {
          return [
            {
              locator: ref,
              title,
              text: source.text,
              ...meta,
            },
          ];
        }

        const text = normalizeEol(source.text);
        const lines = text.split('\n');
        const offset = Math.max(0, (options?.offset ?? 1) - 1);
        const limit = Math.max(
          1,
          Math.min(options?.limit ?? 200, MAX_READ_LINES),
        );
        const content = lines.slice(offset, offset + limit).join('\n');
        const truncated = offset + limit < lines.length || offset > 0;
        return [
          {
            locator: `${ref}#L${offset + 1}`,
            title,
            text: content,
            ...meta,
            ...(truncated
              ? { truncated: true, totalLines: lines.length }
              : {}),
          },
        ];
      },

      async grep(ref, query) {
        const source = await readSource(ref);
        const needle = query.toLowerCase();
        if (!needle) return [];
        const lines = normalizeEol(source.text).split('\n');
        const items: Array<{
          locator: string;
          snippet: string;
          line: number;
          encoding: string;
        }> = [];
        for (let index = 0; index < lines.length; index += 1) {
          const line = lines[index] ?? '';
          if (!line.toLowerCase().includes(needle)) continue;
          items.push({
            locator: `${ref}#L${index + 1}`,
            snippet: line.slice(0, 240),
            line: index + 1,
            encoding: source.encodingLabel,
          });
          if (items.length >= MAX_GREP_ITEMS) break;
        }
        return items;
      },
    },
  },

  commands: {
    'text-editor.save': {
      summary: '按原编码、BOM 与换行保存纯文本',
      args: {
        ref: { type: 'string', required: true },
        content: { type: 'string', required: true },
        expectedDigest: { type: 'string' },
        force: { type: 'boolean' },
      },
      async run(input, ctx) {
        const ref = String(input.ref);
        const content = String(input.content);
        const current = await ctx.fs.read(ref);
        const currentDigest = digestOfBytes(current);
        const expected =
          typeof input.expectedDigest === 'string' ? input.expectedDigest : '';
        const force = input.force === true;

        if (!force && expected && expected !== currentDigest) {
          throw new Error(
            '文件已在外部更新；请重新加载，或选择“保留我的修改”后再保存。',
          );
        }

        const source = decodeSource(current);
        if (source.readOnly && content !== source.text) {
          throw new Error(
            source.binary
              ? '该文件被识别为二进制内容，已切换为只读。'
              : '该文件无法完整往返解释，已切换为只读。',
          );
        }

        let next = current;
        let wrote = false;
        if (content === source.text) {
          next = current;
        } else {
          next = encodeSource(content, source);
          if (!sameBytes(next, current)) {
            await ctx.fs.write(ref, next);
            wrote = true;
          }
        }

        const after = decodeSource(next);
        if (wrote) ctx.changed(ref, 'content');
        return {
          saved: true,
          ref,
          exact: content === source.text,
          wrote,
          meta: metaOf(after),
        };
      },
    },
  },
});
