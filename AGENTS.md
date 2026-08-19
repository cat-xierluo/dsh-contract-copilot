# dsh-contract-copilot 项目协作指南

本仓库按全局 AI 协作与文档协议（[~/.claude/CLAUDE.md] v4）维护。本文只规定本项目的具体边界与文档职责。

## 适用范围与优先级

- 本协议是默认规则。项目级 `AGENTS.md` / `CLAUDE.md` / `README` / Skill 说明或其他更具体规范优先。
- 本仓库代码涉及法律专业场景，**任何更新先看 `docs/DECISIONS.md` 与 `docs/2026-08-18-dsh-plugin-design.md`**。

## 文档职责

| 文档角色 | 位置 | 权威内容 |
|---|---|---|
| 项目说明 | `README.md` | 项目用途、安装、使用 |
| 项目协作规则 | `AGENTS.md`（`CLAUDE.md` symlink） | 本文件 |
| 路线图 | `docs/ROADMAP.md` | 愿景、阶段退出条件、依赖风险 |
| 决策记录 | `docs/DECISIONS.md` | 真实发生过的取舍（Q1 起，编号连续） |
| 架构 | `docs/ARCHITECTURE.md` | 当前已实现的模块、边界、数据流 |
| 设计稿 | `docs/2026-08-18-dsh-plugin-design.md` | v0.2 设计稿（架构 + 测试映射 + e2e 记录） |
| 变更日志 | `CHANGELOG.md` | 已交付的 commit 历史（用户可见变化） |

## 工作原则

- 用户当前明确指令优先于文档队列；发现冲突时先说明，不静默改写任务目标。
- 设计稿（`docs/2026-08-18-dsh-plugin-design.md`）是事实层；新决策先写 `docs/DECISIONS.md`，不直接改设计稿的决策章节。
- Python 脚本一行不改（项目硬约束）；插件只做外壳。
- 任何已完成的提交都必须写到 `CHANGELOG.md`；涌现任务先登记到 `status/TASKS.md`，规模可控则一并处理。

## 范围边界（v1）

- ✅ 审查流程（SKILL.md §3.2 四步 + §九 9.1–9.4 操作细则）
- ✅ 起草流程（§十）：v1 不 plugin 化
- ✅ §9.5 复核环节的专用 tool：不单独做，由 resume + analyze 组合覆盖

## 安全边界

- 不提交外部资料中受版权保护的命名（SKILL.md §十一 合规要求）
- 配置文件（`config/reviewer_profile.json`、`config/review_memory.json`）由 Python CLI 独占写入，插件只读
- 改动 Python 脚本需用户明确确认

## 完成标准

1. 结果完整：交付物符合当前任务目标
2. 行为可验证：`pnpm run test` 全绿（当前 66/66）；e2e 涉及 API 时记录在 `CHANGELOG.md`
3. 文档同步：本次变化的真实影响写入对应文档（变更日志、决策）
4. 状态透明：剩余风险、未验证项在 `docs/ROADMAP.md` 或 `docs/DECISIONS.md` 标明

[~/.claude/CLAUDE.md]: /Users/maoking/.claude/CLAUDE.md