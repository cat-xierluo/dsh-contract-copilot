# dsh-contract-copilot

把现有 `contract-copilot` skill（v1.6.3）改造为 [DeepSeek Harness] 插件。审查流程不变（SKILL.md §3.2 四步），把交互、产物落位、长程续接投影到 DSH harness 的工具链与持久层。

- 设计稿：`docs/2026-08-18-dsh-plugin-design.md`
- 原 skill：`legal-skills/skills/contract-copilot/SKILL.md`（**Python 一行不动**，插件只做外壳）
- 安装：`dsh plugin --profile lawyer add ./dsh-contract-copilot`
- 当前阶段：**v1 session-first 已交付，e2e 全链路跑通**；v2 插件 UI 方向已确认（DSH 原生 `client-modules` + `ui-slots`）

## 快速开始

```sh
# 在律师 profile 中安装本插件
dsh plugin --profile lawyer add ./dsh-contract-copilot

# profile 的 cordis.patch.yml 配置 skill 根目录（必填）
- id: contract-copilot
  config:
    skillRoot: /path/to/legal-skills/skills/contract-copilot
```

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

## License

CC-BY-NC-4.0 © 杨卫薪律师（微信 ywxlaw）

[DeepSeek Harness]: 参考项目/deepseek-harness/AGENTS.md