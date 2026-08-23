# Agent Note: 直播间原生的计划 chip、上下文环与斜杠菜单

Status: implemented

[English](2026-08-23-slg-room-native-controls.md) | 中文

## 问题

直播间遮蔽了常驻 composer，也随之失去了它的辅助控件：计划模式退出 chip、上下文占用仪表和斜杠命令发现。[房间笔记](2026-08-16-slg-game-view.md)已经补回了 composer 的阻塞式交互（权限、审批、提问、队列），但三个随时可用的能力仍缺失——只用直播间的用户既退不出计划模式，也看不到上下文余量，更发现不了会话的 agent 接受哪些命令。

## 决策

给 `SlgGameViewInjected` 增加三个动词——`exitPlanMode`、`listCommands`、`runCommand`——并在 `InputExtras.tsx` 渲染三个输入条附加件，每个都由标准投影座位供数，数据源缺席时什么都不渲染：

- **计划 chip**：读 `useProjection('plan')`；生效目标是主机折叠值 `pending ? !active : active`（不做客户端乐观）。点击经绑定会话的命令动词 `/plan off` 退出；应答折叠为 `null` 或英文失败行（错误面策略），离开过程中按钮禁用。
- **上下文环**：发送按钮旁的 14px 圆环，由 `contextPressure`/`contextBreakdown` 供数。占用计算复刻 ui-conversation 的 `contextOccupancy`（`projectedTokens ?? pressureTokens` 除以 `contextWindow`，整数取整、100% 截断）——跨插件导入他人内部符号被禁止；点开面板显示 token 数字与构成行，彩色分段像原生一样按提供方精确百分比占比。
- **斜杠菜单**：`/` 按钮每次打开拉一次 `remote.commands.list(sessionId)`（失败的拉取解析为空）。声明了输入提示的描述符把 `/name ` 回填进草稿；裸命令经会话命令动词直接执行。行内按名称本地过滤。

插件 `inject` 声明增加 `remote` 与 `remote.commands`；无会话或寻址子会话时 `listCommands` 降级为空表，与运行时目录自身的子会话守卫一致。

## 已考虑的替代方案

**复用 ui-conversation 的 `ContextMeter` / `StatsLine` 辅助函数。** 导出纪律禁止导入其他插件的内部；共享的计算只有几行，复刻时以注释指向原件。

**复用 `CommandUiRuntime` 的弹窗机制。** 它的弹窗焊死在输入机器的斜杠管线（consume-token 事件、贡献/装饰、锚定浮层）。直播间的朴素输入只需要目录发现加执行或回填，运行时服务的多余面积还得为此拉进 ui-input-trigger，换不来行为收益。

**用客户端状态跟踪计划模式。** 投影是从已记录的主机状态（含 pending 迁移）折叠的；切换中途乐观的客户端状态会与链上事实不一致。

## 后果

- 未组合 token-meter、plan-mode 或目录为空的部署上，三个附加件整体消失；部分组合不改变房间。
- 本包新增对 `@deepseek-ai/dsh-token-meter`、`@deepseek-ai/dsh-plan-mode`、`@deepseek-ai/dsh-commands` 的类型级依赖（peer + dev、tsconfig 引用、信息性 `dsh.client.inject` 行）。
- 无模型可见变化：`/plan off` 与斜杠命令走既有命令生命周期日志；投影只读。

## 测试

`browser-plugin.client.spec.ts` 断言扩展后的 inject 声明、在 bench 中提供 `remote`/`remote.commands`，覆盖正向路径（退出折叠为 null、run 转发命令行、未匹配行解析 false、list 转发目录）以及无会话时的空表降级。`slg-game-view.client.spec.tsx` 直接以 props 渲染（80 个测试）：计划 chip（无投影不渲染、非激活隐藏、pending 折叠下显示、点击退出、失败提示并恢复可点）、上下文环（分子与容量齐备前隐藏、面板读数与数字、projectedTokens 优先与截断、构成行以组合投影为门）、斜杠菜单（每次打开拉一次、名称过滤、裸执行与带回填两种拾取、空目录与失败拉取、无会话时触发钮禁用）。
