# 当前任务

## TASK-2026-09-06-orca-gov-01：governance: dsh Phase 1 — PR 模板 + CODEOWNERS + CI baseline

- 状态：`PENDING`
- 类型：`implementation`
- 来源：2026-09-06 桌面 `orca-governance-adoption` 调研；同目录 `ADOPTION-dsh-contract-copilot.md` §1 + `CHECKLIST.md` Phase 1
- 关联材料：`docs/orca-governance-adoption/ADOPTION-dsh-contract-copilot.md`、`docs/orca-governance-adoption/CHECKLIST.md`

### 问题

dsh-contract-copilot 是公有仓库但仓库内 0 个 `.github/` 文件：PR 描述纯自由文本（无机读锚点）、业务规则路径无 CODEOWNERS 路由、完全无 CI——`ADOPTION-dsh-contract-copilot.md` 现状盘点已把"完全没有 CI"列为最大缺口。协作律师 `@杨卫薪律师` 对业务规则有审核资格但代码层 ownership 未声明，PR review 只能靠口头找人。

### 目标

按 orca-style 给 dsh 装最小可用的入口与门禁三件套，让 PR 描述可机读、协作律师自动进入 review 圈、CI 在合并前必跑 typecheck + test + build（含 `NODE_OPTIONS=--max-old-space-size=2048` 堆顶防护，与本机 vitest 堆顶一致，固化 `7eae439` 的止血措施到 CI runner）。

### 验收标准

- [ ] `.github/pull_request_template.md` 新建（约 50 行 Markdown，含 ELI5 / Summary / Why / What Changed / Linked Issue / Visual Proof / Test Plan / AI Disclosure / Notes / Checklist 锚点，模板全文见 `ADOPTION-dsh-contract-copilot.md` §1.1）
- [ ] `.github/CODEOWNERS` 新建：业务规则路径（`/docs/business-rules/`、`/src/plan-review/`、`/src/intake-fields/`、`/src/host-api/contract-types.ts`）归 `@杨卫薪律师`；核心实现 / tests / CI 配置文件归主维护者 `@maoking`；兜底 `* @maoking`
- [ ] `.github/workflows/ci.yml` 新建：typecheck + test（含 `NODE_OPTIONS=--max-old-space-size=2048`，与本机一致）+ build；`on: pull_request` + `push: main`
- [ ] 仓库 Settings → Branches → main → Branch protection rules 勾 `test` 与 `typecheck` 为 required status check
- [ ] 在 fork 或新 branch 上各填一个 PR 跑完整 CI（typecheck + test + build），确认 ELI5 / What Changed 等锚点可机读、CODEOWNERS 自动请求律师 review
- [ ] commit 风格沿用 dsh 现有约定（英文 type prefix + 中文说明 + 中文正文），示例：`chore(governance): adopt orca-style PR template + CODEOWNERS + CI baseline (Phase 1)`
- [ ] 不修改任何已有源文件、测试、package.json、tsconfig；新增文件仅限 `.github/` 下

### 风险与边界

- `@杨卫薪律师` 中文 GitHub username 在仓库 Settings → Collaborators 必须已加为协作者，否则 CODEOWNERS 不会触发 review request
- dsh 不需要 folia 那种私有仓库限制——pullfrog for OSS 免费 + CodeRabbit 公有免费均适用，但本卡不引入（属 Phase 3）
- CI 端 `NODE_OPTIONS=--max-old-space-size=2048` 是合约级必保留的——见 `orca-oom-crash-loop.md` 2026-09-06 14:25 / 15:16 / 16:32 三轮收场记录，崩 1 次/59 秒与崩 1 次/107 秒的实际差就是这道护栏
- Phase 2（路径感知 pr.yml + verify required check）、Phase 3（CodeRabbit + pullfrog）由本卡 4 / 卡 3 / 卡 2 后续处理，本卡不引入

---

## TASK-2026-09-06-orca-gov-02：test: 根治 dsh vitest 状态污染循环 — 临时目录严格隔离 + claude 工作流限定

- 状态：`已完成（2026-09-06，验收证据见卡内"执行证据"；独立 reviewer 复跑通过，7/7 验收项全勾）`
- 类型：`implementation`
- 来源：2026-09-06 桌面 `orca-governance-adoption` 调研 + 同日 `orca-oom-crash-loop.md` 末段 16:32 全套件长跑归因
- 关联材料：`docs/orca-governance-adoption/CHECKLIST.md`（dsh Phase 1 注解段）、`docs/orca-governance-adoption/ADOPTION-dsh-contract-copilot.md` §1.3 堆上限注解

### 问题

