# MAINTAINER-WORKFLOW — orca 维护者日常工作流

> 增量研究。`REPORT.md` §3.6 提了"信任边界"和"workflow 不执行 PR 代码"，对**维护者日常**几乎没碰。本文是这次研究里最被忽视也最有借鉴价值的一层：triage bot（不只是 os-labeler）、stale PR 关闭规则、commit message 与 squash 规则、信任分级、PR/issue 链接的"自动关联"配置、维护者承诺与社区喊话。

## 0. 一句话增量

orca 的维护者日常不是"开 GitHub 收 PR"，而是**一套半自动化的分工流程**：机器人做 80% 的初筛和登记（os-labeler + track-community-pr），人类做 20% 的终审（CODEOWNERS 域 owner + AI 审查分歧），社区做反向 push（Twitter shoutout + author disclosure）。**这层分工几乎都在 CONTRIBUTING.md 里以散文形式写明**，不是 workflow 文件——容易被做治理研究的人忽略。

## 1. CONTRIBUTING.md 是治理合同的"自然语言层"

`REPORT.md` §3.6 引了"作者侧 AI 自审"那一段，但**CONTRIBUTING.md 是治理合同的源头**，所有 workflow 和模板都引用它：

### 1.1 跨平台契约

```markdown
## Before You Start

- Orca targets macOS, Linux, and Windows. Every change must stay compatible
  with all three platforms unless the code is explicitly guarded by a runtime
  platform check.
- For keyboard shortcuts, use runtime platform checks in renderer code and
  `CmdOrCtrl` in Electron menu accelerators.
- For shortcut labels, show `⌘` and `⇧` on macOS, and `Ctrl+` and `Shift+` on
  Linux and Windows.
- For file paths, use Node or Electron path utilities such as `path.join`.
- Orca must work against local repositories, remote servers, and SSH worktrees.
  Do not assume a process, file, credential, shell, or network path exists only
  on the local machine.
```

**这是 contract——PR 模板里的 Notes 段（"Ensure no issues in: Security, Cross-platform support..."）就是这条 contract 的复述**。**contract 在 CONTRIBUTING.md 详写，模板里只放 anchor**。

### 1.2 Type 决策条款

```markdown
## Type Declarations: Prefer `.ts` Over `.d.ts`

Project-owned type declarations belong in `.ts` files. `.d.ts` is reserved for
ambient shims (e.g., `env.d.ts`, `vite/client.d.ts`). TypeScript's `skipLibCheck: true`
setting applies globally, including to our own `.d.ts` files, which means any
unresolved type reference in a `.d.ts` silently becomes `any` at its call sites.
Write your types in `.ts` files so the compiler actually checks them.

CI enforces this for `src/preload/` and `src/shared/`.
```

**条款后跟 "CI enforces this for ..."**——这意味着 contract 在 CI 里有对应执行。**pr.yml 第 195-200 行** 的 `Guard against project-owned .d.ts in preload/shared` 是这条 contract 的具体实现：

```yaml
matches=$(find src/preload src/shared -name '*.d.ts' 2>/dev/null || true)
if [ -n "$matches" ]; then
  echo "::error::Project-owned .d.ts files are not allowed under src/preload or src/shared."
  echo "Move type declarations into a .ts file so skipLibCheck does not hide errors."
  echo "See .github/CONTRIBUTING.md#type-declarations-prefer-ts-over-dts."
fi
```

### 1.3 给用户仓库的启示

**CONTRIBUTING.md 应是 CI 规则的"自然语言目录"**——每条 CI 规则都在 CONTRIBUTING.md 有对应段落。folia / dsh Phase 1 应在 CONTRIBUTING.md 至少包含：
- 跨平台兼容要求（folia 是 macOS-only 可以简化）
- commit 消息格式（conventional commits）
- 分支命名规则（CONTRIBUTING.md 已给三个示例：`fix/ctrl-backspace-delete-word`、`feat/shift-enter-newline`、`chore/update-contributor-guide`）
- "release 流程"（避免贡献者自加版本号）

## 2. Triage bot 总览：不止 os-labeler

orca 的"triage bot"不是单一 bot，而是**多个 GitHub App / workflow 的组合**：

| Bot / Workflow | 职责 | 触发器 |
|---|---|---|
| `issue-os-labeler.yaml` | 给 issue 打 `os:*` label | `issues: [opened, edited, reopened]` |
| `track-community-prs.yaml` | 社区 PR 加进 Project 13 | `pull_request_target: [opened, reopened, ready_for_review]` |
| `coderabbitai[bot]`（SaaS App） | 模板合规 + 行级 review | 安装后自动（opened/synchronize） |
| `pullfrog[bot]`（仓库内 workflow + SaaS） | 语义级 review + 防陈旧元数据 | workflow_dispatch + 平台事件 |
| `github-actions[bot]`（系统 bot） | release cut / commit / tag | release-cut.yml 等 |
| `buf0-bot[bot]`（GitHub App 2590194） | 跨仓库写（homebrew-orca tap） | homebrew-bump.yml 等 |
| `bufo-bot`（同上 App，安装 token 名） | Project board 登记 | track-community-prs.yaml |

