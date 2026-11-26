/**
 * 编码检测、解码与按原编码写回。
 *
 * 目标不是“把文件读成字符串”，而是“读进来再写回去时，没改过的字节不变”：
 *   - BOM 单独剥离 / 写回；
 *   - 先严格校验 UTF-8，再让 jschardet 给出候选，候选必须能字节级 round-trip；
 *   - 非 UTF-8 用 iconv-lite 编码；新增字符无法表示时直接失败，不写 '?'；
 *   - 含 NUL / 高比例控制字符的内容标记为二进制并只读。
 */

import { createHash } from 'node:crypto';
import { detectAll, type DetectionResult } from 'jschardet';
import iconv from 'iconv-lite';
import type {
  BomKind,
  EncodingConfidence,
  TextMeta,
} from '../shared/text-meta';
import { summarizeEols } from './eol';

const SAMPLE_BYTES = 64 * 1024;
const MAX_CANDIDATES = 8;

interface BomDefinition {
  kind: BomKind;
  encoding: string;
  bytes: readonly number[];
}

const BOM_DEFINITIONS: readonly BomDefinition[] = [
  { kind: 'utf-32le', encoding: 'utf-32le', bytes: [0xff, 0xfe, 0x00, 0x00] },
  { kind: 'utf-32be', encoding: 'utf-32be', bytes: [0x00, 0x00, 0xfe, 0xff] },
  { kind: 'utf-8', encoding: 'utf-8', bytes: [0xef, 0xbb, 0xbf] },
  { kind: 'utf-16le', encoding: 'utf-16le', bytes: [0xff, 0xfe] },
  { kind: 'utf-16be', encoding: 'utf-16be', bytes: [0xfe, 0xff] },
];

const BOM_BYTES: Record<BomKind, readonly number[]> = Object.fromEntries(
  BOM_DEFINITIONS.map((item) => [item.kind, item.bytes]),
) as Record<BomKind, readonly number[]>;

/** jschardet 的编码名 → iconv-lite 编码名。 */
const CHARSET_ALIASES: Record<string, string> = {
  ascii: 'utf-8',
  'utf-8': 'utf-8',
  'utf-16le': 'utf-16le',
  'utf-16be': 'utf-16be',
  'utf-16-le': 'utf-16le',
  'utf-16-be': 'utf-16be',
  'utf-32le': 'utf-32le',
  'utf-32be': 'utf-32be',
  'utf-32-le': 'utf-32le',
  'utf-32-be': 'utf-32be',
  gb18030: 'gb18030',
  gb2312: 'gb2312',
  gbk: 'gbk',
  big5: 'big5',
  'euc-jp': 'euc-jp',
  'euc-kr': 'euc-kr',
  cp932: 'cp932',
  shift_jis: 'shift_jis',
  cp949: 'cp949',
  'iso-8859-1': 'latin1',
  'windows-1252': 'windows-1252',
  'koi8-r': 'koi8-r',
};

function normalizeCharset(name: string): string | null {
  const key = name.trim().toLowerCase();
  const mapped = CHARSET_ALIASES[key] ?? key;
  if (mapped === 'utf-8' || validEncoding(mapped)) return mapped;
  return null;
}

const ENCODING_LABELS: Record<string, string> = {
  'utf-8': 'UTF-8',
  'utf-16le': 'UTF-16 LE',
  'utf-16be': 'UTF-16 BE',
  'utf-32le': 'UTF-32 LE',
  'utf-32be': 'UTF-32 BE',
  gb18030: 'GB18030',
  gb2312: 'GB2312',
  gbk: 'GBK',
  big5: 'Big5',
  'euc-jp': 'EUC-JP',
  'euc-kr': 'EUC-KR',
  shift_jis: 'Shift_JIS',
  'iso-2022-jp': 'ISO-2022-JP',
  'iso-2022-kr': 'ISO-2022-KR',
  'iso-2022-cn': 'ISO-2022-CN',
  latin1: 'ISO-8859-1',
  'iso-8859-2': 'ISO-8859-2',
  'iso-8859-5': 'ISO-8859-5',
  'iso-8859-6': 'ISO-8859-6',
  'iso-8859-7': 'ISO-8859-7',
  'iso-8859-8': 'ISO-8859-8',
  'iso-8859-9': 'ISO-8859-9',
  'windows-1250': 'Windows-1250',
  'windows-1251': 'Windows-1251',
  'windows-1252': 'Windows-1252',
  'windows-1253': 'Windows-1253',
  'windows-1254': 'Windows-1254',
  'windows-1255': 'Windows-1255',
  'windows-1256': 'Windows-1256',
  'windows-1257': 'Windows-1257',
  'windows-1258': 'Windows-1258',
  'windows-874': 'Windows-874',
  'koi8-r': 'KOI8-R',
};