dsh vitest 测试套件存在"claude 会话反复跑 `pnpm test` → 状态污染 → 失败 → 重试 → 崩溃循环"的真实事故链。`orca-oom-crash-loop.md` 2026-09-06 16:32 全套件长跑 24 分钟终版归因：113 个测试里 25 失败 / 7 个 spec 失败、**零新崩溃报告**（堆顶 + 后台 I/O 双保险已让 OOM 假说不成立）。真正根因是**会话侧状态污染而非 OOM**：
- `docx-extract` 4 个失败：30s test timeout（后台优先级下 Python 子进程慢）+ 临时目录 fixture ID 残留（`expected [] to deeply equal ['cc-docx-65575-...']`）——跨 spec 临时目录不隔离
- `agent-coordinator` 6 个失败：全 10s `beforeEach` hook 超时，启动 DSH 进程派生在后台优先级下被卡
- 崩 1 次/59 秒是被 `NODE_OPTIONS=--max-old-space-size=2048`（commit `7eae439`）截断的**次生现象**，根因是会话侧并发 + 临时目录不隔离 + 真实 Python/DSH 子进程派生叠加

`AGENTS.md` / `CLAUDE.md` 没有限定 claude 工作流（"不要让 claude 跑 `pnpm test` 全量"），导致 claude 会话继续触发同款循环。

### 目标

把 16:32 终版归因的"真正根因"在 dsh 仓库内修掉：① 给关键 spec 加 `beforeEach` / `afterAll` 临时目录严格隔离；② 提到 `agent-coordinator.spec.ts` 的 hook 超时上限 ≥30s；③ 在 `AGENTS.md` / `CLAUDE.md` 加 claude 工作流限定——让 claude 跑单 spec 或 `--bail` 早停，不跑全量。

### 验收标准

- [x] `tests/docx-extract.spec.ts` 加临时目录严格隔离：beforeEach 把进程级 TMPDIR 重定向进独占 mkdtemp 目录，afterEach 还原环境后断言零 `cc-docx-*` 残留（守卫自检注入假残留验证过断言会红）；勘误：卡内引用的失败信息实际顺序为 `expected ['cc-docx-...'] to deeply equal []`（vitest 打印"实际 to deeply equal 期望"），语义即"发现残留"，归因方向不变
- [x] hook 超时上限 ≥30s：落地为新增 `vitest.config.ts` 全局 `hookTimeout: 30_000`（卡内明示允许的全局方案），覆盖 agent-coordinator 及所有在 hook 里派生真实 python3 的 spec
- [x] `AGENTS.md` 新增"claude 会话跑测试的限定"段：禁止 agent 会话直接 `pnpm test` 跑全量；推荐 `pnpm vitest run tests/<single-spec>` 或 `--bail 1` 早停
- [x] 受控环境（机器空闲、单 runner、堆顶在位）3 连跑 16 个 spec 完整套件：266/266 全绿 ×3（每轮 ~1.4s）、零临时目录残留断言失败、零崩溃报告；`$TMPDIR` 无新增残留
- [x] 提交后由独立 reviewer 在 PM 同一 commit 上复跑一次，确认结果一致（2026-09-06 通过：独立会话在 507aaef / HEAD 6a48422 上静态核对 hookTimeout 与 TMPDIR 隔离断言后全量复跑 2 次，均 266/266 全绿、退出码 0、零崩溃、零 hook 超时；cc-docx-extract- 计数运行前后均 5、零新增，mtime 确认全为历史遗留。结论：验收通过）
- [x] 提交信息沿用 dsh 风格：`test: dsh vitest 状态污染根治 — 临时目录隔离 + hook 超时 + claude 工作流限定`
- [x] 不修改 product 源码（`src/`）；只动 `tests/docx-extract.spec.ts`、`vitest.config.ts`（新建）、`AGENTS.md`

### 执行证据（2026-09-06）

- 根因物证：`$TMPDIR` 内 5 个 `cc-docx-extract-*` 残留目录（含 noisy-python / term-ok-python / garbage-python fixture 与 `cc-docx-<pid>-<rand>` 子目录），时间戳与 8 份 node OOM 崩溃报告（09-05 21:29/21:41/21:57/22:53/23:02 + 09-06 14:25/15:05/15:12/15:31）一一对应；另有 7 个 `cc-bridge-term-*` 残留
- 基线：main 空闲机器全量 266/266 全绿、1.59s——证明失败为负载诱导（并发全量跑 → python3 派生超 hook/test 上限 → 在飞清理泄漏 → 残留断言失败），非确定性 bug
- 修复验证：守卫自检（注入 `cc-docx-999999-injected.py` → 断言红，失败信息含注入文件名）→ 删除自检文件；全量 3 连跑 266/266；dsh-plugin-lint 已跑（10 FAIL 均为 §5 client 构建产物存量问题，与本次无关，§8 卫生 PASS）
- 附带修复：docx-extract fixture 不再依赖 python-docx（旧 makeDocx 的 `|| true ||` 回退永不执行）；决策记录 Q45

### 风险与边界

- 本卡**不**移除 `NODE_OPTIONS=--max-old-space-size=2048`——堆顶是与 CI 共享的合约级护栏（见卡 1 §1.3 验证）
- 临时目录隔离是治本方向；不引"减少 vitest worker 数量"——用户已拒绝该方案（本卡原记录 [[no-worker-count-limits]]）
- 16:32 归因已确认 vitest OOM 假说不成立——本卡不重做 OOM 调查，避免循环
- 如 3 次复跑仍出现 docx-extract 临时目录残留，可能需要 `mkdtemp` 串行化（不直接动 worker 数）——超出本卡，留作后置观察
- CC-V5-004 异步抽取（DECISIONS Q44，feat-v5 波次）合入 main 后，docx-extract.spec 以该分支的异步版为准（其 mkdtemp-per-run + TMPDIR 重定向设计与本卡同构）

