# @deepseek-ai/dsh-host-plugin-inventory

[English](README.md) | 中文

当前 Cordis Loader 树的 Host 投影，并支持浏览器侧的启用状态写入。`PluginInventoryGateway` 注册 `pluginInventory` 服务，发布两个由 Typert 生成的直接 Remote。`pluginInventory/list` 每次调用都直接读取 `ctx.loader.entries()`，跳过结构性的 group 行，再按 Loader 顺序返回其余条目，并且只包含 Loader 条目 id、模块标识、有效启用状态与当前根 Fiber 阶段。`pluginInventory/setEnabled` 把一个条目的启用状态以显式 `{ id, disabled }` 行持久化到本次启动的 profile 用户 patch 层（经由 [`dsh-user-patches`](../../boot/user-patches/README.md)，即该层的首个程序化写入器），并通过 `loader.update` 把同一状态应用到运行中的树，返回刷新后的快照。

阶段为 `pending`、`loading`、`active`、`failed` 或 `unloading`；条目没有存活的根 Fiber 时则为 `null`。每个条目还携带包分类与包声明的事实：`source` 为 `library`（名字出现在 profile 清单的 `dependencies` 中 —— 这是 `dsh plugin` 为用户装进 profile 的一切写的记录，bundle 与否）或 `native`（其余，即模板 bundle 等安装自带的行），表面未提供用户层上下文时为 `null`；`description` 与 `version` 来自包自身的 `package.json`：以 profile 清单为锚点探测 require 查找路径 —— 这条父级遍历同时到达 profile 自己的 `node_modules` 与 loader 的 `profiles/node_modules` 平铺兜底，且不要求包导出 `./package.json` —— 包不可解析或未声明时为 `null`。该快照刻意只表示调用当下：Loader 仍是唯一的生命周期权威，本包不拥有缓存、历史或分层来源模型。写入依赖启动器事实 `ctx.userPatchPaths`（由 `dsh profile-boot` 提供）；未组合用户 patch 层的表面会大声失败，而不是猜测文件。写入行在两个方向上都显式 —— `disabled: true` 与 `disabled: false` —— 与 `loader.update` 语义一致，因此后续 bundle 默认值不会静默夺回该条目；home 层与 `--patch` 覆盖层仍高于写入行，与表面启动时的组合顺序一致。启动期的 patch 监视器（`dsh-app-boot` 的 `watchUserPatches`）会把写入后的层重新应用到同一状态，文件写入与运行中的树因此幂等收敛。公开 payload 类型位于 `./types`，Typert 生成由 `./typert` 与 `./remote` 导出的 Host 和 Client Remote 产物。

该服务声明自己的 `Context` merge（`ctx.pluginInventory`），让 [`dsh-tool-plugin-inventory`](../tool-plugin-inventory/README.md) 这类同进程消费者可以直接注入；浏览器客户端通过显式的 [`api-remotes`](../../api/remotes/README.md) 组合消费同一实例，而不导入 Host 实现。

## 模型体验

无，因为这个仅限 Host 的清单投影不注册提示词、工具、消息或提供方请求。`setEnabled` 写入可能改变活跃会话组合所携带的插件集合，因此它对任何模型表面的影响由被启用或停用的插件自己负责，而非本包。

#### KV Cache 影响

无；本包从不组装模型输入。

## 已知限制与暂缓事项

- **仅表示调用当下** —— 结果不包含持久的失败历史或订阅；只要不存在存活的根 Fiber，就会报告 `null`，而不区分其原因。
- **无来源** —— 服务不识别条目由哪个 bundle、profile 或 override 引入。
- **启用写入仅落在 profile 层** —— `setEnabled` 总是写入 profile 自己的 `cordis.patch.yml`；按部署选择 home 层需要引入经过校验的 Config 字段，条目的添加/移除也在范围之外。