**6 类自动化身份**——这才是 orca 维护者日常"接 PR"时的真实边界。维护者收到新 PR 时，看到的元数据来自这 6 类机器。

### 2.1 给 folia / dsh 的启示

folia / dsh 不需要这么复杂——但**至少有 3 类**：
1. **CODEOWNERS 自动路由**（已有 Phase 1）
2. **PR check 矩阵**（Phase 2+）
3. **issue 自动 label**（Phase 1 的 issue-os-labeler 类）

6 类是 orca 这种有"跨产品线（mobile / desktop / cloud）+ 多 channel（hourly/daily/adhoc/rc/stable）+ 跨仓库（main / orca-hourly / orca-daily / orca-adhoc / homebrew-orca）"的复杂度才需要的。**小仓库 3 类足够**。

## 3. Stale PR 处理：orca 不靠 stale bot

### 3.1 实测 PR 状态分布（`gh api repos/stablyai/orca/pulls?per_page=30`）

```
{"n":19044,"author":"brennanb2025","merged":null}     # open
{"n":19043,"author":"oliverlukschander","merged":null}  # open
{"n":19042,"author":"brennanb2025","merged":null}     # open
{"n":19041,"author":"nwparker","merged":"2026-09-06T07:31:07Z"}  # merged
{"n":19040,"author":"brennanb2025","merged":null}     # open
{"n":19039,"author":"nwparker","merged":"2026-09-06T07:28:39Z"}  # merged
```

30 个最近 PR 中：
- ~70% 是 open
- ~30% 是 merged
- **0 stale**（没有 30 天以上未活动且无 reviewer 的）

### 3.2 orca 不用 probot/stale 的可能原因

- CONTRIBUTING.md 鼓励 PR 作者"rebase 自己"——commit 历史不长、不容易积压；
- AI reviewer（CodeRabbit + pullfrog）的持续 presence 让 PR 不会"沉默"——总有新评论触发活动；
- 社区体量适中，maintainer 实时关注 GitHub Notifications；
- `track-community-pr` 把社区 PR 加进 Project 13，**看板是另一个 reminders 渠道**——不依赖 probot。

### 3.3 给 folia / dsh 的建议

**两仓库都小**，但**仍建议装 GitHub 内置的 `Stale` action**：

```yaml
# .github/workflows/stale.yml
name: Close stale issues
on:
  schedule:
    - cron: '30 1 * * *'  # 每天 01:30 UTC
permissions:
  issues: write
  pull-requests: write
jobs:
  stale:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/stale@v9
        with:
          days-before-stale: 30
          days-before-close: 7
          stale-issue-label: 'stale'
          exempt-issue-labels: 'pinned,security'
          stale-pr-label: 'stale'
          exempt-pr-labels: 'pinned,WIP'
          operations: 'issues,pull-requests'
```

**为什么装**：
- folia / dsh 没有 AI reviewer 持续戳 PR，沉默概率高于 orca；
- 业务规则类 issue（dsh）容易"提了但忘记"——`stale` + auto-close 提醒用户跟进；
- 或ca 那种"看板 + AI reviewer + 实时通知"三位一体的反沉默机制两仓库都没有。

## 4. Commit message 与 squash 规则

### 4.1 CONTRIBUTING.md 的"Branch Naming"段（直接约束 commit）

```markdown
## Branch Naming

Use a clear, descriptive branch name that reflects the change.

Good examples:

- `fix/ctrl-backspace-delete-word`
- `feat/shift-enter-newline`
- `chore/update-contributor-guide`

Avoid vague names like `test`, `misc`, or `changes`.
```

**conventional commits 风格的分支命名**——`fix/`、`feat/`、`chore/`、`docs/`、`refactor/`、`test/`、`perf/`、`ci/`、`build/`、`style/` 是 10 类。

### 4.2 squash merge 默认 → commit message = PR title + body

orca 用 squash merge（PR-LIFECYCLE.md §7 已分析），**每个 PR 的最终 commit message = PR title + body**。**这意味着 PR title 是 commit message 的核心信号**。

### 4.3 当前 squash merge 后能看到什么