---

## TASK-2026-09-06-orca-gov-03：governance: dsh Phase 1 增补 — issue 业务规则模板 + module dropdown

- 状态：`PENDING`
- 类型：`implementation`
- 来源：2026-09-06 桌面 `orca-governance-adoption` 调研
- 关联材料：`docs/orca-governance-adoption/ISSUE-LIFECYCLE.md` §6.2、`docs/orca-governance-adoption/CHECKLIST.md` dsh §Phase 1 增补段

### 问题

dsh 是合同审查业务规则工具——bug 类型高度结构化（合同主体 / 计划审核 / 字段抽取 / docx 渲染 / Python 桥），但仓库内 0 个 issue 表单、0 个 issue labeler、0 张业务规则专用 issue 模板。用户/律师直接打 issue 没有结构化表单，CODEOWNERS 路由靠"@律师"手动提及，template 字段缺失导致 reviewer 第一次回复常常是"麻烦告诉我这是哪条规则"（见 `ISSUE-LIFECYCLE.md` §6.2 的对偶论证）。

### 目标

按 `ISSUE-LIFECYCLE.md` §6.2 的"业务规则审核专用版"落地两个文件：① 新建 `01-business-rule-review.yml`（杨律师专属，触发条件=用户投诉合同审查逻辑错/律师提出改进）；② 在 `bug_report.yml`（新建）加 `module` dropdown（intake / plan-review / docx-view / python-bridge / session），让 CODEOWNERS 自动路由 + 模板字段双重定位。

### 验收标准

- [ ] `.github/ISSUE_TEMPLATE/01-business-rule-review.yml` 新建（含杨律师专属字段如 `rule_version`、`affected_contract_clause`、`repro_docx_path`，完整 YAML 见 `ISSUE-LIFECYCLE.md` §6.2）
- [ ] `.github/ISSUE_TEMPLATE/bug_report.yml` 新建：含 `module` dropdown（intake / plan-review / docx-view / python-bridge / session），加上 `os`、`details` 必填字段；title 前缀 `[Bug]: `、type: Bug、labels: ["bug"]
- [ ] 仓库 Settings → General → Issues 勾选 "Issues must be created from a template"（与 orca 的 `blank_issues_enabled: false` 等价）
- [ ] 在 fork 上各发一个 bug + 一个 business-rule-review issue，确认 module dropdown 渲染、CODEOWNERS 自动请求律师 review
- [ ] commit 风格：`chore(governance): issue template — 业务规则审核 + module dropdown (Phase 1 增补)`
- [ ] 不修改任何已有源文件、测试；新增文件仅限 `.github/ISSUE_TEMPLATE/`

### 风险与边界

- 本卡**不**创建 labeler workflow（`issue-labeler.yaml`）——folia 的影响面→severity 映射对 dsh 不直接适用（dsh 的"影响面"是业务规则被破坏面，不是 macOS/Windows/Linux）。后续如需按 `module` 自动加 label，再开卡 3+
- 不创建 `other.yml`——`ISSUE-LIFECYCLE.md` §1.2 论证"other 是兜底不是默认"，dsh 双维护者+律师可直接走 bug_report + business-rule-review 二选一
- `01-business-rule-review.yml` 的字段命名要稳定 schema-friendly（`rule_version` 而非 `规则版本`）——便于后续 AI reviewer / 内部 PM 消费

---

## TASK-2026-09-06-orca-gov-04：governance: dsh Phase 2 — 路径感知 PR workflow + verify 必为 required check

- 状态：`PENDING`
- 类型：`implementation`
- 来源：2026-09-06 桌面 `orca-governance-adoption` 调研
- 关联材料：`docs/orca-governance-adoption/ADOPTION-dsh-contract-copilot.md` §2.1–§2.2、`docs/orca-governance-adoption/PR-LIFECYCLE.md` §3.3 反直觉警示、`docs/orca-governance-adoption/PR-LIFECYCLE.md` §6 信任脚本模式

### 问题

dsh Phase 1（卡 1）装完三件套后，docs-only PR 仍会跑完整的 typecheck + test + build——贵 CI 不必要，PR 生命周期被拖长；更重要的是 `PR-LIFECYCLE.md` §3.3 实证发现：orca 的 `verify` 实际**可能是 advisory**（org 级别 branch protection 在 repo API 看不到，PR #19030 头 SHA 只看到 track-community-pr + pullfrog 两个 check），用 CI 流水线不等于真把 PR 拦在门外——**分支保护里勾选哪些 check 是 required 才决定 CI 实际拦不拦 PR**。

### 目标

