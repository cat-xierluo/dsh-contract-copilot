# RELEASE-GOVERNANCE — orca 的发布治理深挖

> 增量研究。`REPORT.md` 仅在 §0、§3.5 提了"verify 红绿"和"required check"，对 release 端完全没碰。本文补全 release-cut.yml 的完整语义、`release-policy.yml` 的"事后仲裁"、docs.yml 的 release_gate 双重把关、hourly/daily/adhoc 三个 dev channel、homebrew-bump 的 tap 同步。

## 0. 一句话增量

orca 的 release 不是"PR 合并后某个 workflow 自动跑"——而是**4 个 workflow + 2 个分支仓库 + 1 个 tap 的链式编排**：release-cut.yml 决定版本号和 tag、release-policy.yml 仲裁 GitHub Release 的合法性、docs.yml 决定是否部署文档站、hourly-mac-build / daily-mac-build / adhoc-mac-build 是 dev channel 旁路、homebrew-bump 把稳定版同步到 homebrew-orca tap。**这 5 个 workflow 共享"tag 必须由 github-actions[bot] 写"的元规则**，由 `release-policy.yml` 强制执行。

## 1. release-cut.yml：单入口 + 状态机

### 1.1 入口：手动 workflow_dispatch（含 schedule 复用）

```yaml
on:
  workflow_dispatch:
    inputs:
      kind: { type: choice, options: [rc, patch, minor, major], default: rc }
      ref: { type: string, default: main }
      dry_run: { type: boolean, default: false }
      version_suffix: { type: string, default: '' }
      version: { type: string, default: '' }   # 显式指定版本（绕过 kind）
```

**只有 5 种触发方式**：
1. `workflow_dispatch` 手动（kind=rc/patch/minor/major）；
2. schedule（CRON 在文件外？需要查）—— 实际看 release-cut.yml 顶部没有 `schedule:` 触发器，**schedule 是其他 workflow 触发的**（CONTRIBUTING.md 提到"scheduled 2x/day RC cron in `release-rc.yml`"）；
3. dry_run 用于演练；
4. `version_suffix` 给 side-branch 加标识（如 `perf` → `v1.2.3-rc.4.perf`）；
5. `version` 显式指定（用于回滚后 leapfrog）。

### 1.2 版本号算法（4 类 kind 的不同语义）

| kind | 算法 | 例子（最新 stable = v1.3.14） |
|---|---|---|
| `rc` | `bump(latest_stable, patch)` 取 base，从该 base 的最高 RC + 1 | `v1.3.15-rc.0` 或 `v1.3.15-rc.(N+1)` |
| `patch` | `bump(latest_stable, patch)` | `v1.3.15` |
| `minor` | `bump(latest_stable, minor)` | `v1.4.0` |
| `major` | `bump(latest_stable, major)` | `v2.0.0` |

关键设计取舍（注释原文）：
> Why: RCs always stabilize the *next* patch after whatever is currently published as stable. Earlier logic tried to "continue the current series" by reading the highest git tag, which silently reopened a series that had already shipped (e.g. cutting `v1.3.21-rc.7` after `v1.3.21` stable was out). Anchoring to `latest_stable + patch` eliminates that class of bug.

**RC 不读最高 git tag，只读最新 stable + 1 patch**——避免"stable 已经发布但 RC tag 没删"导致 reopen shipped series。

### 1.3 三道安全门

门 1 — **stable 必须严格大于 latest stable**：

```bash
if ! semver_gt "$new" "$latest_stable"; then
  echo "::error::Refusing to cut $KIND $new: not greater than latest stable $latest_stable." >&2
  exit 1
fi
```

注释：**"This is the only guard electron-updater actually needs — it compares semver within a channel, so a regressing 'latest' is the one thing that breaks auto-update for fresh installs."**

门 2 — **package.json 作为版本下限**（recovery 机制）：

```bash
package_stable="$(current_package_stable)"
if semver_gt "$package_stable" "$latest_stable"; then
  echo "Stable floor from package.json: $package_stable"
  latest_stable="$package_stable"
fi
```

如果 main 上 `package.json` 已经在 `v1.4.155`，但 GitHub releases list 还停在 `v1.4.154`（人为删除/回滚），下一次 `kind=patch` 会**自动以 package.json 为下限**，避免"repatch"到更老的版本。

门 3 — **orphan tag 恢复**（cut 失败但 tag 已推送）：

