# 实战检查清单：两个仓库的 Phase 1 落地

> 给 agent 与人读。按此清单逐项打勾，每完成一项把 `[ ]` 改成 `[x]` 并在 PR 链接处填上。
> 完整背景与设计原理见 `REPORT.md`；分阶段路线见各自的 `ADOPTION-*.md`；一页纸总结见 `SUMMARY.md`。

---

## 通用前置（两个仓库都做一次）

- [ ] 确认 `gh` 已登录：`gh auth status` 输出 `✓ Logged in to github.com account cat-xierluo`
- [ ] 确认 fork 或直写权限（folia 和 dsh 都是你主仓库，直接 push 即可）
- [ ] 确认 worktree 习惯：开发用 worktree；主文件夹 `*` 切分支操作一律禁止（沿用现有约定）
- [ ] 完成后跑一遍：删除 worktree、回到主仓、`git status --short` 干净

### 增补 A — Stale 回收（issue 不沉底）

- [ ] 新建 `.github/workflows/stale.yml`（完整 YAML 见 `MAINTAINER-WORKFLOW.md` §3.3）：14 天无活动 → "stale" 标签 + 评论；再 7 天无活动 → 关闭。orca 实测能把 100+ 沉底 issue 在 3 周内收敛到 0。

### 增补 B — CONTRIBUTING.md（contributor contract）

- [ ] 新建 `CONTRIBUTING.md`（最简 30 行；正文见 `MAINTAINER-WORKFLOW.md` §2）。必须明确：贡献者不要提版本号、不要 force-push main、PR 必须走 CODEOWNERS 路由。

### 增补 C — PR 模板加维护意愿

- [ ] 在 PR 模板加 `- [ ] 我愿意在合并后继续维护这个改动` checkbox（详见 `MAINTAINER-WORKFLOW.md` §4.1）。

### 增补 D — 仓库设置

- [ ] Settings → General → Pull Requests → 勾 `Allow squash merging` + `Automatically delete head branches`。orca 实测这样能把 head branch 数从 200+ 压到 50 以下。

### 增补 E — issue severity 标签

- [ ] 创建 3 个 label：`severity:P0 / P1 / P2`。folia / dsh 各自的"影响面 dropdown"映射见 ISSUE-LIFECYCLE.md §6.1 / §6.2。

---

## folia 仓库（私有 — `cat-xierluo/Folia`）

路径：`/Users/maoking/Library/Application Support/maoscripts/folia`

### Phase 1（30 分钟，今天）

- [ ] **PR 模板**：新建/替换 `.github/PULL_REQUEST_TEMPLATE.md`（完整内容见 `ADOPTION-folia.md` §1.1，约 60 行 Markdown）
- [ ] **CODEOWNERS**：新建 `.github/CODEOWNERS`（完整内容见 `ADOPTION-folia.md` §1.2，约 25 行）
  - 特别检查：杨律师在仓库 Settings → Collaborators 里已被加为协作者，否则 CODEOWNERS 不会触发 review request
- [ ] **开启 issue 表单强制**：Settings → General → Issues → 勾 "Issues must be created from a template"
- [ ] **本地验证**：在 fork 或新 branch 上各填一个 PR，跑一次完整的 CI（folia 已有 `ci.yml` + `release.yml`），确认 ELI5 / What Changed 锚点都有可机读字段
- [ ] **commit 信息示例**：`chore(governance): adopt orca-style PR template + CODEOWNERS (Phase 1)`

### Phase 1 增补（来自 ISSUE-LIFECYCLE.md 深挖）

- [ ] **issue 表单**：新建 `.github/ISSUE_TEMPLATE/01-bug-report.yml`（最低成本版，影响面 dropdown 自动映 severity 标签，完整 YAML 见 `ISSUE-LIFECYCLE.md` §6.1）
- [ ] **issue labeler**：新建 `.github/workflows/issue-labeler.yaml`（从 issue body 的 `### Impact` 锚点提取"全量用户 / 部分用户 / 单用户"，映射到 severity 标签）

### Phase 2（半天，下一周内）

- [ ] **新增 `.github/workflows/pr.yml`**：路径感知门禁（detect → fan-out → verify 聚合；完整骨架见 `ADOPTION-folia.md` §2.1）
  - **关键补丁**：verify job 必须显式设为 **required check**（orca 自己的 verify 实际是 advisory，见 `PR-LIFECYCLE.md` §3.3）
- [ ] **分支保护**：Settings → Branches → main → Require status checks → 勾 `verify` 与 `test`
- [ ] **本地验证**：分别用 docs-only、tauri-only、full 三类 PR 走一遍，确认 docs-only 不跑贵 job

### Phase 3（1 天，2 周后决定）

- [ ] **预算评估**：月 PR 数 × 平均 review 时间 vs Pullfrog / Copilot 费用
- [ ] **装 CodeRabbit**：仓库 → Settings → Integrations → 安装
- [ ] **观察 2 周**：CodeRabbit 的 False Positive 率
- [ ] **可选**：装 Pullfrog（付费或自托管）