export interface DecodedSource extends TextMeta {
  /** 去掉 BOM 后的原文，换行符保持原样。 */
  text: string;
  bytes: Uint8Array;
}

function digestOf(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  for (let index = 0; index < a.byteLength; index += 1) {
    if (a[index] !== b[index]) return false;
  }
  return true;
}

function encodeBody(text: string, encoding: string): Uint8Array {
  const encoded = iconv.encode(text, encoding, { addBOM: false });
  return new Uint8Array(encoded);
}

function decodeBody(bytes: Uint8Array, encoding: string): string {
  return iconv.decode(bytes, encoding, { stripBOM: false });
}

function validEncoding(encoding: string): boolean {
  return iconv.encodingExists(encoding);
}

function labelOf(encoding: string): string {
  return ENCODING_LABELS[encoding] ?? encoding.toUpperCase();
}

function detectBom(bytes: Uint8Array): BomDefinition | null {
  for (const definition of BOM_DEFINITIONS) {
    if (bytes.byteLength < definition.bytes.length) continue;
    if (definition.bytes.every((byte, index) => bytes[index] === byte)) {
      return definition;
    }
  }
  return null;
}

function utf8Strict(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

function looksBinary(text: string): boolean {
  let controls = 0;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (code === 0) return true;
    if (code < 0x20) {
      if (
        char !== '\t' &&
        char !== '\n' &&
        char !== '\r' &&
        char !== '\f' &&
        char !== '\b' &&
        char !== '\u001b'
      ) {
        controls += 1;
      }
    }
  }
  return text.length > 0 && controls / text.length > 0.02;
}

function pushWarning(warnings: string[], message: string): void {
  if (!warnings.includes(message)) warnings.push(message);
}

interface FinalizeInput {
  bytes: Uint8Array;
  text: string;
  encoding: string;
  confidence: EncodingConfidence;
  bom: BomKind | null;
  binary: boolean;
  lossy: boolean;
  warnings: string[];
}

function finalize(input: FinalizeInput): DecodedSource {
  const summary = summarizeEols(input.text);
  const binary = input.binary || looksBinary(input.text);
  const readOnly = binary || input.lossy;
  const warnings = [...input.warnings];
  if (binary) pushWarning(warnings, '检测到二进制内容，已切换为只读，避免按文本写回损坏文件。');
  if (input.lossy) pushWarning(warnings, '该编码无法完整往返解释原始字节，已切换为只读。');
  if (input.confidence === 'low' && !binary) {
    pushWarning(
      warnings,
      `编码按 ${labelOf(input.encoding)} 打开，未能完全确认；保存时会沿用该编码。`,
    );
  }

  return {
    bytes: input.bytes,
    text: input.text,
    encoding: input.encoding,
    encodingLabel: labelOf(input.encoding),
    encodingConfidence: input.confidence,
    bom: input.bom,
    eol: summary.eol,
    defaultEol: summary.defaultEol,
    finalNewline: summary.finalNewline,
    lineCount: summary.lineCount,
    size: input.bytes.byteLength,
    digest: digestOf(input.bytes),
    binary,
    readOnly,
    warnings,
  };
}

function decodeWithBom(
  bytes: Uint8Array,
  bom: BomDefinition,
): DecodedSource {
  const body = bytes.subarray(bom.bytes.length);
  const text = decodeBody(body, bom.encoding);
  const lossy = !equalBytes(encodeBody(text, bom.encoding), body);
  return finalize({
    bytes,
    text,
    encoding: bom.encoding,
    confidence: 'high',
    bom: bom.kind,
    binary: false,
    lossy,
    warnings: [],
  });
}

