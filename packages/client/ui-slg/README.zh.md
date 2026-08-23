# @deepseek-ai/dsh-client-ui-slg · 内测 v0.2

[English](README.md) | 中文

把 DeepSeek Harness 的对话界面换成直播间风格。本包在框架的 `conversation` 槽位以遮蔽优先级注册，直接替换默认聊天线程（不新增标签页）；禁用本包即恢复默认聊天界面。

## 功能

- **直播画面**：主播卡片（头像、可自定义的主播名、直播中徽标、房间标题）+ `消耗 tok` 徽标 + 弹幕/礼物开关 + 模型切换（含思考强度）
- **立绘互动**：七张情绪立绘 + 六个隐形点触区，点击切换表情并送出反应台词
- **弹幕系统**：显示区域（顶部/中部/底部）、密度、不透明度、字体大小、速度、堆叠/不堆叠开关
- **礼物弹幕**：工具调用以「打赏」弹幕形式从右飘过，不再占用画面底部
- **对话记录**：Markdown 渲染、工具详情展开（参数 + 结果）、思考内容摘要（超长折叠、可展开）、自动滚底 + 回到底部按钮
- **说话条 + 输入条**：视觉小说式字幕与发送/停止
- **权限选择**：输入条上的访问模式选择按钮——读取与 composer chip 相同的 `permissions` 投影、走相同的 `/permission` 命令写入；Full access 需通过风险确认
- **审批与提问**：待审批的工具请求与向用户提问会在说话条上方接管显示，经运行时 carrier 以与 composer 链相同的线协议应答（提问优先于审批）
- **队列与插话**：运行中发送自动进入瞬态队列（每行可立即发送/移除）；Ctrl/Cmd+Enter 在普通会话上插话正在进行的回合
- **计划模式**：会话处于计划模式时输入条显示 `Plan ×` chip（读主机折叠的 `plan` 投影，含 pending 翻转），点击经 `/plan off` 退出；未组合 plan-mode 的部署不渲染
- **上下文占用环**：发送按钮旁的 14px 圆环，由 `contextPressure` 投影供数（分子优先取 `projectedTokens`，与 TUI 同样的整数取整与上限截断）；点击展开面板显示 token 数量与 `contextBreakdown` 的系统提示/工具定义/对话内容构成行
- **斜杠命令菜单**：输入条 `/` 按钮拉起当前会话的主机命令目录（`remote.commands.list`），可按名称过滤；带参数提示的命令回填草稿，裸命令直接执行；子会话或目录为空时入口禁用/隐藏
- **设置弹窗**：点头像或主播名打开，可改名并调节弹幕（跨重挂与刷新持久化）

## 安装

复制下面这句话，发给任何可用的 AI 助手，让它帮你安装：

> 请帮我把 `@deepseek-ai/dsh-client-ui-slg`（内测 v0.2，直播间风格对话界面）安装到我的 DeepSeek Harness Web 客户端：把本仓库源码放进 harness 的 `packages/client/ui-slg/`；运行 `pnpm install` 和 `pnpm --filter @deepseek-ai/dsh-client-ui-slg bundle`；再用 `pnpm dsh plugin --profile web add link:<packages/client/ui-slg 的绝对路径>` 把它装进 profile（本包自带 bundle 补丁层）；重启 dsh web 并硬刷新页面。之后按普通已安装插件管理：在「插件」面板开关（重启保留），卸载用 `pnpm dsh plugin --profile web remove @deepseek-ai/dsh-client-ui-slg`。

## 模型体验

无，因为此包只渲染既有会话数据并把用户输入转交给 conversation 服务；不触达模型请求，也不新增会话事件。

#### KV Cache 影响

无；本包不组装也不发送提供方请求。

## 已知限制与暂缓事项

- 七张立绘经绝对 URL（`/portraits/*.png`）从 Web 壳 public 目录加载。
- 替换 `conversation` 槽位会移除常驻输入区及其额外座位（计划、输入 dock 等）；直播间自带输入条，会话仍可发送。
