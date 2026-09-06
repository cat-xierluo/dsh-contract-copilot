# folia 落地 orca 治理体系——分阶段方案

> 调研日期：2026-09-06。基线：本地克隆的 folia（私有仓库，路径 `/Users/maoking/Library/Application Support/maoscripts/folia`，上游 `cat-xierluo/Folia`）。folia 贡献者：maoking（307 commits，主力）、杨卫薪律师（96 commits，第二活跃）、xierluo（9 commits）、高澄（1 commit）。近期 PR（#160–#164）已显示稳定的“关联 ISS + 跑完 typecheck/test/lint/build/test:e2e 才合并”流程。

---

## 现状盘点

| 项 | 状态 | 备注 |
|---|---|---|
| `.github/PULL_REQUEST_TEMPLATE.md` | ✅ 已有 | 已含 Summary/Why/关联 ISS/Test Plan/Checklist 六个锚点；缺 ELI5/Visual Proof/AI Disclosure/Agent skill upstream boundary/Notes |
| `.github/ISSUE_TEMPLATE/` | ✅ 已有子目录 | 已有结构化表单 |
| `.github/workflows/` | ✅ ci.yml + release.yml | 已有 CI；无 PR 路径感知门禁，无 required check 聚合 job |
| `.github/CODEOWNERS` | ❌ 无 | 改路径无人工路由——杨卫薪律师（96 commits）与 maoking 共同 ownership 需声明 |
| `track-community-prs.yaml` | ❌ 无 | 不在 Project 13（orca 用 bufo-bot 登记）；folia 不需要 Project 跟踪，但可用 `pr-track` workflow 写一条简化的私有登记表 |
| 机器人审查（CodeRabbit / pullfrog） | ❌ 无 | 安装门槛低 |
| `blank_issues_enabled: false` | ❌ 无 | 已有结构化表单，可加一道防线 |

folia 是 **私有** 仓库，与 orca（开源）治理落地的两个关键差异：

1. **pullfrog 的"免费 for OSS" 不可用**——私有仓库需要付费或自托管 LLM 推理。Phase 3 给出私有替代方案（GitHub Copilot code review / self-hosted ollama + pullfrog-action）。
2. **CODEOWNERS 在私有仓库里仍生效**——人类路由逻辑不变。

---

## Phase 1：最小集（今天就能做，预计 30 分钟）

**目标**：让 PR 模板变成“可机读门禁”、把协作伙伴的 ownership 落到 CODEOWNERS。

### 1.1 重写 PR 模板

路径：`.github/PULL_REQUEST_TEMPLATE.md`

替换为下面这份（保留 folia 现有的 Summary/Why/Test Plan，新增或ca 已验证的 ELI5/Visual Proof/AI Disclosure/Notes，并补齐锚点让机器人可读）：

```markdown
## ELI5

<!-- 一段话，对不熟悉这块代码的人说明这个 PR 干了什么 -->

## Summary

<!-- 1-3 行说做了什么 -->

-

## Why

<!-- 为什么要做。不写 why 不接 -->

- 关联 ISS: <!-- 例: ISS-216 / 无 -->
- 触发场景:

## What Changed

<!-- 列出关键改动点；保持 scope tight -->

-

## Linked Issue

<!-- 关联的 issue 编号或描述 -->

Fixes #

## Visual Proof

<!-- UI/行为变更必须附 BEFORE/AFTER；无可视变化写 N/A 加理由 -->

`N/A`（理由：...）

## Test Plan

<!-- 实际跑过的命令和结果。不接受 "Not run in this step" -->

\`\`\`text
$ npm run typecheck
$ npm test
$ npm run lint
$ npm run build
$ cd src-tauri && cargo check
$ npm run test:e2e -- e2e/<file>.spec.ts
\`\`\`

## AI Disclosure

<!-- 非 folia 维护者若用了 AI 工具请声明；维护者忽略 -->

## Agent skill upstream boundary

- [ ] Not applicable, or this change follows `docs/reference/agent-skill-sharing-upstream-boundary.md`

## Notes

<!-- 跨平台（Linux/Windows/macOS）/ SSH/Remote / 性能 / 安全等影响；无则写 N/A -->

## Checklist

- [ ] PR 小且聚焦
- [ ] ELI5 / Summary / Why / What Changed / Test Plan 都填了
- [ ] UI 变更附 BEFORE/AFTER，或 N/A
- [ ] 自审正确性 / 安全 / 性能
- [ ] 跨平台与 SSH/Remote 影响已考虑（或 N/A）
- [ ] `npm run typecheck / test / lint / build` 本地通过（或说明等 CI）
```