按 `ADOPTION-dsh-contract-copilot.md` §2.1 实现 detect → fan-out → verify 聚合模式，docs-only PR 跳过贵 job（typecheck / test / build 全 skipped，verify 打印"docs-only"消息后通过）。**关键补丁**：分支保护必须显式把 `verify` 勾为 required check（避免 orca 那种"有 CI 但拦不住 PR"的反例）。`pr-test-loc.yml` 写权限 workflow 脚本从 default branch 拉（不执行 PR head），照搬 `PR-LIFECYCLE.md` §6 的"高权限 workflow 不执行 PR 代码"原则。

### 验收标准

- [ ] `.github/workflows/pr.yml` 新建：detect job（按 `git diff --name-only origin/main...HEAD` 输出 `src_changed` / `docs_only` / `worktree_only` 三个布尔）→ fan-out（`typecheck` / `test` / `build` 三 job 按 `src_changed` 触发）→ verify 聚合 job（`needs: [detect, typecheck, test, build]` + `if: always()`；docs-only PR 走"docs-only"快速通过路径）
- [ ] `.github/workflows/pr-test-loc.yml` 新建：测试 vs 实现 LoC 比值评论到 PR；**关键安全设计**——脚本通过 Files API 从 default branch（`main`）拉取（`actions/checkout@v6` with `ref: main`），不执行 PR head 代码（参考 `PR-LIFECYCLE.md` §6 完整 YAML）
- [ ] 仓库 Settings → Branches → main → Require status checks 显式勾 `verify` 为 required check（**不**只勾 `typecheck` / `test`——这是 orca 反例的核心教训）
- [ ] 提交一个 docs-only PR（如改 `README.md` 单行），确认 typecheck / test / build 全部 skipped、verify 通过
- [ ] 提交一个 src 改动 PR，确认 typecheck / test / build 全跑、verify 通过
- [ ] commit 风格：`chore(governance): path-aware PR workflow + verify required check (Phase 2)`
- [ ] 不修改任何已有源文件、测试、Phase 1 装的 `ci.yml`（pr.yml 是新增，ci.yml 保留 push:main 的常规 CI）

### 风险与边界

- **不照搬 orca 的 e2e 红态降级逻辑**——`PR-LIFECYCLE.md` §2.2 明确建议"folia / dsh 不应照搬 orca 的 e2e 红态降级"，除非 e2e 稳定绿 1 个月。dsh 没有 e2e，不涉及
- 关键安全点：pr-test-loc.yml 持 `pull-requests: write`，必须从 default branch 拉脚本，否则恶意 PR 可借 workflow 篡改度量逻辑或发垃圾评论
- 本卡**不**引入 CodeRabbit / pullfrog——属 Phase 3
- 分支保护勾 verify 这一步必须在 GitHub web UI 手动操作（API 在 org 级别不可见），PR 验证前请 reviewer 截图保留

---

## TASK-2026-09-06-orca-gov-05：investigation: 完成 orca 治理调研的全套对照 — 从 dsh 出发探索 folia 同款落地

- 状态：`已完成（2026-09-06，落地部分随 6a48422 提交；原"本卡显式不 commit"验收项被用户 2026-09-06 下午授权推进推翻）`；跨仓库对照（dsh ↔ folia，Phase 4）不在本卡范围、未做
- 类型：`investigation`
- 来源：2026-09-06 桌面 `orca-governance-adoption` 调研
- 关联材料：`docs/orca-governance-adoption/` 全部 11 份文件、本卡 1–4

### 问题

2026-09-06 桌面 `orca-governance-adoption/` 11 份文件是 orca 治理体系的完整调研（2782 行），但桌面文件夹未来可能不可达。dsh 仓库需要的不是"读完桌面文件再决定怎么做"，而是"一打开仓库就能找到所有调研材料并继续工作"。本卡是元任务——保证接手 agent 在 dsh 仓库内能完成"定位调研材料 + 理解 4 张实现卡 + 跨仓库对照（dsh ↔ folia）"的完整链路。

### 目标

让接手 agent 在 dsh 仓库内能完成三件事：① 找到 `docs/orca-governance-adoption/` 11 份文件并按 `HANDOFF.md` 文件清单顺序读；② 按 `status/TASKS.md` 顶部 4 张实现卡的卡序（卡 1 → 卡 2 → 卡 3 → 卡 4）领卡；③ 在 dsh 落地过程中能对照 `ADOPTION-folia.md` 验证 folia 同款机制（如 `_test` / `_lint` 路径分支、squash merge 配置），把 folia 已验证的 YAML / 配置直接复用为 dsh 起点。

### 验收标准

