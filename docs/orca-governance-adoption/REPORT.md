# stablyai/orca PR 治理与分层审查体系研究报告

> 调研日期：2026-09-06。材料来源：本地克隆的 orca 仓库 `/Users/maoking/Library/Application Support/maoscripts/参考项目/orca`（上游 main 快照，未 fetch），GitHub API 只读查询（issue #18831、PR #19030/#19031/#19033 及其 check runs / reviews / comments）。全程只读，未修改任何仓库。

---

## 0. 一句话总览

orca 用一条 **"结构化入口 → 机读模板 → 流程编排 CI → 双 AI 交叉审查 → CODEOWNERS 人类终审"** 的流水线，把海量外部 PR 的初审成本从人类移到机器与 AI，人类只处理机器无法判定或出现分歧的残差。

---

## 1. 分层架构图（文字版）

```text
┌─────────────────────────────────────────────────────────────────────────┐
│ L0 结构化入口（issue 侧）                                                │
│   .github/ISSUE_TEMPLATE/{bug_report,feature_request,other}.yml          │
│   config.yml: blank_issues_enabled: false  → 逼所有人走表单               │
│   输出：带 "### Operating system" 等固定锚点标题的 issue body             │
│   机器人：issue-os-labeler.yaml（issues: opened/edited/reopened）         │
│     判定依据：正则 ^### Operating system\s+(.+)$m 解析表单生成体           │
│     输出物：os:macos / os:Windows / os:linux 标签（幂等 setLabels）       │
│     失败后果：无匹配字段 → 跳过并打日志，不阻塞                            │
├─────────────────────────────────────────────────────────────────────────┤
│ L1 机读 PR 模板（pull_request_template.md）                              │
│   锚点段落：ELI5 / What Changed / Why / Linked Issue / Visual Proof /     │
│   Testing(checkbox) / AI Disclosure / Review / Agent skill upstream       │
│   boundary(checkbox) / Notes / Checklist(6 项 checkbox)                   │
│   硬规则：Linked Issue 注释 "there should ALWAYS be one"；UI 变更必须      │
│   附 BEFORE/AFTER，否则写 "N/A" + 理由                                    │
├─────────────────────────────────────────────────────────────────────────┤
│ L2 流程编排层（GitHub Actions，每个 workflow 职责单一）                    │
│   ① track-community-prs.yaml  分流登记                                    │
│      触发：pull_request_target [opened, reopened, ready_for_review]       │
│      判定：作者 ∈ {github-actions[bot], dependabot[bot]} → skip；          │
│            作者 ∈ org team stably-eng（active 成员）→ skip（内部 PR）      │
│      输出物：社区 PR 加入 Project 13（用 bufo-bot App token，app-id        │
│            2590194；workflow_dispatch + pr_number 支持补录）               │
│      失败后果：不阻塞 PR，只影响登记                                       │
│      安全设计：pull_request_target 但只做元数据操作，不 checkout PR 代码    │
│   ② pr.yml "PR Checks"  路径感知的确定性门禁矩阵                           │
│      触发：pull_request [opened, synchronize, reopened, ready_for_review] │
│      第一个 job code_paths：detect code-relevant changes，对 merge-base    │
│      diff 做路径分类（checkout 用 fetch-depth: 0 + filter: blob:none 省    │
│      流量），输出 15 个布尔开关驱动下游                                    │
│      下游按需 fan-out（needs + if 组合）：                                 │
│        static_analysis / root_directory_guard / typecheck /               │
│        git_compatibility / codex_index_heal_contract / xterm_patch_sync / │
│        shell_contracts / test(+native cache) / orcad_browser /            │
│        cross-version-wire / managed_hook_node18 / package /               │
│        package_windows / e2e-paths→e2e / terminal_ime_native              │
│      终点：verify 聚合 job（见 §3.5）——required check 的单点收敛           │
│      docs-only PR：verify 打印 "Docs-only change; expensive PR checks     │
│      skipped." 后通过，贵 job 全部 skipped                                 │
│   ③ pr-test-loc.yml  测试密度度量（review 信号，非门禁）                    │
│      统计 test vs non-test LoC 并更新 PR；安全设计：持写权限 GITHUB_TOKEN  │
│      的 job **从 default branch 拉脚本**（Files API），绝不执行 PR head    │
│      里的代码——"A PR that edits these scripts takes effect once merged."  │
│   ④ e2e.yml  可复用 E2E（workflow_call + workflow_dispatch + schedule      │
│      cron）——被 pr.yml 复用，也每天定时跑 main 兜底                        │
│   ⑤ docs.yml  文档站：PR 只做无凭证 build check（fork 也跑），生产部署      │
│      只在 release published 时由 release_gate 把关                         │
├─────────────────────────────────────────────────────────────────────────┤
│ L3 双 AI 审查层（互补，同一 PR 并发）                                      │
│   CodeRabbit（coderabbitai[bot]，SaaS App）——规则/门禁型                   │
│     触发：App 安装后自动（opened/synchronize）                             │
│     判定依据：模板段落名、Linked Issue、diff 内函数 docstring 覆盖率、      │
│     代码规则库（Review profile: CHILL）                                    │
│     输出物（PR 内 2 类实体）：                                             │
│       a. 总结评论：📝 Walkthrough + **Merge Risk 🟡 Moderate** +           │
│          🚥 Pre-merge checks（✅/❌ 表格）+ "Fix all pre-merge checks      │
│          with AI" 复选框                                                  │
│       b. review 评论：行级 actionable comments（🟠 Major 等）              │
│     失败后果：Warning 不阻塞 merge，但公开可见、人类终审时必须回应           │
│   pullfrog（pullfrog[bot]，仓库自带 GitHub Actions workflow 跑 Agent）      │
│     配置：.github/workflows/pullfrog.yml（workflow_dispatch +              │
│     pullfrog/pullfrog@v0 action）                                         │
│     判定依据：读 diff + 全仓上下文，做语义级正确性论证（见 §3.3）            │
│     输出物：review 评论 = ✅/❌ 结论 + Reviewed changes 逐条摘要 +          │
│     验证过程叙述 + HTML 注释元数据块（防陈旧）+ Fix it ➔ 一键修复触发器     │
│     失败后果：作为 check run 上报（本例 conclusion: success），通常        │
│     非阻塞但构成 required conversation 的一部分                            │
├─────────────────────────────────────────────────────────────────────────┤
│ L4 人类终审                                                               │
│   .github/CODEOWNERS：按"域"点名（不是全路径枚举）                          │
│     /src/renderer/src/i18n/locales/ 等 i18n 面 → @brennanb2025             │
│     /cloud/ + /.github/workflows/cloud-*.yml + cloud-sql-rollout-lease    │
│     action → @Jinwoo-H                                                   │
│   其余产品源码：归"normal reviewers"（CODEOWNERS 第 1 行注释明示）           │
│   人类只看：verify 红绿 + 两个 AI 的分歧点 + CodeRabbit Major 意见 +        │
│   模板是否实填                                                            │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. 机读模板解析（L1）

`.github/pull_request_template.md` 关键原文：

```markdown
## Linked Issue

