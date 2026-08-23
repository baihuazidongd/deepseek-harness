# @deepseek-ai/dsh-client-ui-session-archive

[English](README.md) | 中文

Web 设置的**归档会话**恢复页。归档会把一段对话从所有分组视图中隐藏，而其会话日志在磁盘上完整保留；此前唯一的找回方式是手工编辑注册表存储介质。本插件列出 Host 的注册表级全局归档集合，一键即可把行恢复到所有视图。

浏览器插件通过 [`ui-settings`](../../client/ui-settings/README.md) 注册一个本地化的 `settings.section` 贡献（id `session-archive`，order `30`），读取标准的 `ctx.sessions` / `ctx.workspaces` 数据流。每一行按最近活动倒序显示已归档对话的显示标题、所属 workspace 与最后活动时间。**打开**在不改变归档集合的情况下选中该会话；**恢复**通过 `workspaces.unarchiveSession` 写入——一元应答（或其他客户端触发的 `host/archived-sessions-changed` 帧）会让该行响应式消失，写入失败则保留该行并显示内联错误。sessions 存储中缺失的归档 id（例如无 cwd 的冷会话）不会在此列出。注册使用 `ctx.slots.inject()`，因此跟随分区的延迟声明、重声明、语言切换与卸载，而不导入分区属主。

## 模型体验

无：本包只在浏览器设置中投影 Host 持有的注册表事实，不发送任何模型请求。

#### KV Cache 影响

无：本包不组装也不发送 provider 请求。

## 已知限制与暂缓事项

- **列表完整性依赖 sessions 存储**：归档行来自实时 session 列表投影；已持久化但未投影的会话（无 cwd 的冷工件）可被归档，但在它进入 `session.list` 之前不会在此显示。
- **没有批量恢复或搜索**：恢复一次只能处理一行并按时间排序；不支持多选、过滤或日志内容预览。
