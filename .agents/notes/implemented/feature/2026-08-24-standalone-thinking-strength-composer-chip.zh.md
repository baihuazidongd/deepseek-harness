# Agent Note: 发送按钮旁的独立思考强度 composer chip

Status: implemented

[English](2026-08-24-standalone-thinking-strength-composer-chip.md) | 中文

## 问题

composer 的[模型座位](../feature/2026-07-24-web-session-model-selector.md)带有[独立的思考强度触发器](../feature/2026-08-13-web-third-party-reasoning-effort-editor.md)，但它只是藏在 `ui-model-selection` 包内、位于模型名旁的次级控件。想要随时选择思考强度的用户必须打开模型座位的菜单；而且没有任何一个界面可以独立于模型选择被关闭——禁用模型选择会让唯一的思考强度控件一并消失。

## 决策

新增 client 插件 `@deepseek-ai/dsh-client-ui-thinking-strength`，在 `conversation.input.right`——即紧邻主发送按钮左侧的 composer 工具行——注册一枚 chip。它通过 `ctx.modelDirectories`（即 `ui-model-selection` 服务）解析会话的共享 `ModelDirectory`，并经 `session.selectModel` 提交，因此 chip 与模型座位回显同一个由 Host 报告的 `ModelSelection`：在任一界面切换的强度，都是另一个界面随后显示的值。它以用户库的形式发布——通过 `dsh plugin add` 安装进 profile，而不是 `web-app` 产品 bundle 里的一行——因此插件管理器将其归类为「库 / library」，并且可以单独禁用 chip，而无需禁用模型选择。

每个有当前模型的普通会话都会渲染 chip。携带[适配器持有的推理元数据](../architecture/2026-07-24-adapter-owned-reasoning-effort-capabilities.md)的模型打开后显示其档位列表——名称、描述与默认值，仅当适配器没有配置模型默认值时才显示提供方默认值行。没有该元数据的模型仍然显示 chip，打开后显示「无可选档位」的空提示而不是隐藏控件，因此每个模型／服务商都呈现同一个界面。共享目录 store 以绑定的 `useDirectory` 框架 hook（保留的 inject `hooks` 槽位）到达组件，组件内部不持有任何订阅机制；`load`/`select`/`error` 都是针对同一目录的普通 inject 动词。被拒绝的选择通过锚定在 composer 卡片上的共享瞬时 Toast 提示。被寻址的子代理会话不渲染 chip，与模型座位的 Agent 绑定 RPC 约束一致。

## 结果

- 一个选择事实、三个界面：模型座位的模型触发器与思考强度触发器，加上这枚 chip，都读写同一个每会话目录。
- 每个模型都显示 chip，于是推理模型通过两个菜单提供相同的档位，而非推理模型仍保有 chip（打开后显示无可选档位）；代价是第二个下拉，收益是发送按钮旁统一的界面与独立的可禁用性。
- chip 依赖 `ui-model-selection` 提供 `ctx.modelDirectories`；没有该包的 profile 不会出现 chip，而且必须安装该包（`dsh plugin add`）chip 才会挂载。
- 没有新的模型可见或线上行为：每次选择都走既有的 `session.selectModel`，因此模型体验与 KV 缓存后果继承自[模型选择器](../feature/2026-07-24-web-session-model-selector.md)。

## 备选方案

- **把 chip 打进 `web-app` 产品 bundle。** 不予采纳：那样会把它归类为「原生 / native」；用户新增的界面应放在 profile 层作为「库 / library」插件，可禁用、可移除而不改动产品 bundle。
- **对非推理模型隐藏 chip。** 不予采纳：那样界面会随模型／服务商而时有时无（推理模型两个按钮、其余模型没有），正是本 chip 要消除的不一致。
- **把 chip 并入 `ui-model-selection`。** 不予采纳：本意就是一个可独立开关的界面；独立包使其可在插件管理器中禁用，并保持模型选择包的范围（模型路由加自身的思考强度面板）不变。
- **只复用模型座位现有的思考强度触发器。** 不予采纳：需求是发送按钮旁的独立按钮，而不是模型菜单里的又一项。
- **建立第二个每会话目录。** 不予采纳：会分叉共享的选择状态；读取 `ctx.modelDirectories` 才能保持单一事实。
