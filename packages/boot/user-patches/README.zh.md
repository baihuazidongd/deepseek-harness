# @deepseek-ai/dsh-user-patches

[English](README.md) | 中文

dsh 启动器交给它所启动应用的 user patch 层路径，以及把 loader 条目启用状态改动原子化持久化到 profile 自有层的行写入器。

这些路径与命令行一样属于启动器事实（见 [`dsh-cmdline`](../cmdline/README.md)）：应用插件无法推导自己的组合把哪些文件当作用户层，因此启动器在任何树条目挂载前调用 `provideUserPatchPaths` 写入宿主上下文，任意插件再读取冻结的 `ctx.userPatchPaths` 快照。未组合用户层的表面只是不提供它，依赖写入的消费者会大声失败，而不是猜测文件。

`upsertUserPatchRow` 让文件保持在 include 的 entry-list 方言里：以 `entryListSchema` 解析（因此 `!!js` 表达式标量得以保留），只替换目标行的 `disabled` 字段，其余行与字段原样往返；目标不存在时追加新的 `{ id, disabled }` 行；文件缺失视为空层；写入为原子操作（临时文件加改名，沿用 include 自己的 Windows 瞬态重试上限），启动期的 patch 监视器（[`dsh-app-boot`](../app-boot/README.md) 的 `watchUserPatches`）因此永远不会读到写了一半的层。存在但不是顶层 mapping 数组的文件属于配置错误，按启动读取方同样的严格性抛错。

## 模型体验

无，本包拥有启动器事实管道与纯文件写入器；这里不组装模型输入，也不注册模型可见表面。

#### KV Cache 影响

无；本包从不组装模型输入。

## 已知限制与暂缓事项

- **仅启用行** —— 写入器只 upsert 一条 `{ id, disabled }` 行；条目的添加/移除以及其它 patch 字段的写入仍是手工编辑。
- **整文件重排格式** —— 原子重写会规范化 YAML 格式（缩进与引号），即使行未被触碰；数组内的注释无法在首次程序化写入后保留。
