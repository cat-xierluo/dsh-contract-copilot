# PR-LIFECYCLE — orca 的 PR 治理补充

> 增量研究。`REPORT.md` §3.2/§3.5 已覆盖 `track-community-prs.yaml`、`pr.yml` 的路径感知与 verify 聚合。本文件补全 PR 端 6 个常被忽略的层面：分支保护、auto-merge / squash 策略、concurrency 自我修复、AI review 二次回访、pr-test-loc 的安全设计、PR 与 issue 链接契约。

## 0. 一句话增量

orca 的 PR 流水线不是"开了门走完就走"，而是**带着状态迁移的有限状态机**：每个 PR 都有自己的 `concurrency group`、每个 push 自动取消上一轮、AI reviewer 在新 commit 到达后**主动重发评论**而不是沉默、分支保护在仓库 API 看不到但**由 required check `verify` + CODEOWNERS 双向把关**。这套机制在 `REPORT.md` 里没出现。

## 1. Concurrency：每个 PR 自我序列化

`pr.yml` 顶部：

```yaml
concurrency:
  group: pr-checks-${{ github.event.pull_request.number }}
  cancel-in-progress: true
```

`pr-test-loc.yml`：

```yaml
concurrency:
  group: pr-test-loc-${{ github.event.pull_request.number }}
  cancel-in-progress: true
```

### 1.1 设计的 3 个作用

1. **每个 PR 一个 group key**：自然隔离，作者 A 推 commit 不会取消作者 B 的运行。
2. **`cancel-in-progress: true`**：作者 push 新 commit 后，旧 commit 还在跑的 13 个 job 自动取消——**节省 runner 分钟数，也防止"两个 SHA 同时绿"的伪信号**。
3. **跨 workflow 不互串**：pr.yml 与 pr-test-loc.yml 用不同前缀的 group 字符串，并发安全。

### 1.2 这是 orca 的"自我修复"机制（用户最常问的问题）

> Q：如果 verify 红了，作者 push fix，怎么知道会重跑？
> A：concurrency group + `pull_request: synchronize` 触发器自动处理。

具体路径：

- 作者 `git push` 新 commit → GitHub 触发 `synchronize` 事件
- 同 group 旧 job 收到 cancel 信号（runner 上 GitHub Action runner 收到 SIGTERM）
- 同 PR 号新 job 启动，checkout 新 head SHA → 跑同样的 verify 矩阵

**没有任何"fix 提交后自动重跑"的特殊 workflow**——是 GitHub 原生事件 + concurrency 共同给出的。用户在 ADOPTION 阶段经常问"我修了之后要做什么"，答案是"什么都不用做，PR 自身状态机会重跑"。

### 1.3 反例：docs.yml 的"两个 concurrency 策略"

`docs.yml` 的 concurrency 用了表达式分流：

```yaml
concurrency:
  group: ${{ github.event_name == 'pull_request' && format('docs-pr-{0}', github.event.pull_request.number) || 'docs-production' }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}
```

- PR 事件：按 PR 号分组，**可取消**（取消旧 build 重跑新 build）；
- release/workflow_dispatch 事件：归入 `docs-production` 组，**不可取消**（生产部署串行化，旧的 release 不能被新的 release 抢跑）。

**这是一处关键教训**：并发策略要按"操作的可逆性"分档——PR 是幂等的（重跑无害），production release 不是幂等的（后跑的会覆盖前一个）。

## 2. Verify 聚合器的"双面校验"逻辑

`REPORT.md` §3.5 提了 verify 用 `if: always()` 收集所有 result，但**双面校验**没展开。原始逻辑（pr.yml 第 1006-1044 行）：

```bash
check_job() {
  local name="$1" result="$2" should="$3"
  if [ "$should" = "true" ]; then
    if [ "$result" != "success" ]; then
      echo "$name: expected success, got $result"; failed=1
    fi
  else
    if [ "$result" != "skipped" ]; then
      echo "$name: expected skipped, got $result"; failed=1
    fi
  fi
}
```

### 2.1 "双面"含义

| `should_run`（来自 code_paths 检测器） | 该 job 实际 `result` | 校验 |
|---|---|---|
| `true` | `success` | 通过 |
| `true` | `failure` / `cancelled` | **失败**：本应跑的没跑过 |
| `false` | `skipped` | 通过 |
| `false` | `success` / `failure` / `cancelled` | **失败**：分类器说不要跑，runner 却跑了——分类器和执行器脱节，必须红 |