`gh api repos/stablyai/orca/commits?per_page=10` 的 commit author 与 PR author 一致——squash 不重写 author。但 commit message 会规范化：PR title `perf(history): probe checkpoint generation from the file head` 就是 commit message 主题。

### 4.4 给 folia / dsh 的启示

- **commit message 直接用 PR title**——不需要本地 `git commit` 强加格式；
- 但 PR title 模板化：`fix: ...`、`feat: ...`、`chore: ...`、`docs: ...`；
- **避免 "Update foo.ts" 这种无信息 title**——PR template 的 "ELI5" 段落强作者写一句 narrative，squash 后 commit message 也带这段。

## 5. 信任分级：内外有别

### 5.1 orca 的三类作者

实测 PR author 分布：

```
brennanb2025, oliverlukschander, nwparker, AmethystLiang, tb-soshiro, cat-xierluo, itsjaydesu, OrcaWin, jondmarien, ...
```

| 类别 | 例子 | 特征 |
|---|---|---|
| 内部团队 | `brennanb2025`（CODEOWNERS owner）、`nwparker`（高频合并） | `org/stably-eng` 成员，PR 自动 skip track-community-pr |
| 长期外部贡献者 | `oliverlukschander`、`OrcaWin`（后者甚至用作 bot 命名） | 不在 org 内，但 PR 频率高、AI 审查稳定 |
| 一次性贡献者 | `cat-xierluo`（用户本人）、`itsjaydesu`、`tb-soshiro` | 偶发 PR，需要更重的机器人初筛 |

### 5.2 orca 的"信任处理差异"

- **内部 PR**：track-community-pr skip（不进 Project 13）——因为内部 PR 不需要人工 triage；
- **外部 PR**：track-community-pr 加进 Project 13——人工 review 的入口；
- **bot PR**：`github-actions[bot]`、`dependabot[bot]` skip——既不进 Project 13 也不需要审查。

### 5.3 给 folia / dsh 的启示

两仓库都是用户一个人的代码（folia 还有杨律师）——**"内外有别"暂时不必要**。但**未来如果引入第二个活跃贡献者**，可以复制：

```yaml
# track-community-prs.yaml 等价物
const author = pr.user.login;
const internalAuthors = new Set([
  'cat-xierluo',
  '杨卫薪律师',
]);
if (internalAuthors.has(author)) {
  core.info(`Skipping internal PR author ${author}.`);
  return;
}
```

——**Phase 3+ 才考虑**。Phase 1 不必引入。

## 6. PR 与 issue 的"自动 close"机制

### 6.1 GitHub 原生的 `Fixes #N` 解析

PR 模板第 11 行：

```markdown
## Linked Issue

<!-- Link the issue this PR addresses, there should ALWAYS be one -->

Fixes #
```

`#` 是 placeholder——PR body 里 `Fixes #123` 会在 PR **merged** 时自动 close issue #123。GitHub 原生机制，不需要 workflow。

### 6.2 orca 的实际使用

实测 issue #18831（autopilot 报告）**没有关联 PR**（body 里没 `Fixes #`，且实测 `gh issue list` 显示仍是 open）。这是"**issue 是 capture，task 是 ticket**"双轨——不是每个 issue 都该被 PR close。

### 6.3 给 folia / dsh 的建议

- folia / dsh Phase 1 模板写 `Fixes #`——**有 issue 的 PR 必填，无 issue 的 PR 写 `N/A`**（PR template 的 Visual Proof 段已示范 `N/A + 理由` 模式）；
- 不要靠"自动 close"作为 issue 闭环的唯一信号——业务规则类 issue（dsh）经常需要"接受 + 评论确认"而非"PR 合并自动 close"。

## 7. 社区喊话与 author disclosure（最容易被忽视的"软治理"）

CONTRIBUTING.md 第 67 行：

