# dsh-contract-copilot 落地 orca 治理体系——分阶段方案

> 调研日期：2026-09-06。基线：`/Users/maoking/Library/Application Support/maoscripts/skills/legal-dsh-plugin/dsh-contract-copilot`（上游 `cat-xierluo/dsh-contract-copilot`，**公有仓库**）。贡献者：maoking（17 commits）、杨卫薪律师（1 commit）。维护期是 “双人以 maoking 为主 + 杨律师审核业务规则” 的状态。
> 注意：父目录 `legal-dsh-plugin/` 不是 git 仓库；本报告只针对子仓库 dsh-contract-copilot。

---

## 现状盘点

| 项 | 状态 | 备注 |
|---|---|---|
| `.github/PULL_REQUEST_TEMPLATE.md` | ❌ 无 | 当前 PR 描述完全自由文本，没有机读锚点 |
| `.github/ISSUE_TEMPLATE/` | ❌ 无 | 用户/律师直接打 issue，没有结构化表单 |
| `.github/workflows/` | ❌ 无 | **完全没有 CI**——这是最大缺口 |
| `.github/CODEOWNERS` | ❌ 无 | 杨律师业务规则的 ownership 未声明 |
| 机器人审查 | ❌ 无 | CodeRabbit / pullfrog 都未安装 |
| 测试现状 | ⚠️ 16 个 spec.ts 健康（峰值 110-150MB） | worktree 里 21 个（多了 5 个 agent 写的），有内存爆炸风险 |
| `package.json` scripts | ✅ 有 `test: "vitest run"` + `build` | 已有基础工具链 |

dsh-contract-copilot 是 **公有** 仓库（pullfrog for OSS 适用），但体量小（双维护者、PR < 3/月），治理强度应介于 folia（私有）与 orca（大型开源）之间——**借鉴 orca 的结构性方法，但只取前三层（模板 + 路径 CI + CodeRabbit），暂不上 Pullfrog**。

---

## Phase 1：最小集（今天就能做，预计 1 小时）

**目标**：让 PR 描述变可机读、声明杨律师的 ownership、补上基础 CI。

### 1.1 新增 PR 模板

路径：`.github/pull_request_template.md`（新建）

```markdown
## ELI5

<!-- 一段话给非开发人员（如合作律师）说明这个 PR 干了什么 -->

## Summary

<!-- 1-3 行说做了什么 -->

-

## Why

<!-- 为什么要做。关联的 issue 编号、用户反馈、回归现象 -->

- 关联 issue / ISS: <!-- 例：ISS-216 / 无 -->
- 触发场景:

## What Changed

<!-- 列出关键改动点；保持 scope tight -->

-

## Linked Issue

Fixes #

## Visual Proof

<!-- 工作台 UI / CLI 输出变更附 BEFORE/AFTER；纯代码/逻辑变更写 N/A 加理由 -->

`N/A`（理由：...）

## Test Plan

<!-- 实际跑过的命令和结果。不接受 "Not run in this step" -->

\`\`\`text
$ pnpm typecheck
$ NODE_OPTIONS=--max-old-space-size=2048 pnpm test
\`\`\`

## AI Disclosure

<!-- 若使用了 AI 工具请声明 -->

## Notes

<!-- 跨平台 / 性能 / 安全 / 业务规则影响；无则 N/A -->

## Checklist

- [ ] PR 小且聚焦
- [ ] ELI5 / Summary / Why / What Changed / Test Plan 都填了
- [ ] UI/CLI 变更附 BEFORE/AFTER，或 N/A
- [ ] 自审正确性 / 安全 / 业务规则
- [ ] 业务规则变更已与杨律师同步（或 N/A）
- [ ] `pnpm typecheck / test` 本地通过（或说明等 CI）
```

### 1.2 新增 CODEOWNERS

路径：`.github/CODEOWNERS`（新建）