**与 orca 模板的差异说明**：删了 AI Disclosure 里"DON'T FILL IN IF YOU ARE STABLYAI TEAM MEMBER" 这种硬编码内部条款（私有仓库没有团队分支），其他锚点一致。

### 1.2 新增 CODEOWNERS

路径：`.github/CODEOWNERS`

```
# Folia domain-by-domain ownership. 命中路径的 PR 自动请求对应 reviewer。

# 核心前端与 Rust 后端主路径——主维护者
/src/ @maoking
/src-tauri/ @maoking

# Skill 契约 / 协作安全护栏
/docs/reference/agent-skill-sharing-upstream-boundary.md @maoking
/config/scripts/*skill*.mjs @maoking

# 工作台 e2e + 性能/导出——第二活跃维护者参与
/src-renderer/tests/ @杨卫薪律师
/src/export/ @杨卫薪律师

# CI/CD 与发布——主维护者独占，避免 release 与 CI 误改
/.github/workflows/ @maoking
/Cargo.toml @maoking
/src-tauri/Cargo.toml @maoking
/src-tauri/tauri.conf.json @maoking

# 兜底：所有 PR 至少要主维护者点头
* @maoking
```

**注意事项**：

- GitHub username 含中文（`@杨卫薪律师`）合法，GitHub 会解析成同名账号；
- 兜底 `* @maoking` 防止漏路径导致 review request 缺失；
- 若你希望共享工作量（与杨律师轮流 merge），可把第二活跃路径的 `@maoking` 改为 `@maoking @杨卫薪律师`，GitHub 会同时请求两位 review。

### 1.3 在仓库设置里开启"未用模板的 issue 关闭"

Settings → General → Issues → “Issues must be created from a template”。这与 orca 的 `blank_issues_enabled: false` 等价但走的是 UI 配置，效果相同。

---

## Phase 2：流程编排（PR 一开就有门禁；预计半天）

**目标**：让 PR 一开就触发路径感知的门禁矩阵，docs-only PR 不跑贵 CI。

### 2.1 路径感知门禁 workflow

路径：`.github/workflows/pr.yml`

参考 orca 的 `pr.yml` 设计（detect code-relevant changes → 15 个布尔开关驱动下游 fan-out → verify 聚合），但 folia 用 npm + tauri 工具链：

```yaml
name: PR Checks
on:
  pull_request: [opened, synchronize, reopened, ready_for_review]

jobs:
  detect:
    runs-on: ubuntu-latest
    outputs:
      frontend: ${{ steps.paths.outputs.frontend }}
      tauri: ${{ steps.paths.outputs.tauri }}
      workflows: ${{ steps.paths.outputs.workflows }}
      docs_only: ${{ steps.paths.outputs.docs_only }}
    steps:
      - uses: actions/checkout@v6
        with: { fetch-depth: 0 }
      - id: paths
        run: |
          changed=$(git diff --name-only origin/${{ github.base_ref }}...HEAD)
          echo "frontend=$(echo "$changed" | grep -qE '^src/|^src-renderer/' && echo true || echo false)" >> $GITHUB_OUTPUT
          echo "tauri=$(echo "$changed" | grep -qE '^src-tauri/' && echo true || echo false)" >> $GITHUB_OUTPUT
          echo "workflows=$(echo "$changed" | grep -qE '^\.github/' && echo true || echo false)" >> $GITHUB_OUTPUT
          echo "docs_only=$(echo "$changed" | grep -qvE '^src/|^src-tauri/|^\.github/|^Cargo' && echo false || echo true)" >> $GITHUB_OUTPUT

  typecheck:
    needs: detect
    if: needs.detect.outputs.frontend == 'true' || needs.detect.outputs.tauri == 'true'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v6
        with: { node-version: 20 }
      - run: npm ci
      - run: npm run typecheck

  test:
    needs: detect
    if: needs.detect.outputs.frontend == 'true' || needs.detect.outputs.tauri == 'true'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v6
        with: { node-version: 20 }
      - run: npm ci
      - run: npm test

  tauri_check:
    needs: detect
    if: needs.detect.outputs.tauri == 'true'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: dtolnay/rust-toolchain@stable
      - uses: Swatinem/rust-cache@v2
      - run: cd src-tauri && cargo check

  lint:
    needs: detect
    if: needs.detect.outputs.frontend == 'true' || needs.detect.outputs.tauri == 'true'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v6
        with: { node-version: 20 }
      - run: npm ci && npm run lint

  verify:
    needs: [detect, typecheck, test, tauri_check, lint]
    if: always()
    runs-on: ubuntu-latest
    steps:
      - if: needs.detect.outputs.docs_only == 'true'
        run: echo "Docs-only change; expensive PR checks skipped." && exit 0
      - if: needs.typecheck.result != 'success' || needs.test.result != 'success' || needs.lint.result != 'success'
        run: |
          echo "::error::One or more required checks failed"
          exit 1
```

