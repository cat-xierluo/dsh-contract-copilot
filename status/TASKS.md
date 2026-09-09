# 当前任务

## WAVE-2026-09-08：GLM 审计整改与独立验收

- Heartbeat：用户于 2026-09-08 明确要求自动回访验收；当前任务已启用 `contract-copilot-glm`（Contract Copilot GLM 成果验收），每 10 分钟执行一次。仅跟进本波三个任务的交付、必要修复、独立 GLM review、已授权 Git 收口和上下文更新；无实质变化保持安静。完成收口或出现需要用户处理的阻塞时暂停并报告。不重复派单、不扩展新波次，也不把定时回访宣称为已验证的 L2/L3 持久控制器。
- 统筹：2026-09-09 用户指定当前 Codex 任务为唯一 PM；原 GLM PM 已交接并停止自主派发、恢复、合并和清理。Run `run_fce28ffada88` 已绑定新控制端 `term_6edfaa2a-c511-4d7c-846a-4d4d6f99fcf0`（coordinator generation 2）。Heartbeat 曾因双 PM 归属冲突暂停，交接确认后已恢复；交接与控制权证据为 Git common-dir 下的 `orchestration/cc-audit-20260908/pm-handoff-to-codex-20260909.json`、`codex-pm-control-20260909.json`。
- 08:08 回访：N1 返修已建同 Run 子任务 `task_4ce88f2a778c`，排队原因及完整边界见 CC-V5-009-R2；无新 Dispatch，不能称已派 Worker。进度隔离 r2 的独立角色门、交付价值后门均 PASS（提取其已有 executed[]，并非本轮重跑测试），证据 `isolation-r2-postflight-evidence.json`。PR #11 仍 OPEN / MERGEABLE / CLEAN，head 未变，但云端 checks 为空、真实 Web 未验，不据此直接合并。治理恢复复查仍 UNKNOWN/no_actionable_quota_evidence，无唤醒输入。
- 状态：REVIEW_RECEIVED / MERGE_HELD（2026-09-09）。两项独立 GLM review 已收到 ACCEPT，但不等于工作台或 PR 整体交付完成。生命周期 N1：Agent 已启动后 upstream abort 先设置 cancelled，后续用户 cancel 可能跳过 agent.cancel；合并前必须完成明确处置及相应证据。治理仍保留原 Dispatch 和未提交改动；现场停在 429 后的空输入提示符，恢复脚本返回 UNKNOWN/no_actionable_quota_evidence，原终端一次“继续”的授权仍待明确。指定 PM 不视为限流恢复豁免；未使用重置卡、未重复派治理 Worker。
- 独立 review：生命周期 `task_20dd70cb276f` / `ctx_f7b1b13977f3` / `cc-lifecycle-review-0908`，冻结 `c0c973378ca6d623c974c4914a940747bb813afb`，报告 ACCEPT、66/66，另有上述 N1。进度隔离原 `ctx_697af9f99a67` 未形成有效验收；实际交付为同一 `task_9cc39bdac119` 的 `ctx_43e3b330a1d0` / `cc-isolation-review-r2-0908` / worktree `codex-cc-isolation-review-r2`，HEAD 为 `94818478d2470429b9c0d76e7ebbb4fba99ea855`，报告 ACCEPT、30/30，PM 已核对 HEAD 与 review-acceptance-gate。该 reviewer 首次在错误 main 基线上的 21/21 作废，不计入验收；修正后包含新隔离 spec 的 30/30 才是有效证据。两份报告及命令日志保存在各自 Session Context；生命周期 review 仅覆盖本轮 R10 后修复，不代表远端旧 PR #4 全部通过。
- 本轮验收证据：生命周期 head `c0c973378ca6d623c974c4914a940747bb813afb`，5 个 spec 共 66/66、Host noEmit 与 diff-check 退出 0；进度隔离 head `94818478d2470429b9c0d76e7ebbb4fba99ea855`，3 个 spec 共 30/30、Host noEmit 与 diff-check 退出 0，[PR #11](https://github.com/cat-xierluo/dsh-contract-copilot/pull/11) 为 OPEN，base 为 feat-v5-quality-hardening，远端 head 一致。PM 实际命令日志及结构化 executed[] 证据保存于 Git common-dir 的 `orchestration/cc-audit-20260908/pm-{lifecycle,isolation}-verification.json`；两份 worker-value-postflight 均通过，独立 review 结果见上项；尚未合并，未做全量、真实 Web 或发布验收。
- 资源与恢复：两个实现 Worker 已释放。2026-09-09，PM 核对交付归属与空闲状态后关闭生命周期 reviewer 和进度隔离 r2 reviewer 的精确终端；两 Dispatch 的 worker-release 均返回 released，pm-orchestrate 确认 provider lease 已释放。实现及 review 分支/worktree 全部保留待 PR 收口；治理终端及脏 worktree 保留，未注入继续或重启。下一步由当前 PM 统筹 N1 处置、治理合法续接、真实工作台验收及 PR 收口，不再重派已完成的相同 review。控制面不能将作者 commands[] 自报当作 PM 的 executed[] 验证证据。
- 派发记录：生命周期 `task_88b4b4615cc5` / `ctx_8741cee94aed` / `cc-lifecycle-0908`；进度隔离 `task_194a37866137` / `ctx_080e0819b0c5` / `cc-isolation-0908`；治理 `task_fe0add259621` / `ctx_9381ff22b07f` / `cc-governance-0908`。模型合同为 `glm-5.3-flash[1M]`，Claude Code backend；内存/额度 preflight 均通过。生命周期基线 `99d6243`、进度隔离 `35527c2`、治理 `02fe756`。
- 文件/依赖隔离：生命周期修复从 R10 `99d6243` 起步，拥有 coordinator/host-api 及对应测试；进度隔离从集成 `35527c2` 起步，拥有 index/session/progress 及对应测试；治理修复从本地主干（含本次审计文档，代码与远端 main 一致）起步，拥有 CODEOWNERS/CI/package.json/配置回归测试。三者不能共用一个检出版本，因此建立独立 worktree；文档仅改各自受影响小节。
- 任务：`CC-V5-009-R1` → `codex-cc-command-lifecycle-0908`；`CC-V5-008-R1` → `codex-cc-agent-progress-isolation-0908`；`GOV-01-R1` → `codex-cc-governance-repair-0908`。Orca/spawn 将分支名中的斜杠规范为连字符，记录实际分支名。
- 设计约束：命令在首个 await 前取得案件所有权，统一取消/关闭并等待收束；进度只按触发 Agent 的 dshSessionId 关联；治理只修有效账号/路径与受支持 Node，保留手动 Actions 和现有律师授权门。beginRecheck 功能扩展、自动 CI、Python 修改不进入本波。
- 安装授权：用户本次整改授权涵盖新 worktree 的锁定依赖安装；PM 将精确命令 `CI=true pnpm install --frozen-lockfile --ignore-scripts --config.package-lock=true` 写入 worker 安装合同，仅作用于其本地 node_modules，禁止软链共享、改 lockfile 或全局安装。沿用 setup inherit，避免自动 setup 在安装门禁落盘前执行。
- 验证：Worker 仅跑合同指定的 scoped spec/typecheck；测试日志保存在其 Session Context，不无界输出。2048 MiB 堆顶保留；全量验证由 PM 在独立验收阶段串行安排。Review 必须绑定40位最终head、不同dispatch/session、有命令退出码证据；未验证的Web/Windows/云端路径如实保留。
- PR：进度隔离交付到 V5 集成分支；治理交付到 main；生命周期先交本地提交给 PM，验收后纳入既有 PR #4，避免为同一异步抽取范围创建重复 PR。不得修改 main 的已有本地提交或强推历史。
- 控制面合同：Git common-dir 的 `orchestration/cc-audit-20260908/dispatch-spec.json` 与 `wave-manifest.json`；Run/Task/Dispatch receipt 及结果在同目录维护，当前任务状态以 Orca Delivery 与 PM验收记录为准。

## AUDIT-2026-09-08：后续 Agent 交付审计与状态校正

- 状态：审计完成；下列整改未完成。本次只更新任务源，不修产品代码、不更新远端 PR、不合并或清理 worktree。
- 范围：本地 main `4518fa2312763bbfbe4285004446c3269d78cee0`（远端 main `30f74753727a5182980fa3fed3359ca55b085f99`）、V5 集成 `35527c2bc39e969bed807c7b67f3dc64ce83f182`、R10 `99d6243`，以及 GitHub PR #2–#10 的实时状态。以下记录校正旧卡的交付状态；原实现范围仍沿用原卡。
- 结论：治理文件和测试层加固已落 main；V5 尚未交付 main；R10 的抽取函数用例通过，但 Agent 命令生命周期仍有阻断缺口。历史 reviewer ACCEPT 与总测试数不能替代这些路径的验证。

| 优先级 | 发现与证据 | 跟踪与退出条件 |
|---|---|---|
| P1 | R10 `src/agent-coordinator.ts` 在 await 抽取与 acquireAgent 之后才登记 active。受控屏障复现同案件两个 runAnalysis 均 accepted，create/followup 各 2 次；抽取中 cancel 返回 `contract-copilot/not-running`；dispose 在抽取 Promise 未结束时返回。 | CC-V5-009：补齐命令准入、抽取取消、创建期间关闭与清理的统一所有权；独立 reviewer 验证全部竞态后才可收口。 |
| P1 | main 与 R10 的 `src/index.ts` pre-step 只读 `store.current()`，未用触发事件的 Agent id 匹配 `dshSessionId`，并更新该案件的 lastInjectedCounter。其他 Agent 先进入 pre-step 时可能收到当前案件名称/进度并消耗其注入水位。这是既有遗漏，非 R10 新引入。 | CC-V5-008：精确关联案件与 DSH session，验证 A/B Agent 隔离、无关联 Agent 不注入、冷启动与恢复。当前为源码确认，实际多 Agent Web 路径 `NOT_VERIFIED`。 |
| P2 | GitHub `codeowners/errors` 返回 14 条错误：4 条 Invalid owner（中文显示名称）、10 条 Unknown owner（@maoking）。末尾 `*` 还覆盖前面规则；若干路径写成不存在的目录而实际为 `.ts` 文件。 | gov-01 重新打开：按真实路径与有效写权限账号校正；远端 errors 为 0，并验证代表性 PR 的 owner 匹配。不得由审计推断或新增协作者权限。 |
| P2 | `.github/workflows/ci.yml` 三个 job 均指定 Node 20，项目 engines 为 >=22，锁定 tsdown 0.22.14 要求 ^22.18.0 或 >=24.11.0。手动 CI 尚不能作为受支持环境的验收证据。 | gov-01：统一受支持 Node 版本，区分 Host/Client typecheck，验证声明的安装、测试、构建入口；保留手动触发策略。云端执行 `NOT_VERIFIED`。 |
| P2 | PR #4 仍 OPEN / CONFLICTING，远端 head 为 `066270d`、无 review/check；本地 R10 已含该 head 及集成 `35527c2`，但未推送。#2/#3/#5/#6/#7/#8 合入的目标是集成分支，不是 main。 | CC-V5 收口：先修阻断、冻结候选并独立审查，再更新 PR #4；里程碑合入 main 后才能称主版本交付。R10 是原 PR 的后续提交链，不是平行重写路线。 |
| P2 | R10 的 node_modules 是指向 main 的符号链接；本机 pnpm 11.7.0 的 exec 触发依赖检查后因 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY` 拒绝继续。两份锁文件/依赖树不能视为独立验收环境。 | CC-V5 收口：建立候选独立依赖环境并固定包管理器版本后复验；本次保留现有链接，未强制清空依赖。 |

### 本次验证与证据边界

- main：`NODE_OPTIONS=--max-old-space-size=2048 pnpm exec vitest run tests/docx-extract.spec.ts --bail 1`，2/2 PASS。本机 pnpm 在执行前自动运行了依赖准备与 prepare/build；未产生受跟踪文件差异。这是同步版测试证据，不能证明 R10 或历史负载事故已全部解决。
- R10：上述 pnpm 入口在依赖检查阶段失败；改用已安装 runner `NODE_OPTIONS=--max-old-space-size=2048 node node_modules/vitest/vitest.mjs run tests/docx-extract.spec.ts --bail 1`，13/13 PASS，含 TERM→KILL、优雅 TERM、并发独占目录和 spawn-failed。只证明当前安装依赖下的单 spec，不冒充 frozen-lockfile 干净安装或全量验收。
- Coordinator 定向复现：用真实 ContractAgentCoordinator/SessionStore，把 extractContractBody 替为可控 Promise 屏障；同案件发起两个 runAnalysis，屏障释放前调用 cancel，再释放并收集结果。输出 `accepted=2, creates=2, followups=2, cancelDuringExtraction=contract-copilot/not-running`。另一路在屏障释放前 await dispose，确认分析仍 pending；释放后才以 coordinator-closed 拒绝。临时脚本 `/tmp/cc-audit-coordinator-20260908.mjs`，命令 `NODE_OPTIONS=--max-old-space-size=2048 node --experimental-transform-types /tmp/cc-audit-coordinator-20260908.mjs`，退出 0；这是确定性调度诊断，不是实际模型/子进程验收。
- GitHub：`gh repo view --json isPrivate,nameWithOwner` 确认当前为私有仓；`gh api repos/cat-xierluo/dsh-contract-copilot/codeowners/errors` 返回上述 14 条错误。CODEOWNERS 仅作用于 PR，不能用来自动路由 Issue；最后匹配规则优先，依据 [GitHub 文档](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners)。
- 文档：doc-curator `--only context-sync --since cddba44` 返回 1 ok / 0 hard，但实际使用 FaroPDF 兜底配置，只检出 DECISIONS 已更新，不能证明本项目任务状态正确。CC-V5-005 仍未完成。Q44 只在异步分支，main Q45 对其引用需要随集成补齐；旧 lint 的 10 FAIL 也没有整改验收，不得宣称发布门禁全绿。
- 本次未运行全量测试、云端 Actions、真实 DSH Web/模型或 Windows 验收。未新增 worker、未干预其他 Agent 的运行资源；本次审计不构成任何分支的合并许可证明。

### 接续顺序

1. 先处理 CC-V5-009 的生命周期缺口与 CC-V5-008 的 Agent 隔离；两项涉及共享接线，派发前重新核对文件所有权和依赖，不同时修改同一模块。
2. gov-01 的 CODEOWNERS/Node 配置校正可与产品整改按文件边界独立推进；gov-04 自动 CI 方案保持暂停，避免覆盖现行手动策略。
3. R10 独立依赖环境与最终候选验收 → 更新/审合 PR #4 → 集成分支吸收 main 的治理/测试改动并解决文档冲突 → 真实工作台验收 → 里程碑 PR。清理仅在合并与资源归属确认后执行。

## TASK-2026-09-06-orca-gov-01：governance: dsh Phase 1 — PR 模板 + CODEOWNERS + CI baseline

- 状态：`重新打开（2026-09-08 审计）：文件已随 PR #10 合入 main；CODEOWNERS 14 条远端错误、Node 版本不匹配，治理效果未验收。历史清理记录保留。`
- 类型：`implementation`
- 来源：2026-09-06 桌面 `orca-governance-adoption` 调研；同目录 `ADOPTION-dsh-contract-copilot.md` §1 + `CHECKLIST.md` Phase 1
- 关联材料：`docs/orca-governance-adoption/ADOPTION-dsh-contract-copilot.md`、`docs/orca-governance-adoption/CHECKLIST.md`

### 问题

dsh-contract-copilot 是公有仓库但仓库内 0 个 `.github/` 文件：PR 描述纯自由文本（无机读锚点）、业务规则路径无 CODEOWNERS 路由、完全无 CI——`ADOPTION-dsh-contract-copilot.md` 现状盘点已把"完全没有 CI"列为最大缺口。协作律师 `@杨卫薪律师` 对业务规则有审核资格但代码层 ownership 未声明，PR review 只能靠口头找人。

### 目标

按 orca-style 给 dsh 装最小可用的入口与门禁三件套，让 PR 描述可机读、协作律师自动进入 review 圈、CI 在合并前必跑 typecheck + test + build（含 `NODE_OPTIONS=--max-old-space-size=2048` 堆顶防护，与本机 vitest 堆顶一致，固化 `7eae439` 的止血措施到 CI runner）。

### 验收标准

- [x] `.github/pull_request_template.md` 新建（约 50 行 Markdown，含 ELI5 / Summary / Why / What Changed / Linked Issue / Visual Proof / Test Plan / AI Disclosure / Notes / Checklist 锚点，模板全文见 `ADOPTION-dsh-contract-copilot.md` §1.1）— 交付 head `e8a7c73`，50 行，含全部锚点
- [ ] `.github/CODEOWNERS` 有效路由：校正实际 `.ts` 路径、有效 owner 与规则顺序；GitHub errors 为 0 且代表性 PR 请求正确 owner。原验收只确认文本存在，2026-09-08 远端校验否定其有效性。
- [ ] `.github/workflows/ci.yml` 三 job 文件已落地，但 Node 20 不满足项目/锁定构建器要求；在受支持版本完成验收后勾选。保留 `workflow_dispatch` 手动触发与 2048 MiB 堆顶；手动运行本身仍使用 Actions 资源。
- [ ] 仓库 Settings → Branches → main → Branch protection rules 勾 `test` 与 `typecheck` 为 required status check — **N/A**：CI 不再自动触发（workflow_dispatch），分支保护 required check 不再有意义；合并前通过本地 `pnpm typecheck && pnpm test && pnpm build` 全跑验证
- [ ] 在 fork 或新 branch 上各填一个 PR 跑完整 CI（typecheck + test + build），确认 ELI5 / What Changed 等锚点可机读、CODEOWNERS 自动请求律师 review — **留给维护者**（web UI；CODEOWNERS 律师路由已知不触发因律师账号未加 Collaborator，按用户 2026-09-06 修订走本地协作路径）
- [x] commit 风格沿用 dsh 现有约定（英文 type prefix + 中文说明 + 中文正文），示例：`chore(governance): adopt orca-style PR template + CODEOWNERS + CI baseline (Phase 1)` — 逐字一致
- [x] 不修改任何已有源文件、测试；新增文件仅限 `.github/` 下 — diff 4 文件（PR 模板/CODEOWNERS/ci.yml/CHANGELOG）；后补加 package.json typecheck script（CI 防御补全，PM 授权）

### 执行证据（2026-09-06）

- **PR #10**：https://github.com/cat-xierluo/dsh-contract-copilot/pull/10（head `e8a7c73356bc0d06f38d00ca6c9e66685ebb9057`，base main）
- **scoped 验证复跑**：`grep -q 'max-old-space-size=2048' .github/workflows/ci.yml` 等全部 PASS
- **safe-push OID 全链核验**：IDENTITY_GATE_COMMIT_OK / base=291c57c / head=e8a7c73 / commits=1 / expected name+email match
- **PM 接管 audit ambiguous**（同卡 03）：与 INFRA-FOLLOWUPS #1 同根因，PM 在 PR #10 留 comment 标内容等价证明
- **资源收口**：worker worktree /Users/maoking/orca/workspaces/dsh-contract-copilot/chore-governance-phase1 已 `git worktree remove --force`，CLEANED

### 风险与边界

- 2026-09-08 勘误：中文显示名称被 GitHub 判为 Invalid owner，不能当作有效 GitHub username；`@maoking` 亦报 Unknown owner。修复前先核实既有账号/写权限，不能据旧卡推断权限或擅加协作者。
- 当前仓库为私有（2026-09-08 GitHub 查询），旧“公有免费适用”前提失效；第三方机器人与计费未验证，本卡不引入。
- CI 端 `NODE_OPTIONS=--max-old-space-size=2048` 是合约级必保留的——见 `orca-oom-crash-loop.md` 2026-09-06 14:25 / 15:16 / 16:32 三轮收场记录，崩 1 次/59 秒与崩 1 次/107 秒的实际差就是这道护栏
- Phase 2（路径感知 pr.yml + verify required check）、Phase 3（CodeRabbit + pullfrog）由本卡 4 / 卡 3 / 卡 2 后续处理，本卡不引入

---

## TASK-2026-09-06-orca-gov-02：test: 根治 dsh vitest 状态污染循环 — 临时目录严格隔离 + claude 工作流限定

- 状态：`main 测试层加固已完成；历史独立 reviewer 证据保留。2026-09-08 审计限定：同步版验证不能推及 R10、所有并发负载或整机 OOM 根因；R10 命令生命周期另由 CC-V5-009 跟踪。`
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

- 状态：`模板内容已交付 main；GitHub 表单实操尚未验收（2026-09-08 校正）。PR #9 为 CLOSED、非 MERGED；其两份 Issue 模板与 main 内容一致，不能把本地内容收编表述为 PR #9 已合并。`
- 类型：`implementation`
- 来源：2026-09-06 桌面 `orca-governance-adoption` 调研
- 关联材料：`docs/orca-governance-adoption/ISSUE-LIFECYCLE.md` §6.2、`docs/orca-governance-adoption/CHECKLIST.md` dsh §Phase 1 增补段

### 问题

dsh 是合同审查业务规则工具——bug 类型高度结构化（合同主体 / 计划审核 / 字段抽取 / docx 渲染 / Python 桥），但仓库内 0 个 issue 表单、0 个 issue labeler、0 张业务规则专用 issue 模板。用户/律师直接打 issue 没有结构化表单，CODEOWNERS 路由靠"@律师"手动提及，template 字段缺失导致 reviewer 第一次回复常常是"麻烦告诉我这是哪条规则"（见 `ISSUE-LIFECYCLE.md` §6.2 的对偶论证）。

### 目标

按 `ISSUE-LIFECYCLE.md` §6.2 的"业务规则审核专用版"落地两个文件：① 新建 `01-business-rule-review.yml`（杨律师专属，触发条件=用户投诉合同审查逻辑错/律师提出改进）；② 在 `bug_report.yml`（新建）加 `module` dropdown（intake / plan-review / docx-view / python-bridge / session），让 CODEOWNERS 自动路由 + 模板字段双重定位。

### 验收标准

- [x] `.github/ISSUE_TEMPLATE/01-business-rule-review.yml` 新建（含杨律师专属字段如 `rule_version`、`affected_contract_clause`、`repro_docx_path`，完整 YAML 见 `ISSUE-LIFECYCLE.md` §6.2）— 交付 head `e9ec7c9`，三必填字段齐
- [x] `.github/ISSUE_TEMPLATE/bug_report.yml` 新建：含 `module` dropdown（intake / plan-review / docx-view / python-bridge / session），加上 `os`、`details` 必填字段；title 前缀 `[Bug]: `、type: Bug、labels: ["bug"] — module 五选项齐，fields=3
- [ ] 若需要禁止空白 Issue，核对 `.github/ISSUE_TEMPLATE/config.yml` 的 `blank_issues_enabled: false` 配置与实际入口；当前尚未落地。
- [ ] 验证 bug 与 business-rule-review 表单的必填字段、module dropdown 与提交结果；CODEOWNERS 只处理 PR review，不列为 Issue 自动路由验收。
- [x] commit 风格：`chore(governance): issue template — 业务规则审核 + module dropdown (Phase 1 增补)` — 逐字一致
- [x] 不修改任何已有源文件、测试；新增文件仅限 `.github/ISSUE_TEMPLATE/` — diff 恰 3 文件 +98/−0

### 执行证据（2026-09-06）

- **PR #9**：https://github.com/cat-xierluo/dsh-contract-copilot/pull/9（head `e9ec7c9599d5aa9fd0927c32398ea3364991d228`，base main）
- **三门全过**：dispatch-value-gate（v2 spec ok）→ worker-value-postflight（ok:true，2 evidence，零越界）→ review-acceptance-gate（ACCEPT，ordinary_delivery:true）
- **独立 reviewer**：7/7 PASS（字段、边界、YAML、CHANGELOG、内容质量、commit 风格）；4 条非阻断观察：label 仓库预建、rule_version 示例口径、node_modules 工作区残留（已清）、docs 入库状态（误报，6a48422 已含）
- **PM 接管 audit ambiguous**：multi-agent-orchestration skill INFRA-FOLLOWUPS #1 已知 bug（pr-audit hunk-header 指纹边界导致 diff 内容等价被判 ambiguous→suspected）；safe-push OID 全链核验替代审计 exact：IDENTITY_GATE_COMMIT_OK / base=291c57c / head=e9ec7c9；PM 在 PR #9 留 comment 标内容等价证明
- **资源收口**：worker worktree /Users/maoking/orca/workspaces/dsh-contract-copilot/chore-issue-templates 已 `git worktree remove --force`，provider-lease 文件保留（脚本不管）

### 风险与边界

- 本卡**不**创建 labeler workflow（`issue-labeler.yaml`）——folia 的影响面→severity 映射对 dsh 不直接适用（dsh 的"影响面"是业务规则被破坏面，不是 macOS/Windows/Linux）。后续如需按 `module` 自动加 label，再开卡 3+
- 不创建 `other.yml`——`ISSUE-LIFECYCLE.md` §1.2 论证"other 是兜底不是默认"，dsh 双维护者+律师可直接走 bug_report + business-rule-review 二选一
- `01-business-rule-review.yml` 的字段命名要稳定 schema-friendly（`rule_version` 而非 `规则版本`）——便于后续 AI reviewer / 内部 PM 消费
- worker 自动 push + 开 PR 是另一会话 2026-09-06 v2.22.0 默认权限升级带来的副作用（worker 隔离在专属分支、push+PR 是必要交付路径、安全类按分段校验放宽）；本仓派发 spec 未显式授予 push 权，worker 依赖默认新规则执行——已 PM 接管认领而非推倒重来

---

## TASK-2026-09-06-orca-gov-04：governance: dsh Phase 2 — 路径感知 PR workflow + verify 必为 required check

- 状态：`暂停／需重订方案（2026-09-08 审计）：现行 CI 已改手动触发，本卡自动 PR workflow 与 required check 的前提过期，不再按旧卡直接派发。`
- 类型：`implementation`
- 来源：2026-09-06 桌面 `orca-governance-adoption` 调研
- 关联材料：`docs/orca-governance-adoption/ADOPTION-dsh-contract-copilot.md` §2.1–§2.2、`docs/orca-governance-adoption/PR-LIFECYCLE.md` §3.3 反直觉警示、`docs/orca-governance-adoption/PR-LIFECYCLE.md` §6 信任脚本模式

### 问题

当前 `.github/workflows/ci.yml` 仅手动触发，docs-only PR 不会自动跑全量。以下目标/验收保留为原方案，尚未按手动策略重订；先明确本地验收与合并门如何执行，再决定是否恢复自动 PR 检查。

### 目标

按 `ADOPTION-dsh-contract-copilot.md` §2.1 实现 detect → fan-out → verify 聚合模式，docs-only PR 跳过贵 job（typecheck / test / build 全 skipped，verify 打印"docs-only"消息后通过）。**关键补丁**：分支保护必须显式把 `verify` 勾为 required check（避免 orca 那种"有 CI 但拦不住 PR"的反例）。`pr-test-loc.yml` 写权限 workflow 脚本从 default branch 拉（不执行 PR head），照搬 `PR-LIFECYCLE.md` §6 的"高权限 workflow 不执行 PR 代码"原则。

### 验收标准

- [ ] `.github/workflows/pr.yml` 新建：detect job（按 `git diff --name-only origin/main...HEAD` 输出 `src_changed` / `docs_only` / `worktree_only` 三个布尔）→ fan-out（`typecheck` / `test` / `build` 三 job 按 `src_changed` 触发）→ verify 聚合 job（`needs: [detect, typecheck, test, build]` + `if: always()`；docs-only PR 走"docs-only"快速通过路径）
- [ ] `.github/workflows/pr-test-loc.yml` 新建：测试 vs 实现 LoC 比值评论到 PR；**关键安全设计**——脚本通过 Files API 从 default branch（`main`）拉取（`actions/checkout@v6` with `ref: main`），不执行 PR head 代码（参考 `PR-LIFECYCLE.md` §6 完整 YAML）
- [ ] 仓库 Settings → Branches → main → Require status checks 显式勾 `verify` 为 required check（**不**只勾 `typecheck` / `test`——这是 orca 反例的核心教训）
- [ ] 提交一个 docs-only PR（如改 `README.md` 单行），确认 typecheck / test / build 全部 skipped、verify 通过
- [ ] 提交一个 src 改动 PR，确认 typecheck / test / build 全跑、verify 通过
- [ ] commit 风格：`chore(governance): path-aware PR workflow + verify required check (Phase 2)`
- [ ] 重订时明确与现行手动 `ci.yml` 的关系；旧“保留 push:main 常规 CI”描述已不成立。

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

- [x] 11 份材料已落库，`6a48422` 与当前文件清单可核对；与桌面原稿逐字节一致是历史自报，本次未复验，且 HANDOFF 已有有意新增的仓库入口。
- [x] 5 张治理任务卡已落库。
- [x] HANDOFF 顶部已有本仓库入口及任务源指向。
- [x] CHANGELOG 的 Planning（2026-09-06）段已有材料与任务卡说明，版本号未改。
- [x] `git show --stat 6a48422` 为 14 个文档文件，含同批卡 02 的 DECISIONS；原未提交状态/文件数合同被实际合并提交取代。
- [x] 该提交没有 src/、tests/、package.json、tsconfig、CI 配置改动。
- [x] 原“不 commit”验收已被本卡记录的后续授权取代；交付提交为 `6a48422`，不再保留为未完成事项。
- [x] 本卡产物不含源码、测试或 CI/Issue 模板；治理实现由其他卡跟踪。

### 风险与边界

- 桌面 `orca-governance-adoption/` 是只读参照源，本仓库内的副本是"dsh 接受 orca 治理调研的完整入口"——**复制而非引用**，避免桌面不可达时丢上下文
- 本卡 5 与卡 1/2/3/4 是元-实现关系：先有本卡 5 把材料落到 dsh，再派发卡 1/2/3/4
- 跨仓库对照（dsh ↔ folia）属 Phase 4 探索——不在本卡 5 范围
- 用户授权（DEC-046）下"自动推进策略"对 5 张卡的派发：默认 `converge` 模式全局同时活跃 worker ≤3、docs-only 必须至少推动 `DRAFT → READY`；本卡 1 / 卡 3 / 卡 4 是 implementation，卡 2 是 test，卡 5 是 investigation — 任何一张派发前确认与 CC-V5 / CC-V4-* 在途任务的资源/分支不冲突

---

## CC-V5：工作台质量加固波次（搁浅恢复，2026-09-06 PM 接管）

- 状态：进行中；波次定义与任务卡权威在集成分支 `feat-v5-quality-hardening` 的 status/TASKS.md（PR #2/#3/#5/#6/#7/#8 已合入该分支，PR #4 OPEN 待审）
- 2026-09-05 会话中断导致波次搁浅：R3 现场（TERM→KILL + mkdtemp，Q44 修订）已保全为 `fix-cc-v5-async-docx-extraction` 上的 WIP commit `56d2805`
- 2026-09-08 校正：R4 为中断现场提交 `612575d`；后由 R10 `99d6243` 完成两个测试缺口，抽取 spec 本次 13/13 通过，但整个异步命令生命周期尚未收口。后续须先整改、独立审查，再更新 PR #4 → 里程碑 PR。
- 独立佐证：`package.json` vitest 堆顶止血已落 main（`7eae439`）
- 2026-09-07 分支清理记录保留：6 个 stale 分支及 worktree 已清理；`contract-copilot-v301-assets` 按原验收记录保留。2026-09-08 校正：R10 是 PR #4 head `066270d` 的后代，含 merge-forward `dda96bc` 及集成 tip `35527c2`，不是平行路线；继续保留待修复/审查，不需把集成 PR 补丁平铺重放。本次未执行清理。
- 2026-09-07 审计发现：远端 PR #4（`066270d`）base 落后 feat-v5 tip——其基线只含到 #2，缺 #3/#5/#6/#7/#8 约 3129 行，审合前须先 update branch 或 rebase 到最新集成分支

### CC-V5-008：恢复 Agent 专属进度注入任务

- 状态：实现及独立 review 已交付；冻结 head、30/30 有效证据与资源结算见本页 WAVE-2026-09-08。PR #11 尚未合并，真实多 Agent Web 路径仍为 NOT_VERIFIED，任务不关闭。
- 目标：pre-step 按事件 Agent id 精确查找 dshSessionId 对应案件；无关联案件不注入，不消费其他案件进度水位。
- 范围：`src/index.ts`、`src/session.ts`、`src/progress.ts` 与对应测试/受影响文档；不改 Python 或律师授权规则。
- 验收：A/B 案件与无关联 Agent 的交错 pre-step、相同案件重复步、冷启动/resume 均隔离且可恢复；绑定最终候选的独立审查与代表性 DSH 路径。诊断依据见本次审计表。

### CC-V5-009：恢复 Agent 命令生命周期与复核入口任务

- 状态：本轮准入/取消/关闭修复及独立 review 已交付，合并前仍须处置 reviewer N1；证据和剩余范围见本页 WAVE-2026-09-08。原统一 beginRecheck 方案需补全任务合同再派发，不能仅按历史标题实现。
- 目标：一个案件从抽取开始即由一条命令拥有；cancel/dispose 覆盖抽取及 Agent 创建，并等待所拥有的异步工作收束。
- 范围：`src/agent-coordinator.ts`、`src/host-api.ts` 及对应测试/文档；复核相关 SessionStore/Tool 改动在补齐合同后纳入，避免漏掉旧计划与批准失效语义。
- 验收：两个请求在首次 await 前后交错只能接受一个；抽取中 cancel 有效；create/resume 未完成时 dispose 不遗留 handle、迟到 followup 或错误持久状态；相关失败有界且零归属资源残留。不得仅以现有“首次 runAnalysis await 完成后再发第二次”的 busy 用例代替并发验证。

### CC-V5-009-R2：上游中止后的取消与结果投影（N1 返修）

- 状态：DELIVERY_RECEIVED / RE_REVIEW_QUEUED（2026-09-09 08:50）；本波第 1 个返修 episode，预算上限 2。收到真实 worker_done，最终候选 `058ce80c8ae5c317cc2a83dd9980425acbb286ca`；PM 核对干净工作树、两提交身份和允许文件，worker-value-postflight PASS。作者在最终树提供 71/71、Host noEmit、diff-check 的 executed[]；独立复审尚未完成，不能据此合并。
- 输入：已审候选 `c0c973378ca6d623c974c4914a940747bb813afb` 及生命周期 reviewer 报告 N1。原 ACCEPT 作为历史保留，PM 将 N1 纳入合并前阻断。
- 目标：accepted/followup 后的 upstream abort 不得抑制后续用户 cancel，也不得把仍正常执行的成功交付误投影为 idle；中止、cancel、dispose 交错必须具有一致语义、幂等取消和唯一句柄释放。
- 范围：仅 `src/agent-coordinator.ts`、`tests/agent-command-lifecycle.spec.ts`、`tests/agent-coordinator.spec.ts`；随行更新本任务与 CHANGELOG、受影响 ARCHITECTURE。不改 Python、Client、SessionStore、依赖或律师批准门，不增加 beginRecheck。
- 派发合同：Git common-dir 的 `orchestration/cc-audit-20260908/lifecycle-n1-{spec.json,prompt.md,recovery.json,receipt.json}`。复用同 Run 子任务 `task_4ce88f2a778c`，实际 Dispatch `ctx_b54c55728b44` / Session `cc-lifecycle-n1-0909` / 终端 `term_7b87f064-259c-4731-97d7-adbba39abdea`；spawn 退出 0、dispatch_bind=ok。短分支/worktree `codex-cc-lifecycle-n1-0909` 的 HEAD 已核对为上述冻结候选，独立 local 依赖及自身 Session Context 写权限已显式配置；保留旧分支及 reviewer 树。仅本地提交，独立复审后纳入既有 PR #4，不新开重复 PR。
- 验收：受控 Promise/AbortController 新回归先在修复前失败，再在修复后通过；沿用 R1 五个 scoped spec、Host noEmit、diff-check 三条精确命令（2048 MiB 堆顶）。以最终 40 位 head、executed[] 日志和不同 Dispatch/Session 的独立复审收口；真实 Web 仍须单独验证。
- 资源：实现 Dispatch 已 settled/succeeded；PM 关闭匹配 incarnation 的精确终端并 release，provider lease 已释放，再 ack `delivery_ab8c947f9dbd`。分支/worktree 保留待复审及 PR 收口，未 push 或修改 PR。

### CC-V5-009-R2-REVIEW：N1 返修独立复审

- 状态：READY / QUEUED_FOR_CAPACITY（2026-09-09 08:54）；同 Run 子任务 `task_7c78851fc4f5` 已建立，价值门 PASS，全局 3 个活跃 Dispatch 已达到上限，本轮尚未派 Worker。下一次派发必须重查全局并发及新鲜额度/内存，不借用其他项目终端或关闭其 Worker。
- 输入：冻结 `058ce80c8ae5c317cc2a83dd9980425acbb286ca`；实现身份 `ctx_b54c55728b44` / `cc-lifecycle-n1-0909`。审 N1 增量 `c0c9733..058ce80`，同时核对 R10 后累计生命周期互动；不把本次审查扩大为远端旧 PR #4 或整个工作台验收。
- 范围：GLM 5.3 Flash，独立短分支/worktree `codex-cc-lifecycle-n1-review-0909`，Session `cc-lifecycle-n1-review-0909`；只读实现和受影响文档，只写自身 Session Context，禁止修代码、提交、push 或新开 PR。安装沿用本波精确 local 命令，不共享依赖。
- 验收：最终 HEAD 一致；Agent 登记/followup 时序、上游中止与 cancel/dispose 交错、结果投影、早期中止及唯一释放均有具体审查结论；独立复跑 R2 同三条命令，交付 review-acceptance.json 与 postflight-evidence.json 及真实日志。不同 Dispatch/Session、角色门和价值后门通过才可接纳；真实 Web 仍 NOT_VERIFIED。
- 合同：Git common-dir `orchestration/cc-audit-20260908/lifecycle-n1-review-{spec.json,prompt.md,receipt.json}`。消费方为当前 Codex PM，目标为既有 PR #4 纳入决策；head 改变旧 review 即失效。派发与资源身份以 receipt 为准。

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
