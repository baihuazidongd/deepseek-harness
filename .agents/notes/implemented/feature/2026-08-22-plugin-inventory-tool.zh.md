# Agent Note: plugin_inventory，模型可见的插件管理器

Status: implemented

[English](2026-08-22-plugin-inventory-tool.md) | 中文

## 问题

插件管理器此前只有浏览器界面（`dsh-client-ui-mods` 读 `pluginInventory` Remote）。agent 没有任何模型可见的插件管理途径：没有列出已配置条目的工具，没有翻转条目启用的工具，模型读得到的任何地方也没有写明如何向 profile 安装新插件（`dsh plugin --profile <name> add <package>` 加上 profile `cordis.patch.yml` 里的条目行，补丁监视器热应用）。用户让 agent「禁用 lsp 插件」或「帮我装个插件」时，agent 只能从源码里自己摸索。

## 决策

新包 `@deepseek-ai/dsh-tool-plugin-inventory` 在 `ctx.tools` 上注册一个 `plugin_inventory` 工具，调度到既有宿主 `pluginInventory` 服务（`inject: ['tools', 'pluginInventory']`）：

- `operation: 'list' | 'set_enabled'`（写操作另带 `entryId`/`enabled`）；两者都以刷新后的清单作为 wire value 返回。
- 工具描述就是模型读到的使用说明：条目字段、翻转的热生效与持久化语义、镜像先行的安装流程，以及如何对待 `failed` 条目。描述文本由包测试钉住。
- 可空条目字段（`fiberPhase`、`source`、`description`、`version`）在输出 schema 里用 `oneOf` 分支表达，因为强制执行的 JSON Schema 子集把 `enum` 校验限定在单一标量类型上。

服务留在宿主平面（浏览器 Remote 读同一实例）。preset 选择的只是它的 agent 是否拿到工具：出厂 preset（`standard`、`code`、`cordis`）挂载本行，web 组合通过 `dsh-web-app` 的依赖解析包。出厂目录快照（`shipped-composition.e2e.ts`）加入 `plugin_inventory` 固定成员。

`pluginInventory` 的 Context 合并移到服务包（`dsh-host-plugin-inventory` 声明 `Context.pluginInventory`），遵循声明 Service Definition 拥有合并类型的惯例。

文档接线遵循仓库的生成目录规则：清单 payload 类型获得 subsystem 页（`docs/subsystems/plugins.md`，`type-equiv` 块登记在 `scripts/type-equiv.manifest.json`），`gen-cordis-catalog` 把 `pluginInventory` 服务映射到该页，`gen-tool-catalog` 带上工具行及其 Model Experience，`gen-doc-graphs` 为服务分类（`SERVICE_ROLES`，消费方 `tool-plugin-inventory` 与 `api-remotes`）；生成的目录页与图文档的中文侧同步维护。

## 镜像先行安装（最小闭环）

第一版描述是直接装进正式 profile 的。用户的完整设计（spawn 独立 home、顺延端口的镜像上测试，AI 驱动测试阶梯、报告页、审批卡、diff 审阅）被裁剪为仍然能在插件碰正式树之前证明它的最小闭环，全部写在工具描述里，因为 agent 本来就有 shell、文件编辑和本工具：

1. 把所启动 profile 的目录复制为 `$DSH_HOME/profiles/` 下的 `<name>-mirror`（shell 复制即可解析同一棵树）。
2. `dsh plugin --profile <name>-mirror add <package>`，再向镜像的 `cordis.patch.yml` 加 insert 块（`- insert:` 加 `- id:`/`name:` 对——裸的顶层条目行是对已有条目的覆盖，未知 id 会被跳过）。
3. 把镜像作为后台进程起在空闲端口：`dsh --profile <name>-mirror --port <port>`。刻意同一 `DSH_HOME`：独立 home 会丢凭据，agent 根本没法驱动镜像。隔离来自 profile 副本和端口，不来自 home。
4. 读镜像日志直到条目报告 `active`，把镜像 URL 告诉用户，等待批准。
5. 批准后在正式 profile 上重复安装+补丁（补丁监视器热应用，`list` 验证），然后停掉镜像进程；镜像 profile 用完即弃。

`dsh --profile <name> web` 不能用来起镜像：`web` 子命令写死 profile `web` 且拒绝父级 `--profile`，所以应用参数形式（`dsh --profile <name>-mirror --port <port>`）是唯一写法。从用户设计中暂缓、均不阻塞的：带健康检查集成的专用镜像工具、测试报告页、审批卡、patch-diff 审阅 UI。

## 考虑过的替代方案

- 用 prompt section 而非工具：能陈述事实但不能行动，且 prompt section 装不下清单本身（那是动态状态，模型可见的动态状态属于工具结果而不是重渲染的 prompt）。
- 不做工具，直接教 agent 用 fs/shell 编辑 `cordis.patch.yml`：今天也做得到，但没有工具的话 agent 没有廉价途径读到条目 id 和 fiber 阶段，而启用写入路径（loader 更新 + 持久化行）的语义需要靠裸编辑文件重新发现。

## 后果

- 出厂 preset 组合出的 agent 能列出并切换插件、知道安装流程；没有宿主服务的组合里该行保持等待（标准 Cordis inject 语义），不会失败。
- 模型可见指南的措辞变更必须在同一 PR 里带着测试变更（包测试钉住 `dsh plugin` 那一行）。
- TUI（base bundle、非 preset）尚未挂载本工具；要在那里加，意味着在 base bundle 挂载宿主 `plugin-inventory` 行，本次变更刻意不做这个决定。
