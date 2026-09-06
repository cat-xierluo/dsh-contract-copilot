# Handoff — orca 治理体系研究与落地产物交接

> **dsh 仓库入口声明（2026-09-06）：** 本目录 + 仓库 `status/TASKS.md` 顶部 5 张任务卡（`TASK-2026-09-06-orca-*`）= dsh 接受 orca 治理调研的完整入口。先读本文件，再按 `status/TASKS.md` 顺序领卡。

> 写给接手这个文件夹的 agent 与人。本文件是该文件夹的入口，先读本文件再读其他。

---

## 背景

2026-09-06，用户（开源贡献者，GitHub 账号 `cat-xierluo`）向 `stablyai/orca`（开源项目）提了 3 个 PR，亲历了 orca 的"机器人初筛 + AI 初审 + 人类终审"流水线，希望把这套治理方法搬到自己两个仓库（`folia` 私有、`dsh-contract-copilot` 公有）。本文件夹是这项研究的最终落地产物。

研究分两轮：

- **第一轮**（6 份文件）——架构 + 落地方案
- **第二轮**（5 份文件，本次）——深度补全：issue 端、PR 端并发治理、release 治理、维护者工作流

**不要从头读起**：先看 `SUMMARY.md`（一页纸），再看 `CHECKLIST.md`（施工单），按需深读其他文件。

---

## 文件清单（按读顺序）

| # | 文件 | 用途 | 何时读 |
|---|---|---|---|
| 1 | **`SUMMARY.md`** | 一页纸：orca 模式精髓 + 两仓库 Phase 1 清单 + 风险边界 | **第一份读** |
| 2 | **`CHECKLIST.md`** | 施工单：每项打勾，含完整命令 | **照单施工时** |
| 3 | `REPORT.md` | orca 治理第一轮深挖（架构图 + 设计原理 + 用户 PR 实证） | 想理解"为什么这样做"时 |
| 4 | `ADOPTION-folia.md` | folia 三阶段路线 + Phase 1 完整文件全文 | 在 folia 落地时 |
| 5 | `ADOPTION-dsh-contract-copilot.md` | dsh 三阶段路线 + Phase 1 完整文件全文 + CI 堆上限（合约级） | 在 dsh 落地时 |
| 6 | `ISSUE-LIFECYCLE.md` | 第二轮深挖：issue 模板全集 + labeler 实测 + 内部 autopilot + 最低成本版模板可立即抄 | 准备 issue 表单时 |
| 7 | `PR-LIFECYCLE.md` | 第二轮深挖：concurrency 自我修复 + verify 是否 advisory 的反直觉设计 + AI 审查为什么重复出现 | Phase 2 加 pr.yml 时必读 |
| 8 | `RELEASE-GOVERNANCE.md` | 第二轮深挖：release-cut 怎么决定版本号 + 3 道安全门 + dev channel 为什么必须独立仓库 + homebrew tap 同步 | 准备发版时 |
| 9 | `MAINTAINER-WORKFLOW.md` | 第二轮深挖：6 类 triage bot + CONTRIBUTING 合同源 + stale 建议 + 信任分级 | 维护者日常 + Phase 1 通用增补时 |
| 10 | `UPDATE-INDEX.md` | 第二轮元文件：5 份新文件与原 6 份的关系图 + 读序 + CHECKLIST 补丁建议 | 读完第二轮新文件后看 |

---

## 关键引用与背景材料（不在本文件夹，但上下文必备）

