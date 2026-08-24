# Agent Note: 技能与 MCP 演示插件对插件管理器做 dogfooding

Status: implemented

[English](2026-08-24-skill-mcp-demo-plugins.md) | 中文

## Problem

插件管理器 —— `dsh-host-plugin-inventory` 加上模型可见的 `plugin_inventory` 工具与 `dsh plugin`/`dsh mirror` CLI —— 此前只在客户端 bundle（ui-mods）上验证过。没有任何东西验证过 AI 实际如何安装与开关一个*宿主*插件，而宿主插件的安装路径（`dsh plugin add link:<path>`）与 Loader 条目形态（技能提供者或 MCP 桥接）都不同于客户端 bundle。

## Decision

两个演示插件，均可通过 `dsh plugin --profile <name> add link:<path>` 安装：

- `@deepseek-ai/dsh-skill-conventional-commits`（`packages/skill/skill-conventional-commits`）—— 一个在 `ctx.skills` 上注册的 bundled `SkillProvider`，带 `dsh.bundle.patch`，以便管理器把它作为 profile 层加入。
- `@deepseek-ai/dsh-mcp-everything`（`packages/mcp/mcp-everything`）—— 一个纯配置 bundle，其 `cordis.patch.yml` 插入一行 `mcp-client`，经 stdio 指向参考版 everything MCP 服务器。

## Alternatives considered

**技能改用文件系统 `SKILL.md` 而非 bundled provider。** 否决：文件系统技能对插件管理器不可见（它不是 Loader 条目），而这正是要暴露的发现之一 —— 两条技能路径有不同的管理表面。

**直接复用 `skill-badge`。** 否决：`skill-badge` 没有 `dsh.bundle.patch`，无法通过 `dsh plugin` 安装；演示需要一个真正可安装的 bundled provider。

## Consequences

dogfooding 暴露了这些实际问题；前三条已在同一次改动中修复：

1. `dsh plugin add link:<相对路径>` 若不带 `./` 前缀，不会锚定到调用目录 —— `anchorPathSpec` 只改写 `.`/`..` 路径。已修：`file:`/`link:` spec 现在无论是否带 `.` 前缀都相对调用目录锚定。
2. `dsh-plugin` 里 `spawnSync('pnpm', args, { shell: true })` 拼接参数时不转义，因此含空格的检出路径（本仓库的 `D:\DeepSeek Harness`）会把 link spec 拆开，安装以 `ERR_PNPM_SPEC_NOT_SUPPORTED_BY_ANY_RESOLVER` 失败。已修：锚定后的参数经 shell 拼接时加双引号。
3. 一旦产生坏链接，`reconcilePlugins` 会误报为「declares no dsh.bundle」—— 把解析失败与缺少 bundle 声明混为一谈。链接能解析后该误报自然消失。
4. bundled skill provider 若不额外加 `dsh.bundle.patch` 包装就无法通过 `dsh plugin` 安装；而以文件系统 `SKILL.md` 形式添加的技能完全不在插件管理器范围内。
5. MCP 服务器脚本 import `@modelcontextprotocol/sdk` 与 `zod`，纯配置 bundle 必须把它们声明为自己的 `dependencies`，spawn 出的 `node server/echo-server.mjs` 才能从 server 目录向上解析到它们 —— 提升到工作区根部的 node_modules 并不为其服务。
6. 纯配置 bundle 仍需要 `src/index.ts`（`export {}`）与 `src/invariant.ts`，工作区 tsdown 的 entry glob（`{index,invariant,startup}`）才至少有一个源文件可构建。

两个演示插件功能正常且可安装：技能提供者的注册测试通过，MCP 桥接 round-trip（`echo`/`add`/`now`）已端到端验证。两者均带双语 README；invariant 覆盖由共享的 `test-invariants` 拓扑套件承担。