- [ ] `docs/orca-governance-adoption/` 下 11 份文件全部到位（与桌面源 byte-identical，已验证 11/11 OK）
- [ ] `status/TASKS.md` 顶部按时间倒序追加 5 张新任务卡（本卡 1–5），时间前缀 `TASK-2026-09-06-orca-gov-XX` 保持 dsh 既有 `CC-V4-XXX` 编号风格
- [ ] `docs/orca-governance-adoption/HANDOFF.md` 顶部插入"dsh 仓库入口声明"，显式指向本目录 + `status/TASKS.md` 5 张卡
- [ ] `CHANGELOG.md` 顶部 `[Unreleased]` 段加 2026-09-06 条目"增加 orca 治理调研材料 + 5 个待办任务卡"——**不**修改版本号
- [ ] `git status` 仅显示 11 份 `docs/orca-governance-adoption/` 新文件 + 1 份 `status/TASKS.md` 改动 + 1 份 `CHANGELOG.md` 改动 + 1 份 `docs/orca-governance-adoption/HANDOFF.md` 头部加 1 句（13 项新增 + 2 项编辑）
- [ ] `git diff --stat` 输出确认 0 个 src/、tests/、package.json、tsconfig、ci 配置被修改
- [ ] 接手 agent 跑 `git log --format='%s'` 仍能看到 0 个新 commit（用户未授权 commit；本卡显式不 commit）
- [ ] 不创建任何新源码、测试、CI workflow、PR/issue 模板——这些是卡 1 / 卡 3 / 卡 4 的产物

### 风险与边界

- 桌面 `orca-governance-adoption/` 是只读参照源，本仓库内的副本是"dsh 接受 orca 治理调研的完整入口"——**复制而非引用**，避免桌面不可达时丢上下文
- 本卡 5 与卡 1/2/3/4 是元-实现关系：先有本卡 5 把材料落到 dsh，再派发卡 1/2/3/4
- 跨仓库对照（dsh ↔ folia）属 Phase 4 探索——不在本卡 5 范围
- 用户授权（DEC-046）下"自动推进策略"对 5 张卡的派发：默认 `converge` 模式全局同时活跃 worker ≤3、docs-only 必须至少推动 `DRAFT → READY`；本卡 1 / 卡 3 / 卡 4 是 implementation，卡 2 是 test，卡 5 是 investigation — 任何一张派发前确认与 CC-V5 / CC-V4-* 在途任务的资源/分支不冲突

---

## CC-V5：工作台质量加固波次（搁浅恢复，2026-09-06 PM 接管）

- 状态：进行中；波次定义与任务卡权威在集成分支 `feat-v5-quality-hardening` 的 status/TASKS.md（PR #2/#3/#5/#6/#7/#8 已合入该分支，PR #4 OPEN 待审）
- 2026-09-05 会话中断导致波次搁浅：R3 现场（TERM→KILL + mkdtemp，Q44 修订）已保全为 `fix-cc-v5-async-docx-extraction` 上的 WIP commit `56d2805`
- 2026-09-06：接管 worker `ccv5-004-r4-glm53`（分支 `fix-cc-v5-async-r4`，run_ec2d75ac4f4f）完成 R4 收尾；后续 PM 走 PR #4 审合 → 里程碑 PR（feat-v5-quality-hardening → main）
- 独立佐证：`package.json` vitest 堆顶止血已落 main（`7eae439`）

## CC-V4-010：简版文档导航根接线（CC-V4-004 验收退回）

- 状态：已完成；真实浏览器复验与 CC-V4-004 独立 reviewer 合并门均通过
- 基线：`bda0e24`
- 目标：把简版文档 JSX 挂载点绑定到 `simpleHolder`；此前 `simpleHolder.current` 恒为 `null`，导航 effect 在定位前静默返回。
- 文件边界：`src/client/Workbench.tsx`、`tests/workbench-client.spec.ts`。
- 验收：Word 与简版 holder ref 均有源码接线回归；client typecheck、完整测试和 build 通过；真实 DSH Web 简版侧栏点击命中 `data-cc-anchor` 并出现 `cc-comment-flash`。
- 证据：Worker 提交 `a084d4d`，集成提交 `cfcfb77`；266/266 测试通过；价值交付后门禁接受；真实浏览器命中 `SPAN[data-cc-anchor]`，高亮为琥珀底色及描边。

## CC-V4-009：跨案件与同案件导航生命周期（CC-V4-004 验收退回）

- 状态：已完成；真实浏览器复验与 CC-V4-004 独立 reviewer 合并门均通过
- 目标：A→B→A 返回旧案件时复位已处理导航水位；重复激活当前案件保持幂等，不清空仍有效状态。
- 文件边界：`src/client/Workbench.tsx`、`tests/workbench-client.spec.ts`。
- 验收：导航水位按案件生命周期复位，同一案件重复激活为 no-op；真实 DSH Web 两条路径均可再次定位并高亮正文。
- 证据：集成提交 `e24a9a5`、`bda0e24`；265/265 阶段测试通过，最终 266/266；两项价值交付后门禁均接受；真实浏览器 A→B→A 与同案件重复点击后均重新出现 `cc-comment-flash`。

## CC-V4-008：简单视图批注前向导航修复（CC-V4-004 验收退回）