<!-- Link the issue this PR addresses, there should ALWAYS be one -->

Fixes #

## Visual Proof

<!-- REQUIRED for UI / behavior changes. Please attach a BEFORE and AFTER that can easily tabbed/switched. ... -->
<!-- If there is truly no visual or interaction change, write exactly: `N/A` and briefly say why. -->

## Testing

- [ ] I manually tested these changes locally
- [ ] Automated tests added/updated, or explained why not below

## AI Disclosure

<!-- DO NOT FILL IN IF YOU ARE STABLYAI TEAM MEMBER (INTERNAL CONTRIBUTOR), IGNORE SECTION: -->
<!-- Which AI model if anyone was used, please state the details -->

## Agent skill upstream boundary

- [ ] Not applicable, or this change follows `docs/reference/agent-skill-sharing-upstream-boundary.md` and copies or mechanically translates no upstream skill-installer source, tests, fixtures, registry entries, path tables, comments, or documentation.

## Notes

Ensure no issues in: Security, Cross-platoform support (Linux, Windows, Mac), Remote SSH, Mobile, general backwards compatibility, performance

## Checklist

- [ ] This PR is small and focused
- [ ] I explained what changed and why (including ELI5)
- [ ] Before/after screenshots or videos attached for UI changes, or `N/A` with reason
- [ ] Self-reviewed for correctness, security, and performance
- [ ] Cross-platform, SSH/remote, and path/shortcut impact considered (or N/A)
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` pass (or CI will cover; local preferred)
```

