# Agent Note：pluginInventory 把用户安装的 bundle 错分类为原生

Status: implemented

[English](2026-08-23-plugin-inventory-source-classification.md) | 中文

## 问题

`pluginInventory/list` 从启动的 profile 清单推导每个条目的 `source`。首版规则把用户安装记录读作 profile 的 `dependencies` **减去** `dsh.profile.bundles` 里的所有名字，理由是"对账器也会把 bundle 列为依赖，因此不得归为用户库"。这个理由混淆了两类 bundle：安装自带的模板 bundle（`@deepseek-ai/dsh-base`、`dsh-web-app`）从不进入 profile 依赖 —— `reconcilePlugins` 只为 `dsh plugin` 安装带入的包写依赖。用户安装的 bundle 因此同时出现在两个列表里，减法把它错归为 `native`：按文档化的 `dsh plugin add` 流程装一个个人 bundle，在「插件」管理面板里却显示在原生插件下，既违背面板自己的图例（`library` = 用户安装进 profile 的包），也不符合真实来源。

## Decision

`readProfileLibraryNames` 返回的恰是 profile 清单的 `dependencies`。成员关系本身就是用户安装记录：`dsh plugin` 装进 profile 的一切 —— 普通库与用户 bundle —— 都读作 `library`；依赖里没有的名字（模板 bundle、`cordis:` 内建、不可解析说明符）保持 `native`。该规则不需要知道条目由哪一层引入，因此不新增来源模型。

## 已考虑的替代方案

**只减去模板 bundle**（对照 `PROFILE_TEMPLATES`/`DEFAULT_PROFILE_BUNDLES`）。否决：这让 Host 包跨启动边界耦合启动器常量，对手改的清单仍是在猜；依赖记录才是唯一由写入方维护的事实。

**保留减法，让用户忽略标签。** 否决：面板就是"我装了什么"的产品表面；对文档化安装流程说谎的分类是缺陷，不是外观问题。

## 结果

- 用户安装的 bundle 现在显示在「库」下，并带包声明的描述与版本；停用/卸载行为不变（`setEnabled` 本就不分类别地写入 profile 用户层）。
- 把自带 bundle 显式加为依赖（`pnpm dsh plugin --profile <name> add @deepseek-ai/dsh-web-app`）会重分类为 `library` —— 可以接受，因为清单此时确实记录了一次用户操作。
- 测试：fixture 现在同时建模用户安装的 bundle（依赖 + 层）与模板 bundle（仅层），分别断言 `library` 与 `native`；旧的"bundle 即使成为依赖也保持 native"预期正是被测的缺陷，已删除。

## Testing

`packages/host/plugin-inventory/tests/inventory.spec.ts` 在同一 fixture profile 上覆盖全部三种来源形态：普通库 → `library`，用户安装的 bundle（依赖 + `dsh.profile.bundles`）→ `library`，模板 bundle（仅层）→ `native`，以及既有的不可解析/内建/子路径 native 与清单失败模式。