---

## dsh-contract-copilot 仓库（公有 — `cat-xierluo/dsh-contract-copilot`）

路径：`/Users/maoking/Library/Application Support/maoscripts/skills/legal-dsh-plugin/dsh-contract-copilot`

### Phase 1（1 小时，今天）

- [ ] **PR 模板**：新建 `.github/pull_request_template.md`（完整内容见 `ADOPTION-dsh-contract-copilot.md` §1.1，约 50 行）
- [ ] **CODEOWNERS**：新建 `.github/CODEOWNERS`（完整内容见 `ADOPTION-dsh-contract-copilot.md` §1.2，约 25 行）
  - 业务规则路径（`/docs/business-rules/`、`/src/plan-review/`、`/src/intake-fields/`、`/src/host-api/contract-types.ts`）归 `@杨卫薪律师`
  - 兜底 `* @maoking`
- [ ] **CI workflow**：新建 `.github/workflows/ci.yml`（完整内容见 `ADOPTION-dsh-contract-copilot.md` §1.3）
  - 关键：CI 端也写 `NODE_OPTIONS=--max-old-space-size=2048`，与本机一致（防 vitest OOM 历史重演）
- [ ] **分支保护**：Settings → Branches → main → 勾 `test` 与 `typecheck` 为 required check
- [ ] **本地验证**：跑一次 `pnpm typecheck` + `NODE_OPTIONS=--max-old-space-size=2048 pnpm test`，确认通过
- [ ] **commit 信息示例**：`chore(governance): PR template + CODEOWNERS + CI baseline (Phase 1)`

### Phase 1 增补（来自 ISSUE-LIFECYCLE.md 深挖）

- [ ] **业务规则审核模板**：新建 `.github/ISSUE_TEMPLATE/01-business-rule-review.yml`（杨律师专属，完整 YAML 见 `ISSUE-LIFECYCLE.md` §6.2）：触发条件为"用户投诉合同审查逻辑错/律师提出改进"
- [ ] **bug_report 加 module dropdown**：在 dsh 的 bug_report.yml 里加 `module` 下拉（intake / plan-review / docx-view / python-bridge / session），让 CODEOWNERS 自动路由 + 模板字段双重定位（详见 `ISSUE-LIFECYCLE.md` §6.2）

### Phase 2（半天，下一周内）

- [ ] **新增 `.github/workflows/pr.yml`**：docs-only 跳过贵 CI；detect → verify 聚合（骨架见 `ADOPTION-dsh-contract-copilot.md` §2.1）
- [ ] **新增 `.github/workflows/pr-test-loc.yml`**：测试密度度量评论（review 信号、非门禁；骨架见 §2.2）
- [ ] **本地验证**：开一个 docs-only PR 确认贵 job 全部 skipped；开一个 src 改动的 PR 确认门禁全跑

### Phase 3（1 天，**优先** —— 公有仓库可免费）

- [ ] **注册 Pullfrog**：[pullfrog.com](https://pullfrog.com) 关联仓库，免费 OSS 计划
- [ ] **合并 pullfrog.yml**：让 pullfrog 自动生成的 workflow 走 PR 流程过你的 review
- [ ] **装 CodeRabbit**：同上并行
- [ ] **观察 2 周**：AI 意见与人工 review 的重叠率

---

## 验证 — 两仓库通用

每个仓库完成 Phase 1 后跑一遍：

```bash
cd <repo-root>
git checkout -b governance/phase-1-$(date +%Y%m%d)
git add .github/
git commit -m "chore(governance): Phase 1 baseline (template + CODEOWNERS + CI)"
git push origin governance/phase-1-$(date +%Y%m%d)
gh pr create --base main --head governance/phase-1-$(date +%Y%m%d) \
  --title "chore(governance): adopt orca-style PR template + CODEOWNERS + CI baseline" \
  --body "Phase 1 of the orca governance adoption plan (see repo-level docs/orca-governance-adoption/SUMMARY.md). Adds a machine-readable PR template, declares ownership paths, and seeds the CI baseline."
```

预期：CI 全绿、CodeRabbit（如果装了）会建议补充 ELI5 / What Changed 等章节（确认锚点可机读）、CODEOWNERS 自动请求对应 reviewer。

---

## 风险检查表（落地后 1 周内回看）

- [ ] folia 私有仓库的 review request 是否成功路由到 `@杨卫薪律师`
- [ ] dsh 的 `NODE_OPTIONS=--max-old-space-size=2048` 是否在 CI 端生效（看 CI 日志）
- [ ] PR 模板的 ELI5 / Visual Proof / Linked Issue 是否有大量空填（出现即改为强制）
- [ ] review 平均耗时是否下降（基线记录）
- [ ] 是否有 reviewer 抱怨机器人噪音（若是，调 review profile）