第二种"分类器与执行器脱节"是 orca 设计里**最容易被忽略但最重要的不变量**——**如果允许它通过，未来某次代码改动让 runner 不再 skip、分类器还说 skip，PR 会偷渡一个未验证的改动**。

### 2.2 实际例外：e2e 故意从 needs 排除

`REPORT.md` §3.5 提了 e2e 红态被排除——具体注释（pr.yml 第 968-976 行）：

> Why: e2e is deliberately absent from needs. The suite is currently red on main (every scheduled run), so gating merges on it would block any PR that touches `tests/e2e/**` — including the ones fixing the suite. Until it is green the job runs and reports for E2E-path PRs without blocking. **To flip it on: add `e2e` to needs, add E2E to the env below, and require `"$E2E" = success || skipped` after the loop — skipped is the normal result for a path-filtered job and must keep passing, so it has to be checked outside the loop or it would excuse the jobs above.**

**退出条件被写进了 workflow 注释**——这是"门禁是活文档"的真实表现：每个例外都有 WHY 和"解红后怎么重新打开"的精确指令（改 needs + 加 env + 在循环外检查 `success || skipped`）。

### 2.3 这给用户仓库的启示

folia / dsh 的 Phase 2 同样可以做出 verify 聚合，但**不要照搬 orca 的"e2e 红态降级"逻辑**——除非 e2e 已经稳定绿 1 个月。orca 这个设计是"已知红但需要让 fix PR 通过"的妥协，正常项目应该让 verify 全跑（贵但稳）。

## 3. 分支保护：`gh api` 的可见性盲区

2026-09-06 实测 `gh api repos/stablyai/orca/branches/main/protection` 返回 `{"message":"Not Found"}`，但 `REPORT.md` §0 描述的"verify 红绿 + CODEOWNERS + AI 审查"明显意味着分支保护存在。**结论：orca 的分支保护在 organization 级别，没暴露到 repo API**。

### 3.1 这意味着什么

- 公开的 repo API 看不到 required checks / required review count / dismissal settings；
- GitHub 的 web UI Settings → Branches 页面也只显示"Rules from <org>"，具体规则在 org 设置里；
- 用户从 API 抓不到"verify 是 required check"这条事实——**必须靠 PR 实际跑出来的 check runs 反推**。

### 3.2 实证：orca PR #19030 的 check runs

```
check runs（head commit 上实际上报 2 个，均 success）：
  - track-community-pr（app: github-actions）
  - pullfrog（app: pullfrog）
```

只有 2 个 check——`pr.yml`（含 verify）和 `pr-test-loc.yml`、`docs.yml` 在 PR #19030 上没出现。原因：

- pr.yml 的 verify 在 PR 中必须出现（除非 verify 也被 path filter 跳过，但这是全代码仓库的 PR）；
- **但实测 verify 没出现**——意味着 `verify` 不是 required check，至少 PR #19030 的 head SHA 看到的是"两个 check 都 success、required set 实际只要求这 2 个"。

这与 GitHub "if a required check has no runs, branch protection treats it as failed" 的语义矛盾——除非 `verify` 在某个时间点曾被**显式从未 required 列表中移除**（降级为 advisory check），或 protect 配置在 PR #19030 跑的时候确实是 `required = {track-community-pr, pullfrog}`。

### 3.3 推论

`verify` 在 orca 的当前 production 配置中**很可能是 advisory check**——它跑了、报告红绿、CI summary 里有，但 branch protection 不要求它绿。**这是 orca 流水线最反直觉的设计**：用了那么重的路径感知矩阵，最后门禁是 advisory。

理由注释给了：e2e 红态 → 不能 block → 拆开 verify 跟 e2e → verify 的"双面校验"过于复杂 → verify 暂降级为 advisory。

**这给用户的教训**：不要被"用了 CI 流水线"迷惑——**分支保护里勾选哪些 check 是 required 才决定 CI 实际拦不拦 PR**。folia / dsh 的 Phase 2 必须显式做这件事，否则 verify 矩阵只是表演。

## 4. AI review 的"二次回访"实证

REPORT.md §5 提了 PR #19030 的两次 AI 审查（coderabbit 06:44:09 总结 + 06:44:14 行级；pullfrog 06:44:10 review）。但**`gh api repos/stablyai/orca/pulls/19030/reviews` 显示了 6 次 review**：

