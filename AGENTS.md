# dsh-contract-copilot 项目协作指南

> **主从关系（2026-09-29 用户明确）**：dsh-plugins 仓库的 `plugins/dsh-contract-copilot` 目录是本插件的**唯一权威源**，所有修改在此进行；独立仓库 `cat-xierluo/dsh-contract-copilot` 只是 subtree 派发镜像（单向 `git subtree push` 同步），**禁止在镜像上直接修改**。同步规则与外部工具路径见 [接入说明](../../docs/CONTRACT-COPILOT.md)（镜像仓读者改看 https://github.com/cat-xierluo/dsh-plugins/blob/main/docs/CONTRACT-COPILOT.md ）；旧 polyrepo 相对路径先核对，不能直接执行。业务规则与任务仍在本目录；不授权恢复旧 Orca 波次、安装生产插件或自动合并候选。

本仓库按全局 AI 协作与文档协议（[~/.claude/CLAUDE.md] v4）维护。本文只规定本项目的具体边界与文档职责。

## 适用范围与优先级

- 本协议是默认规则。项目级 `AGENTS.md` / `CLAUDE.md` / `README` / Skill 说明或其他更具体规范优先。
- 本仓库代码涉及法律专业场景，**任何更新先看 `docs/DECISIONS.md` 与 `docs/2026-08-18-dsh-plugin-design.md`**。

## 文档职责

| 文档角色 | 位置 | 权威内容 |
|---|---|---|
| 项目说明 | `README.md` | 项目用途、安装、使用 |
| 项目协作规则 | `AGENTS.md`（`CLAUDE.md` 通过 `@AGENTS.md` 引用） | 本文件 |
| 路线图 | `docs/ROADMAP.md` | 愿景、阶段退出条件、依赖风险 |
| 当前任务源 | `status/TASKS.md` | 当前任务边界、状态、验收和执行证据 |
| 决策记录 | `docs/DECISIONS.md` | 真实发生过的取舍（Q1 起，编号连续） |
| 架构 | `docs/ARCHITECTURE.md` | 当前已实现的模块、边界、数据流 |
| 设计稿 | `docs/2026-08-18-dsh-plugin-design.md` | v0.2 设计稿（架构 + 测试映射 + e2e 记录） |
| 变更日志 | `CHANGELOG.md` | 已交付的 commit 历史（用户可见变化） |

## 工作原则

- 用户当前明确指令优先于文档队列；发现冲突时先说明，不静默改写任务目标。
- 设计稿（`docs/2026-08-18-dsh-plugin-design.md`）是事实层；新决策先写 `docs/DECISIONS.md`，不直接改设计稿的决策章节。
- Python 脚本一行不改（项目硬约束）；插件只做外壳。
- 任何已完成的提交都必须写到 `CHANGELOG.md`；涌现任务先登记到 `status/TASKS.md`，规模可控则一并处理。

## claude 会话跑测试的限定（TASK-2026-09-06-orca-gov-02）

- 2026-09-05/06 崩溃循环的负载来源是多 worktree 里 agent 会话并发跑全量 `pnpm test`（归因见 `status/TASKS.md` 卡 02 与 `docs/orca-governance-adoption/`）。
- claude/agent 会话验证代码跑单 spec：`pnpm vitest run tests/<name>.spec.ts`，或 `pnpm vitest run --bail 1` 早停；不要直接 `pnpm test` 跑全量。
- 全量套件只在与 CI 一致的受控场景执行（机器空闲、单 runner）；`NODE_OPTIONS=--max-old-space-size=2048` 堆顶是合约级护栏，任何场景不得移除。

## 重负载验证与 ORCA 进程树解耦（2026-09-10，5 次 worker OOM 后）

- 实测因果链：ORCA 终端树内的 vitest worker V8 OOM（2048 顶下 2.1GB old-space 累积）会**连带 Orca 主进程崩溃重启**（2026-09-09/10 共 5 次 runtime 切换，用户的自动化任务被中断）；agent 会话（claude/codex）跑在 ORCA 终端里时，其子进程全部在传染范围内。
- 规则：**全量 vitest、acceptance 脚本、启动 DSH/浏览器/本地模型的重验证，一律不在 ORCA 终端树内执行**。执行出口只有两个：① GitHub Actions 手动触发（`workflow_dispatch`，已有）；② 本地独立 Terminal.app（`osascript -e 'tell application "Terminal" to do script ...'` 或用户手开终端），保证进程树与 ORCA 无父子关系。
- ORCA 内的 worker/PM 验证继续走 scoped 单 spec + 2048 堆顶（`vitest.config.ts` 的 Q46 护栏，任何入口生效）；scoped 失败需要全量佐证时，按上条出口执行并回填证据。
- 子进程输出收集必须有上限（`python-bridge.ts` `OUTPUT_CAP_BYTES` 保尾模式）；新增 spawn 收集代码不得使用无上限 `+= chunk`。

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
2. 行为可验证：`pnpm run test` 全绿（当前基线 266/266）；e2e 涉及 API 时记录在 `CHANGELOG.md`
3. 文档同步：本次变化的真实影响写入对应文档（变更日志、决策）
4. 状态透明：剩余风险、未验证项在 `docs/ROADMAP.md` 或 `docs/DECISIONS.md` 标明
5. **发布门禁**：发布/声称完成前跑 `dsh-plugin-lint`（skill 位于 `../../legal-skills/skills/dsh-plugin-lint/`：`node ../../legal-skills/skills/dsh-plugin-lint/scripts/lint.mjs .` + 人工过其 SKILL.md §2–§5）；不采信自报 PASS

[~/.claude/CLAUDE.md]: /Users/maoking/.claude/CLAUDE.md
