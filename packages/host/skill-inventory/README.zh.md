# @deepseek-ai/dsh-host-skill-inventory

[English](README.md) | 中文

可发现技能的 Remote 投影,带逐技能启用。网关读取 `ctx.skills`,叠加持久化在 `skill-enablement` settings 命名空间里的用户禁用集,暴露 `list`(每个技能带 `enabled` 标志)、`get`(单个技能完整正文)、`setEnabled`(翻转单个技能)。该禁用集是模型可见技能目录与加载器共同遵循的唯一事实来源,因此被禁技能会同时离开这个管理界面和模型的可用技能列表。

## Model Experience

间接通过禁用集生效:`tool-skill` 会把被禁技能从模型目录、`skill` 工具和 `/name` 手势中过滤掉。本包本身不发请求、不产生模型可见文本。

#### KV Cache effect

本身无直接影响;开关会改变 `tool-skill` 目录发布的技能集合,从而改变该插件的 provider KV 前缀。

## Known Limitations and Deferred Work

- 逐技能启用是用户偏好;此处被禁的技能对任何绕过禁用集的消费者仍可发现。