设计要点：

1. **每个标题都是稳定锚点**：`## ELI5`、`## What Changed`…… 可以被正则/LLM 双重消费。人读的是段落语义，机器读的是"锚点是否存在、内容是否非空"。
2. **`N/A` 有规范写法**：Visual Proof 允许跳过但必须"write exactly: `N/A` and briefly say why"——跳过本身变成一个可校验的值，而不是留白。
3. **AI Disclosure 双语义**：对社区是披露要求，对内部成员显式豁免（注释里写明 IGNORE SECTION），避免内部 PR 被机器误判。
4. **upstream boundary 是"许可证护栏"**：把法务约束编码成 PR checkbox，防止贡献者把上游 skill-installer 源码/fixture 机械搬运进来。
5. **CONTRIBUTING.md 与模板互相引用**：CONTRIBUTING 的 "Pull Requests" 节逐条展开模板含义，还要求 "include a brief code review summary from your AI coding agent that explicitly checks cross-platform compatibility, SSH/remote/local compatibility, supported agent and integration compatibility, performance risk, UI quality when applicable, and basic security risk"——**把"作者侧 AI 自审"也写进了贡献合同**。

---

## 3. 各层深度解析

### 3.1 结构化 issue 入口 + labeler（L0）

- `ISSUE_TEMPLATE/config.yml` 只有一行：`blank_issues_enabled: false`——堵死空白 issue，强制人人走表单。
- `bug_report.yml` 用 dropdown 固化 Operating system 字段（macOS/Windows/Linux/Other），textarea 的 placeholder 里预置了 "Short summary / What happened? / How can we reproduce it?" 叙事骨架。
- `issue-os-labeler.yaml` 之所以能工作，正因为表单生成的 body 有稳定标题锚点：

```js
const osMatch = body.match(/^### Operating system\s+(.+)$/m);
```

并且是**幂等标签管理**：先剥离旧的 os:* 标签再写入目标标签，避免 edited 事件重复叠加。

### 3.2 track-community-pr：内外分流的登记层（L2①）

`track-community-prs.yaml` 是所有外部 PR 进入 orca 的第一站。它的三个判定全部是**身份判断而非内容判断**：

1. 作者在跳过名单（`github-actions[bot]`、`dependabot[bot]`）→ skip；
2. `teams.getMembershipForUserInOrg({org: 'stablyai', team_slug: 'stably-eng', username})` 为 active → 内部作者，skip；
3. 否则用专用 App token（bufo-bot，`actions/create-github-app-token@v3`，app-id 2590194，密钥来自 `secrets.BUFO_BOT_PRIVATE_KEY`）把 PR 加进 Project 13。

关键取舍：

- 用 `pull_request_target` 但**只做 API 元数据操作、不 checkout 代码**，规避了该事件的提权风险；
- 用 App token 而非 GITHUB_TOKEN，是为了让登记动作的执行者（bufo-bot）与工作流身份解耦、可审计；
- `workflow_dispatch` + `pr_number` 输入让登记失败可补录——**机器人流水线也要有运维通道**。

