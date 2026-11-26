# Text Editor

WorkStudio 的纯文本编辑器插件：**CodeMirror 6 + 字节保真的编码 / BOM / 换行处理**。
除了 `.txt` / `.log`，它也负责纯文本形态的配置文件：INI / cfg / conf / env /
properties，以及 YAML / TOML / JSON。

纯文本编辑的核心不是“把文件读成字符串”，而是**读进来再写回去时，没改过的字节不变**。
本插件把编码、BOM、换行和二进制边界都当成一等公民。

## 功能

- **编码检测**：UTF-8（含 BOM）、UTF-16 LE/BE、UTF-32 LE/BE、GB18030 / GBK /
  GB2312、Big5、CP932 / Shift_JIS、CP949 / EUC-KR、EUC-JP、Windows-125x、
  ISO-8859-x、KOI8-R 等
- **字节保真**：
  - 保存时沿用原编码与原 BOM；
  - 每一行保留原来的 `LF` / `CRLF` / `CR`，混用换行符也不会被静默规范化；
  - 不自动添加或删除文件末尾换行；
  - 文本没有变化时直接复用原始字节；
  - 新增字符无法用原编码表示时**拒绝保存**，不写 `?` 或替换字符；
  - 检测到二进制内容时只读打开，避免按文本写回损坏文件
- **语法高亮**：YAML、TOML、JSON、INI / properties、日志级别与时间戳
- **编辑体验**：行号、当前行高亮、自动换行、查找 / 替换、多光标、撤销 / 重做、
  括号匹配、YAML / JSON 折叠、空白字符显示
- **状态**：脏标记、光标行列、选中字符数、文档行列数、编码 / BOM / 换行 / 大小
- **冲突处理**：保存前用原始字节的 sha256 检测外部更新，提示「重新加载 / 保留我的修改」
- **主题**：跟随 WorkStudio / 系统浅色与深色主题
- **设置**：自动换行、字号、Tab 宽度、行号、当前行、空白字符、拼写检查

## 为什么 YAML / TOML 也在这里

WorkStudio 的插件按 `claims` 认领文件。YAML / TOML / INI 本质上是“带轻量语法的
纯文本配置”，没有独立文档模型，也不需要预览视图；放进纯文本插件可以共享同一套
编码、换行、保存和冲突处理。

| 文件 | claims | 语言 |
| --- | --- | --- |
| `.txt` / `.text` | 纯文本 | 无语法 |
| `.log` | 纯文本 | 日志级别 / 时间戳高亮 |
| `.ini` / `.cfg` / `.conf` / `.properties` / `.env` | 配置文本 | INI / properties |
| `.yaml` / `.yml` | 配置文本 | YAML（Lezer） |
| `.toml` | 配置文本 | TOML（StreamLanguage） |
| `.json` | 结构化文本（优先级 10） | JSON（Lezer） |

`.json` 使用较低的 claims 优先级：以后如果出现专门的 JSON 数据编辑器，可以由它
以更高优先级接管；没有专门插件时，纯文本编辑器仍能打开它。

## 依赖选型

完整对比与取舍见 [`docs/text-engine.md`](./docs/text-engine.md)。当前选择：

| 层 | 选择 | 原因 |
| --- | --- | --- |
| 编辑器 | CodeMirror 6 | ESM、体积可控、IME / 大文件表现好，和 Markdown / HTML 插件一致 |
| YAML | `@codemirror/lang-yaml` | 官方 Lezer 语法，缩进、折叠、高亮完整 |
| TOML | `@codemirror/legacy-modes/mode/toml` | 没有维护中的官方 `lang-toml`；StreamLanguage 足够做词法高亮 |
| INI / 配置 | `@codemirror/legacy-modes/mode/properties` | 覆盖 section、`key=value`、`#` / `;` / `!` 注释 |
| JSON | `@codemirror/lang-json` | 官方 Lezer 语法；`.jsonc` 暂不认领 |
| 日志 | 自研轻量 StreamParser | 只标时间戳、级别和 URL，不对日志做结构解析 |
| 编码检测 | `jschardet` | 对短小的中文 / 日文配置比 `chardet` 更可靠（代价是引擎体积更大） |
| 编码转换 | `iconv-lite` | 负责非 UTF-8 的编码与写回；UTF-8 先用 `TextDecoder` 严格校验 |

## 开发

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

`pnpm build` 生成：

```text
dist/page/index.html
dist/settings/index.html
dist/engine.js
dist/assets/...
commands.json
api.json
api.d.ts
```

依赖全部打包进 `dist`，安装时不需要执行 npm。

## 发布

打 tag 会触发 `.github/workflows/release.yml`：

```bash
git tag -a 0.1 -m "Release 0.1"
git push origin main
git push origin 0.1
```

Workflow 会：

1. checkout 本插件；
2. 从 npm 安装已发布的 `@work-studio/sdk`；
3. `pnpm install --frozen-lockfile`、`pnpm typecheck`、`pnpm test`、`pnpm build`；
4. 生成最小清单的安装包：
   - `release/text-editor-<version>.zip`
   - `release/text-editor-<version>.zip.sha256`
5. 创建 GitHub Release 并上传 zip / sha256；
6. 更新 `Work-Agent/PluginRegistry` 的 `plugins/text-editor.json`，并向该仓库提交 PR。

Release 需要配置 GitHub App：

