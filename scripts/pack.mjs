#!/usr/bin/env node
/**
 * 生成 WorkStudio 可安装的插件 zip。
 *
 * 输出：
 *   release/<id>-<version>.zip
 *   release/<id>-<version>.zip.sha256
 *
 * zip 根目录直接放 package.json + dist/ + commands.json + skills/。
 * 不包含源码、node_modules、workflow 或构建脚本；package.json 使用最小清单，
 * 避免把本地 SDK 的 file: 依赖带进安装包。
 */
import { createHash } from 'node:crypto';
import { access, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipSync } from 'fflate';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const release = join(root, 'release');
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const ws = pkg.workstudio;
if (!ws?.id) throw new Error('package.json 缺少 workstudio.id');
if (!pkg.version) throw new Error('package.json 缺少 version');

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function walk(dir, base = dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(file, base)));
    else if (entry.isFile()) out.push(relative(base, file).replaceAll('\\', '/'));
  }
  return out;
}

const minimalManifest = {
  name: pkg.name,
  version: pkg.version,
  description: pkg.description,
  ...(pkg.author ? { author: pkg.author } : {}),
  license: pkg.license ?? 'MIT',
  type: 'module',
  exports: pkg.exports,
  workstudio: ws,
};

for (const file of [
  ws.pages?.content,
  ws.pages?.settings,
  'commands.json',
  'dist/engine.js',
]) {
  if (!file) throw new Error('插件清单缺少页面或入口');
  if (!(await exists(join(root, file)))) throw new Error(`缺少构建产物：${file}`);
}

await rm(release, { recursive: true, force: true });
await mkdir(release, { recursive: true });

const entries = {
  'package.json': new TextEncoder().encode(
    `${JSON.stringify(minimalManifest, null, 2)}\n`,
  ),
};

for (const file of ['commands.json', 'api.json', 'api.d.ts', 'README.md', 'LICENSE']) {
  if (await exists(join(root, file))) {
    entries[file] = new Uint8Array(await readFile(join(root, file)));
  }
}

for (const dir of ['dist', 'skills']) {
  if (!(await exists(join(root, dir)))) continue;
  for (const file of await walk(join(root, dir))) {
    entries[`${dir}/${file}`] = new Uint8Array(await readFile(join(root, dir, file)));
  }
}

const zip = zipSync(entries, { level: 6 });
const base = `${ws.id}-${pkg.version}`;
const zipPath = join(release, `${base}.zip`);
await writeFile(zipPath, zip);
const sha256 = createHash('sha256').update(zip).digest('hex');
await writeFile(`${zipPath}.sha256`, `${sha256}\n`);
console.log(`packed ${base}.zip (${(zip.length / 1024 / 1024).toFixed(1)} MB)`);
console.log(`sha256 ${sha256}`);