这正是用户 PR #19030 里 `track-community-pr` check 的来源（见 §5 实证）。

### 3.3 双 AI 审查的互补性（L3）

| 维度 | CodeRabbit（规则/门禁型） | pullfrog（语义/论证型） |
|---|---|---|
| 形态 | SaaS App，零仓库配置 | 仓库内 `.github/workflows/pullfrog.yml`，`uses: pullfrog/pullfrog@v0` |
| 供给 | OSS 免费（评论尾部注明 "It's free for OSS"） | "Using `DeepSeek Pro` (free via Pullfrog for OSS)"——DeepSeek Pro 供给 OSS |
| 判定依据 | 模板锚点、Linked Issue、**diff 触及函数的 docstring 覆盖率（80% 门槛）**、规则库（Review profile: CHILL） | 读 diff + 全仓上下文做推理：调用点穷尽、写路径原子性（tmp + rename）、并发串行化、float/exponent 误解析、向后兼容 |
| 输出 | Walkthrough / Merge Risk 🟡 / Pre-merge checks 表格 / 行级 🟠 Major / "Fix all pre-merge checks with AI" | ✅ No new issues found + Reviewed changes 逐条 + 验证叙述 + 防陈旧元数据块 + Fix it ➔ |
| 陈旧防护 | `final_review_risk_coverage:{"sourceCommitId":"da176...","coveredCommitId":"da176...","kind":"reviewed"}` + "Merge Risk: 🟡 Moderate · up to `da176`" | HTML 注释元数据：**"These findings were written against da17677; if commits have landed ... treat every specific bug, file, or line callout as POTENTIALLY STALE and re-diff before acting on it."** + Mode/Files reviewed/Commits reviewed/Base/Head 清单 |
| 时间线实证 | 06:44:09 总结评论，06:44:14 review（Actionable comments posted: 1） | 06:44:10 review（✅） |

互补逻辑：CodeRabbit 回答"**格式与可维护性契约是否满足**"（有模板可对照、有覆盖率可量化），pullfrog 回答"**这个改动在语义上是否真的正确、有没有漏掉的破坏面**"（需要模型推理）。两个 AI 意见一致 → 人类可以放心；意见分歧 → 人类只看分歧处。AI 不是替代人类审查，而是把人类审查的输入从"整块 diff"压缩为"两份带 commit 指纹的审查意见 + 分歧清单"。

pullfrog 的 workflow 本身很克制（原文节选）：

```yaml
on:
  workflow_dispatch:
    inputs:
      prompt:
        type: string
        description: Agent prompt
permissions:
  contents: read
jobs:
  pullfrog:
    runs-on: ubuntu-latest
    permissions:
      id-token: write
      contents: read
    steps:
      - name: Checkout code
        uses: actions/checkout@v6
        with:
          fetch-depth: 1
      - name: Run agent
        uses: pullfrog/pullfrog@v0
        with:
          prompt: ${{ inputs.prompt }}
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          DEEPSEEK_API_KEY: ${{ secrets.DEEPSEEK_API_KEY }}
          # ...（共 10 个 provider key 位，含注释掉的 Bedrock/Vertex 扩展位）
```

注意：`workflow_dispatch` 的 prompt 输入说明调度方（Pullfrog 平台/App）在 PR 事件时触发 workflow 并携带审查 prompt；runner 出网调用 LLM API；`permissions` 收到只有 `contents: read` + `id-token: write`，Agent 不能直接改仓库。

### 3.4 CODEOWNERS 按域路由（L4）

全文只有 11 行，非默认所有者只有两个人、三组路径：

```
/src/renderer/src/i18n/locales/ @brennanb2025
/config/scripts/*localization*.mjs @brennanb2025
/config/scripts/*locale*.mjs @brennanb2025
/config/i18next.config.ts @brennanb2025

/cloud/ @Jinwoo-H
/.github/workflows/cloud-*.yml @Jinwoo-H
/.github/actions/cloud-sql-rollout-lease/ @Jinwoo-H
```