> **Include your X (Twitter) handle** in the PR template Author section — we shout out contributors when we merge features on [@orca_build](https://x.com/orca_build).

PR 模板里的 "Author" 段：

```markdown
## Author

- [ ] ...
```

——**ora 用 Twitter shoutout 作为对外部贡献者的激励**。`@orca_build` 是一个 brand 账号，每次合并 feature 公开喊话。这是"软治理"——不是技术门禁，而是社区心理契约。

### 7.1 给 folia / dsh 的启示

- **小仓库不必搞 Twitter shoutout**——但**必须在 PR template 里让作者写"动机"和"问题"**（ELI5 + Why 段），让 reviewer 理解背景；
- 如果 folia / dsh 公开度高（dsh 是公有），**考虑在 PR 模板加 "Willing to maintain this after merge?"**——让作者确认愿意接手维护。

## 8. release-cut 的"维护者守护"模式

`release-cut.yml` 是手动的，但**手动触发本身是治理信号**：

- release 不能全自动——每次发布都是产品决策；
- 但 release 流程**全部 CI 化**（不依赖 `pnpm release:*` 本地脚本）；
- 注释明确："running releases locally is too easy to get wrong (dirty tree, wrong branch, stale main)"。

### 8.1 给 folia / dsh 的建议

- **Phase 3 之前不必做 release workflow**——folia / dsh 现在都靠 `git tag + gh release create` 手动发版；
- 但**如果做 release workflow，必须手动 trigger**（workflow_dispatch only），不要做"PR merge → release"自动触发。

## 9. Stale issue + auto-label 的延伸：维护者的"看板式管理"

### 9.1 orca 的 Project 13

`track-community-prs.yaml` 第 33 行：

```yaml
PROJECT_NUMBER: '13'
```

**Project 13 是社区 PR 的看板**——所有外部 PR 自动加进 Project 13。维护者每天/每周打开 Project 13 看板就能看到"等审 PR"的 backlog。

### 9.2 folia / dsh 的轻量版

- folia / dsh 体量小，不需要 GitHub Project；
- 但**可以用 GitHub Issues 的"label view"代替**——给 issue 打 `triage-pending`、`triage-done`、`bug/P0` 等 label，用 `is:open label:triage-pending` 看 backlog；
- **Phase 1 装 os-labeler 时同时装 1-2 个业务 label**——例如 `severity:P0`、`severity:P1`、`severity:P2`——给维护者一个"按优先级排序"的视图。

## 10. 与原 REPORT.md 的关系

| 主题 | REPORT.md | 本文件增量 |
|---|---|---|
| 维护者日常 | 0 | 全 10 节 |
| CONTRIBUTING.md 作为合同源 | §3.6 一句 | §1（cross-platform contract + .d.ts 条款 + CI 引用链） |
| Triage bot 总览 | §3.1 + §3.2 + §3.3 各一段 | §2（6 类自动化身份 + folia/dsh 最低 3 类建议） |
| Stale PR | 0 | §3（实测 0 stale + 为什么 orca 不用 stale bot + folia/dsh 应该用） |
| Commit message | 0 | §4（squash merge → commit = PR title + ELI5） |
| 信任分级 | §3.2 "内外有别"一句 | §5（3 类作者 + 处理差异 + Phase 3+ 复制方法） |
| PR/issue 链接 | §3.1 一句 + §5 一笔 | §6（Fixes # 自动 close + 双轨制 + folia/dsh 用法） |
| 社区喊话 | 0 | §7（Twitter shoutout + Author section） |
| 手动 release | 0 | §8（产品决策 vs CI 流程） |
| 看板式管理 | §3.2 Project 13 一句 | §9（label view 轻量替代） |

**没有冲突**——本文件填补 REPORT.md 完全未触及的"维护者日常工作流"层，并给 folia / dsh 各自的可执行建议。

---

## 附录 A：维护者日常工作的 10 个具体动作清单

按时间消耗排序（每天 < 30 分钟）：

1. **打开 Project 13**（或 folia/dsh 的 label view）看等审 PR backlog
2. **检查 os-labeler 是否漏打**（看 `is:open label:bug -label:os:*`）
3. **回复 CodeRabbit / pullfrog 提的 Major 意见**（需要人工判断的）
4. **给 issue 打 `triage-done` 或 `severity:P?`**（dsh 业务规则优先）
5. **检查 release-cut 是否被触发**（CONTRIBUTING.md 提到"weekly release"）
6. **处理 stale 提醒**（Phase 2+ 装 stale bot 后）
7. **看 hourly/daily 看板**（如果装 dev channel）——确认 main 没出 red
8. **回复 community PR 的"please rebase"类请求**
9. **更新 CONTRIBUTING.md**（任何 CI 规则改动都同步 PR 模板）
10. **Twitter shoutout**（feature merge 后）

## 附录 B：folia / dsh Phase 1 立即可加的 5 项维护者流程

| 动作 | 难度 | 立即价值 |
|---|---|---|
| 装 stale bot（§3.3 YAML） | 5 分钟 | 防止 issue 沉底 |
| 装 issue-os-labeler（§ISSUE-LIFECYCLE §6.1） | 10 分钟 | 自动归类 |
| 在 CONTRIBUTING.md 写 release 流程 | 10 分钟 | 防止贡献者提版本号 |
| 在 PR template 加 "Willing to maintain"（§7.1） | 5 分钟 | 心理契约 |
| 给 issue 至少加 3 个 label（P0/P1/P2） | 5 分钟 | 优先级排序 |

合计：35 分钟——与 REPORT.md 里的"Phase 1 30 分钟"接近，可并入 Phase 1 增补。