- 在 `Work-Agent/PluginRegistry` 上安装 App，权限 `Contents: write` + `Pull requests: write`
- 在 TextEditor 的 Actions secrets 中配置：
  - `REGISTRY_APP_CLIENT_ID`
  - `REGISTRY_APP_PRIVATE_KEY`（App 私钥全文）

`REGISTRY_APP_CLIENT_ID` 也可以放 Actions variable。`REGISTRY_APP_PRIVATE_KEY`
只能放 secret。GitHub Free 下 Organization secret 不能用于私有仓库；TextEditor
是 public 时可用 Organization secret（需选中该仓库），是 private 时请用 Repository secret。

本地也可以直接打包：

```bash
pnpm build
pnpm pack:plugin
```

## 安装

把整个仓库目录作为本地插件安装到 WorkStudio，或 `pnpm build` 后打 zip 安装。

约定：

- `workstudio.id`: `text-editor`
- claims: `.txt` / `.text` / `.log` / `.ini` / `.cfg` / `.conf` / `.properties` /
  `.env` / `.yaml` / `.yml` / `.toml` / `.json`
- 内容页：`dist/page/index.html`
- 设置页：`dist/settings/index.html`
- 引擎：`dist/engine.js`
- 技能：`skills/text-editor/SKILL.md`

## 命令

| 命令 | 入参 | 说明 |
| --- | --- | --- |
| `text-editor.save` | `ref`, `content`, `expectedDigest?`, `force?` | 按原编码、BOM、换行写回；sha256 不匹配时拒绝覆盖 |

`commands.json` / `api.json` / `api.d.ts` 由 `workstudio-plugin` 从 `definePlugin`
生成，不手写。

资源适配器支持：

- 读取整篇文本，并返回编码、BOM、换行、末尾换行、大小、sha256、二进制标记；
- `offset` / `limit` 按行读取（Agent 读取大文件用）；
- `grep` 按行返回 `ref#L<n>` 定位与片段。

## 设置

设置保存在插件数据目录，对所有文本文件生效：

- 自动换行
- 字号（11–24 px）
- Tab 宽度（1–8）
- 显示行号
- 高亮当前行
- 显示空白字符
- 拼写检查

编码、BOM 与换行不在这里配置：它们由文件自身决定，保存时原样保留。

## 快捷键

| 快捷键 | 动作 |
| --- | --- |
| `Cmd/Ctrl+S` | 保存 |
| `Cmd/Ctrl+F` | 查找 / 替换 |
| `Cmd/Ctrl+Z` / `Shift+Cmd/Ctrl+Z` | 撤销 / 重做 |
| `Cmd/Ctrl+/` | 切换行注释 |
| `Cmd/Ctrl+Shift+↑/↓` | 上移 / 下移当前行 |
| `Tab` / `Shift+Tab` | 缩进 / 反缩进 |

## 结构

```text
src/
├── engine.ts                  # definePlugin：text 资源适配器 + save
├── shared/
│   ├── settings.ts            # 设置类型、默认值与归一化
│   └── text-meta.ts           # 编码 / BOM / 换行等快照元数据
├── text/
│   ├── encoding.ts            # jschardet + iconv-lite：检测、解码、按原编码写回
│   └── eol.ts                 # 换行扫描、主换行、按行重建
├── editor/
│   ├── index.ts               # CodeMirror 编辑器工厂与适配层
│   ├── eol-field.ts           # StateField：每行原始行尾，跨事务映射
│   ├── language.ts            # 扩展名 → YAML / TOML / JSON / INI / 日志
│   ├── keymap.ts              # 保存、查找、折叠、注释等快捷键
│   ├── theme.ts               # CM6 主题与语法配色
│   └── types.ts
├── page/
│   ├── index.html
│   ├── main.ts                # 资源订阅、保存、冲突、设置、状态栏
│   ├── mock.ts                # 浏览器预览用的内存 bridge
│   └── style.css
└── settings/                  # 插件设置页
```

## 字节保真边界

“字节保真”在本插件中的定义：

| 场景 | 行为 |
| --- | --- |
| 打开后直接保存，没有编辑 | 直接复用原始字节，字节级不变 |
| 编辑内容 | 沿用原编码、BOM 与每一行原换行；未修改行的行尾不被规范化 |
| 混用 `LF` / `CRLF` / `CR` | 每行行尾单独记录，编辑时只影响发生变化的行 |
| 末尾没有换行 | 不自动补换行；删除最后一个换行时也如实保存 |
| 新增字符无法用原编码表示 | 保存失败并提示，不写 `?`，不静默转 UTF-8 |
| 二进制 / 无法往返的编码 | 只读打开，保存禁用 |
| 外部更新 | `expectedDigest` 不匹配时拒绝覆盖，页面提供重新加载 / 保留修改 |

已知边界：

- 不提供手工“以某编码重新打开 / 另存为 UTF-8”的 UI；当前以自动检测为准。
- 二进制文件只读，不提供十六进制编辑器。
- 不做 YAML / TOML / JSON 的语义校验、格式化或 schema 补全；高亮不等于校验。
- `.conf` 统一按通用 INI / properties 处理；nginx 等专用语法不单独识别。
- `.jsonc` / `.json5` 暂不认领，避免把注释和尾逗号误判为 JSON 错误。
- 超大文件仍由 CodeMirror 自身承担渲染成本，暂未做降级阈值。