设计原理：

- **不是"每条路径都点名"**，首行注释明示 "Product source remains owned by its normal reviewers; localization inputs need focused review."——产品主路径走常规 review 流程，只有**外部输入面（本地化文案）**和**生产部署面（cloud + 其专属 workflow 与发布 action）**加锁；
- 把 `.github/workflows/cloud-*.yml` 纳入 cloud owner 是个容易被忽略的细节：**CI 定义本身也是攻击面**，谁写部署 workflow 谁就该是部署域 owner；
- 通配符按语义匹配（`*localization*`、`*locale*`）而非目录枚举，降低维护成本。

### 3.5 pr.yml 的"路径感知 + verify 聚合"门禁（L2②）

pr.yml 48KB、17 个 job，但结构是两段式：

**第一段 code_paths 检测器**（`detect code-relevant changes`）：对 merge-base diff 做路径分类，产出 15 个布尔输出。注释直接写明了设计动机：

> "a README/docs-only PR used to start the full matrix ... Path filters on `on.pull_request` would drop the `verify` check entirely; this detector keeps verify as the required aggregate and skips the expensive jobs. ... empty diffs fail closed and run everything."

即：不用 GitHub 原生 `paths:` 过滤（那会让 required check 消失导致分支保护误判通过），而是**让所有 job 都存在、只是大部分被 skip，由一个聚合 job 判定**。

**第二段 verify 聚合 job**：`if: always()` 收集所有 job 的 result 与 should_run，逐对校验——`should_run=true` 的 job 必须 success；`should_run=false` 的 job 必须 skipped（否则说明分类器和执行器脱节，也算失败）。e2e 被刻意排除在 needs 之外，注释说明 "the suite is currently red on main ... gating merges on it would block any PR that touches tests/e2e/** — including the ones fixing the suite"，并给出解红后启用它的三步操作。**门禁是活文档：每一条例外都有 Why 和退出条件。**

### 3.6 信任边界的细节（贯穿各层）

- `pr-test-loc.yml`：持写权限的 job **从 default branch 而非 PR head 拉取执行脚本**："this job holds a write-scoped GITHUB_TOKEN, so it may only execute reviewed code."
- `pr.yml` checkout 用 `filter: blob:none`：blob 占仓库 pack 约 89%，按需拉取即可满足 merge-base diff。
- `docs.yml`：PR check job "deliberately has no deployment credentials and runs for every PR, including forks"；生产部署由单独 release_gate 分隔。
- `pullfrog.yml`：Agent 容器只有 `contents: read`，凭 API key 出网推理，结果以 review 评论形式落地——**Agent 有"说"的权限，没有"写"仓库的权限**。

---

## 4. 设计原理提炼

1. **为什么分三层而不是一层大而全**
   - **信任分层**：每一层的凭证权限递减——登记层用专用 App token 只做元数据；CI 层 GITHUB_TOKEN 只读为主；AI 层只有 read + 自有 API key。任何一层被 prompt injection 或恶意 PR 攻破，都拿不到写权限。
   - **成本分层**：贵检查（package 矩阵、E2E）被 code_paths 分类器按需 skip，docs-only PR 不烧 runner 分钟数。
   - **判定可解释与可对抗**：每个机器人输出独立、有 commit 指纹，人类看到分歧才知道该看哪里；单一"超级审查器"的误报无法定位也无法争论。
   - **失败隔离**：登记层挂了不影响门禁，AI 层挂了不影响 verify 红绿——每层有独立的 SLO，流水线整体不因单点故障瘫痪。

