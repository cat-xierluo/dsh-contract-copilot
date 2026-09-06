# UPDATE-INDEX — 本次增量研究的元文件

> 给接手 agent 的读序指南 + 与原 6 份文件的关系图 + 是否需要在 CHECKLIST.md 增补。

## 0. 一次性回答

**这次研究新增 4 份专题文件 + 本索引**——全部为 REPORT.md / HANDOFF.md / SUMMARY.md 的**增量补全**，原文件**不需要修改**。建议接手 agent 按下面 §1 的顺序读这 4 份新文件，再回头看原 REPORT.md 会发现很多原本"为什么没提"的地方都有了答案。

## 1. 5 份新文件 + 1 份原文件补丁建议

```
/tmp/orca-supplementary/
├── ISSUE-LIFECYCLE.md       (L0 深挖：4 个 issue 模板 + labeler 实测 + 内部 autopilot)
├── PR-LIFECYCLE.md          (PR 端补充：concurrency + 分支保护盲区 + AI 二次回访 + 信任脚本)
├── RELEASE-GOVERNANCE.md    (发布治理：5 个 workflow 协作 + 版本算法 + 3 个 dev channel + tap 同步)
├── MAINTAINER-WORKFLOW.md   (维护者日常：CONTRIBUTING 合同源 + 6 类 triage bot + stale 建议)
└── UPDATE-INDEX.md          (本文件)
```

## 2. 读序建议

按 **"先把 orca 真实形态讲清楚、再讲怎么落地到你的仓库"** 的顺序读：

| 顺序 | 文件 | 读完能回答的问题 |
|---|---|---|
| 1 | `ISSUE-LIFECYCLE.md` | issue 表单的真实结构是什么？labeler 跑得怎么样？内部 agent 怎么自动化？ |
| 2 | `PR-LIFECYCLE.md` | concurrency 怎么自我修复？为什么 verify 矩阵那么重但实际可能是 advisory？AI 审查为什么重复出现？ |
| 3 | `RELEASE-GOVERNANCE.md` | release-cut 怎么决定版本号？release-policy 怎么拦截非法 release？dev channel 为什么必须独立仓库？homebrew tap 怎么同步？ |
| 4 | `MAINTAINER-WORKFLOW.md` | 维护者每天做什么？6 类 triage bot 是哪些？CONTRIBUTING.md 和 CI 怎么引用？folia/dsh 该装什么 bot？ |
| 5 | 本文件（`UPDATE-INDEX.md`） | 与原 6 份文件的关系图、是否需要补丁、读完之后怎么继续 |

读完这 5 份，再回去读原 REPORT.md §3（各层深度解析）会发现**每一节都有可扩展点**——本次研究把那些"REPORT.md 没说"的地方补齐了。

## 3. 与原 6 份文件的关系图

```
原 6 份文件（不改）：
  /Users/maoking/Desktop/orca-governance-adoption/
  ├── REPORT.md             ← 本次研究的最大互补方
  ├── HANDOFF.md            ← 路径不变
  ├── CHECKLIST.md          ← 需要在 Phase 1 增加 5 项（详见 §4）
  ├── SUMMARY.md            ← 不变
  ├── ADOPTION-folia.md     ← 需要小补丁（详见 §5.1）
  └── ADOPTION-dsh-contract-copilot.md  ← 需要小补丁（详见 §5.2）

新 4 份文件（不替代原 REPORT.md，而是补全）：
  /tmp/orca-supplementary/
  ├── ISSUE-LIFECYCLE.md     ← 补 REPORT.md §3.1
  ├── PR-LIFECYCLE.md        ← 补 REPORT.md §3.2 + §3.5 + §3.6
  ├── RELEASE-GOVERNANCE.md  ← 补 REPORT.md §3.5（PR 端）之外的所有 release 内容
  └── MAINTAINER-WORKFLOW.md ← 完全新增（REPORT.md 没碰）
```

**原 6 份文件的内容与本次新 4 份的内容不冲突**——所有新发现都是**"原文件提到但没展开"或"原文件完全没提"**。以新为准时不需要删旧内容，新内容独立成立。

## 4. CHECKLIST.md 是否需要补丁？

### 4.1 建议增补到 CHECKLIST.md 的 5 项（Phase 1 通用前置部分）