- 状态：已完成；真实浏览器复验与 CC-V4-004 独立 reviewer 合并门均通过
- 基线：`4a31b5c`
- 目标：修复简单视图点击侧栏批注必未命中的缺陷——Workbench 的导航效果把 `CommentNavigationInput.options`（简单视图 `data-cc-anchor` 打点属性）丢在共享 navigator 之外，属性策略按默认 `data-cc-comment-id` 寻址必然落空，每次跳转都报 `id-not-found`；同时补齐 `.cc-comment-flash` 高亮 CSS（控制器一直输出该 class，但从未有规则渲染，两套视图的高亮均不可见）。
- 文件边界：`src/client/comment-navigation.ts`、`src/client/Workbench.tsx`、`tests/comment-navigation.spec.ts`、`tests/workbench-client.spec.ts`；不修改 Host、协议、DOCX 解析或 Python。
- 验收：`CommentNavigator.navigate` 支持逐次视图绑定选项（逐键覆盖创建时选项）并由 Workbench 经 `executeNavigationRequest` 接缝传递；高亮规则覆盖 simple 与 word 两个文档容器且限定在文档画布内；client typecheck、全量测试与 build 通过；dsh-plugin-lint 机械层 0 FAIL。
- 证据：集成提交 `9f65ed7`；新增 6 项测试（navigator 逐次选项契约含旧缺陷回归对照、executeNavigationRequest 接线契约、flash CSS 覆盖与可见性），阶段基线 262/262、最终基线 266/266，typecheck/build 通过；真实 DSH Web 的 Word 与简版前向定位、高亮和反向选择均复验通过。

## CC-V4-R01：`docx-preview` 批注 DOM 与导航策略验证

- 状态：已并入 CC-V4-005（派发前收敛）
- 目标：针对当前锁定的 `docx-preview@0.4.0` 和真实 DOCX fixture，确认 `renderComments` 输出、批注正文关联、稳定选择器、滚动/高亮方案与无法定位时的降级策略。
- 边界：只读源码、依赖和 fixture；结果写入 worker Session Context，不修改产品代码或共享文档。
- 验收：给 CC-V4-003 提供可直接执行的 DOM 断言、交互步骤、风险清单和推荐实现，不以记忆推断第三方库行为。

## CC-V4-R02：工作台独立浏览器验收合同

- 状态：已并入 CC-V4-006 与 CC-V4-004（派发前收敛）
- 目标：基于现有 DSH Web 验收入口和样例，定义明暗主题、桌面/窄屏、对话框焦点、批注双向导航的候选绑定验收合同。
- 边界：只读 DSH 与插件现状；结果写入 worker Session Context，不启动长期服务、不修改产品代码或共享文档。
- 验收：列出可机械断言的 DOM/尺寸/焦点条件、真实用户路径、证据文件命名与清理要求，供 CC-V4-004 reviewer 使用。

## CC-V4-001：工作台视觉与窄屏交互统一

- 状态：已完成；集成、真实浏览器验收与独立 reviewer 合并门均通过
- 基线：`6c52c76`（律师决策工作台已验收）
- 目标：让工作台在 DSH 明暗主题与桌面/窄屏布局中保持一致、可读、可操作，并补齐对话框键盘焦点管理。
- 文件边界：`src/client/Workbench.tsx`、`src/client/index.tsx` 与现有 client 测试；typed locale 模块由 CC-V4-006 单独交付；不修改 Host、协议、DOCX 解析或 Python。
- 验收：夜间模式不再出现浅色孤岛或低对比文本；窄屏不隐藏案件操作入口；对话框具备初始焦点、Tab 环与关闭后焦点归还；UI 文案由 typed locale 字典拥有；client typecheck、聚焦测试与 build 通过。
- 证据：`420c73a` 实现壳层，`acea9f7` 修复 typed locale 集成后通过；最终集成分支的 client typecheck、完整测试 266/266 和 build 通过；真实浏览器通过明暗主题、窄屏三页签和 Escape 焦点归还。

## CC-V4-002：批注定位锚点模型

- 状态：已完成；已由 CC-V4-003 消费并通过真实浏览器验收与独立 reviewer 合并门
- 基线：`6c52c76`（律师决策工作台已验收）
- 目标：Host/协议层为 DOCX 批注和简版文档渲染提供稳定、可持久传输的定位信息，供工作台执行双向跳转与高亮。
- 文件边界：`src/docx-view.ts`、`src/workbench-protocol.ts`、`src/host-api.ts` 及其对应测试；不修改 `src/client/Workbench.tsx`、共享文档或 Python。
- 验收：每条批注具有稳定 id 和可解析锚点；正文输出存在可选择的对应标记；无法精确定位时保留可解释降级信息；协议/RPC 兼容简单视图与 Word 预览；聚焦测试与 build 通过。
- 证据：`35a342e`、`b48ba5d`、`1d2868a`、`d1c909d`；最终集成分支 docx-view、host-api、完整测试 266/266 和 build 通过。

## CC-V4-005：客户端批注导航控制器

