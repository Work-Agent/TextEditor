import { describe, expect, it } from 'vitest';
import iconv from 'iconv-lite';
import { decodeSource, encodeSource } from '../src/text/encoding';

function bytes(...parts: Array<number[] | Uint8Array | string>): Uint8Array {
  const chunks = parts.map((part) =>
    typeof part === 'string'
      ? new TextEncoder().encode(part)
      : part instanceof Uint8Array
        ? part
        : new Uint8Array(part),
  );
  const size = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const out = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

function iconvBytes(text: string, encoding: string, bom = false): Uint8Array {
  return new Uint8Array(iconv.encode(text, encoding, { addBOM: bom }));
}

describe('decodeSource / encodeSource', () => {
  it('keeps UTF-8 text and line endings byte-identical', () => {
    const original = bytes('第一行\r\nsecond\nthird\r\n');
    const source = decodeSource(original);
    expect(source.encoding).toBe('utf-8');
    expect(source.text).toBe('第一行\r\nsecond\nthird\r\n');
    expect(source.eol).toBe('mixed');
    expect(source.finalNewline).toBe(true);
    expect(source.readOnly).toBe(false);
    expect(encodeSource(source.text, source)).toEqual(original);
  });

  it('preserves a UTF-8 BOM', () => {
    const original = bytes([0xef, 0xbb, 0xbf], 'héllo\r\n');
    const source = decodeSource(original);
    expect(source.encoding).toBe('utf-8');
    expect(source.bom).toBe('utf-8');
    expect(source.text).toBe('héllo\r\n');
    expect(encodeSource(source.text, source)).toEqual(original);
  });

  it('preserves UTF-16 LE BOM and CRLF', () => {
    const original = iconvBytes('你好\r\nworld\r\n', 'utf-16le', true);
    const source = decodeSource(original);
    expect(source.encoding).toBe('utf-16le');
    expect(source.bom).toBe('utf-16le');
    expect(source.text).toBe('你好\r\nworld\r\n');
    expect(source.eol).toBe('crlf');
    expect(encodeSource(source.text, source)).toEqual(original);
  });

  it('preserves UTF-16 BE BOM', () => {
    const original = iconvBytes('hello\r\n', 'utf-16be', true);
    const source = decodeSource(original);
    expect(source.encoding).toBe('utf-16be');
    expect(source.bom).toBe('utf-16be');
    expect(source.text).toBe('hello\r\n');
    expect(encodeSource(source.text, source)).toEqual(original);
  });

  it('preserves UTF-32 LE BOM', () => {
    const original = iconvBytes('hello\r\n', 'utf-32le', true);
    const source = decodeSource(original);
    expect(source.encoding).toBe('utf-32le');
    expect(source.bom).toBe('utf-32le');
    expect(source.text).toBe('hello\r\n');
    expect(encodeSource(source.text, source)).toEqual(original);
  });

  it('detects UTF-16 LE without a BOM', () => {
    const original = iconvBytes('hello\r\n世界\r\n', 'utf-16le');
    const source = decodeSource(original);
    expect(source.encoding).toBe('utf-16le');
    expect(source.bom).toBe(null);
    expect(source.text).toBe('hello\r\n世界\r\n');
    expect(source.binary).toBe(false);
    expect(source.readOnly).toBe(false);
    expect(encodeSource(source.text, source)).toEqual(original);
  });

  it('detects UTF-32 LE without a BOM', () => {
    const original = iconvBytes('hello\r\n', 'utf-32le');
    const source = decodeSource(original);
    expect(source.encoding).toBe('utf-32le');
    expect(source.bom).toBe(null);
    expect(source.text).toBe('hello\r\n');
    expect(source.readOnly).toBe(false);
    expect(encodeSource(source.text, source)).toEqual(original);
  });

  it('round-trips Chinese legacy encodings', () => {
    const original = iconvBytes('中文配置\r\nkey=值\r\n', 'gb18030');
    const source = decodeSource(original);
    expect(source.text).toBe('中文配置\r\nkey=值\r\n');
    expect(source.binary).toBe(false);
    expect(source.readOnly).toBe(false);
    expect(encodeSource(source.text, source)).toEqual(original);
  });

  it('does not add a final newline or normalize mixed line endings', () => {
    const original = bytes('a\r\nb\nc\rd');
    const source = decodeSource(original);
    expect(source.eol).toBe('mixed');
    expect(source.finalNewline).toBe(false);
    expect(encodeSource(source.text, source)).toEqual(original);
  });

  it('opens binary content read-only', () => {
    const original = new Uint8Array([0, 1, 2, 3, 0x80, 0xff, 0x00, 0x1f]);
    const source = decodeSource(original);
    expect(source.binary).toBe(true);
    expect(source.readOnly).toBe(true);
    expect(source.warnings.length).toBeGreaterThan(0);
  });

  it('handles an empty file as UTF-8', () => {
    const source = decodeSource(new Uint8Array());
    expect(source.encoding).toBe('utf-8');
    expect(source.text).toBe('');
    expect(source.eol).toBe('none');
    expect(source.binary).toBe(false);
    expect(source.readOnly).toBe(false);
  });

  it('refuses characters the original encoding cannot represent', () => {
    const original = iconvBytes('café\r\n', 'windows-1252');
    const source = decodeSource(original);
    expect(source.readOnly).toBe(false);
    expect(() => encodeSource('中文\r\n', source)).toThrow(/无法表示/);
  });
});