2. **机读锚点让模板从建议变门禁**
   - 纯人类模板只有社会约束力（"reviewer 会不高兴"）；orca 把段落名做成锚点后，CodeRabbit 的 Description check 可以机器校验"ELI5/What Changed/Why/Visual Proof/... 是否存在且非空"，用户 PR #19030 就吃到两条 warning（见 §5）。
   - 同一机制在 issue 侧复用：dropdown 生成 `### Operating system` 锚点 → labeler 正则消费 → 自动打标签。**模板 = 数据 schema，锚点 = 解析接口。**
   - 锚点还保留人性出口：`N/A` + 理由、AI Disclosure 的内部豁免——门禁不等于僵化。

3. **双 AI 交叉审查的互补性**：规则型（CodeRabbit：可枚举、可量化、便宜、秒回）+ 语义型（pullfrog：需推理、贵一点、能发现规则覆盖不到的正确性问题）+ 两者输出都带 commit 指纹防陈旧。交叉比对的价值在"分歧信号"而不在"双份冗余"。

4. **CODEOWNERS 按域路由**：只锁"外部输入面"与"生产部署面"两类高风险域，产品主体归常规 reviewer——避免"所有者名单腐化成全仓枚举"的常见死亡螺旋。同时把部署 workflow 的编写权绑给部署 owner。

5. **审查元数据防陈旧**：AI 意见在后续 commit 到达后会失效，orca 的两个 AI 都显式声明"written against <sha>"，pullfrog 更进一步用大写警告 "POTENTIALLY STALE and re-diff before acting on it"。**AI 审查意见被当作有版本的事实，而不是常青真理。**

6. **内外有别 + 运维通道**：org team membership 把内部 PR 排除在社区审查池外；workflow_dispatch 支持补录；e2e 红态时降级为非阻塞并写明启用条件。治理系统自己也是代码，同样讲"可回滚、可运维"。

---

## 5. 实证：用户 3 个 PR 的机器人行为时间线

用户：`cat-xierluo`（杨卫薪律师）。三个 PR 均于 2026-09-06 提交，全部 open、未合并。

### PR #19030 `perf(history): probe checkpoint generation from the file head`

- 元数据：+96/−4，4 files，head `da17677`，base `main`，created 06:38:16Z
- **check runs（head commit 上实际上报 2 个，均 success）**：
  - `track-community-pr`（app: github-actions）——§3.2 登记层产物
  - `pullfrog`（app: pullfrog）
- **时间线**：

| 时刻（UTC） | 执行者 | 行为 |
|---|---|---|
| 06:38:16 | 人 | PR 创建（body 用了自有格式而非 orca 模板——这是后面 Description check 触发的原因） |
| 06:44:09 | coderabbitai[bot] | 总结评论：📝 Walkthrough（一句话概括改动）+ **Merge Risk: 🟡 Moderate · up to `da176`** + 一句风险摘要 "Warm reattach can accept a malformed checkpoint generation..." + 🚥 Pre-merge checks ✅3 ❌2 + "Fix all pre-merge checks with AI" 复选框 |
| 06:44:10 | pullfrog[bot] | review（COMMENTED）：**"✅ No new issues found."** + Reviewed changes 三条摘要 + 验证叙述（"Verified the key-order guarantee holds for every writer ... the write is atomic (tmp + rename) and serialized per session by `mutations.track`, and that the probe cannot mis-parse floats/exponent forms ..."）+ HTML 注释元数据（见 §3.3）+ 页脚 "Using `DeepSeek Pro` (free via Pullfrog for OSS)" 与 "Fix it ➔" |
| 06:44:14 | coderabbitai[bot] | review（COMMENTED）："**Actionable comments posted: 1**"（即用户看到的 🟠 Major 行级意见）+ 运行配置披露（Review profile: CHILL / Plan: Team / Run ID）+ commit 区间元数据 "Reviewing files that changed from the base of the PR and between 15dabf8... and da17677..." |

