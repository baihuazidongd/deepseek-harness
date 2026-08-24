# @deepseek-ai/dsh-skill-conventional-commits

English | [中文](README.zh.md)

Optional bundled skill provider that contributes `conventional-commits` to `ctx.skills`. The skill instructs the agent to write git commit messages and pull-request titles following the [Conventional Commits](https://www.conventionalcommits.org/) specification — type/scope/subject format, imperative mood, and the 72-character subject limit.

The plugin is installable through the plugin manager: its `dsh.bundle.patch` adds a `skill-conventional-commits` row when a profile lists the package in `dsh.profile.bundles` (`dsh plugin --profile <name> add` maintains that list). Mounting the plugin enables the provider; it has no configuration.

## Model Experience

Indirectly, through `@deepseek-ai/dsh-tool-skill`, which renders the catalog entry and the selected skill body.

#### KV Cache effect

The provider adds one catalog entry and, when loaded, one skill body at their insertion points in the provider KV prefix.

## Known Limitations and Deferred Work

- The provider contributes one fixed skill and has no runtime customization.
