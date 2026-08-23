# Agent Note: 自主创建 goal

Status: implemented

[English](2026-08-16-goal-tool-autonomous-create.md) | 中文

## Problem

`create_goal` 只能在已经包含直接 `{ kind: 'user' }` 消息的运行时根 agent 轮次中运行。模型往往在已经深入工作之后——即处于 goal 轮或插件续作轮中——才意识到这是长期运行目标，而此时不存在直接人类消息，因此 `create_goal` 被以 `GOAL_TOOL_AUTHORITY_REQUIRED` 拒绝。长期任务因此从未建立 goal，同会话 goal 轮驱动器也无从续作。

## Decision

`create_goal` 不再要求直接人类输入。它现在只要求运行时根 agent，叠加每个 goal 工具本已强制执行的「活跃 agent、running 状态、driver initiator、开放轮次」检查。任意顶层轮次——直接人类请求、goal 轮或插件续作轮——都能自动创建 goal；活跃 subagent 仍被拒绝。`edit`、`pause` 和 `resume` 保留直接人类要求，`complete`/`blocked` 保留其既有的「直接人类或精确 goal 轮」权限。

`tool:goal` 策略指引与 `create_goal` 工具描述现在指示模型在识别到长期运行或多轮任务时立即自动创建 goal，而不再只是从直接人类请求推断意图。

## Consequences

- 根 agent 可在任意顶层轮次建立 goal，因此长期任务可以在中途建立 goal，随后由 goal 轮驱动器续作。
- create 的权限边界从「证明本轮存在人类消息」转变为「证明是顶层 agent」：插件注入轮不再是权限缺口，而 subagent 仍被排除在外。
- 固定 `tool:goal` 指引与 `create_goal` schema 的快照副件已重新生成，`docs/tool-catalog.md` 也已重新生成。

## Testing

`tool-goal` 单元测试现在固定了「插件来源的根轮次可以创建 goal，而无 agent、无 driver、活跃子 agent 的调用仍被拒绝」。既有的直接人类、goal 轮与终止权限测试保持不变。

## Alternatives considered

- **保留直接人类创建并只依赖首轮提示词** —— 拒绝：模型往往在人类轮次结束后才判断任务是长期任务，若不等待下一条人类消息便无法建立 goal。
- **同时放宽 `edit`、`pause` 和 `resume`** —— 拒绝：重定义、暂停或重新启用人类目标必须保持人类授权；报告中的缺口仅在 create 边界。
- **新增 driver 级自动检测，在轮次异常结束时创建 goal** —— 因风险更高且超出本次范围而拒绝；与既有「模型判断」设计一致，模型仍是判断「何为长期任务」的语义裁决者。
