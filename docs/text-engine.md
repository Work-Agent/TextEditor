# 文本引擎依赖选型

本文固定纯文本编辑器的技术选型：编辑器底座、配置语言支持、编码检测与写回、
换行保真模型，以及这些选择拒绝的替代方案。

## 1. 范围

插件认领两类文件：

| 类别 | 扩展名 | 处理方式 |
| --- | --- | --- |
| 纯文本 / 日志 | `.txt` `.text` `.log` | 纯文本；日志额外做轻量行首高亮 |
| 配置文本 | `.ini` `.cfg` `.conf` `.properties` `.env` `.yaml` `.yml` `.toml` `.json` | 同一套编码 / 换行 / 保存管道 + 对应语法高亮 |

YAML / TOML / JSON 没有独立的文档模型，也不需要预览视图。把它们放进纯文本插件，
可以共享字节保真的读取与写回；专门的 JSON 编辑器出现后，可以用更高的 claims
优先级接管 `.json`。

## 2. 编辑器底座

| 候选 | 优点 | 不选的原因 |
| --- | --- | --- |
| **CodeMirror 6** | ESM、按需组合、IME 与大文件表现稳定、官方语言包、移动端可用 | — |
| Monaco | 功能完整、IDE 体验强 | 体积与 worker 装配成本高；纯文本场景用不到语言服务、DiffEditor 等能力 |
| Ace | 成熟、体积较小 | 插件化与状态模型较旧，主题 / 扩展体验不如 CM6 |
| `textarea` + 高亮层 | 实现最简单 | 大文件、多光标、查找替换、折叠、IME 都需要自己补，长期成本更高 |

选择 CodeMirror 6 还有一个仓库级原因：MarkdownEditor 与 HTMLEditor 已经使用
CM6，纯文本插件沿用同一套编辑体验和主题变量，用户切换文件时不会出现两套光标、
选区、查找面板。

## 3. 配置语言支持

| 格式 | 依赖 | 选型理由 |
| --- | --- | --- |
| YAML | `@codemirror/lang-yaml` | 官方维护的 Lezer 语法，支持缩进、折叠与完整高亮 |
| TOML | `@codemirror/legacy-modes/mode/toml` | 目前没有维护中的官方 `@codemirror/lang-toml`；CM5 的 `@sgarciac/cm_toml_mode` 依赖 `codemirror@5`，不能直接用。StreamLanguage 只做词法高亮，不承诺语义校验 |
| INI / cfg / conf / properties / env | `@codemirror/legacy-modes/mode/properties` | 覆盖 section、`key=value`、`key: value`、`#` / `;` / `!` 注释；`env` 与 properties 足够接近 |
| JSON | `@codemirror/lang-json` | 官方 Lezer 语法；`.jsonc` 的注释与尾逗号会被当作错误，因此暂不认领 |
| 日志 | 自研 StreamParser | 只识别行首时间戳、`ERROR` / `WARN` / `INFO` / `DEBUG` 级别、URL 与数字；不解析日志结构，避免大文件上的解析成本 |

不引入通用的“代码编辑器全家桶”：

- `@codemirror/language-data` 会为 Markdown 代码块等场景按需加载大量语言；
  纯文本插件不编辑 Markdown，不需要这层动态加载。
- 不把 YAML / TOML 解析成 AST 再做编辑。配置文件的注释、空行、键顺序、引号风格
  都属于用户内容；结构化重写会破坏这些信息。编辑器只做词法高亮，保存写回原文本。

## 4. 编码检测与写回

### 4.1 候选对比

| 方案 | 能读 | 能写回 | 结论 |
| --- | --- | --- | --- |
| `TextDecoder` / `TextEncoder` | 浏览器支持的编码 | 只能写 UTF-8 | 只能用于 UTF-8 严格校验，不能承担 GBK / Shift_JIS 写回 |
| `chardet` | 多编码检测 | — | 体积小，但对十几字节的中文 / 日文配置置信度很低，容易误判为 ISO-8859-x |
| **`jschardet`** | 带训练模型的编码检测，覆盖 GB18030 / Big5 / CP932 / CP949 等 | — | 选择：短小的中文 / 日文样例也能给出正确首选，代价是引擎体积约增加 1 MB |
| `iconv-lite` | 纯 JS 编码 / 解码 | 支持 GBK / GB18030 / Big5 / Shift_JIS / UTF-16 等 | 选择：负责非 UTF-8 的实际解码与写回 |
| `encoding-japanese` | 日文编码 | 日文编码 | 覆盖面太窄，不含中文 / 韩文 |

