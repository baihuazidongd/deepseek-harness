# Agent Note：`dsh mirror` —— 一次性镜像命令族

状态：已实现

[English](2026-08-23-mirror-command-family.md) | 中文

## 问题

`plugin_inventory` 工具已经向模型讲授了镜像优先的安装流程，但每一步都是 shell 手工活：复制 profile 目录（Windows 上是布满 junction 的 `node_modules`）、把启动进程放到后台、事后寻找并终止它。这个流程执行起来脆弱，也不留下任何可检视的东西 —— 没有记录 pid、端口或日志路径，一个崩溃的镜像循环可能泄漏进程和目录。

## 决策

启动器级 `dsh mirror` 子命令族（`apps/cli/src/mirror.ts`，从 `bin.ts` 与 `plugin` 并列分发）：

- **`create <name> --from <profile>`** —— 只复制组合文件（`package.json`、`pnpm-lock.yaml`、`pnpm-workspace.yaml`、`cordis.patch.yml`）；绝不复制 `node_modules`（pnpm junction 指向源树内部）。带依赖的清单在镜像里跑一次 `pnpm install`，从共享存储重链。写入 `.dsh-mirror.json`，即授权后续所有动词的状态记录。
- **`launch <name>`** —— 探测空闲端口（bind-0），以 `[...process.execArgv, process.argv[1], '--profile', <镜像>, '--port', <端口>]` 脱离式 spawn `node`，stdio 追加到 `.dsh-mirror.log`（re-exec 保留源码启动下 tsx 的 `--import` 加载器），记录 pid/端口/启动时间，并轮询 HTTP 直到实例应答（120 秒预算）。
- **`list` / `status <name>`** —— 扫描 `$DSH_HOME/profiles` 的状态记录；status 附带存活检查（`process.kill(pid, 0)`）与日志尾部。
- **`stop <name>`** —— 终止记录的进程树（Windows 用 `taskkill /PID /T /F`，其余平台 `SIGKILL`）并清空记录中的 pid/端口；已退出与从未启动的镜像是无操作。
- **`discard <name>`** —— 先停运行中的镜像，再删目录。状态记录就是授权：没有记录的目录是真实 profile，会被拒绝，因此 `discard` 永远不可能删掉用户的 profile。

`plugin_inventory` 工具描述现在改用 `dsh mirror` 动词（`create`/`launch`/`stop`/`discard`），不再描述手工 shell 流程；模型读到的指南与 CLI 是同一套流程，由工具的包测试钉住并重生成进工具目录。

spawn 与流走 `internals` 缝隙（`dsh-cmdline` 的模式），单元套件因此能在临时 `$DSH_HOME` 上用伪造子进程与伪造 `fetch` 驱动 create/list/status/stop/discard —— 测试里没有真实进程管理。

## 备选方案

**复制整个 profile 目录（工具最初的措辞）。** 否决：pnpm 的 `node_modules` junction 指向源树内部，逐字复制既庞大又错误；清单复制加存储重链更小且正确。

**每个镜像隔离的 `DSH_HOME`。** 本命令族否决（保留为更早阶段暂缓的加固项）：凭据与设置必须传给镜像，驱动方才能使用它；隔离已经由 profile 副本和端口顺延提供。

**经 `ctx.subprocess` 的宿主面进程管理。** 否决：镜像动词运行在任何树存在之前 —— 它们和 `dsh plugin` 一样是启动器关注点。

## 结果

- 镜像就是普通 profile 加一个状态文件：所有既有动词（`dsh plugin --profile <镜像> add ...`、patch 编辑、`dsh --profile <镜像>`）对它原样可用。
- 状态记录是尽力而为：主机重启会让记录的 pid 变孤儿（存活检查读作已死），`list` 显示 stopped；残留目录由 `discard` 清理。
- 空闲端口探测在关闭与使用之间存在与他人绑定的竞争；本地单用户使用接受该窗口。
- POSIX 的 `stop` 只对记录的 pid 发信号 —— web 实例的后代是运行时自有的子进程，随进程树终止；Windows 用全树 `taskkill`。

## 测试

`apps/cli/tests/mirror.spec.ts` 覆盖 create（复制集合、重链分发与失败、自复制/缺失/已存在拒绝）、list/status（空 home、stopped 行、日志尾部、非镜像拒绝）、launch（带加载器参数的 re-exec 形状、状态记录、HTTP 等待、早期退出、二次启动拒绝）、stop（树杀、已退出/未启动无操作、记录清空）、discard（拒绝真实 profile、先停后删）。`apps/cli/tests/args.spec.ts` 钉住子命令路由。完整生命周期也在真实 web profile 上手工走了一遍（create → 空闲端口启动且 HTTP 200 → list/status → stop → discard 后目录无残留）。