function candidatesFor(
  detected: DetectionResult[],
): Array<{ encoding: string; confidence: EncodingConfidence }> {
  const found: Array<{ encoding: string; confidence: EncodingConfidence }> = [];
  const seen = new Set<string>();
  for (const match of detected.slice(0, MAX_CANDIDATES)) {
    if (!match.encoding) continue;
    const mapped = normalizeCharset(match.encoding);
    if (!mapped || seen.has(mapped)) continue;
    seen.add(mapped);
    found.push({
      encoding: mapped,
      confidence: match.confidence >= 0.2 ? 'high' : 'low',
    });
  }
  for (const fallback of ['utf-16le', 'utf-16be', 'windows-1252', 'latin1']) {
    if (seen.has(fallback) || !validEncoding(fallback)) continue;
    found.push({ encoding: fallback, confidence: 'low' });
  }
  return found;
}

function binarySource(bytes: Uint8Array, warning?: string): DecodedSource {
  return finalize({
    bytes,
    text: decodeBody(bytes, 'latin1'),
    encoding: 'latin1',
    confidence: 'low',
    bom: null,
    binary: true,
    lossy: false,
    warnings: [warning ?? '无法识别文本编码，按 ISO-8859-1 只读打开。'],
  });
}

/**
 * 读取字节并推断编码。若无法给出可往返的编码，则按 ISO-8859-1 只读打开。
 */
export function decodeSource(bytes: Uint8Array): DecodedSource {
  if (bytes.byteLength === 0) {
    return finalize({
      bytes,
      text: '',
      encoding: 'utf-8',
      confidence: 'high',
      bom: null,
      binary: false,
      lossy: false,
      warnings: [],
    });
  }

  const bom = detectBom(bytes);
  if (bom) return decodeWithBom(bytes, bom);

  // NUL 字节意味着二进制或 UTF-16/32；不要先按 UTF-8 接受它。
  if (bytes.byteLength > 0 && !bytes.includes(0)) {
    const text = utf8Strict(bytes);
    if (text !== null) {
      return finalize({
        bytes,
        text,
        encoding: 'utf-8',
        confidence: 'high',
        bom: null,
        binary: false,
        lossy: false,
        warnings: [],
      });
    }
  }

  const sample = bytes.subarray(0, Math.min(bytes.byteLength, SAMPLE_BYTES));
  const detected = detectAll(sample, { minimumThreshold: 0 });
  const top = detected[0];
  if (top && (!top.encoding || top.mimeType === 'application/octet-stream')) {
    return binarySource(bytes);
  }

  for (const candidate of candidatesFor(detected)) {
    const text = (() => {
      try {
        return decodeBody(bytes, candidate.encoding);
      } catch {
        return null;
      }
    })();
    if (text === null) continue;
    const roundTrip = (() => {
      try {
        return equalBytes(encodeBody(text, candidate.encoding), bytes);
      } catch {
        return false;
      }
    })();
    if (!roundTrip) continue;
    return finalize({
      bytes,
      text,
      encoding: candidate.encoding,
      confidence: candidate.confidence,
      bom: null,
      binary: false,
      lossy: false,
      warnings: [],
    });
  }

  // 最后兜底：latin1 对 0x00-0xFF 一一映射，至少保证字节可往返；页面只读。
  return binarySource(bytes);
}

/** 按原编码写回；新增字符无法表示时抛错，绝不写 '?' 或替换字符。 */
export function encodeSource(
  content: string,
  source: Pick<DecodedSource, 'encoding' | 'bom'>,
): Uint8Array {
  const body = encodeBody(content, source.encoding);
  const check = decodeBody(body, source.encoding);
  if (check !== content) {
    throw new Error(
      `当前编码 ${labelOf(source.encoding)} 无法表示新增字符；为避免损坏文件，请改回可由该编码表示的文本。`,
    );
  }
  if (!source.bom) return body;
  const bom = BOM_BYTES[source.bom];
  const output = new Uint8Array(bom.length + body.byteLength);
  output.set(bom, 0);
  output.set(body, bom.length);
  return output;
}

export function digestOfBytes(bytes: Uint8Array): string {
  return digestOf(bytes);
}

export function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  return equalBytes(a, b);
}