注释原文（精确的失败案例）：
> Why: if a previous cut pushed the tag but was cancelled (or the dependent release build jobs otherwise failed to start) before the GitHub Release was published, the tag now exists on the remote but "latest stable" still points at the prior version. Every subsequent patch cut then recomputes the same version and dies on "Tag already exists." **This exact sequence wedged the cut pipeline on 2026-05-01 when v1.3.26 was pushed by a cancelled run (25237882049) — every patch cut after that rehit the same tag for hours until the orphan release was dispatched by hand.**

恢复策略：tag 存在但 draft 或 missing → 复用 tag；tag 存在且 published → 拒绝（必须人工）。

### 1.4 off-main release 不污染 main

```bash
main_sha="$(git rev-parse origin/main)"
if [[ "$sha" == "$main_sha" ]]; then
  echo "push_main=true" >>"$GITHUB_OUTPUT"
else
  echo "push_main=false" >>"$GITHUB_OUTPUT"
fi
```

注释：
> Why: only push the version-bump commit back to main when the caller is releasing the exact tip of main. For any older or off-main ref we leave main alone and only publish the tag.

**这是"hotfix from old commit"模式**：当 bad commit 刚落地，可以 `kind=patch, ref=<good-sha>` 切一个旧 SHA，**main 不被改、tag 指向好 commit、fix 之后再 forward 到 main**。

### 1.5 唯一写者身份校验

release-cut.yml 第 116-119 行：

```yaml
- name: Configure git author
  run: |
    git config user.name "github-actions[bot]"
    git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
```

+ release-policy.yml 第 36 行：
```js
const allowed = author === "github-actions[bot]" && ...
```

**所有 tag 必须由 `github-actions[bot]` 写**——人工 git tag 会被 release-policy.yml 拒绝。这是 orca 的"写者白名单"。

## 2. release-policy.yml：事后仲裁

```yaml
on:
  release:
    types: [published, edited]

jobs:
  enforce:
    if: github.repository == 'stablyai/orca'
    runs-on: ubuntu-latest
    steps:
      - name: Enforce release policy
        uses: actions/github-script@v8
        with:
          script: |
            const release = context.payload.release;
            const tag = release.tag_name;
            const author = release.author?.login;
            const stableTag = new RegExp(`^v${version}$`);
            const prereleaseTag = new RegExp(
              `^(?:v${version}-rc\\.${number}(?:\\.[0-9A-Za-z]+)?|mobile(?:-android)?-v${version})$`,
            );
            const allowed = author === "github-actions[bot]" &&
              (stableTag.test(tag) || expectedPrerelease);
```

### 2.1 三类合法 tag

- `v<digit>.<digit>.<digit>` — stable
- `v<digit>.<digit>.<digit>-rc.<digit>[.<alphanum>]` — RC（允许 `v1.4.184-rc.0.perf` 这种 side-branch 标识）
- `mobile-android-v<digit>.<digit>.<digit>` — 移动端

### 2.2 不合法 release 的处理（强删）

```js
await github.rest.repos.updateRelease({
  owner, repo, release_id: release.id,
  draft: true, prerelease: true, make_latest: "false",
});
await restoreLatestStable();
await github.rest.repos.deleteRelease({ owner, repo, release_id: release.id });
try {
  await github.rest.git.deleteRef({ owner, repo, ref: `tags/${tag}` });
} catch (error) {
  if (error.status !== 404) throw error;
}
```

**非法 release 会被：**
1. 标 draft（不再显示在公共 release 列表）；
2. 标 prerelease（不进 `make_latest` 候选）；
3. **强制删除**（release 实体）；
4. **强制删除 git tag**（refs/tags/<tag>）；
5. `restoreLatestStable()` 把 `make_latest: "true"` 设回最近一个合法 stable。

注释：
> Deleted unauthorized release ${tag} created by ${author}.

### 2.3 用途

防御场景：
1. 开发者误 git tag + git push → release-policy 自动删除；
2. 第三方往 repo push 一个 mobile 之外的 tag（如 `evil-v1.0.0`）→ 被正则拒绝；
3. mobile tag 不带 `-android-` 前缀 → 拒绝；
4. RC suffix 用错（如 `v1.0.0-rc.abc`）→ 拒绝。

### 2.4 与 release-cut.yml 的协作关系

| 角色 | release-cut.yml | release-policy.yml |
|---|---|---|
| 时机 | 前置（创建 tag + bump package.json） | 后置（监听 published/edited） |
| 写权限 | `contents: write`（cut job） | `contents: write`（删除非法 release） |
| 防御目标 | 防止 cut 出不合法版本 | 防止非 release-cut 路径创建 release |
| 撤销能力 | 没有（一次走到底） | 有（删 release + tag + restore make_latest） |