```
# dsh-contract-copilot domain-by-domain ownership.
# 命中路径的 PR 自动请求对应 reviewer。

# 业务规则层：合同审查四步流程、计划/审查/报告生成——合作律师审核
/docs/business-rules/ @杨卫薪律师
/src/plan-review/ @杨卫薪律师
/src/intake-fields/ @杨卫薪律师
/src/host-api/contract-types.ts @杨卫薪律师

# 核心实现：主维护者独占
/src/agent-coordinator/ @maoking
/src/python-bridge/ @maoking
/src/docx-view/ @maoking
/src/session/ @maoking

# 测试套件：主维护者独占（worktree 里曾有 vitest OOM 循环，参考 [DEC-…] 决策）
/tests/ @maoking

# CI 与发布配置：主维护者独占
/.github/ @maoking
/package.json @maoking
/tsconfig.json @maoking
/tsconfig.client.json @maoking

# 兜底：所有 PR 至少要主维护者点头
* @maoking
```

**为什么业务规则路径单独归律师**：律师是这套工具的最终用户、也是唯一有资格判断“合同审查四步流程是否正确”的人；把审核权下沉到代码层比放到文档层效率高（律师 PR review 时直接看到代码与文档的对应）。

### 1.3 新增基础 CI workflow

路径：`.github/workflows/ci.yml`（新建）

```yaml
name: CI
on:
  pull_request: [opened, synchronize, reopened]
  push:
    branches: [main]

jobs:
  typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: pnpm/action-setup@v4
        with: { version: 10 }
      - uses: actions/setup-node@v6
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck

  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: pnpm/action-setup@v4
        with: { version: 10 }
      - uses: actions/setup-node@v6
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      # 堆上限与本机一致——主仓 package.json 已注入
      - run: NODE_OPTIONS=--max-old-space-size=2048 pnpm test

  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: pnpm/action-setup@v4
        with: { version: 10 }
      - uses: actions/setup-node@v6
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
```

**为什么堆上限要在这里也写**：CI runner 默认也有 OOM 风险；本机已加的 `NODE_OPTIONS=--max-old-space-size=2048` 在 CI 同样必要，并明确告诉 reviewer “这个项目已有 OOM 循环历史，堆顶是合约”。

### 1.4 在分支保护里把 `test` 与 `typecheck` 设为 required

Settings → Branches → main → Require status checks → 勾 `test` 与 `typecheck`。

---

## Phase 2：路径感知 + docs-only 跳过（预计半天）

**目标**：docs-only PR 不跑贵 CI；前端/后端 / docx 解析 / 测试密度按路径分类。

### 2.1 detect + fan-out pattern

路径：`.github/workflows/pr.yml`（新建；与 Phase 1 的 ci.yml 并存）

```yaml
name: PR Checks
on:
  pull_request: [opened, synchronize, reopened, ready_for_review]

jobs:
  detect:
    runs-on: ubuntu-latest
    outputs:
      src_changed: ${{ steps.paths.outputs.src_changed }}
      docs_only: ${{ steps.paths.outputs.docs_only }}
      worktree_only: ${{ steps.paths.outputs.worktree_only }}
    steps:
      - uses: actions/checkout@v6
        with: { fetch-depth: 0 }
      - id: paths
        run: |
          changed=$(git diff --name-only origin/${{ github.base_ref }}...HEAD)
          echo "src_changed=$(echo "$changed" | grep -qE '^src/|^tests/' && echo true || echo false)" >> $GITHUB_OUTPUT
          echo "docs_only=$(echo "$changed" | grep -qvE '^src/|^tests/|^\.github/' && echo true || echo false)" >> $GITHUB_OUTPUT
          echo "worktree_only=$(echo "$changed" | grep -qE '^src/agent-coordinator/' && echo true || echo false)" >> $GITHUB_OUTPUT

  verify:
    needs: detect
    if: needs.detect.outputs.docs_only == 'false'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: pnpm/action-setup@v4
        with: { version: 10 }
      - uses: actions/setup-node@v6
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: NODE_OPTIONS=--max-old-space-size=2048 pnpm typecheck
      - run: NODE_OPTIONS=--max-old-space-size=2048 pnpm test

  docs_only_ok:
    needs: detect
    if: needs.detect.outputs.docs_only == 'true'
    runs-on: ubuntu-latest
    steps:
      - run: echo "Docs-only change; expensive PR checks skipped."
```

