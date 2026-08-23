# Agent Note：Session 取消归档——恢复接缝与设置页

Status: implemented

[English](2026-08-23-session-unarchive-recovery.md) | 中文

## 问题

归档在 Web GUI 里曾是单行道：wire 上存在 `workspace.archiveSession`，但没有任何注册表方法、RPC 路由或 UI 入口能撤销它。会话行菜单里的一次点击就把对话从所有分组视图中隐藏，唯一文档化的找回方式是手工编辑 `workspace.json`。真实的对话正是这样"丢失"的——被隐藏，而非被删除。

## 决策

对既有归档链做最小对称扩展，外加一个新客户端插件；完全不改动 workspace 浏览器 UI 本身。

**注册表**（`dsh-workspace`）：`WorkspaceRegistry.unarchiveSession(id)` 通过与归档相同的串行化状态写入从 `archivedSessionIds` 过滤掉一个 id。当前未归档的 id——包括未知 id——直接完成而不写入，恢复流程因此无需存在性检查；记账绝不被触碰。

**Wire**（`dsh-host-apiproxy`）：`workspace.unarchiveSession({ sessionId })` 在 RpcMethodMap 行、请求／值 schema、一元分发表和网关实现上镜像归档路由，应答完整的更新后集合。存储域 watcher 已在每次持久集合变更后广播 `host/archived-sessions-changed`，所有已连接客户端免费获得重基线。

**客户端运行时**（`dsh-client-runtime`）：`IWorkspaces.unarchiveSession(id)`，manager/service 实现镜像 `archiveSession`——service 在 Host 出错时抛出 `session unarchive failed: code: message`。

**插件**（`@deepseek-ai/dsh-client-ui-session-archive`，新包）：注册 `settings.section` 贡献（id `session-archive`，order 30），把归档集合与 sessions 存储联表展示——显示标题、workspace 标签、最后活动时间，按最近倒序。打开在不改变归档集合的情况下选中该会话（归档行仍留在列表存储中，只有分组会隐藏它们）；恢复通过 `ctx.workspaces.unarchiveSession` 写入，由应答／帧响应式移除该行。投影中缺失的 id（无 cwd 的冷工件）无法渲染，是文档化的限制。新包挂载于仓库自身的 web-app bundle roster；源码检出无需 profile patch 层变更。

## 考虑过的替代方案

**打开时自动取消归档。** 否决：打开一条归档对话来阅读不应改动归档集合；显式的恢复保持显示状态归用户所有。

**在侧边栏行菜单里就地取消隐藏。** 否决：归档行在客户端被各分组树过滤，菜单需要跨三个分组面逐一布线；设置页不需要任何这些，而归档操作的误触可发现性是 ui-workspace 的 UX 议题，超出本次修复范围。

**直接改存储介质／一次性脚本。** 否决：未文档化、与宿主锁不安全竞争，且缺口仍在，下一次误触归档照样发生。

## 后果

- 取消归档经由既有的 changed 帧广播传播到所有客户端；没有新增推送种类。
- ui-workspace README 的已知限制措辞（"没有查看或取消归档入口"）退役；删除 Session 仍然按设计不支持。
- 相邻潜在风险的预防加固（单个坏工件导致整表扫描失败、静默跳过撕裂头部）继续暂缓；本次只关闭可逆性缺口。

## 测试

`packages/workspace/workspace/tests/workspace.spec.ts` 覆盖持久化／幂等取消归档、记账不动、未知 id 无操作与重启恢复。`packages/host/apiproxy/tests/api-proxy-workspace.spec.ts` 端到端覆盖路由，包括唯一的 `host/archived-sessions-changed` 快照与无帧的无操作。运行时 `workspaces-service.client.spec.ts` 覆盖应答安装、选中保留与错误透传。插件套件覆盖注册／HMR 语义与组件行为（排序、空态、缺失 id 跳过、响应式移除、内联失败）。两个 tsconfig 聚合类型检查全绿。