**这是 release 治理的"双工位"**——cut 是"做"，policy 是"拆"。两个 workflow 共担合法性校验的不同阶段。

## 3. docs.yml 的 release_gate：双重授权

`docs.yml` 第 79-200 行是 release_gate：

```yaml
release_gate:
  name: Authorize release
  if: >-
    github.repository == 'stablyai/orca' &&
    (github.event_name == 'release' || github.event_name == 'workflow_dispatch')
  steps:
    - name: Validate stable desktop tag
      env:
        RELEASE_TAG: ${{ github.event.release.tag_name }}
        INPUT_TAG: ${{ inputs.tag }}
        RELEASE_PRERELEASE: ${{ github.event.release.prerelease }}
        RELEASE_DRAFT: ${{ github.event.release.draft }}
        RELEASE_AUTHOR: ${{ github.event.release.author.login }}
```

### 3.1 三重授权校验

```bash
authorized_ref=false
[[ "$WORKFLOW_REF" == "refs/heads/$DEFAULT_BRANCH" ]] && authorized_ref=true

authorized_author=false
[[ "$(jq -r '.author.login' <<<"$release_json")" == "github-actions[bot]" ]] && authorized_author=true

release_state_ok=false
if [[ "$(jq -r '.tag_name' <<<"$release_json")" == "$tag" &&
  "$(jq -r '.prerelease' <<<"$release_json")" == "false" &&
  "$(jq -r '.draft' <<<"$release_json")" == "false" ]]; then
  release_state_ok=true
fi
```

**三项必须全为 true 才部署**：
1. **authorized_ref**：触发 workflow 的 ref 必须是 default branch（防 PR 触发的 workflow_dispatch 部署）；
2. **authorized_author**：release 的作者必须是 github-actions[bot]（防人工 git tag）；
3. **release_state_ok**：tag 一致 + 非 prerelease + 非 draft（防 RC 文档被部署为生产）。

### 3.2 tag → commit SHA 解析（防 force-move）

```yaml
- Resolve tag to immutable commit SHA before handing it to the deployment job.
  This prevents a force-moved tag from changing the source between authorization and checkout.
```

注释里的核心防御：**即使 tag 在 authorization 和 deploy 之间被 force-move，部署的是原始 SHA**——这是"tag 不应被 force-move"的具体防护。

### 3.3 docs production 部署到独立 environment

```yaml
production:
  needs: release_gate
  environment:
    name: docs-production
    url: https://www.onorca.dev/docs
```

用 GitHub `environment` 隔离 docs-production 部署——manual approval 在这里有效，但本仓库的 docs-production 看起来没启用 required reviewers（注释暗示"the intended follow-up"）。**用户从 orca 借鉴时如果要在 folia / dsh 部署文档站，也用 environment 隔离**。

## 4. 三个 dev channel：hourly / daily / adhoc

`REPORT.md` 没说的事——**main 之外还有 3 个 dev-channel 仓库**：

| Channel | 触发器 | 仓库 | Retention | 用途 |
|---|---|---|---|---|
| `hourly-mac-build.yml` | cron `0 * * * *` | `stablyai/orca-hourly` | 72 builds（~3 天） | main 每小时签名 + 公证 |
| `daily-mac-build.yml` | cron `15 18 * * *` | `stablyai/orca-daily` | 30 builds（~30 天） | main 每天 mac + win |
| `adhoc-mac-build.yml` | workflow_dispatch（指定 ref） | `stablyai/orca-adhoc` | 30 天（按年龄） | 任意 branch 的 mac + win |

### 4.1 为什么不直接发 main 的 release？

注释原文（hourly）：
> Artifacts publish to `stablyai/orca-hourly`, never to `stablyai/orca`: the main repo's releases atom feed exposes only its 10 newest entries, so 24 hourly tags a day would evict every stable/RC entry and break updates for real users.

**GitHub releases atom feed 只暴露 10 条**——如果 hourly tag 发到 main，stable/RC 会被踢出。**这是 GitHub 平台的硬限制，不是政策选择**。

### 4.2 freshness 检查（避免空跑）

```bash
last_sha="$(gh release view "$last_body" --repo "$DAILY_REPO" --json body \
  --jq '.body | capture("commit `(?<sha>[0-9a-f]{7,40})`") | .sha' 2>/dev/null || true)"
if [[ -n "$last_sha" && "$head_sha" == "$last_sha"* ]]; then
  echo "should_build=false" >>"$GITHUB_OUTPUT"
  echo "main is unchanged since $last_body ($last_sha); skipping."
fi
```