**与 orca 的差异**：folia 的工具链比 orca 简单（npm + tauri 不用 cloud/relay），所以门禁数量少很多，但仍保留“detect → fan-out → verify 聚合”的核心骨架。

### 2.2 在分支保护里把 `verify` 设为 required check

Settings → Branches → main → Require status checks to pass before merging → 勾 `verify` + `test`。

**为什么 `test` 也单独勾**：verify 是聚合、test 是叶子——GitHub 的分支保护会按 check 名匹配；如果以后想拆 verify 为多 job（例如独立 e2e），test 已经在那儿是稳的兜底。

---

## Phase 3：AI 审查层（私有仓库的特殊考量；预计 1 天）

**目标**：把 AI 初审接上，避免你/杨卫薪律师每天看十几个 PR 的体力活。

### 3.1 私有仓库的 pullfrog 困境

`pullfrog.yml` 通过 workflow_dispatch 触发 LLM API（DeepSeek Pro / Claude / OpenAI 等），OSS 项目通过 "Pullfrog for OSS" 计划免费用 DeepSeek Pro。**私有仓库不在该计划内**，需要：

- **方案 A（推荐起步）**：走 Pullfrog 付费 plan（[https://pullfrog.com](https://pullfrog.com)），私有仓库也支持，工作量是 OSS 数倍但仍比雇人便宜；
- **方案 B（自托管）**：在你自己机器或 VPS 上搭 ollama + 一个开源 LLM（如 Qwen2.5-Coder-32B），把 pullfrog workflow 的 API key 换成自托管 endpoint；优点是数据不出域，缺点是 GPU 推理成本与质量均待评估；
- **方案 C（最简）**：装 **GitHub Copilot code review**（GitHub 原生），在仓库设置一键启用，缺点是贵（~$39/seat/月），且审查粒度与自定义能力不如 pullfrog。

### 3.2 推荐的初装顺序

1. **先装 CodeRabbit（私有仓库免费）**：仓库 → Settings → Integrations → CodeRabbit，安装后自动审查 PR；模板里加上我们 Phase 1 的 ELI5 / docstring 覆盖率门禁就能开始工作；
2. **再上 Pullfrog（试 1 周付费）**：如果 CodeRabbit 的“规则/覆盖率型审查”能覆盖你日常 60% 的反馈，再加 Pullfrog 处理“语义型正确性”；
3. **预算策略**：3 个月后评估 ROI——若 CI runner 时间节省 > Pullfrog 费用，保留；否则回到 CodeRabbit only。

### 3.3 私有仓库的特殊安全配置

- `permissions: contents: read`——这条 orca 已严格遵守，folia 沿用；
- **`actions/checkout` 的 `persist-credentials: false`**——AI review workflow 里 LLM agent 不应能 push 到你的仓库；
- **不暴露 secret 到 fork PR**：所有 PR 触发的 workflow 都用 `pull_request_target` 而不是 `pull_request`，且 checkout 不带 token（AI 跑的是 default branch 代码，不跑 PR head——orca 的 track-community-prs 就是这个安全设计）。

---

## 边界（明确不做）

- **Project 跟踪**：folia 体量小（PR < 5/月），Project 13 这种 Project 集成是 orca 高并发的专用设计，folia 不需要；
- **多语言/国际化 issue 自动 labeler**：folia 无 i18n 流程，跳过；
- **release.yml 改造**：release.yml 现已能跑，Phase 1-3 期间不动；
- **CODEOWNERS 自动分配轮值**：本次只声明 ownership，轮值由你/杨律师手工决定（避免过度自动化）。

## How to apply

- 仓库路径：`/Users/maoking/Library/Application Support/maoscripts/folia`
- PR 在上游：`https://github.com/cat-xierluo/Folia`
- 协作伙伴：maoking（主）、杨卫薪律师（次）、xierluo（备）