- 状态：已完成；已由 CC-V4-003 接线并通过真实浏览器验收与独立 reviewer 合并门
- 基线：`6434e82`
- 目标：在独立纯客户端模块中实现稳定选择器、正文定位、滚动/聚焦、短暂高亮清理和未命中结果，供 CC-V4-003 接入工作台。
- 文件边界：只新增 `src/client/comment-navigation.ts` 与 `tests/comment-navigation.spec.ts`；不修改 Workbench、Host、协议、依赖或共享文档。
- 验收：无需真实浏览器即可确定性验证找到/未找到锚点、特殊 id 转义、滚动与高亮生命周期；client typecheck、聚焦测试与 build 通过。
- 证据：`e30efb8` 与 `d1c909d`；最终集成分支导航控制器、client typecheck、完整测试 266/266 和 build 通过。

## CC-V4-006：typed locale 工作台词典

- 状态：已完成；集成、双语言浏览器验收与独立 reviewer 合并门均通过
- 基线：`6434e82`
- 目标：把当前工作台产品文案整理为类型完整的中英文 locale 字典与取值 API，为 CC-V4-001/003 的最终接线提供单一来源。
- 文件边界：只新增 `src/client/locale.ts` 与 `tests/workbench-locale.spec.ts`；不修改 Workbench、Host、协议、依赖或共享文档。
- 验收：两种 locale 的键集合编译期/运行时一致，无空翻译，未知 locale 确定性回退；client typecheck、聚焦测试与 build 通过。
- 证据：`574b56d`、`acea9f7` 与 `b48ba5d`；最终集成分支 locale、client typecheck、完整测试 266/266 和 build 通过。

## CC-V4-003：批注双向导航与 Word 原生观感

- 状态：已完成；集成、真实浏览器验收与独立 reviewer 合并门均通过
- 目标：工作台启用 `docx-preview` 批注渲染，将侧栏批注与正文锚点连接；点击批注滚动到正文并短暂高亮，正文批注标记反向选中侧栏条目，同时兼顾键盘与降级路径。
- 验收：真实含批注 DOCX 在简单视图和 Word 预览中均可完成可见的定位反馈；未找到锚点时不误跳且给出状态；浏览器实操与截图/GIF 绑定候选提交。
- 证据：`b48ba5d`、`1d2868a`、`d1c909d`、`a6ba439`、`21bbc8a`、`9f65ed7`、`e24a9a5`、`bda0e24`、`cfcfb77`；真实浏览器发现并补齐 run-style Word 标记、简版导航选项、可见高亮、跨案件水位和简版 holder 接线；最终集成分支完整测试 266/266、client typecheck 和 build 通过。

## CC-V4-007：专属 Agent 分析上下文闭环

- 状态：已完成；真实模型浏览器验收、最终候选绑定与独立 reviewer 合并门均通过
- 目标：使只装载 7 个合同领域工具的 DSH Web 专属 Agent 获得确定的合同正文和最小审查指导，不依赖未装载的文件、shell 或 skill 工具。
- 验收：Host 从受信任的 session 合同路径抽取可见正文并有界注入；合同伪造数据边界被隔离；提取失败、空正文和无效配置 fail loud；交付提示不携带正文；真实模型能够从工作台进入 plan_ready。
- 证据：`ed6233a`、`47272ed`；新增 OOXML 正文抽取、提示边界与截断、失败状态、配置范围和 analyze 工具说明测试；隔离 DSH 0.1.2-rc.1 Web profile 使用真实 `deepseek-v4-flash` 从合成合同生成 8 项 finding，并停在 plan_ready / waiting-decisions；最终集成分支完整测试 266/266、typecheck 和 build 通过。

## CC-V4-004：独立验收与项目收口

- 状态：已完成；代码、静态门禁、真实 DSH Web、GUI GIF 与独立 reviewer 合并门均通过
- 目标：由未参与实现的 reviewer 对暗色、窄屏、焦点、批注跳转、回归测试和文档一致性做独立验收；PM 只在通过后写回 CHANGELOG、ARCHITECTURE、ROADMAP 与本任务源。
- 验收：typecheck、完整测试、build、更新后的 dsh-plugin-lint、真实 DSH Web 浏览器流程和 GUI GIF 均绑定最终候选；未通过项退回原 worker 修复。
- 当前证据：候选 `cfcfb77` 的 client typecheck、16 文件 266/266 测试、build 和 worker 价值交付后门禁通过；浏览器验收包 SHA-256 `6b96c0f6d7334b13934c339959e030ab48c3684f9e29b5c6062aa27d9f87a198` 安装到 DSH `0.1.2-rc.1`（`76fda729`）隔离 profile，明暗主题、窄屏、焦点、Word/简版双向导航、A→B→A 与同案件重复激活均通过真实浏览器复验。收口重打包 SHA-256 `713d73025ac3e243e7fc29df6e9a34e499926a9dd15ec2c3d29457c98a8835d1`，除 README 状态外与浏览器验收包逐文件一致。GUI GIF SHA-256 为 `3f19a70ea655b5a1f1969349bd309957122cb3b63d578779c4549009c068aace`；未参与实现的 GLM reviewer 在 PR 头 `cdcbbcca69dbaff768d98fe450f9a86ba7fa6ca2` 给出 `ACCEPT`，review-acceptance 与 merge-gate 结构化门禁均通过。正式证据见 `docs/acceptance/2026-09-05-workbench-ux-hardening.md`。

