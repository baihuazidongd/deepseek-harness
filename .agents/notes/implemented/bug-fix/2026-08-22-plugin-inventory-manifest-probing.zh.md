# Agent Note: 插件清单改为探测方式解析包清单

Status: implemented

[English](2026-08-22-plugin-inventory-manifest-probing.md) | 中文

## Problem

`pluginInventory/list` 通过 `readPackageMetadata` 为每个非 group 的 Loader 条目补充元数据，即对每个条目同步调用一次 `require.resolve('<name>/package.json', { paths: [profileDir] })` —— 出厂 web profile 中约有 129 个条目。在 [tsx 源码启动](../architecture/2026-07-29-dsh-source-launch-tsx-esm.md)下，每次 `require.resolve` 都要走打了补丁的 TypeScript 感知 resolver，单个条目耗时数百毫秒（实测每条约 240 ms，整轮约 31 s；纯 Node 下整轮约 230 ms）。因此一次 `list()` 调用会把事件循环阻塞半分钟：Web 插件管理器一直停在"正在读取插件…"，其他所有 `/api` 请求都排在它后面。

## Decision

`dsh-host-plugin-inventory` 的 `readPackageMetadata` 不再调用 resolver。它从 `createRequire(<profileDir>/package.json).resolve.paths(moduleName)` 取得 require 查找路径 —— 纯路径计算，得到从 profile 目录出发的父级遍历 —— 然后读取第一个 `existsSync` 命中的 `<searchPath>/<moduleName>/package.json`。这条遍历同时到达 profile 自己的 `node_modules`（用户安装的库）与 loader 的 `profiles/node_modules` 平铺兜底（安装自带的包），因此解析结果不变：在 web profile 上实测，同样有 127/129 个条目解析成功，纯 Node 与 tsx 下都在几十毫秒内完成。

探测读取的是物理清单，因此元数据不再要求包导出 `./package.json` —— 与 `dsh-app-boot` 的 `packageDirFromAnchor` 解析 bundle 时依赖的性质相同。

## Alternatives considered

**按模块名缓存已解析的元数据。** 拒绝作为修复：每次服务器启动后的第一次 `list()` 仍会阻塞几十秒；只有再次打开插件管理器才能受益。

**在条目之间 await 以让出事件循环。** 拒绝：总耗时不变，快照还需要引入部分状态。成本在 resolver 调用本身，不在批处理方式。

**用构建后的 `lib/` 而非 tsx 启动服务器。** 拒绝作为此路径的修复：源码启动是受支持的契约，且任何其他同步调用 resolver 的代码都会踩到同样的停顿。

**复用 `dsh-app-boot` 的 `packageDirFromAnchor`。** 拒绝：为一个六行循环引入跨包依赖，且锚点契约不同 —— bundle 解析先试安装锚点，而清单元数据只从 profile 锚点解析。

## Consequences

在 tsx 源码启动下，插件管理器不再出现数秒级停顿；纯 Node 安装的解析结果保持不变。`exports` 映射未包含 `./package.json` 的包现在会显示声明的 description 与 version，而不再是 null；`./package.json` 的 `exports` 重定向被忽略，以物理文件为准。名字不是纯包标识符的条目 —— 如 `pkg/sub` 子路径工具、`cordis:` 内建 —— 仍然没有元数据。单元测试固定了 profile 本地解析、无 `./package.json` 导出的情形，以及子路径为 null。