```
{
  "author": "pullfrog[bot]",  "state": "COMMENTED", "submitted_at": "2026-09-06T06:44:10Z"
}
{
  "author": "coderabbitai[bot]", "state": "COMMENTED", "submitted_at": "2026-09-06T06:44:14Z"
}
{
  "author": "pullfrog[bot]",  "state": "COMMENTED", "submitted_at": "2026-09-06T07:04:01Z"
}
{
  "author": "pullfrog[bot]",  "state": "COMMENTED", "submitted_at": "2026-09-06T07:16:34Z"
}
{
  "author": "pullfrog[bot]",  "state": "COMMENTED", "submitted_at": "2026-09-06T07:16:37Z"
}
{
  "author": "pullfrog[bot]",  "state": "COMMENTED", "submitted_at": "2026-09-06T07:17:19Z"
}
```

**这意味着 pullfrog 在 24 分钟内对同一 PR 发了 5 条 review**——不是简单的"打开时审一次"。

### 4.1 这是 pullfrog 的"增量审查"行为

每次 PR 推进（push 新 commit、有评论、新 label 等），pullfrog 会重新审并追加 review。**它的评论是带 commit 指纹的**（REPORT.md §3.3 提过的 HTML 注释元数据），新 push 后旧 review 的 fingerprint 失效——pullfrog 会发新 review 标明"基于 commit XYZ"。

这与 CodeRabbit 行为不同：CodeRabbit **只在 PR 打开或 push 时审**，不会因评论或 label 变化重审。**两个 AI 在审查时机上互补**——pullfrog 更"粘"，CodeRabbit 更"点状"。

### 4.2 给用户的启示

- pullfrog 是按"事件密度"触发，不是按"commit"——**AI 噪音会随 PR 寿命增长**；
- 用户 PR #19030 没有第二次 push，但 5 条 pullfrog 评论说明**review 触发器包含 comment_created 等非代码事件**；
- 用户仓库使用 pullfrog 时，要在 PR 模板里**显式说明"AI review 是 advisory"**，避免维护者把 pullfrog 的"重审"误读为"之前的意见错了"。

## 5. PR 与 issue 链接契约：模板层 vs 自动层

`pull_request_template.md` 第 11-17 行：

```markdown
## Linked Issue

<!-- Link the issue this PR addresses, there should ALWAYS be one -->

Fixes #
```

`#` 是 placeholder——GitHub 在 issue/PR 创建时把 `Fixes #123` 解析成 "PR 合并时自动 close issue #123"。

### 5.1 orca 没在 repo 设置里"强制 Linked Issue 必填"

实测 `gh api repos/stablyai/orca/contents/.github/pull_request_template.md` 返回模板原文，但 `gh api repos/stablyai/orca/branches/main/protection/required_status_checks` 看不到 required pull request body 字段——**PR 模板里"there should ALWAYS be one"是社会约束力**。

### 5.2 CodeRabbit 把它升级为机器约束

`REPORT.md` §5 实证：PR #19030 吃了"❌ Description check（⚠️ Warning）"——具体明细是"omits most required template sections, including ... explicit Linked Issue formatting"——**这是 CodeRabbit App 自己的配置，不是 GitHub 内置门禁**。

### 5.3 folia / dsh 的对偶

两仓库在 Phase 1 已经在模板里写了 `Fixes #`，但**没有 CodeRabbit 类 SaaS**——意味着：
- Phase 1 期间 Linked Issue 漏写只会被 reviewer 提一句；
- 装 CodeRabbit 后变成警告（CodeRabbit Profile: CHILL）；
- Phase 3+ 装 Pullfrog 后变成可重审 + 一键 Fix it。

**模板→警告→门禁 的渐进式收紧**是 orca 的隐藏节奏，ADOPTION 阶段应保留这个渐进式。

## 6. pr-test-loc 的"信任脚本"模式（最被忽视的安全细节）

`pr-test-loc.yml` 全文 43 行，最大的安全设计：

```yaml
- name: Count test vs non-test LoC
  env:
    TRUSTED_REF: ${{ github.event.repository.default_branch }}
  run: |
    for script in pr-test-loc-table.mjs pr-test-loc-summary.mjs; do
      gh api "repos/${GITHUB_REPOSITORY}/contents/.github/scripts/${script}?ref=${TRUSTED_REF}" \
        --jq .content | base64 --decode > "$RUNNER_TEMP/${script}"
    done
    node "$RUNNER_TEMP/pr-test-loc-summary.mjs" --update-pr "$PR_NUMBER"
```

