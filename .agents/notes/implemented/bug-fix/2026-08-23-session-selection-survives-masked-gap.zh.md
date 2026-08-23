# Agent Note: 会话选中在掩蔽间隙中保留

Status: implemented

[English](2026-08-23-session-selection-survives-masked-gap.md) | 中文

## Problem

`SessionRuntime` 把当前真实会话选中投影为 `list.current`，并同步写入浏览器持久化单元 `dsh.sessions.current`，以便刷新后重新打开同一会话。投影定义了「掩蔽间隙」：一个选中的 id 在重连、成员重取或组合重载期间暂时不在投影列表里时，会从 `current` 中消失，但仍保留在管理器的内存选中里，等 id 重新出现后再次浮出。持久化写入把这种间隙与显式清空混为一谈：只要 `current` 为 `undefined` 就写入 `{}` 清掉该单元。一次组合重载（如热生效的插件开关）若短暂掩蔽了当前会话，就会抹掉 `dsh.sessions.current`，下一次刷新便落到空白「新会话」——这正是「聊天记录不见了」的表象，尽管磁盘上的会话数据完好无损。

## Decision

`SessionManager` 以只读访问器 `get selectedId()` 暴露内存选中：它只在显式 `clearSelection()`（或尚未选中任何会话）之后为 `undefined`，而当 id 仅仅被掩蔽时仍保持设置。`SessionRuntime.projectList` 现在只在 `current === undefined` **且** `this.manager.selectedId === undefined`（即显式清空）时清除持久化单元。掩蔽间隙（`current === undefined` 但管理器仍持有该 id）则不动该单元，使 id 在同一会话和之后的刷新中都能重新浮出。

## Alternatives considered

**在选中之外另记一个显式 `wasCleared` 标志。** 否决：管理器的 `selected` 字段已精确编码这一事实（只有 `clearSelection()` 与构造会把它置为 `undefined`），再加一个标志就是需要同步维护的冗余生命周期状态。

**只在已知的临时窗口（重连、重取）内抑制清除。** 否决：任何投影变动都可能造成掩蔽，包括组合重载和宿主驱动的列表刷新；枚举窗口既脆弱，又会让同一缺陷经由未枚举的路径再次触发。

## Consequences

临时的掩蔽间隙不再抹除持久化选中，因此插件热生效或列表重取都不会把用户丢到空白会话上。显式清空（新建会话入口）仍会清除该单元，而从未选中的全新启动仍落在空白状态。保留的单元沿用既有对残留失效 id 的容忍：投影忽略不存在的 id，所以 `current` 仍为 `undefined`，UX 与清空一致，直到该 id 重新出现。新增的聚焦测试钉住掩蔽期间该单元得以保留及其重新浮出，与既有的「清空即清除」测试并列。