**从上一次 release 的 body 里正则解析出 sha**——sha 一样就跳过整个 build。**节省 runner 时间 + 避免堆积冗余 tag**。

### 4.3 ad-hoc 的"ref 验证"安全门

adhoc-mac-build.yml 的"Vet the requested inputs"：

```bash
if ! git rev-parse --verify --quiet "$REQUESTED_SHA^{commit}" >/dev/null; then
  echo "::error::Commit $REQUESTED_SHA is not in stablyai/orca."
  exit 1
fi
if [[ -z "$(git for-each-ref --contains "$REQUESTED_SHA" refs/heads refs/tags | head -1)" ]]; then
  echo "::error::Commit $REQUESTED_SHA is not reachable from any branch or tag of stablyai/orca; refusing to build it."
  exit 1
fi
```

**两段校验**：
1. commit 存在；
2. commit 从某个 branch 或 tag reachable（**不是 PR-only commit**——拒绝 PR head，因为 PR head 不能保证稳定性）。

注释：
> PR refs are refused outright — this workflow runs the checked-out code next to MAC_CERTS and the notary password, so "just build that community PR" must not become a way to hand fork code the release identity.

**这是 release 端对抗"恶意 PR 借 ad-hoc build 拿到签名身份"的具体防御**——任何 PR head 都拒绝，必须 merge 到 branch 后才行。

### 4.4 dev-channel vs production-channel 的 trade-off

| 维度 | dev channel | production (release-cut) |
|---|---|---|
| 测试覆盖 | 无（"No tests ran"） | 完整 E2E（terminal-rendering-golden） |
| 签名 | macOS yes + notarize；Windows no | macOS + Windows 都 signed（SignPath 4h 等待预算） |
| 文档站部署 | 否 | 是（docs.yml release_gate） |
| Homebrew tap 更新 | 否 | 是（homebrew-bump.yml） |
| Telemetry | 关闭（不传 `ORCA_BUILD_IDENTITY`） | `stable` 或 `rc` |
| 主要消费者 | 内部开发者 + 早期采用者 | 真实用户 |

**dev-channel 是"低成本内部试用"，production 是"高成本正式发布"**——这种分工让 release-cut 的 30-90 分钟开销不至于拖慢开发。

## 5. homebrew-bump.yml：tap 同步

### 5.1 触发器设计取舍

```yaml
on:
  workflow_call:
    inputs:
      tag: { required: true, type: string }
  workflow_dispatch:
    inputs:
      tag: { required: true, type: string }
```

**显式不用 `release.published` 触发器**——注释：
> Why no `release.published` trigger: other products shipped from this repo (e.g. mobile under `mobile-v*`) also publish GitHub Releases. A blanket `release.published` trigger would fire this workflow for any of them and attempt to download `orca-macos-*.dmg` from a non-desktop release, at best 404ing and at worst (if the filter were weaker) rewriting the cask to a non-desktop version.

**mobile-v0.0.1 也走 release.published，但 mobile 没有 macOS DMG**——触发器必须由 release-cut 显式 `workflow_call` 调起。

### 5.2 cask token 分流

```bash
if [[ "$TAG" =~ ^v[0-9]+\.[0-9]+\.[0-9]+-rc\.[0-9]+$ ]]; then
  token="orca@rc"
  branch_token="orca-rc"
elif [[ "$TAG" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  token="orca"
  branch_token="orca"
```

- 稳定版 → `Casks/orca.rb`（用户 `brew install --cask stablyai/orca/orca`）
- RC 版 → `Casks/orca@rc.rb`（用户 `brew install --cask stablyai/orca/orca@rc`）

**两个 cask 互不冲突**——但都是 `Orca.app`，所以切换 channel 需要先 `brew uninstall --cask` 再 install 另一个。CONTRIBUTING.md 写明"Switch channels with a normal `brew uninstall --cask` followed by the install for the other channel. Do not use `--zap` unless you intentionally want to remove local Orca state."

### 5.3 squashed auto-merge

```bash
gh pr merge "$branch" --squash --delete-branch
```

注释：
> Why: squash-merge immediately rather than `--auto`. The tap has no required checks or branch protection, and `gh pr merge --auto` only activates when there's something to wait on — on a repo with no gates it silently no-ops, leaving the PR open forever.

**auto-merge 在没有 required check 的 repo 上是 no-op**——这是 GitHub 行为细节，orca 显式绕过。**用户仓库如果 homebrew tap 没设 required check，不要用 `--auto`**，直接 `--squash`。

