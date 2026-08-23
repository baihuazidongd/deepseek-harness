# @deepseek-ai/dsh-client-ui-thinking-strength

[English](README.md) | 中文

思考强度插件（浏览器端部分）：在 composer 工具行 `conversation.input.right`（紧邻发送按钮左侧）放置一枚独立的思考强度 chip，打开后列出当前模型可选的推理（reasoning）强度档位，并通过 `ctx.modelDirectories` 持有的、与 `ui-model-selection` 的 composer 座位及 `/model` 弹窗相同的每会话 `ModelDirectory` 提交。Host 报告的 `ModelSelection` 仍是唯一的选择事实，因此这里切换的强度正是模型座位随后显示的值，反之亦然。

仅当普通会话的当前模型带有精确路由的推理元数据时，chip 才会渲染；没有档位的模型没有可选强度。触发器显示当前强度（或“默认”），菜单列出该模型由适配器提供的档位名称、描述与默认值。选择档位会通过 `session.selectModel` 提交完整选择；选择当前档位则直接关闭。被拒绝的选择会通过锚定在 composer 卡片上的共享瞬时 Toast 提示，并携带目录错误文本（如有）。共享目录的 store 以绑定的 `useDirectory` 框架 hook（保留的 inject `hooks` 槽位）到达组件，组件内部不持有任何订阅机制。

本插件不持有目录状态、不建立刷新链：load/select 动词、可用性与最新错误读取器都来自共享目录服务，按钮只跟随目录快照。被寻址的子代理会话不渲染 chip，其动词为空操作，因为那些 Agent 绑定的 RPC 会在直接父会话延续路径之外激活已持久化的历史。

## Model Experience

间接地，通过与 `ui-model-selection` 相同的 `session.selectModel` RPC，chip 提交完整的 `ModelSelection`（provider、model 及可选的 effort），由 Host 在下一个提示组装边界快照；正在运行的步骤保留其已组装的选择，菜单交互不增加任何提示内容。

#### KV Cache effect

切换强度可能改变同一路由后续请求的提供方侧缓存复用；提示词前缀本身不受影响。

## Known Limitations and Deferred Work

- **不支持任意强度输入** — chip 只提供精确模型由适配器公布的档位；没有推理元数据的适配器会隐藏该 chip。
- **依赖 `ui-model-selection`** — chip 读取共享的 `ctx.modelDirectories` 服务并共享其每会话目录，因此在缺少该包的组合中不存在。