| 引用 | 用途 | 位置 |
|---|---|---|
| orca 模板原文 | 直接借鉴段落锚点 | `~/Library/Application Support/maoscripts/参考项目/orca/.github/pull_request_template.md` |
| orca CODEOWNERS | 按域声明的范例 | `~/Library/Application Support/maoscripts/参考项目/orca/.github/CODEOWNERS` |
| orca pullfrog workflow | AI reviewer 接入模板 | `~/Library/Application Support/maoscripts/参考项目/orca/.github/workflows/pullfrog.yml` |
| orca issue 模板全集 | 抄最低成本版 | `~/Library/Application Support/maoscripts/参考项目/orca/.github/ISSUE_TEMPLATE/*.yml` |
| orca stale workflow 范例 | 抄 `.github/workflows/stale.yml` | `~/Library/Application Support/maoscripts/参考项目/orca/.github/workflows/stale.yml`（如有） |
| 用户三个 PR | orca 实际审查行为的实证 | `stablyai/orca#19030` / `#19031` / `#19033` |
| 用户现有 PR 模板（folia） | 现状基线 | `~/Library/Application Support/maoscripts/folia/.github/PULL_REQUEST_TEMPLATE.md` |

---

## 谁在协作

| 角色 | 仓库 | GitHub 账号 | 是否中文账号 | 备注 |
|---|---|---|---|---|
| 主维护者 | folia / dsh | `cat-xierluo` | 否 | 用户本人 |
| 第二活跃 | folia | `@杨卫薪律师` | **是** | 96 commits，业务规则相关，CODEOWNERS 用中文名 |
| 业务规则审核 | dsh | `@杨卫薪律师` | **是** | 1 commit，但具备审核资格 |
| 备 | folia | `xierluo` | 否 | 9 commits |

---

## 落地三阶段全景

| 阶段 | folia | dsh | 目标 |
|---|---|---|---|
| **Phase 1** | 30 分钟（模板 + CODEOWNERS + 强制表单 + stale + issue 模板 + 影响面 labeler） | 1 小时（模板 + CODEOWNERS + CI baseline + 业务规则审核模板 + module dropdown） | 入口可机读 + 路由到位 + 不沉底 |
| **Phase 2** | 半天（路径感知 PR workflow + verify **required** check + 分支保护） | 半天（docs-only 跳过 + 测试密度评论 + verify required） | 流程编排 + 跳过贵 job |
| **Phase 3** | 1 天（CodeRabbit → Pullfrog/自托管） | 1 天（**优先**：pullfrog for OSS 免费 + CodeRabbit） | AI 审查层 |

每个仓库的完整 Phase 内容见各自 `ADOPTION-*.md`。`CHECKLIST.md` 是合并版施工单。**Phase 1 已包含第二轮研究的全部增补**（stale / CONTRIBUTING / 维护意愿 / 仓库设置 / severity label / 业务规则模板 / module dropdown）。

---

## agent 怎么读这份产物

如果你是被派去落地的 agent，按这个顺序读：

1. **读 `SUMMARY.md`**（4KB，1 分钟）— 掌握全景；
2. **读 `CHECKLIST.md`** 第一节"通用前置"和对应仓库的 Phase 1 章节（5 分钟）— 知道今天要做什么；
3. **按 `CHECKLIST.md` Phase 1 逐项施工**：每项完成后回到该文件把 `[ ]` 改成 `[x]`，必要时在 PR 链接处填入 `gh pr create` 的输出；
4. **遇到"为什么"问题**：去 `REPORT.md` 找第一轮原理与实证；去 `PR-LIFECYCLE.md` / `RELEASE-GOVERNANCE.md` / `MAINTAINER-WORKFLOW.md` 找第二轮具体机制；
5. **遇到"具体怎么写"问题**：去对应 `ADOPTION-*.md` 的 Phase 章节找全文（如 PR 模板、CODEOWNERS、CI workflow、stale workflow、issue 表单都有可直接复制粘贴的完整内容）；
6. **Phase 2/3 不在今天任务内**：除非用户显式要求，否则停在 Phase 1。

**不要做的事**：