## CC-V3-001：律师决策工作台闭环

- 状态：已完成
- 分支：`feat/lawyer-decision-workbench`
- 基线：`69e1886`（DSH 0.1.2 工作台迁移已验收）
- 目标：工作台直接驱动专属 DSH Agent 完成风险分析，在生成修订版前强制暂停，由律师逐项决定处理方式，确认后恢复同一 Agent 完成修订与交付。

### 范围

- 建案后由工作台创建或恢复专属 DSH Agent，不再要求用户回聊天窗口补一句指令。
- 审查计划生成后进入强制律师决策门；未批准的计划不能调用 `contract_copilot_apply`。
- 每项 finding 支持“按建议处理、仅批注、仅意见书、忽略”，并可调整风险等级、填写律师备注。
- 决策保存为可审计历史；重新 analyze 或改变计划后，旧批准自动失效。
- 工作台展示 Agent 运行、等待律师、失败、可重试和已交付状态，并提供取消操作。

### 非目标

- 不修改 Contract Copilot Python 脚本。
- 不实现多人权限、批量合同队列或跨设备任务调度。
- 不把 DSH `workflowEngine` 当作案件持久层；当前 workflow run 不支持后台收集与断点恢复。
- 不展示模型隐式推理内容。

### 验收

- [x] 设计、决策、架构、README、CHANGELOG 与任务状态一致。
- [x] 工作台建案后能够直接启动专属 Agent，并在 `plan_ready` 后停在“等待律师决策”。
- [x] 任一 finding 未决定时，批准操作失败；计划未批准时，Agent 或手工 tool 调用 `apply` 均失败。
- [x] 四种决定及风险等级调整能确定性投影到最终 `review-plan.json`，并保留追加式审计记录。
- [x] 计划变化后旧批准失效；批准后文件被外部改写时 `apply` 拒绝执行。
- [x] 刷新工作台和重启 DSH 后能够从业务 session 与 DSH session 恢复。
- [x] 单元测试、真实 Python 集成测试、build、dsh-plugin-lint 和 tarball 安装通过。
- [x] 从真实候选启动 DSH Web，完成建案、分析、逐项决策、修订、交付的浏览器验收并保留截图证据。

### 执行证据

- 2026-09-04：用户确认采用“分析后强制暂停、律师逐项决策、确认后才能修订交付”的交互模型。
- 2026-09-04：DSH 0.1.2 接口核对完成；选择 `ctx.agents.create/resume` 驱动专属 Agent，排除 foreground-only、无 journaling 的 `workflowEngine` 作为案件主流程。
- 2026-09-04：律师计划批准领域层完成；17 项聚焦测试通过，覆盖四种决定、审计保留、漏项、旧 hash、文件篡改、Host RPC 和 Client 调用。
- 2026-09-04：案件专属 Agent 编排完成；25 项聚焦测试通过，覆盖 create/resume、当前默认模型选择、重复命令、首次创建失败重试、取消、真实 idle、Host RPC 和 Client 命令。
- 2026-09-04：客户端 typecheck、Node build、完整客户端 bundle 与 `pnpm peers check` 通过；DSH 依赖族统一为 `0.1.2-rc.1`。
- 2026-09-04：五阶段律师决策界面完成；13 个文件 103 项完整测试、真实 Python spawn、Node/Client build 和 peer 校验通过，新增空计划、漏项、字段规范化、稳定状态提示、工作台 session 精确复用和直接 apply fail-closed 覆盖。
- 2026-09-04：真实 DSH Web 建案验收发现前置信息自由文本框缺少辅助标签；已用问题正文补齐 `aria-label`，随后随候选重建复验通过。
- 2026-09-04：候选 `e287ee2` 从 tarball 安装进隔离 DSH Web profile；自由文本框辅助标签复验通过。
- 2026-09-04：脱敏合成合同经本地 replay provider 跑通专属 Agent 分析、律师逐项批准、真实 Python apply、finalize 与双 DOCX 交付；批准前按钮禁用，决定后解锁。
- 2026-09-04：DSH 重启后恢复 `delivered`、R001 决定、批准锁、修订预览和两个下载入口；验收截图及正式 dsh-plugin-lint 报告见 `docs/acceptance/2026-09-04-lawyer-decision-workbench.md`。
- 2026-09-04：浏览器发现交付完成后临时运行提示未清除；最终候选已按持久 automation 稳定状态收敛提示并复验，运行中可见临时提示，到达 `delivered` 后 `role=status` 为空。

## CC-DOC-001：固化 DSH 工作台交互原则

- 状态：已完成
- 目标：把“DSH 的 Agent、Session、Tools 和状态事件支撑细粒度工作台交互”的判断写入项目权威上下文，并明确不展示模型隐藏思维链。
- 验收：README 提供产品说明；ARCHITECTURE 记录运行面到工作台职责的映射；DECISIONS 记录约束与重新评估条件；CHANGELOG 留痕。
- 证据：2026-09-04 新增 ARCHITECTURE §2.1 与 DECISIONS Q40，并同步 README 和 CHANGELOG。