最终链路：

```text
bytes
  │
  ├─ 有 BOM ──► 按 BOM 指定编码解码
  │
  ├─ 严格 UTF-8 校验通过 ──► UTF-8
  │
  └─ jschardet.detectAll
        └─ 候选按置信度排序
             └─ 逐个 iconv-lite 解码，并要求 encode(decode(bytes)) === bytes
                  └─ 第一个可字节级往返的候选
```

- `jschardet` 返回 `encoding: null` / `application/octet-stream` 时直接按二进制只读；
- 候选必须能 **编码回完全相同的字节**，否则跳过，避免“能显示但写回会变”的编码；
- 没有可往返候选时用 ISO-8859-1 只读兜底：它对 `0x00-0xFF` 一一映射，至少不会让
  页面显示崩溃，同时禁止保存；
- 保存时用原编码重新编码，并检查 `decode(encode(content)) === content`；新增字符
  无法表示时抛错，不写 `?`。

### 4.2 BOM

BOM 单独剥离、单独写回：

| BOM | 编码 |
| --- | --- |
| `EF BB BF` | UTF-8 |
| `FF FE` | UTF-16 LE |
| `FE FF` | UTF-16 BE |
| `FF FE 00 00` | UTF-32 LE |
| `00 00 FE FF` | UTF-32 BE |

UTF-32 BOM 必须在 UTF-16 LE 之前判断，否则 `FF FE` 会误判为 UTF-16。

### 4.3 二进制边界

满足任一条件即只读：

- 没有 BOM 且 `jschardet` 明确返回二进制 / `application/octet-stream`；
- 解码后的文本含 NUL，或 C0 控制字符（排除 Tab / 换行 / CR / FF / BS / ESC）
  占比超过 2%；
- 编码无法完成字节级往返。

只读文件仍可查看（ISO-8859-1 一一映射），但保存按钮禁用。

## 5. 换行保真模型

CodeMirror 内部文档只使用 `\n`。如果直接把 `state.doc.toString()` 写回，混用
`CRLF` 与 `LF` 的文件会被静默规范化——这违反字节保真。

本插件用 `StateField` 维护一条与文档行等长的“每行原始行尾”数组：

```ts
interface EolState {
  eols: string[];       // 最后一项恒为 ''
  defaultEol: '\n' | '\r\n' | '\r';
}
```

- 打开：从原文扫描出每行行尾；
- 编辑：事务发生后，把旧文档的换行位置通过 `ChangeSet.mapPos` 映射到新文档；
  新插入的换行使用文件的主换行（`defaultEol`）；
- 删除：换行被删除时对应行尾自然消失；
- 保存：`textFromState` 按行拼接，得到保留原行尾的完整字符串。

这样不需要字符级 diff，也不需要把整个文件重新排版；未修改行的行尾在编辑过程中
始终保留。文件没有任何修改时，引擎直接复用原始字节，连重新编码都不做。

## 6. 保存与冲突

`text-editor.save` 的输入：

```ts
{
  ref: string;
  content: string;         // 已按原始行尾拼好的完整文本
  expectedDigest?: string; // 打开时快照中的 sha256
  force?: boolean;         // 用户明确选择“保留我的修改”
}
```

保存流程：

1. 读取当前文件字节，计算 sha256；
2. 未传 `force` 且 `expectedDigest` 不匹配 → 拒绝覆盖；
3. 重新检测当前文件的编码 / BOM；
4. `content` 与原文一致 → 直接返回原始字节；
5. 否则按原编码 / BOM 写回，并验证可逆；
6. 通知同一 ref 的 `workspace` 订阅者，返回新的元数据与 digest。

页面在保存成功后更新 `expectedDigest`；外部更新冲突时提供「重新加载 / 保留我的修改」。

## 7. 验收

自动化测试覆盖：

- UTF-8 / UTF-8 BOM / UTF-16 LE BOM；
- CRLF / LF / CR / 混合换行；
- 末尾有无换行；
- GB18030 中文配置往返；
- 二进制只读；
- 原编码无法表示新增字符时拒绝保存；
- 混用行尾在插入、删除、修改文本后仍保留未修改行；
- 空文件。

手工验收：

- 打开一个 GBK + CRLF 的 `.ini`，修改一行后保存，用十六进制确认未修改行的字节与
  行尾不变；
- 打开 `.yaml` / `.toml` / `.json`，确认高亮、折叠（YAML / JSON）和查找替换；
- 在编辑器外修改文件后再保存，确认冲突提示；
- 切换浅色 / 深色主题，确认编辑区与语法配色跟随。
