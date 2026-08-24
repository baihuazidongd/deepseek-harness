# @deepseek-ai/dsh-client-ui-skills

[English](README.md) | 中文

「技能」页:侧边栏底部管理可发现技能的界面。浏览器插件注册一个 `sidebar.footer.action` 条目(id `skills`),打开全屏面板,列出每个可发现技能及其来源和启用开关,提供按名称/描述/提供者的搜索,以及可展开的明细块(描述、提供者、来源、已加载的正文)。读写走生成的 [`skillInventory`](../../host/skill-inventory/README.md) Remote:`list` 取快照、`setEnabled` 翻转开关(返回的快照为准)、`get` 取明细正文。宿主侧该翻转持久化进 `skill-enablement` settings 命名空间,且模型可见目录遵循它,因此被禁技能会同时离开本页和模型的可用技能列表。

## Model Experience

间接通过它写入的禁用集生效:`tool-skill` 从模型目录过滤被禁技能。本包不发请求、不渲染模型可见文本。

#### KV Cache effect

无;本包既不组装也不发送 provider 请求。

## Known Limitations and Deferred Work

- 每次打开或重试取一次快照——面板不订阅注册表变化。
- 明细正文在展开时懒加载,面板保持打开期间不刷新。
