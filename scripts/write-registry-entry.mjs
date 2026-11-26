#!/usr/bin/env node
/**
 * 把当前 release 写入 WorkStudio PluginRegistry 的 plugins/<id>.json。
 *
 * 由 release workflow 调用；也可本地预演：
 *   REGISTRY_DIR=../PluginRegistry \
 *   SOURCE_URL=https://github.com/.../releases/download/.../text-editor-0.1.0.zip \
 *   SHA256=... REPO_URL=https://github.com/... \
 *   node scripts/write-registry-entry.mjs
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const ws = pkg.workstudio;
if (!ws?.id) throw new Error('package.json 缺少 workstudio.id');
if (!pkg.version) throw new Error('package.json 缺少 version');

const registryDir = process.env.REGISTRY_DIR;
const source = process.env.SOURCE_URL;
const sha256 = process.env.SHA256;
const repo = process.env.REPO_URL;
if (!registryDir) throw new Error('缺少 REGISTRY_DIR');
if (!source || !/^https:\/\/\S+\.zip$/.test(source)) {
  throw new Error(`SOURCE_URL 必须是 https .zip 地址：${source ?? ''}`);
}
if (!sha256 || !/^[a-f0-9]{64}$/.test(sha256)) {
  throw new Error(`SHA256 非法：${sha256 ?? ''}`);
}
if (!repo || !/^https:\/\//.test(repo)) {
  throw new Error(`REPO_URL 非法：${repo ?? ''}`);
}

const entryFile = join(resolve(registryDir), 'plugins', `${ws.id}.json`);
let previous = {};
try {
  previous = JSON.parse(await readFile(entryFile, 'utf8'));
} catch {
  // 新插件：文件不存在。
}

function parts(version) {
  return version.split('-')[0].split('.').map((value) => Number(value));
}
function isNewer(a, b) {
  const left = parts(a);
  const right = parts(b);
  for (let index = 0; index < 3; index += 1) {
    if ((left[index] ?? 0) !== (right[index] ?? 0)) {
      return (left[index] ?? 0) > (right[index] ?? 0);
    }
  }
  return false;
}
if (previous.version && isNewer(previous.version, pkg.version)) {
  throw new Error(
    `Registry 已有更新版本 ${previous.version}，拒绝回退到 ${pkg.version}`,
  );
}

const entry = {
  ...previous,
  id: ws.id,
  name: ws.label ?? previous.name ?? ws.id,
  description:
    previous.description ??
    pkg.registry?.description ??
    pkg.description ??
    ws.label ??
    ws.id,
  version: pkg.version,
  repo,
  source,
  sha256,
  icon: previous.icon ?? ws.icon ?? 'file-text',
  category: previous.category ?? pkg.registry?.category ?? '开发',
  tags:
    previous.tags ??
    pkg.registry?.tags ??
    ['text', 'editor', 'config', 'encoding'],
};

await mkdir(dirname(entryFile), { recursive: true });
await writeFile(entryFile, `${JSON.stringify(entry, null, 2)}\n`);
console.log(`wrote ${entryFile}`);
console.log(JSON.stringify(entry, null, 2));
