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
- **设置弹窗**：点头像或主播名打开，可改名并调节弹幕

## 安装

复制下面这句话，发给任何可用的 AI 助手，让它帮你安装：

> 请帮我把 `@deepseek-ai/dsh-client-ui-slg`（内测 v0.2，直播间风格对话界面）安装到我的 DeepSeek Harness Web 客户端：把本仓库源码放进 harness 的 `packages/client/ui-slg/`；在 `packages/bundle/web-app/cordis.patch.yml` 的 client 插件列表末尾注册 `- id: ui-slg`、`name: '@deepseek-ai/dsh-client-ui-slg'`；在 `packages/bundle/web-app/package.json` 增加依赖 `"@deepseek-ai/dsh-client-ui-slg": "workspace:^"`；然后运行 `pnpm install`、`pnpm --filter @deepseek-ai/dsh-client-ui-slg bundle`，重启 dsh web 并硬刷新页面。

## 模型体验

无。此包只渲染既有会话数据并把用户输入转交给 conversation 服务，不触达模型请求、也不新增会话事件。

## 已知限制

- 七张立绘经绝对 URL（`/portraits/*.png`）从 Web 壳 public 目录加载。
- 主播名与弹幕设置是本地会话状态，不跨会话持久化。
- 替换 `conversation` 槽位会移除常驻输入区及其额外座位（计划、输入 dock 等）；直播间自带输入条，会话仍可发送。
