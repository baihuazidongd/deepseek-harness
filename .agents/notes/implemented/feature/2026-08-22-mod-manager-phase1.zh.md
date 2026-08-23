# Agent Note：模组管理器第一阶段 —— 侧边栏模组页与可持久的启用写入

状态：已实现

[English](2026-08-22-mod-manager-phase1.md) | 中文

## 问题

Loader 条目过去只能手工编辑 `cordis.patch.yml` 来切换：浏览器的插件列表标签页在设计上是只读的，仓库里也没有任何代码程序化地写入用户 patch 层。用户在设计一套模组管理工作流（镜像实例测试、晋升门禁、本体更新流程）时，首先需要管理基座：一个启用开关可持久、可热生效、并与组合的 patch 层语义保持一致的一级表面。

## 决策

三件事，各自落在既有 seam 上：

**`@deepseek-ai/dsh-user-patches`（新包，`packages/boot/user-patches`）** —— 启动器事实 `ctx.userPatchPaths`（两个用户层路径，冻结；由 `dsh profile-boot` 的 prepare 阶段与 `provideCmdline` 并列提供，因为只有启动器知道组合把哪些文件当作用户层），以及 `upsertUserPatchRow`，即用户 patch 层的首个程序化写入器。写入器以 include 的 `entryListSchema` 解析（因此 `!!js` 表达式标量可往返），只替换目标行的 `disabled` 字段，目标缺失则追加新行，文件缺失视为空层，存在但非法的文件按启动读取方同样的大声程度拒绝，并以原子方式写入（临时文件加改名，沿用 include 的 Windows 瞬态重试上限）。写入语义显式：`disabled: true` 与 `disabled: false` 都落盘（镜像 `loader.update`），绝不移除行 —— 因此后续 bundle 默认值永远不会静默夺回被切换过的条目。备选方案（启用即移除行、重新继承组合默认值，即 settings-file 的 reset 模式）被否决：它让开关的含义取决于下层 bundle 层，且无法表达"强制启用以覆盖 bundle 默认停用"。

**`pluginInventory/setEnabled`（`dsh-host-plugin-inventory` 上的新 Remote）** —— 先对照运行中的树校验条目 id，经写入器把显式行持久化到 profile 自有层，用 `loader.update` 应用同一状态，并返回刷新后的 `list()` 快照。三路重复应用（文件写入、直接 update、启动监视器重读）是幂等的：监视器从文件重新组合，文件与树因此收敛。未提供 `ctx.userPatchPaths` 的表面大声失败。包 README 中网关的描述从"只读投影"改为"带启用写入的投影"。

**`@deepseek-ai/dsh-client-ui-mods`（新包，`packages/client/ui-mods`）** —— 一个 `sidebar.footer.action` 列表 slot 注册（id `mods`）：设置旁的触发行（宽行 / 轨道圆形，设置外壳的节奏），打开全视口遮罩加对话框面板，含状态筛选 chips、搜索，以及每个非 group 条目一行的开关。`setEnabled` 返回的快照是权威（无乐观残留；被拒的写入升起面板级错误行）。已停用条目省略冗余的 Fiber 阶段播报（沿用模板标签页的约定）。本包刻意只做管理基座：路线图中的镜像测试阶梯、晋升门禁与本体更新流程是后续阶段，记录在其 README 的暂缓事项里。

配套接线：`dsh profile-boot` 提供路径；web bundle 的浏览器 roster 增加 `ui-mods` 行；fixture 传输层（`dsh-client-connection` 的 fixture world）以确定性的五条目清单和内存开关状态应答 `pluginInventory/list`/`setEnabled`，使组装快照通道可以无 key 地演练该页面。 同一 PR 把表面从模组改名为插件并扩展投影：`list` 现在把每个条目分类为 `native`（安装自带 bundle 提供的行）或 `library`（名字出现在 profile 清单的 dependencies 中；首版规则还会减去 bundle 名、把用户安装的 bundle 错归为原生，后经[分类修正](../bug-fix/2026-08-23-plugin-inventory-source-classification.md)改为只看依赖记录），并从 profile 目录解析包自身的 `package.json` 取声明的 `description` 与 `version`（包不可解析时为 null，与 `cordis:` 内建及非包说明符一致）。没有启动器的用户层事实时分类为 `null`（页面读作未知）、元数据保持 null；存在但非法的 profile 清单大声失败。页面新增第二组筛选（来源：全部/原生插件/库）与每行的可展开明细块（描述、版本、模块、loader 条目 id、分类）；内部包名与 slot id 保持 `mods`/`ui-mods` —— 改名只发生在文案层，id 不面向用户。

## 结果

- 浏览器开关从此可持久地改变 Host 组合：profile 自己的 `cordis.patch.yml` 携带显式 `{ id, disabled }` 行，运行中的树立即应用，状态在重启后保留。对该文件的手工编辑只在正常层序内高于后续开关 —— 写入行永远是该行的最新编辑。
- plugin-inventory Remote 不再只读；其网关描述、api-remotes 组合的措辞、以及 fixture 传输层（现已应答两个端点）随之改变。
- 侧边栏底部在设置旁多出第二个触发行；设置的"插件列表"标签页保持只读，因此启用状态的展示现在有两个表面（标签页的 loader 树检查视图与模组页的管理视图）—— 模组页是管理权威，标签页仍是检查视图。
- 不新增模型可见输入或会话事件：启用状态是 Host 面状态，开关对任何模型表面的影响由被启用或停用的插件自己负责。
- 清单 Remote 的 payload 增加了三个字段（`source`、`description`、`version`）；所有消费方夹具随之更新，组装 golden 现在钉住两组筛选与一个展开的明细块。

## 测试


- 包测试套件：`packages/boot/user-patches`（11）、`packages/host/plugin-inventory`（5）、`packages/client/ui-mods`（12）、`packages/client/connection` fixture（扩展），全部达到每文件 100% 覆盖率（写入器的改名重试路径带说明理由的 `v8 ignore`）。
- 组装 keyless 快照 `apps/web/tests/mods-page.snapshot.ts` 以构建产物经 AppWebEntry 对 fixture 传输层启动，从侧边栏触发行打开页面，钉住面板形状（`snapshots/mods-page/ui.expected.md`），并经 fixture Remote 翻转一个开关。

## 备选方案

**通过 Loader 自身的树回写（`entry.options.disabled = true; tree.write()`）** —— 那会持久化进 `prepareProfile` 每次启动都重写的一次性 profile 根 `cordis.yml`；持久状态必须活在 patch 层里。

**把写入口做成带 Config 声明路径的 Host 服务** —— profile patch 路径是启动器事实，不是部署配置；由插件猜测它违反配置错误大声失败的规则。

**扩展现有设置里的"插件列表"标签页而非侧边栏一级页面** —— 已确认的产品设计要把模组管理做成一级表面（后续有镜像状态、晋升门禁、更新）；标签页保留为只读清单视图。

## 后续

- 第二阶段：`dsh mirror` 命令族（可抛弃 profile + 独立 `DSH_HOME`、端口顺延；注意 `scrubbedParentEnv` 会剥离 `DSH_HOME`，镜像 spawn 必须显式传递）。
- 第三阶段：instance-control 能力 seam、测试阶梯（静态 → keyless snapshot → 真实会话 → 人工）、`promote` 命令、带 diff 渲染的会话审批卡。
- 第四阶段：本体更新流程，走同一道镜像阶梯。
