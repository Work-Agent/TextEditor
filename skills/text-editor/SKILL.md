---
name: text-editor
description: 读取、编辑和保存工作区中的纯文本、日志与配置文本（txt/text/log/ini/cfg/conf/properties/env/yaml/yml/toml/json），保留编码、BOM 与换行。
---

# 纯文本编辑器

用于读取、编辑和保存工作区的纯文本与配置文本。编辑器基于 CodeMirror 6，支持
YAML / TOML / JSON / INI / 日志高亮，并在保存时保留原文件的编码、BOM 和每一行
换行符。

## 工作流

1. 先用 `read` 读取 `file://...` 文本资源；返回的快照会带 `encoding`、
   `bom`、`eol`、`digest`、`binary`、`readOnly` 等字段。
2. 在纯文本编辑器页面修改；`Cmd/Ctrl+S` 保存。
3. 也可以通过 `text-editor.save` 写回：
   - `ref`: 当前文件地址
   - `content`: 完整文本（包含原始换行符）
   - `expectedDigest`: 打开时快照中的 sha256；不匹配时拒绝覆盖
   - `force`: 用户明确要求保留自己的修改时跳过 digest 检查
4. 保存后同一 ref 的订阅者会收到 `content` 变更。

## 编码与换行

- 保存沿用原编码与原 BOM；不要先把内容转成 UTF-8 再写回。
- `eol` 可能是 `lf` / `crlf` / `cr` / `mixed` / `none`；`mixed` 表示文件混用换行，
  编辑器会逐行保留。
- 新增字符无法用原编码表示时命令会失败，这是有意的保护；不要通过其他方式强行
  覆盖，除非用户明确要求转码。
- `binary: true` 或 `readOnly: true` 时不要编辑保存；该文件已被识别为二进制或
  无法完整往返的编码。

## 注意

- 不改变文件身份或路径。
- 外部更新且未保存修改冲突时，页面会提示「重新加载 / 保留我的修改」。
- 高亮不等于校验：YAML / TOML / JSON 的语义错误不会自动修复。
