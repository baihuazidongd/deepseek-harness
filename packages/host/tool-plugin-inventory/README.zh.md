# @deepseek-ai/dsh-tool-plugin-inventory

[English](README.md) | 中文

宿主插件清单 Remote 之上的模型可见 `plugin_inventory` 工具。

该工具向 agent 暴露两个操作：

- `list` —— 列出全部已配置的 Loader 条目，含条目 id、模块名、启用开关、fiber 生命周期阶段、来源分类（`native` / `library`），以及包声明的 description/version。
- `set_enabled` —— 按条目 id 翻转启用状态。变更对活的 Loader 树热生效，并持久写入所启动 profile 的用户补丁层（`cordis.patch.yml`），重启后仍然有效。

工具描述就是模型读到的使用说明：除两个操作外，它还写明镜像先行的安装流程 —— 把所启动 profile 的目录复制为 `$DSH_HOME/profiles/` 下的 `<name>-mirror`，通过 shell 执行 `dsh plugin --profile <name>-mirror add <package>` 并向镜像的 `cordis.patch.yml` 追加条目行，把镜像作为后台进程起在空闲端口（`dsh --profile <name>-mirror --port <port>`，同一 `DSH_HOME` 因此凭据可用），读其日志直到条目报告 `active`，分享镜像 URL 并等待用户批准后才在正式 profile 上重复安装+补丁（补丁监视器热应用）—— 以及如何对待 `failed` 条目。描述文本归本包所有并由包测试钉住，措辞变更须随测试一起落地。

服务本身留在宿主平面：浏览器 Remote（`dsh-host-plugin-inventory`）与工具调度读的是同一个实例，启用写入由该服务持有。preset 选择的只是它的 agent 是否拿到这个工具 —— 出厂 preset 在 `apps/cli/config/agent-presets/*/agent.cordis.yml` 挂载本行。

## 组合

```yaml
- id: tool-plugin-inventory
  name: '@deepseek-ai/dsh-tool-plugin-inventory'
```

需要宿主 `pluginInventory` 服务（web 组合在 `dsh-web-app` 中挂载）；没有该服务的组合里此行会等待而不是失败。

## Model Experience

### 工具 schema 与结果

#### 模型看到什么

生成的 [`plugin_inventory` schema](../../../docs/tool-catalog.md#deepseek-aidsh-tool-plugin-inventory)。两个操作都把刷新后的清单以紧凑 JSON 返回，而 schema 描述本身就是使用说明 —— 条目字段、翻转的热生效与持久化语义、镜像先行的安装流程、以及如何对待 `failed` 条目 —— 因此本包不注册任何 prompt section。

#### Token 开销

仅固定的 schema 成本；没有 prompt 注册。每次调用追加一个清单结果，大小随 Loader 树规模增长。

#### KV Cache 影响

schema 定义与可见性不变时前缀稳定；调用与结果追加在可复用的请求前缀之后，不会使更早的条目失效。

## Known Limitations and Deferred Work

- TUI（base bundle、非 preset）不挂载本工具；在那里暴露意味着在 base bundle 挂载宿主 `plugin-inventory` 行，本包刻意不做这个决定。
- 工具读不到 `failed` 条目的失败详情（Loader fiber 的错误尚未被清单 Remote 投影），模型能看到条目失败但看不到原因。