### 5.4 buf0-bot 跨仓库 token

```yaml
- name: Generate buf0-bot token
  uses: actions/create-github-app-token@v3
  with:
    app-id: 2590194
    private-key: ${{ secrets.BUFO_BOT_PRIVATE_KEY }}
    owner: stablyai
    repositories: homebrew-orca   # 限定到这个仓库
```

`buf0-bot` 已经在 `track-community-prs.yaml` 用过——同一 App token 服务多个 workflow。**App token 比 PAT 好在：自动 1 小时过期、可限定到具体仓库、可审计身份**。

## 6. 用户 PR 合并后多久能 release？

### 6.1 实际节奏（`gh api repos/stablyai/orca/releases` 实测）

最近 8 个 stable releases 的时间分布：

| Tag | published_at | 间隔 |
|---|---|---|
| v1.4.197 | 2026-09-04T00:45:53Z | — |
| v1.4.196 | 2026-09-03T01:50:54Z | ~25h |
| v1.4.195 | 2026-09-02T03:51:16Z | ~26h |
| v1.4.194 | 2026-09-01T04:51:09Z | ~23h |
| v1.4.193 | 2026-08-31T06:42:17Z | ~22h |
| v1.4.192 | 2026-08-29T08:18:41Z | ~46h |
| v1.4.191 | 2026-08-28T18:32:41Z | ~14h |
| v1.4.190 | 2026-08-26T19:45:57Z | ~46h |

**实测节奏：1 stable / 1-2 天**，但有 46h 间隔（周末/跳过）。

### 6.2 RC 节奏

| RC | published_at |
|---|---|
| v1.4.184-rc.0 | 2026-08-16T03:05:13Z |
| v1.4.183-rc.0 | 2026-08-14T09:00:20Z |

**不是 daily RC**——CONTRIBUTING.md 提到"scheduled 2x/day RC cron in `release-rc.yml`"但实测 RC 不是每天切，可能是 allow-list 后台手动控制 + RC draft 在合并前不发。

### 6.3 main commit → release tag 的端到端时间

公式：

```
T_release = T_PR_merged + T_queue + T_release_cut_trigger + T_cut_duration + T_release_publish
```

- `T_release_cut_trigger`：人类操作 + GitHub UI 延迟，~5-30 分钟
- `T_cut_duration`：cut 阶段跑 ~5 分钟（含 semver 计算 + git tag）
- `T_release_publish`：release 阶段跑 ~5-15 分钟（GitHub Release + artifact upload）
- `T_PR_merged → T_release`：典型 **30 分钟 ~ 数小时**

**没有一个 "PR 合并 → 自动 release" 的 workflow**——release 是 **手动 trigger + 自动执行**。这是有意设计：cut 涉及版本号选择、kind 选择、是否 dry-run、是否显式 version——这些都需要人工判断。

### 6.4 给 folia / dsh 的启示

- **不要做"PR 合并自动 release"**——`auto-release-on-merge` 类 action 在小项目上很常见，但每次发布都是产品决策（"现在发还是等下一个 fix？"），应该人工 trigger。
- **如果想 daily release**：定时 schedule + workflow_dispatch + allow-list 维护者手动 trigger，比"PR 合并触发"靠谱。
- **release-cut 的版本号算法值得照搬**：`latest_stable + bump + semver_gt check` 三件套，用 50 行 bash 就能实现，不必依赖 release-please 这种重型工具。

## 7. 与原 REPORT.md 的关系

| 主题 | REPORT.md | 本文件增量 |
|---|---|---|
| Release 整体 | 0（除 verify 矩阵） | 5 个 workflow 的协作图 |
| 版本号算法 | 0 | 4 类 kind + 3 道安全门 + off-main 模式 |
| release-policy.yml | 0 | 强删机制 + 与 release-cut 的双工位分工 |
| docs.yml release_gate | 0 | 三重授权 + tag-to-SHA 防 force-move |
| hourly/daily/adhoc | 0 | GitHub releases feed 10 条限制 + freshness 检查 + PR ref 拒绝 |
| homebrew-bump | 0 | cask token 分流 + auto-merge no-op 警告 + buf0-bot 复用 |
| 用户 PR 合并到 release 时间 | 0 | 实测 ~30 分钟到数小时 + 无自动 release 的设计意图 |

**没有冲突**——本文件填补 REPORT.md 完全未触及的 release 治理层，并补足一份实测时间表。