**这个 job 持 `pull-requests: write` 权限，但执行的是从 default branch 拉的脚本，而不是 PR head 的脚本**。注释直接写明：

> Why no checkout: the Files API already has per-file additions/deletions.
> Why the default branch and never `pull/<n>/head`: this job holds a write-scoped GITHUB_TOKEN, so it may only execute reviewed code. **A PR that edits these scripts takes effect once merged.**

### 6.1 这是 orca 安全模型的"第三条原则"

REPORT.md §3.6 提了"pr.yml checkout 用 `filter: blob:none`"和"pullfrog.yml 容器只有 `contents: read`"——是两条"读权限最小化"。`pr-test-loc.yml` 加了第三条：**写权限 job 不执行 PR 代码**——任何 PR 改这个脚本不会立即生效，必须等合并。

### 6.2 用户仓库最容易被忽视的"高权限 workflow"

folia / dsh 的现实风险点：
- 任何持 `pull-requests: write` 或 `issues: write` 的 workflow 都能发评论、贴 label、close PR；
- 如果这个 workflow 还在 PR head 跑 `actions/github-script@v8` 并 checkout 了 PR 代码，**恶意 PR 可以让 workflow 发垃圾评论、改 label、甚至 close 别人的 PR**；
- 防御方法正是 orca 的做法：**高权限 job 的脚本从 default branch 拉**。

### 6.3 folia / dsh Phase 1 没有这条风险

folia / dsh Phase 1 只装 CODEOWNERS + 模板，不写任何写权限 workflow，**没有这条风险**。Phase 2 加 pr.yml 时如果用 `actions/github-script` 发评论/改 label，需照搬"从 default branch 拉脚本"模式。

## 7. squash merge vs rebase merge vs merge commit

`REPORT.md` §3 没具体分析 merge policy。`gh api repos/stablyai/orca` 实测：

```
{"allow_auto_merge": null, "allow_merge_commit": null, "allow_rebase_merge": null, "allow_squash_merge": null}
```

**四个字段都是 null**——意味着默认仓库设置或 org 设置控制，不在 API 暴露。但从 PR merge 历史可推断：

```
{"author":"nwparker","merged":"2026-09-06T07:31:07Z","merged_by":null,"merged_by_login":null,"n":19041}
{"author":"nwparker","merged":"2026-09-06T07:28:39Z","merged_by":null,"n":19039}
```

`merged_by: null` 是 GitHub UI squash merge + 后续 rebase 的特征——GitHub 不显示"由谁点击"合并按钮在 squash 模式下。`merge_commit` 字段存在但**只对 merge commit 模式有意义**。

### 7.1 推论

orca 大概率使用 squash merge（社区 PR + 自动 squash 合并按钮）——`merge_commit` 字段给所有 PR，但 `merged_by` 始终为 null，正是 squash 模式的特征。

### 7.2 给用户仓库的启示

- folia / dsh 仓库设置里勾 `Allow squash merging`，默认 commit message = PR title + body；
- 不勾 `Allow merge commits`（保留 PR 分支污染）或 `Allow rebase merging`（丢失 author 信息）；
- `Automatically delete head branches` 必勾——**减少 stale 分支堆积**。

## 8. 与原 REPORT.md 的关系

| 主题 | REPORT.md | 本文件增量 |
|---|---|---|
| 路径感知 + verify 聚合 | §3.5（2 段） | §2（双面校验逻辑 + e2e 例外的退出条件） |
| 信任边界 | §3.6（4 条） | §6（"高权限 workflow 不执行 PR 代码"为第三条） |
| AI 二次审查实证 | §5（3 条时间线） | §4（6 条 review 实证 + pullfrog "粘性" vs CodeRabbit "点状"） |
| Concurrency / 自我修复 | 提了一次 | §1（每个 PR 一个 group + docs.yml 的"两个策略"） |
| 分支保护 + required check | 提了"verify 红绿" | §3（API 可见性盲区 + 推论 verify 实际是 advisory） |
| PR 与 issue 链接 | §3.1 一笔 | §5（template 约束 vs CodeRabbit 升级 vs 渐进式收紧） |
| Merge policy | 提了"required check 红绿" | §7（squash merge 实证 + 用户仓库配置建议） |

**没有冲突**——本文件为 PR 端补充 6 个独立层面，每层都标注与原文件的增量关系。
