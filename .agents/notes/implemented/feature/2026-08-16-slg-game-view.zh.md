# Agent Note: 作为对话界面的直播间

Status: implemented

[English](2026-08-16-slg-game-view.md) | 中文

## Problem

dsh 网页 GUI 把会话渲染成标准聊天线程——标签页、消息、输入框。用户希望把同一个实时会话呈现为 B 站风格的直播间（主播卡片、角色立绘、弹幕、工具调用飘屏、视觉小说式说话条，外加按组织分组的对话列表），并且希望直播间**替换整个对话页面**，而不是作为额外标签页并排存在。其他插件的界面（应用侧栏与详情列）必须继续可用，且不得改变触达模型请求的内容。

## Decision

新增 `@deepseek-ai/dsh-client-ui-slg` 客户端插件包，往框架的 `conversation` 槽位（single、`session-maybe`）以 `priority: -1` 注册。single 槽位渲染其存活条目中优先级最低者，因此直播间遮蔽 ui-conversation 的 ConversationRoot：整个中列渲染成直播间、不新增标签页。视图是纯展示组件（`SlgGameView`），其 props 是会话运行时份额（`PropsRuntime<'conversation'>`，因此 `sessionId` 与 `useSession` 为 session-maybe）加上 `PropsLocale<'slg'>`、一个声明的设置 store，以及注入的业务面 `{ send, stop, loadOlder }` 加模型选择面 `{ modelAvailable, modelDirectory, loadModels, selectModel }`。

实时数据只经框架 hook 进入：说话条、对话记录与对话定位轮盘读 `useSession` 的会话行与流式片段，「消耗 tok」读 `useProjection('sessionStats')`，房间标题与成员切换读 `useSessions` 的会话行。动词经会话作用域的 `conversation` 服务（`sessions.scope(sessionId)?.get('conversation')`）转发 send/stop 与历史翻页；没有模型可见输入、也没有会话事件。直播间在会话切换时保持挂载（槽位为 session-maybe），并在无当前会话时禁用输入条。

直播间设置（主播名、弹幕区域/密度/不透明度/字号/速度、堆叠、思考面板高度）走声明式 store（`createSlgSettingsStore`，`persist: 'dsh.slg.settings'`），跨重挂与刷新保留。渲染器在 session-maybe 条目未收养时不提供 store 座椅，且收养不重挂，因此导出组件是无 hook 分发器：有座椅后 `StoredRoom` 读 store，此前 `EphemeralRoom` 用本地状态提供同一设置面，两者共用 `RoomView` 主体。持久化是整值替换，`StoredRoom` 会修复旧形状的载荷（缺失字段回退默认值并写回）。

对话定位轮盘为观众的每条消息渲染一个圆点，每个点锚定到对话记录里真实行的 DOM 元素：点击圆点把那条消息滚到视口顶部，激活点（视口顶线之上最后一行）始终保持在条带正中，条带一屏恰好 4.5 个自适应圆点，滚轮每格精确步进一个点距。快照报告 `hasMore` 时直播间自动翻页 `loadOlder`（拉取失败即停、切会话重试），让记录与轮盘覆盖整个会话。回合流式输出推理时，说话条在可拉伸、高度持久化的面板里显示真实思考内容并自动贴底滚动。

立绘显示七张情绪图之一，图片由 Web 壳的 public 目录提供（`apps/web/public/portraits/`，以 `/portraits/<emotion>.png` 引用）；立绘上的六个隐形命中区点击后各自切换为对应表情并把反应台词送进底部说话条，短暂延迟后回到默认表情。弹幕、打赏弹幕层与对话记录都从同一份扁平化会话行（用户/助手文本与助手工具调用）派生，因此三者永不打架；弹幕/礼物开关分别控制两层，弹幕/打赏速度倍率来自设置 store。表情/反应、面板选择与开关是组件本地状态。

组合路线遵循[槽位系统标准](../architecture/2026-07-22-slot-type-chain-implementation.md)；遮蔽机制（single 槽位渲染最低优先级存活条目）与框架的 `conversation` 座位见 [web 客户端架构说明](../architecture/2026-07-19-gui-web-client-architecture.md)。

## Alternatives considered

**把直播间保留为 `conversation.view` 标签条目。** 这正是用户否掉的方案：它让直播间与「聊天」并排成第二个标签页，而不是整页；标签方案还会保留常驻输入区及其各座位，而直播间并不需要它们。

**遮蔽 `root` 槽位替换整个应用。** 往 `root` 注册会连侧栏与详情列一并移除，且 `root` 为 root 作用域、没有 `useSession`，直播间无法读到当前会话；框架也明确警告不要这么做。`conversation`（session-maybe）才是既携带当前会话、又能整体替换对话界面的座位。

**弹幕、礼物、工具调用各走独立的人工数据源。** 把三个表面统一走同一条派生的行流（会话节点）即可免费保持与对话记录、说话条一致，也契合 harness 实际产出方式（助手工具调用是回合的一部分）。

## Consequences

- 直播间替换对话界面：中列的头部、标签页、聊天主体、输入区被遮蔽，应用侧栏与详情列继续可用；禁用本包即恢复默认聊天线程。
- 启用本包期间，常驻输入区及其各座位（模型选择、计划、输入 dock）不可用；直播间自带输入条与模型切换器，会话仍可发送、可切模型。
- 设置按会话作用域持久化在 localStorage；旧形状载荷在首次挂载时修复。无模型可见变更：视图只是重渲染既有快照并把输入经 conversation 服务转发，因此没有新东西触达模型请求或会话日志。
- 工作区/会话管理动词（重命名、分叉、归档、删除）保持未接线：直播间只经 sessions 运行时份额提供切换。

## Testing

`browser-plugin.client.spec.ts` 在真实 cordis Context + SlotRegistry 上应用插件，断言 `conversation` 条目（组件、locale、遮蔽优先级）、注入面（无作用域会话时 send/stop 拒绝、模型面降级）与 fiber 销毁注销。`slg-game-view.client.spec.tsx` 直接以 props 渲染组件（58 个测试）：说话条问候/流式/真实思考面板（可拉伸持久化高度、旧载荷修复）、无座椅的会话前渲染与临时设置、设置面板跨重挂驱动每个 store 动作、tok 速度显示与降级、历史自动翻页（循环、在途去重、失败即停）、锚定轮盘（精确行跳转、激活点居中、单点滚轮步进）。