- 不要修改 `REPORT.md` 的实证与原理分析——那是对 orca 体系的客观记录，是后续 Phase 决策的依据；
- 不要在没问用户的情况下给 folia 装 CodeRabbit——私有仓库，pullfrog for OSS 不适用，得先和用户对齐方案（参见 `ADOPTION-folia.md` §3.1）；
- 不要忘记把 `NODE_OPTIONS=--max-old-space-size=2048` 写进 dsh 的 CI workflow——这是有真实事故背景的，必须保留（参见 `ADOPTION-dsh-contract-copilot.md` §1.3）；
- **新增警示（第二轮）**：Phase 2 加 pr.yml 时**必须显式把 verify 设为 required check**——orca 自己的 verify 实际可能是 advisory，不显式设置就拦不住 PR（详见 `PR-LIFECYCLE.md` §3.3）；
- **新增警示（第二轮）**：装 Pullfrog / CodeRabbit 后**在 PR 模板里显式说明"AI review 是 advisory"**——避免贡献者误以为 AI 审过就一定能合（详见 `PR-LIFECYCLE.md` §4.2）；
- **新增警示（第二轮）**：装 stale workflow 前**先决定"哪些 label 永不 stale"**（如 `severity:P0`、`bug`、assigned），否则会误关 in-flight bug 修复（详见 `MAINTAINER-WORKFLOW.md` §3.3）。

---

## 已知风险与边界（务必看）

- **CODEOWNERS 用中文 GitHub username 合法但需协作者身份**：必须先确认杨律师账号在仓库 Settings → Collaborators 里，否则不会触发 review request；
- **folia 是私有仓库**：pullfrog for OSS 免费计划不适用；Phase 3 需付费或自托管；
- **dsh 的 CI 堆上限**：与本机一致（详见 README `dec-...` 决策），是合约级必须保留的；
- **CODEOWNERS 的兜底 `* @maoking`**：保留它防止漏路径导致 review request 缺失；
- **verify 必须显式设为 required check**：orca 的 verify 是 advisory，不要照搬；
- **Phase 2/3 在 Phase 1 验证 1 周后再做**：避免过度配置。

---

## 完整材料（4 个 PR + 11 个文件）

```
~/Library/Application Support/maoscripts/参考项目/orca/        ← 已克隆的上游 main 快照
├── .github/
│   ├── pull_request_template.md                                  (L1 模板原文)
│   ├── CODEOWNERS                                                (L4 路由)
│   ├── ISSUE_TEMPLATE/                                           (L0 表单全集)
│   └── workflows/
│       ├── pullfrog.yml                                          (L3 pullfrog agent 接入)
│       ├── track-community-prs.yaml                               (L2 流程登记)
│       ├── pr.yml                                                 (L2 路径感知门禁)
│       ├── issue-os-labeler.yaml                                  (L0 自动标签)
│       └── ... (其余 60+ 个 workflows)
└── CLAUDE.md / AGENTS.md / README.md

~/Desktop/orca-governance-adoption/                                ← 本文件夹
├── HANDOFF.md           (本文件)
├── SUMMARY.md           (一页纸 · 第一轮)
├── CHECKLIST.md         (施工单 · 合并两轮补丁)
├── REPORT.md            (架构解析 · 第一轮)
├── ISSUE-LIFECYCLE.md   (issue 端深挖 · 第二轮)
├── PR-LIFECYCLE.md      (PR 端深挖 · 第二轮)
├── RELEASE-GOVERNANCE.md (发布治理 · 第二轮)
├── MAINTAINER-WORKFLOW.md (维护者日常 · 第二轮)
├── UPDATE-INDEX.md      (第二轮元文件 · 读序指南)
├── ADOPTION-folia.md
└── ADOPTION-dsh-contract-copilot.md
```

---

## 当前会话遗留（agent 接手时记得看）

- vitest 全套件后台运行中（taskpolicy -c background），load 已回落，零新崩溃报告；
- orca PR #19030 / #19033 全绿 MERGEABLE 等人审；#19031 draft；
- dsh 内存根因未定位到单文件，但堆顶防护已生效（59 秒速死而非 107 秒爬满 4GB），会话侧限并发是根治方向。
