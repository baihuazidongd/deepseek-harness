# Agent Note: 插件清单按组合 id 持久化启用状态

Status: implemented

[English](2026-08-23-plugin-inventory-persists-composition-id.md) | 中文

## Problem

`pluginInventory/setEnabled` 把开关写进 profile 的 `cordis.patch.yml` 时，用的是 `{ id: request.entryId, disabled }`，而 `entryId` 直接取自 `loader.entries()` 的 `entry.id`——那是 Loader 的*限定*运行时 id：在根 include 子树里，顶层条目 `demo-plugin` 会以 `include:demo-plugin` 暴露。启动时的补丁应用（`applyEntryPatches`）按配置文件声明的*非限定* id（`demo-plugin`）建立索引，因此写下的 `{ id: 'include:demo-plugin' }` 匹配不到任何条目，被跳过并告警。live 开关却仍然生效（同一个限定 id 正是 `loader.update` 要解析的），于是「关闭插件」看似成功，下次启动却悄悄恢复——正是「关了之后刷新还是开的」这一表象。

## Decision

`setEnabled` 按限定 id 解析目标条目，然后把补丁行以 `entry.options.id`（启动补丁应用所索引的非限定组合 id）持久化，live 的 `loader.update` 仍使用限定的 `request.entryId`。`list()` 仍返回限定的 `entry.id`，作为稳定、唯一的运行时身份供客户端回传。

## Alternatives considered

**由 `list()` 暴露非限定 id 并让客户端回传。** 否决：非限定 id 跨子树不唯一（两个 include 可以各声明一个 `demo-plugin`），无法安全地标识条目供 `loader.update` 使用；而持久化行又确实需要非限定 id——把一个身份拆成两个字段会把歧义推给调用方。

**从运行时 id 里剥掉 `include:` 前缀再持久化。** 否决：前缀是 include 条目自身的 id，还可能嵌套（`include:group:child`），字符串裁剪很脆弱；`entry.options.id` 已直接携带精确的非限定值，无需解析。

## Consequences

关闭插件现在能在刷新和重启后保持。持久化行使用组合 id，与 `dsh --dump-config` 及启动读取器所索引的 id 一致，因此手工编辑 `cordis.patch.yml` 与 UI 开关会收敛到同一行。回归测试通过根 include 挂载配置文件，钉住持久化行目标是 `demo-plugin` 而非 `include:demo-plugin`。
