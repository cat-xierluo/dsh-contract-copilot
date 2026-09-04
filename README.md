# dsh-contract-copilot

把现有 `contract-copilot` skill（v1.6.3）改造为 [DeepSeek Harness] 插件。审查流程不变（SKILL.md §3.2 四步），把交互、产物落位、长程续接投影到 DSH 的工具链、持久层与内嵌工作台。

- 设计稿：`docs/2026-08-18-dsh-plugin-design.md`
- 原 skill：`legal-skills/skills/contract-copilot/SKILL.md`（**Python 一行不动**，插件只做外壳）
- 安装：`dsh plugin --profile lawyer add ./dsh-contract-copilot`
- 当前阶段：**v0.2 已适配 DSH 0.1.2-rc.1**；7 个 Agent tool 与 Python CLI 保持不变，工作台使用官方侧栏 slot 和 Connection 鉴权数据面

## 快速开始

```sh
# 在律师 profile 中安装本插件
dsh plugin --profile lawyer add ./dsh-contract-copilot

# profile 的 cordis.patch.yml 配置 skill 根目录（必填）
- id: contract-copilot
  config:
    skillRoot: /path/to/legal-skills/skills/contract-copilot
    workbench:
      enabled: true
```

启动 DSH Web 后，侧栏底部的“合同审查”入口会打开三栏工作台：左侧是审查队列，中间是 Word 修订视图，右侧是四阶段进度、确认表单、交付产物和最近操作记录。工作台所有 RPC、实时事件和 DOCX 下载都复用 DSH 的浏览器会话认证；headless profile 不加载界面，但 7 个工具照常工作。

## 项目协议

本仓库按全局 AGENTS.md（v4）维护协议文件：

| 文件 | 职责 |
|---|---|
| `README.md` | 项目说明、安装、使用 |
| `AGENTS.md`（`CLAUDE.md` symlink） | 项目协作规则 |
| `CHANGELOG.md` | 已交付的 commit 历史 |
| `docs/DECISIONS.md` | 真实发生过的取舍与影响 |
| `docs/ROADMAP.md` | 愿景、阶段退出条件、依赖风险 |
| `docs/ARCHITECTURE.md` | 当前已实现的模块、边界、数据流 |
| `docs/DSH-PLUGIN-REFERENCE.md` | **DSH 插件技术范式与参考文件索引**（开发其他 DSH 插件可复用） |
| `docs/2026-08-18-dsh-plugin-design.md` | v0.2 设计稿（含审计、e2e 记录、决策日志 Q1–Q28） |
| `docs/plans/2026-09-04-dsh-0.1.2-workbench-migration-design.md` | DSH 0.1.2 工作台迁移设计与验收边界 |

## 开发循环（本地 link 安装）

**插件代码不热加载**（2026-08-19 双向实测：node half 改 `lib/` 后长驻进程不重载 apply；client half 重建 bundle 后 `__DSH_BOOT__` rev 不重扫）。改代码后必须 `pnpm run build` + 重启 dsh。

macOS 免手动 build 的一行命令（fswatch）：

```sh
fswatch -o src/ | while read -r _; do pnpm run build; done
# 重启 dsh 仍需手动（另开终端）
```

只有 profile 的 `cordis.patch.yml`（配置层）是热重载的——调 skillRoot 等配置无需重启。

## License

CC-BY-NC-4.0 © 杨卫薪律师（微信 ywxlaw）

[DeepSeek Harness]: 参考项目/deepseek-harness/AGENTS.md
