# dsh-contract-copilot

把现有 `contract-copilot` skill（v1.6.3）改造为 [DeepSeek Harness] 插件。审查流程不变（SKILL.md §3.2 四步），把交互、产物落位、长程续接投影到 DSH 的工具链、持久层与内嵌工作台。

- 设计稿：`docs/2026-08-18-dsh-plugin-design.md`
- 原 skill：`legal-skills/skills/contract-copilot/SKILL.md`（**Python 一行不动**，插件只做外壳）
- 安装：`dsh plugin --profile lawyer add ./dsh-contract-copilot`
- 当前阶段：**v0.3.1 工作台体验收口正在进行最终合并门复核**；7 个 Agent tool 与 Python CLI 保持不变，工作台可直接驱动案件专属 Agent，在修订前执行逐 finding 律师批准，并支持明暗主题、窄屏操作和 Word/简版批注双向定位

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
      analysisContractTextMaxChars: 40000
```

启动 DSH Web 后，侧栏底部的“合同审查”入口会打开三栏工作台：左侧是审查队列，中间是 Word 修订视图，右侧是“前置信息 → 风险分析 → 律师决策 → 修订交付 → 完成”五阶段进度。律师可逐项选择按建议处理、仅批注、仅意见书或忽略，调整风险等级、填写内部备注，再批准方案并让同一 Agent 继续交付。工作台专属 Agent 不要求 Web profile 开放通用文件或 skill 工具：Host 在分析派发前提取本地 DOCX 正文，并把有界正文和最小审查指导作为数据注入分析回合；`analysisContractTextMaxChars` 默认 40000，可在 1000–200000 之间配置。工作台所有 RPC、实时事件和 DOCX 下载都复用 DSH 的浏览器会话认证；headless profile 不加载界面，但 7 个工具及批准门仍照常工作。

## 为什么选择 DSH 工作台

DSH 同时提供可观察的 Agent 生命周期、持久 Session、命名 Tool 调用和状态事件，使插件能够在一次完整审查内部设置暂停、确认、取消、重试和恢复点，而不必把全部交互压缩成一轮轮聊天。Contract Copilot 将这些运行信号投影为可持久化、可操作、可审计的案件状态；这不表示展示模型的隐藏思维链。具体职责映射和边界见 [`docs/ARCHITECTURE.md` §2.1](docs/ARCHITECTURE.md#21-工作台交互粒度的来源)及 [`docs/DECISIONS.md` Q40](docs/DECISIONS.md#q40dsh-可观察运行面支撑工作台交互粒度2026-09-04)。

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
| `docs/acceptance/2026-09-04-dsh-0.1.2-workbench.md` | DSH 0.1.2 候选构建、安全与浏览器验收证据 |
| `docs/plans/2026-09-04-lawyer-decision-workbench-design.md` | v0.3 专属 Agent、律师决策门与逐 finding 交互设计 |
| `docs/acceptance/2026-09-04-lawyer-decision-workbench.md` | v0.3 候选绑定、完整链路、重启恢复与正式插件审查证据 |
| `docs/acceptance/2026-09-05-workbench-ux-hardening.md` | v0.3.1 明暗主题、窄屏、焦点与批注双向导航验收证据 |
| `status/TASKS.md` | 当前执行任务、范围、验收条件与证据 |

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