### 2.2 测试密度度量（review 信号，非门禁）

参考 orca 的 `pr-test-loc.yml`——统计 test vs non-test LoC，触发后评论到 PR。**重要安全设计**：脚本从 default branch 拉（不执行 PR head），避免恶意 PR 篡改度量逻辑。

```yaml
# .github/workflows/pr-test-loc.yml
name: PR Test LoC Ratio
on: { pull_request: [opened, synchronize] }
permissions:
  pull-requests: write
  contents: read
jobs:
  ratio:
    runs-on: ubuntu-latest
    steps:
      # 关键：脚本必须来自 main，不来自 PR head
      - uses: actions/checkout@v6
        with: { ref: main, path: _main }
      - uses: actions/checkout@v6
        with: { path: _pr }
      - run: |
          test_loc=$(wc -l $(find _pr/tests -name '*.ts' -not -name '*.test.ts') 2>/dev/null | tail -1 | awk '{print $1}')
          impl_loc=$(wc -l $(find _pr/src -name '*.ts' -not -name '*.test.ts') 2>/dev/null | tail -1 | awk '{print $1}')
          ratio=$(awk "BEGIN { printf \"%.2f\", $test_loc / ($impl_loc + 1) }")
          echo "Test/Impl ratio: $ratio"
          # 评论到 PR（API 调用省略）
```

---

## Phase 3：AI 审查层（公有仓库，可上 pullfrog；预计 1 天）

**目标**：节省人工 review 时间，对应 folia 的 Phase 3 但配置更轻。

### 3.1 公有仓库的优势

dsh-contract-copilot 是**公有仓库**——**pullfrog for OSS（DeepSeek Pro 免费）适用**，**零成本**获得 agent 级审查。这一条比 folia 优越得多，建议优先接入。

### 3.2 接入步骤

1. 在 [pullfrog.com](https://pullfrog.com) 注册账号并关联 `cat-xierluo/dsh-contract-copilot`；
2. pullfrog 会自动创建 `.github/workflows/pullfrog.yml`，或在确认后手动合并（建议手动，让它走 PR 流程过你自己的 review）；
3. 装 CodeRabbit 同样免费（公有仓库）——两者并行。

### 3.3 配套任务卡

把“装 CodeRabbit + Pullfrog”记入 repo 的 ISS 体系（如果当前没有 ISS，建议用 GitHub Issues + 一个 `governance` label），并在 README 末尾加一段：

```markdown
## 贡献者

PR 流程遵循 [`.github/pull_request_template.md`](.github/pull_request_template.md)。
业务规则变更需要 `@杨卫薪律师` review；实现与 CI 变更需要 `@maoking` review。
机器人审查：CodeRabbit + Pullfrog。
```

---

## 边界（明确不做）

- **multi-agent-orchestration skill 联动**：本 skill 是用户的私有编排工具，与 dsh 仓库无关，不在治理落地范围内；
- **Yjs 协作 / docx 实时协同**：与治理无关；
- **腾讯云 / 阿里云部署 CI**：公有仓库的 GitHub Actions runner 足够；
- **国际化**：仓库无 i18n 流程，跳过。

## How to apply

- 仓库路径：`/Users/maoking/Library/Application Support/maoscripts/skills/legal-dsh-plugin/dsh-contract-copilot`
- PR 在上游：`https://github.com/cat-xierluo/dsh-contract-copilot`
- 协作伙伴：maoking（主）、杨卫薪律师（业务规则审核）
- Phase 1 优先级：模板 > CODEOWNERS > CI workflow > 分支保护