把以下 5 项加进 `CHECKLIST.md` "通用前置" 段（在原"确认 gh 已登录"等之后）：

```markdown
- [ ] 通用前置 §增补 A：装 GitHub 内置 `actions/stale`（见 `/tmp/orca-supplementary/MAINTAINER-WORKFLOW.md` §3.3 YAML）
- [ ] 通用前置 §增补 B：CONTRIBUTING.md 加 "Release 流程"段落（明确"贡献者不要提版本号"）
- [ ] 通用前置 §增补 C：PR 模板加 "Willing to maintain this after merge?"（作者维护意愿）
- [ ] 通用前置 §增补 D：仓库设置里勾选 `Allow squash merging` + `Automatically delete head branches`
- [ ] 通用前置 §增补 E：issue 至少加 3 个 severity label（P0/P1/P2），给维护者优先级视图
```

合计增量时间：~35 分钟（按 MAINTAINER-WORKFLOW.md 附录 B 估算）。

### 4.2 folia Phase 1 增补

```markdown
- [ ] folia §Phase 1 §增补 A：用 `/tmp/orca-supplementary/ISSUE-LIFECYCLE.md` §6.1 的最低成本版 issue 表单
- [ ] folia §Phase 1 §增补 B：装 `issue-labeler.yaml`（影响面 → severity 标签）
```

### 4.3 dsh Phase 1 增补

```markdown
- [ ] dsh §Phase 1 §增补 A：用 `/tmp/orca-supplementary/ISSUE-LIFECYCLE.md` §6.2 的"业务规则审核"模板
- [ ] dsh §Phase 1 §增补 B：bug_report.yml 加 `module` dropdown（让杨律师 CODEOWNERS 自动路由 + 模板字段双重定位）
```

### 4.4 Phase 2 / Phase 3 是否需要补丁？

**暂不补丁**——原 CHECKLIST.md 的 Phase 2 / Phase 3 内容已经覆盖 pr.yml + CodeRabbit + Pullfrog。本次研究在以下方面有新发现但**只影响决策细节、不改变 Phase 2/3 的总体方向**：

- Phase 2 加 pr.yml 时**必须显式把 verify 设为 required check**（见 PR-LIFECYCLE.md §3.3 的反例：orca 自己的 verify 实际是 advisory）；
- Phase 2 加 pr.yml 时**写权限 workflow 从 default branch 拉脚本**（见 PR-LIFECYCLE.md §6）；
- Phase 3 装 Pullfrog 时**在 PR 模板里显式说明"AI review 是 advisory"**（见 PR-LIFECYCLE.md §4.2）。

这些可以并入原 ADOPTION 文档作为小补丁。

## 5. ADOPTION-*.md 是否需要补丁？

### 5.1 ADOPTION-folia.md 的小补丁

在 Phase 1 之后、Phase 2 之前加一段：

```markdown
## 增补（基于 orca 二次深挖）

folia 私有仓库单用户，不需要 6 类 triage bot。但仍建议在 Phase 1 末增补：

- 装 `actions/stale` 防止 issue 沉底
- issue 表单用 ISSUE-LIFECYCLE.md §6.1 的最低成本版（影响面 dropdown）
- issue-labeler.yaml 把"影响面"映射成 `severity:P0/P1/P2/P3`
- 仓库设置：Allow squash merging + Automatically delete head branches

Phase 2 加 pr.yml 时务必：
- 把 verify 设为 required check（PR-LIFECYCLE.md §3.3 反例）
- 写权限 workflow 从 default branch 拉脚本（PR-LIFECYCLE.md §6）
```

### 5.2 ADOPTION-dsh-contract-copilot.md 的小补丁

在 Phase 1 之后、Phase 2 之前加一段：

```markdown
## 增补（基于 orca 二次深挖）

dsh 公有仓库 + 业务规则审核，建议在 Phase 1 末增补：

- bug_report.yml 加 `module` dropdown（合同主体 / 计划审核 / 字段抽取 / 其他）
- 这样 CODEOWNERS 自动路由到 @杨卫薪律师 + 模板字段让 reviewer 第一时间看到上下文
- ISSUE-LIFECYCLE.md §6.2 有完整 YAML

Phase 2 加 pr.yml 时务必：
- 把 verify 设为 required check
- 写权限 workflow 从 default branch 拉脚本
- 注意 dsh 是公有仓库，pullfrog for OSS 免费 + CodeRabbit 都可以装（见原 ADOPTION）
```

