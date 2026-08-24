# @deepseek-ai/dsh-skill-conventional-commits

[English](README.md) | 中文

可选的 bundled 技能提供者，向 `ctx.skills` 贡献 `conventional-commits` 技能。该技能教代理按 [Conventional Commits](https://www.conventionalcommits.org/) 规范写 git 提交信息与 PR 标题——type/scope/subject 格式、祈使语气、以及 72 字符的主题长度上限。

该插件可通过插件管理器安装：其 `dsh.bundle.patch` 在 profile 的 `dsh.profile.bundles` 列出该包时（由 `dsh plugin --profile <name> add` 维护）加入一行 `skill-conventional-commits`。挂载插件即启用提供者；无配置项。

## Model Experience

间接通过 `@deepseek-ai/dsh-tool-skill` 渲染目录条目与所选技能正文。

#### KV Cache effect

该提供者在 provider KV 前缀的插入点新增一条目录条目，加载后新增一段技能正文。

## Known Limitations and Deferred Work

- 该提供者只贡献一个固定技能，无运行时定制。
