# Agent Note: 会话头部的编号五格消息定位条

Status: implemented

[English](2026-08-24-message-jump-numbered-cell-strip.md) | 中文

## Problem

消息定位头部控件最初是一对上/下箭头加「当前 / 总数」读数。在长对话里逐条步进很慢，读数不携带任何「哪条是哪条」的信息，也无法直达任意更早的消息——回到往前第五条要按四次。

## Decision

`@deepseek-ai/dsh-client-ui-message-jump` 把它在 `conversation.session.header.actions` 的席位渲染为一排编号格子，每格对应一条用户自己发出的消息，一次最多显示五个（`MAX_CELLS`）。在格子条上滚动鼠标滚轮，可见窗口每次移动一格；悬停或键盘聚焦某个格子时，通过共享的 `ui-primitives` `Tooltip` 气泡预览那条消息的文本；点击格子用既有的流式行几何计算把聊天滚动容器直接定位到该行。当前位于滚动容器顶部的消息格子保持高亮；当活动消息滚出可见窗口时窗口自动跟随，而手动滚出的偏移在包含关系成立时保持不动。

消息引用与预览来自框架 `useSession` 钩子暴露的实时聊天快照（`user` 与 `steering` 两类；注入的 `context` 不计）。载荷类型属于 `ui-conversation` 的 `ChatNodeDataMap` merge，因此预览对消息节点做结构化读取（拼接文本块、折叠空白、上限 120 字符），而不是跨包导入另一插件的符号。滚轮处理器以 `{ passive: false }` 原生绑定，因为 React 合成 wheel 监听是 passive 的，无法 `preventDefault()` 控件背后的对话滚动。窗口算术（`clampWindowStart`、`shiftWindowStart`、`followWindowStart`）与预览提取都是 `jump.ts` 中的纯函数，在无浏览器的环境下单元测试。

## Consequences

- 直达取代步进：最近五条消息一次点击可达，更早的至多数次滚轮。
- 控件保持在头部 chrome 预算内：五个 24px 格子适配操作行；更长对话靠翻页而非增长。
- 在格子条上滚轮永远不会带动其下方的对话滚动——非 passive 原生监听持有这一约定，测试断言了 `preventDefault` 调用。
- 纯图片或其他非文本消息的预览回退到占位文案（`preview.empty`），不会渲染成空泡。
- 共享 `Tooltip` 上游仍标注待视觉打磨（无箭头）；气泡继承其 fixed 定位，这正是它能逃出头部相邻层不被裁剪的原因。

## Alternatives considered

- **保留箭头对并加数字输入框。** Rejected: 在头部控件里输入序号比点击可见格子慢，且丢掉了格子条一眼可见的对话长度线索。
- **始终渲染全部消息的格子。** Rejected: 长会话会把头部撑出滚动条或溢出标题簇；五个格子上限约束了占地，其余交给翻页。
- **Portal 弹层列出全部消息。** Rejected: 多一步交互（先打开再挑选）、失去常驻的位置指示，且扫描历史本就是轨迹视图的职责。
- **导入 `UserMessageNode` 类型并强转载荷。** Rejected: kind 到载荷的保证属于另一个包的 merge；结构化读取让本插件对自身可假设的范围保持诚实，也能在重放回退行下存活。