### 5.3 是否要修改 HANDOFF.md / SUMMARY.md？

**不需要**——这两份文件是给接手 agent 的"入口 + 一页纸"。本次新增 4 份文件应该被加入 HANDOFF.md 的"文件清单"段，但**不替换**现有的 6 份文件：

```markdown
## 文件清单（在原表后追加）

| 文件 | 用途 | 何时读 |
|---|---|---|
| `/tmp/orca-supplementary/ISSUE-LIFECYCLE.md` | issue 端深挖：4 表单 + labeler + autopilot | 想理解 issue 表单怎么机器消费时 |
| `/tmp/orca-supplementary/PR-LIFECYCLE.md` | PR 端补充：concurrency + verify advisory + AI 二次回访 | 想理解 PR 流水线怎么自我修复时 |
| `/tmp/orca-supplementary/RELEASE-GOVERNANCE.md` | 发布治理：5 workflow 协作 + dev channel + tap | 想做 release workflow 时 |
| `/tmp/orca-supplementary/MAINTAINER-WORKFLOW.md` | 维护者日常：CONTRIBUTING + 6 类 bot + stale | 想理解维护者每天做什么时 |
| `/tmp/orca-supplementary/UPDATE-INDEX.md` | 元文件：与原 6 份的关系 + 读序 | 读完上面 4 份后读 |
```

## 6. 本次研究的局限

- **分支保护不可见**：orca 的 main branch protection 在 org 级别，repo API 返回 404。本研究基于 PR #19030 实跑结果反推 verify 是 advisory check——但**未直接验证**。如需 100% 确认，需要 org admin 权限或 GitHub web UI。
- **release-cut.yml 读 800 行后部未覆盖**：文件 2253 行，本文读了前 1369 行。后续 884 行主要是 Windows 打包与 SignPath 集成——**对 folia / dsh 无借鉴价值**（两仓库都没有 Windows 打包 + 第三方签名），故未读。
- **issue 样本量有限**：只看了前 100 条 issue 的 label 分布。orca 实际 issue 数远超 100（PR 数 19044 反推 issue 数至少 10000+），`os:linux` 标签 0 出现只是样本偏差。
- **内部 autopilot 的 `/create-task` IT-NNNNN 编号系统未实测**：只是从 issue #18831 body 推断——IT 编号是 orca Cloud 内部 tracker，未公开 API。

## 7. 后续可继续深挖的方向（不在本次范围）

| 方向 | 价值 | 工作量 |
|---|---|---|
| 看 release-cut.yml 后 884 行 | 完整 release pipeline | 1 小时 |
| 看 orca Cloud 的 terraform workflow | 部署域治理 | 半天 |
| 跑 `gh api repos/stablyai/orca/pulls?state=closed&per_page=100` 看历史 PR | 真实 PR 寿命分布 + merge 时间 | 1 小时 |
| 抽样读 50 个 issue 看 labeler 命中率 | 验证 labeler 真实效果 | 2 小时 |
| 读 `docs/reference/` 26 篇 reference 全文 | 理解 orca 设计哲学 | 半天 |

## 8. 总结

**原 6 份文件是骨架，本次 4 份新文件是肉**。两者结合就是 orca 治理体系的完整图谱——L0（issue 表单 + labeler）→ L1（PR 模板）→ L2（CI 编排 + concurrency + verify 聚合）→ L3（双 AI 审查 + AI 二次回访）→ L4（CODEOWNERS 按域）→ L5（release governance 双工位）→ L6（维护者日常 + 6 类 triage bot）。

接手 agent 读完原 REPORT.md + 本次 4 份新文件 + 本索引，就有了：
1. orca 治理体系完整图谱
2. folia / dsh 各自的可执行落地清单
3. CHECKLIST.md / ADOPTION-*.md 的补丁清单

按 §4 的补丁清单执行 Phase 1（增补 35 分钟 + 原 30 分钟 / 1 小时），两仓库即可达到 orca 治理水平的一个最小可用版本。
