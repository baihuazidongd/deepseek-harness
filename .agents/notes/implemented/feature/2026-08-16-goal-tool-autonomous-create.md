# Agent Note: Autonomous goal creation

Status: implemented

English | [中文](2026-08-16-goal-tool-autonomous-create.zh.md)

## Problem

`create_goal` could only run inside a turn that already contained a direct `{ kind: 'user' }` message on a runtime-root agent. The model frequently recognizes a long-running objective only after it is already deep in the work — inside a goal round or a plugin-continued turn — where no direct human message exists, so `create_goal` was rejected with `GOAL_TOOL_AUTHORITY_REQUIRED`. Long tasks therefore never established a goal, and the same-session goal-round driver had nothing to continue.

## Decision

`create_goal` no longer requires direct human input. It now requires only a runtime-root agent, on top of the live-agent, running-status, driver-initiator, and open-turn checks every goal tool already enforces. Any top-level turn — a direct human request, a goal round, or a plugin-continued turn — may create a goal automatically; live subagents remain rejected. `edit`, `pause`, and `resume` keep the direct-human requirement, and `complete`/`blocked` keep their existing direct-human or exact-goal-round authority.

The `tool:goal` policy guidance and the `create_goal` tool description now instruct the model to create a goal automatically as soon as it recognizes a long-running or multi-round task, rather than only inferring intent from a direct human request.

## Consequences

- A root agent can mint a goal in any top-level turn, so a long task can establish its goal mid-flight and then be continued by the goal-round driver.
- The create authority boundary shifts from "prove a human message this turn" to "prove a top-level agent": plugin-injected turns are no longer an authority gap, while subagents stay excluded.
- Snapshot sidecars pinning the `tool:goal` guidance and the `create_goal` schema were regenerated, and `docs/tool-catalog.md` was regenerated.

## Testing

`tool-goal` unit tests now pin that a plugin-sourced root turn can create a goal while agentless, driverless, and live-child calls remain rejected. The existing direct-human, goal-round, and terminal-authority tests are unchanged.

## Alternatives considered

- **Keep direct-human creation and rely on the first-turn prompt alone** — rejected: the model often decides a task is long only after the human turn has ended, leaving no way to establish the goal without waiting for another human message.
- **Also relax `edit`, `pause`, and `resume`** — rejected: redefining, pausing, or rearming a human objective must remain human-authorized; only the create boundary was the reported gap.
- **Add driver-level auto-detection that creates a goal when a turn ends abnormally** — rejected for this change as higher risk and out of scope; the model remains the semantic judge of what counts as a long task, matching the existing model-judgment design.