- **Pre-merge checks 明细**（原文表格）：
  - ❌ Description check（⚠️ Warning）："The description explains the motivation, implementation, compatibility behavior, and tests. However, it omits most required template sections, including ELI5, What Changed, Why, Visual Proof, explicit Linked Issue formatting, AI Disclosure, Review, boundary confirmation, Notes, and the checklist." Resolution 给出修复路径（补全模板、`Fixes #` 格式、Visual Proof 写 `N/A` + 理由）。
  - ❌ Docstring Coverage（⚠️ Warning）："Docstring coverage is 0.00% which is insufficient. The required threshold is 80.00%. Docstring coverage is scoped to functions touched by this diff. Analyzed 2 functions across 4 files."
  - ✅ Title check / Linked Issues check（skipped，无关联 issue）/ Out of Scope Changes check（skipped）。
- **可观察结论**：模板缺失没有阻塞 PR，但转化成了两条公开、可回应、带修复建议的 warning——"建议变门禁"的温和形态；两个 AI 在 5 秒内先后完成审查且都锚定了 head commit。

### PR #19031 `perf(runtime): bound per-PTY headless mirror scrollback to a flat window`

- 元数据：+92/−0，3 files，head `840bd00`，created 06:38:27Z。截至取证时刻（当日）尚无 bot 评论/review——**机器人行为有排队与延迟，不是即时的**；check 层面同样应有 track-community-pr 登记（该 PR 与 #19030 同批）。

### PR #19033 `fix(kimi): bound orphaned managed-block recovery to installer-shaped tables`

- 元数据：+47/−6，2 files，head `c3d2a15`，created 06:47:04Z
- 时间线：coderabbitai[bot] 总结评论 06:52:41 + review（COMMENTED）06:52:47；pullfrog[bot] review（COMMENTED）06:54:38（用户提交时 pullfrog 显示"进行中"，取证时已完成）。
- head commit check runs：`pullfrog` success、`track-community-pr` success——与 #19030 同构。

### 附证：issue #18831 的内部 autopilot 流程痕迹

`gh api repos/stablyai/orca/issues/18831` 正文开头即为机器锚点：

```html
<!-- machinery-sig: session-daemon-never-auto-updates-when-live-sessions-exist -->
<!-- autopilot-issue-labels: developer-report,severity:medium,evidence:located -->
```

正文自述："This issue was filed via `autopilot report-issue` by a developer through the `/report-issue` skill — capturing the context from the session where the problem occurred. It is the durable capture of the report; the eventual fix still flows through `/create-task` → IT-NNNNN." 并附 Framework version `stratos-autopilot@0.70.0+593873c1fb`、签名、severity、完整机制分析与建议——**内部缺陷报告本身就是结构化产物：机器签名 + 机器标签 + 会话上下文捕获 + 工单编号管道**。这与 PR 侧的机读锚点是同一套哲学在 issue 侧的延伸。

---

## 6. 落地注意点（对用户环境的直接启示）

1. **先有锚点，再上 AI**：CodeRabbit 的 Description check 之所以有价值，是因为模板先存在。没有机读模板时直接装 AI reviewer，只能得到泛泛的代码意见。
2. **Warnings 是主通道，阻塞是例外**：orca 的 AI 层基本不阻塞（CodeRabbit warnings、pullfrog review 都非硬门禁），硬门禁收敛在 verify 这一个 required check 上。阻塞越多，绕过与噪音越多。
3. **AI 审查意见必须带 commit 指纹**，否则新 commit 后旧意见会变成误导。
4. **有写权限的 workflow 不执行 PR 代码**：orca 用"从 default branch 拉脚本"和"pull_request_target 只做元数据"两个模式划清信任边界——用户仓库引入任何 GitHub Actions 都应遵守。
5. **免费供给的真实形态**：CodeRabbit 对 OSS 免费（public repo 可直接装）；pullfrog 对 OSS 提供 DeepSeek Pro 免费额度（通过 Pullfrog for OSS 计划申请，workflow 仍是用户仓库自己维护的 Actions）。私有仓库两条路都涉及费用或额度限制，见各 ADOPTION 文档的成本对比。
